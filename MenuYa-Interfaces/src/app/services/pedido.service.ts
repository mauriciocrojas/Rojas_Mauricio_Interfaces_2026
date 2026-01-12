import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { ToastController } from '@ionic/angular';
import { PushNotificationService } from '../services/push-notification.service';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export type EstadoPedido =
  | 'pendiente'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'recibido'
  | 'finalizado'
  | 'cancelado';

export type TipoPedido = 'salon' | 'domicilio';

export interface PedidoRow {
  id: number;
  numero_mesa: number;
  items: unknown | null;
  monto_total: number | null;
  tiempo_elaboracion: number | null;
  cocina_listo: boolean | null;
  cocteleria_listo: boolean | null;
  estado: EstadoPedido | null;
  created_at?: string;
  tipo: TipoPedido | null;
  domicilio_direccion: string | null;
  domicilio_lat: number | null;
  domicilio_lng: number | null;
}

export interface PedidoCreate {
  // para salón: se usa el que venga
  // para domicilio: lo vamos a sobreescribir por la mesa virtual
  numero_mesa: number;
  items?: unknown;
  monto_total?: number;
  tiempo_elaboracion?: number;
  cocina_listo?: boolean;
  cocteleria_listo?: boolean;
  estado?: EstadoPedido;
  // nuevos
  tipo?: TipoPedido;
  domicilio_direccion?: string | null;
  domicilio_lat?: number | null;
  domicilio_lng?: number | null;
}

export interface ContextoDomicilio {
  direccion: string | null;
  lat: number | null;
  lng: number | null;
}

export type PedidoUpdate = Partial<PedidoCreate>;

const TABLA = 'menuya_pedidos' as const;

const ESTADOS_VALIDOS: readonly EstadoPedido[] = [
  'pendiente',
  'en_preparacion',
  'listo',
  'entregado',
  'cancelado',
  'finalizado'
] as const;

type PedidoDbRow = {
  id: number | string;
  numero_mesa: number | string;
  items: unknown | null;
  monto_total: string | number | null;
  tiempo_elaboracion: number | null;
  cocina_listo: boolean | null;
  cocteleria_listo: boolean | null;
  estado: EstadoPedido | null;
  created_at?: string;
  tipo?: TipoPedido | null;
  domicilio_direccion?: string | null;
  domicilio_lat?: number | null;
  domicilio_lng?: number | null;
};

/**
 * Retorna true si es un objeto plano (no Array, no función, etc.)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convierte NUMERIC (string) a number o null de forma segura.
 */
export function toNumberOrNull(
  input: string | number | null | undefined
): number | null {
  if (input === null || input === undefined) return null;
  const n = typeof input === 'number' ? input : Number.parseFloat(input);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza una fila proveniente de Supabase/PostgREST al tipo del front.
 * - Convierte `monto_total` (NUMERIC en DB) a `number | null`.
 * - Asegura `id` y `numero_mesa` como number.
 */
export function mapRowFromDb(row: PedidoDbRow): PedidoRow {
  return {
    id: Number(row.id),
    numero_mesa: Number(row.numero_mesa),
    items: row.items ?? null,
    monto_total: toNumberOrNull(row.monto_total),
    tiempo_elaboracion:
      typeof row.tiempo_elaboracion === 'number'
        ? row.tiempo_elaboracion
        : row.tiempo_elaboracion ?? null,
    cocina_listo: row.cocina_listo ?? null,
    cocteleria_listo: row.cocteleria_listo ?? null,
    estado: row.estado ?? null,
    created_at: (row as any).created_at ?? null,
    tipo: row.tipo ?? null,
    domicilio_direccion: row.domicilio_direccion ?? null,
    domicilio_lat:
      typeof row.domicilio_lat === 'number'
        ? row.domicilio_lat
        : (row.domicilio_lat as any) ?? null,
    domicilio_lng:
      typeof row.domicilio_lng === 'number'
        ? row.domicilio_lng
        : (row.domicilio_lng as any) ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class PedidoService {
  constructor(
    private ToastController: ToastController,
    private pushNotificationService: PushNotificationService   // 👈 NUEVO
  ) {
    this.initPedidosRealtime();
  }
  // mesa virtual para delivery (debe existir en DB: menuya_mesas.numero_mesa = 9999)
  private readonly MESA_VIRTUAL_DELIVERY = 9999;

  // 👇 NUEVO: eventos generales de cambio de pedidos (para estado_mesas, etc.)
  private pedidosChangesSubject = new Subject<void>();
  pedidosChanges$ = this.pedidosChangesSubject.asObservable();

  // ya existente:
  private pedidosPendientesSubject = new BehaviorSubject<PedidoRow[]>([]);
  private pedidosPendientesIniciado = false;

  // Realtime: para no inicializar dos veces
  private pedidosRealtimeInitialized = false;

  // --- CONTEXTO DELIVERY (memoria + persistencia simple) ---
  private _ctxDomicilio: ContextoDomicilio | null = null;
  private _ultimoDeliveryId: number | null = null;
  private readonly LAST_DELIVERY_ID_KEY = 'menuya_last_delivery_id';

  /**
   * Inicializa Realtime sobre menuya_pedidos.
   * Cada cambio (INSERT/UPDATE/DELETE) dispara pedidosChanges$.
   */
  private initPedidosRealtime() {
    if (this.pedidosRealtimeInitialized) return;
    this.pedidosRealtimeInitialized = true;

    console.log('[PedidoService] initPedidosRealtime');

    supabase
      .channel('rt-menuya-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLA },
        (payload) => {
          console.log('[PedidoService] Realtime payload:', payload);
          // Notificar a todos los interesados (estado_mesas, cocina, etc.)
          this.pedidosChangesSubject.next();

          // Opcional: refrescar también los pedidos "en_preparacion"
          this.refrescarPedidosPendientes().catch((err) => {
            console.error(
              '[PedidoService] Error refrescando pedidos pendientes tras realtime:',
              err
            );
          });
        }
      )
      .subscribe((status) => {
        console.log('[PedidoService] Realtime pedidos status:', status);
      });
  }

  setContextoDomicilio(ctx: ContextoDomicilio) {
    this._ctxDomicilio = ctx;
    try {
      localStorage.setItem('menuya_ctx_domicilio', JSON.stringify(ctx));
    } catch {}
  }

  getContextoDomicilio(): ContextoDomicilio | null {
    if (this._ctxDomicilio) return this._ctxDomicilio;
    try {
      const raw = localStorage.getItem('menuya_ctx_domicilio');
      if (raw) {
        this._ctxDomicilio = JSON.parse(raw) as ContextoDomicilio;
        return this._ctxDomicilio;
      }
    } catch {}
    return null;
  }

  clearContextoDomicilio() {
    this._ctxDomicilio = null;
    try {
      localStorage.removeItem('menuya_ctx_domicilio');
    } catch {}
  }

  setUltimoPedidoDeliveryId(id: number) {
    if (!Number.isFinite(id) || id <= 0) return;
    this._ultimoDeliveryId = id;
    try {
      localStorage.setItem(this.LAST_DELIVERY_ID_KEY, String(id));
    } catch {}
  }

  getUltimoPedidoDeliveryId(): number | null {
    if (this._ultimoDeliveryId != null) return this._ultimoDeliveryId;
    try {
      const raw = localStorage.getItem(this.LAST_DELIVERY_ID_KEY);
      if (raw) {
        const val = Number(raw);
        if (Number.isFinite(val) && val > 0) {
          this._ultimoDeliveryId = val;
          return val;
        }
      }
    } catch {}
    return null;
  }

  clearUltimoPedidoDeliveryId() {
    this._ultimoDeliveryId = null;
    try {
      localStorage.removeItem(this.LAST_DELIVERY_ID_KEY);
    } catch {}
  }

  getNumeroMesaDeliveryVirtual(): number {
    return this.MESA_VIRTUAL_DELIVERY;
  }

  /**
   * Observable con todos los pedidos en estado "en_preparacion",
   * ordenados desc por id (como getTodos()).
   */
  observarPedidosPendientes(): Observable<PedidoRow[]> {
    if (!this.pedidosPendientesIniciado) {
      this.pedidosPendientesIniciado = true;
      this.refrescarPedidosPendientes().catch((err) => {
        console.error('[PedidoService] Error al refrescar pedidos pendientes iniciales:', err);
      });
    }
    return this.pedidosPendientesSubject.asObservable();
  }

  /**
   * Recarga desde Supabase y emite en el BehaviorSubject.
   */
  private async refrescarPedidosPendientes(): Promise<void> {
    try {
      const pedidos = await this.getTodos();
      this.pedidosPendientesSubject.next(pedidos);
    } catch (err) {
      console.error('[PedidoService] Error al obtener pedidos pendientes:', err);
      // opcional: this.pedidosPendientesSubject.error(err);
    }
  }


  /**
   * Crea un nuevo pedido en `menuya_pedidos`.
   * - Para salón: requiere `numero_mesa > 0`.
   * - Para domicilio: fuerza mesa virtual y usa el contexto de domicilio.
   * - Normaliza NUMERIC -> number al retornar.
   * @throws Error si hay validaciones fallidas o error de Supabase.
   */
  async createPedido(input: PedidoCreate): Promise<PedidoRow> {
    const isDelivery = input.tipo === 'domicilio';

    let numeroMesaFinal = input.numero_mesa;

    if (isDelivery) {
      // para delivery siempre usamos la mesa virtual
      numeroMesaFinal = this.MESA_VIRTUAL_DELIVERY;
    }

    // Validaciones mínimas (solo para salón)
    if (
      !isDelivery &&
      (typeof numeroMesaFinal !== 'number' ||
        !Number.isFinite(numeroMesaFinal) ||
        numeroMesaFinal <= 0)
    ) {
      throw new Error('numero_mesa es requerido y debe ser > 0');
    }

    if (input.items !== undefined) {
      const ok =
        Array.isArray(input.items) ||
        isPlainObject(input.items) ||
        input.items === null;
      if (!ok) {
        throw new Error('items debe ser un objeto o array serializable');
      }
      try {
        JSON.stringify(input.items);
      } catch {
        throw new Error('items no es serializable a JSON');
      }
    }
    if (
      input.cocina_listo !== undefined &&
      typeof input.cocina_listo !== 'boolean'
    ) {
      throw new Error('cocina_listo debe ser boolean');
    }
    if (
      input.cocteleria_listo !== undefined &&
      typeof input.cocteleria_listo !== 'boolean'
    ) {
      throw new Error('cocteleria_listo debe ser boolean');
    }
    if (input.estado !== undefined && !ESTADOS_VALIDOS.includes(input.estado)) {
      throw new Error('estado no es válido');
    }
    if (
      input.monto_total !== undefined &&
      (typeof input.monto_total !== 'number' ||
        !Number.isFinite(input.monto_total))
    ) {
      throw new Error('monto_total debe ser un número');
    }
    if (
      input.tiempo_elaboracion !== undefined &&
      (typeof input.tiempo_elaboracion !== 'number' ||
        !Number.isFinite(input.tiempo_elaboracion))
    ) {
      throw new Error('tiempo_elaboracion debe ser un número');
    }

    // armar payload
    const payload: Partial<PedidoDbRow> & { numero_mesa: number } = {
      numero_mesa: numeroMesaFinal,
    };

    if (input.items !== undefined) payload.items = input.items as unknown;
    if (input.monto_total !== undefined) payload.monto_total = input.monto_total;
    if (input.tiempo_elaboracion !== undefined)
      payload.tiempo_elaboracion = input.tiempo_elaboracion;
    if (input.cocina_listo !== undefined)
      payload.cocina_listo = input.cocina_listo;
    if (input.cocteleria_listo !== undefined)
      payload.cocteleria_listo = input.cocteleria_listo;
    if (input.estado !== undefined) payload.estado = input.estado;

    // tipo + domicilio
    if (isDelivery) {
      payload.tipo = 'domicilio';
      const ctx = this.getContextoDomicilio();
      payload.domicilio_direccion =
        input.domicilio_direccion ?? ctx?.direccion ?? null;
      payload.domicilio_lat = input.domicilio_lat ?? ctx?.lat ?? null;
      payload.domicilio_lng = input.domicilio_lng ?? ctx?.lng ?? null;
    } else {
      payload.tipo = 'salon';
    }

    const { data, error } = await supabase
      .from(TABLA)
      .insert(payload as Record<string, unknown>)
      .select('*')
      .single();

    if (error) {
      throw new Error(`No se pudo crear el pedido: ${error.message}`);
    }
    if (!data) {
      throw new Error('No se pudo crear el pedido: respuesta vacía');
    }
    const mapped = mapRowFromDb(data as PedidoDbRow);

    if (isDelivery) {
      this.setUltimoPedidoDeliveryId(mapped.id);
      this.setContextoDomicilio({
        direccion: mapped.domicilio_direccion ?? null,
        lat: mapped.domicilio_lat ?? null,
        lng: mapped.domicilio_lng ?? null
      });

      // // 🔔 NUEVO: push al DUEÑO cuando se genera el pedido delivery PUSH PEDIDO A DOMICILIO
      // try {
      //   const direccion = mapped.domicilio_direccion ?? null;

      //   this.pushNotificationService.sendNotificationToRole({
      //     role: 'dueño', 
      //     title: 'Nuevo pedido a domicilio',
      //     body: `Pedido #${mapped.id} a domicilio, confirmalo o rechazalo.`,
      //     data: {
      //       tipo: 'nuevo_pedido_delivery',
      //       pedidoId: mapped.id
      //     }
      //   });
      // } catch (err) {
      //   console.error('[PedidoService] Error enviando push nuevo pedido delivery:', err);
      // }
    }

    this.refrescarPedidosPendientes().catch((err) => {
      console.error('[PedidoService] Error refrescando pedidos pendientes tras createPedido:', err);
    });

    // 👇 NUEVO
    this.refrescarPedidosPendientes().catch((err) => {
      console.error('[PedidoService] Error refrescando pedidos pendientes tras createPedido:', err);
    });

    // 👇 NUEVO: notificar a observadores (estado_mesas, etc.)
    this.pedidosChangesSubject.next();

    return mapped;
  }

  /**
   * Actualiza parcialmente un pedido por `id`.
   * - Acepta cualquier subset de campos del pedido (patch).
   * - Normaliza NUMERIC -> number al retornar.
   * @throws Error si `id` es inválido, patch vacío o error de Supabase.
   */
  async updatePedido(id: number, patch: PedidoUpdate): Promise<PedidoRow> {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
      throw new Error('id inválido');
    }
    if (!patch || Object.keys(patch).length === 0) {
      throw new Error('Nada para actualizar');
    }

    if (patch.numero_mesa !== undefined) {
      if (
        typeof patch.numero_mesa !== 'number' ||
        !Number.isFinite(patch.numero_mesa) ||
        patch.numero_mesa <= 0
      ) {
        throw new Error('numero_mesa debe ser > 0');
      }
    }
    if (patch.items !== undefined) {
      const ok =
        Array.isArray(patch.items) ||
        isPlainObject(patch.items) ||
        patch.items === null;
      if (!ok) {
        throw new Error('items debe ser un objeto o array serializable');
      }
      try {
        JSON.stringify(patch.items);
      } catch {
        throw new Error('items no es serializable a JSON');
      }
    }
    if (
      patch.cocina_listo !== undefined &&
      typeof patch.cocina_listo !== 'boolean'
    ) {
      throw new Error('cocina_listo debe ser boolean');
    }
    if (
      patch.cocteleria_listo !== undefined &&
      typeof patch.cocteleria_listo !== 'boolean'
    ) {
      throw new Error('cocteleria_listo debe ser boolean');
    }
    if (patch.estado !== undefined && !ESTADOS_VALIDOS.includes(patch.estado)) {
      throw new Error('estado no es válido');
    }
    if (
      patch.monto_total !== undefined &&
      (typeof patch.monto_total !== 'number' ||
        !Number.isFinite(patch.monto_total))
    ) {
      throw new Error('monto_total debe ser un número');
    }
    if (
      patch.tiempo_elaboracion !== undefined &&
      (typeof patch.tiempo_elaboracion !== 'number' ||
        !Number.isFinite(patch.tiempo_elaboracion))
    ) {
      throw new Error('tiempo_elaboracion debe ser un número');
    }

    const payload: Partial<PedidoDbRow> = {};
    if (patch.numero_mesa !== undefined) payload.numero_mesa = patch.numero_mesa;
    if (patch.items !== undefined) payload.items = patch.items as unknown;
    if (patch.monto_total !== undefined) payload.monto_total = patch.monto_total;
    if (patch.tiempo_elaboracion !== undefined)
      payload.tiempo_elaboracion = patch.tiempo_elaboracion;
    if (patch.cocina_listo !== undefined)
      payload.cocina_listo = patch.cocina_listo;
    if (patch.cocteleria_listo !== undefined)
      payload.cocteleria_listo = patch.cocteleria_listo;
    if (patch.estado !== undefined) payload.estado = patch.estado;
    if (patch.tipo !== undefined) payload.tipo = patch.tipo;
    if (patch.domicilio_direccion !== undefined)
      payload.domicilio_direccion = patch.domicilio_direccion;
    if (patch.domicilio_lat !== undefined)
      payload.domicilio_lat = patch.domicilio_lat;
    if (patch.domicilio_lng !== undefined)
      payload.domicilio_lng = patch.domicilio_lng;

    const { data, error } = await supabase
      .from(TABLA)
      .update(payload as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `No se pudo actualizar el pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(`No se pudo actualizar el pedido ${id}: respuesta vacía`);
    }
    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 👇 NUEVO
    this.refrescarPedidosPendientes().catch((err) => {
      console.error('[PedidoService] Error refrescando pedidos pendientes tras updatePedido:', err);
    });

      // 👇 NUEVO
    this.pedidosChangesSubject.next();

    return mapped;
  }

  /**
   * Actualiza únicamente el `estado` del pedido.
   */
  async updateEstado(id: number, estado: EstadoPedido): Promise<PedidoRow> {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
      throw new Error('id inválido');
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
      throw new Error('estado no es válido');
    }

    const { data, error } = await supabase
      .from(TABLA)
      .update({ estado } as Partial<PedidoDbRow>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `No se pudo actualizar el estado del pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(
        `No se pudo actualizar el estado del pedido ${id}: respuesta vacía`
      );
    }
    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 👇 NUEVO
    this.refrescarPedidosPendientes().catch((err) => {
      console.error('[PedidoService] Error refrescando pedidos pendientes tras updateEstado:', err);
    });

        // 👇 NUEVO
    this.pedidosChangesSubject.next();
    return mapped;
  }

  /**
   * Trae todos los pedidos ordenados por `id` desc (más recientes primero).
   * - Normaliza NUMERIC -> number.
   */
  async getTodos(): Promise<PedidoRow[]> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('estado', 'en_preparacion')
      .order('id', { ascending: false });

    if (error) {
      throw new Error(`No se pudieron obtener los pedidos: ${error.message}`);
    }
    const rows = (data ?? []) as PedidoDbRow[];
    return rows.map(mapRowFromDb);
  }

  /**
   * Trae pedidos por `numero_mesa` ordenados por `id` desc.
   */
  async getPorNumeroMesa(numero_mesa: number): Promise<PedidoRow[]> {
    if (
      typeof numero_mesa !== 'number' ||
      !Number.isFinite(numero_mesa) ||
      numero_mesa <= 0
    ) {
      throw new Error('numero_mesa es requerido y debe ser > 0');
    }

    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('numero_mesa', numero_mesa)
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(
        `No se pudieron obtener pedidos de la mesa ${numero_mesa}: ${error.message}`
      );
    }
    const rows = (data ?? []) as PedidoDbRow[];
    return rows.map(mapRowFromDb);
  }

  async updateListoCocina(id: number, cocina_listo: boolean): Promise<PedidoRow> {
    const payload: Partial<PedidoDbRow> = {
      cocina_listo,
    };

    const { data, error } = await supabase
      .from(TABLA)
      .update(payload as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `No se pudieron actualizar el flag cocina_listo del pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(
        `No se pudieron actualizar el flag cocina_listo del pedido ${id}: respuesta vacía`
      );
    }

    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 5) Refrescar stream de pendientes en segundo plano
    this.refrescarPedidosPendientes().catch((err) => {
      console.error(
        '[PedidoService] Error refrescando pedidos pendientes tras updateListoCocina:',
        err
      );
    });

    // 👇 NUEVO
    this.pedidosChangesSubject.next();

    return mapped;
  }

  async updateListoBartender(id: number, cocteleria_listo: boolean): Promise<PedidoRow> {
    const payload: Partial<PedidoDbRow> = {
      cocteleria_listo,
    };

    const { data, error } = await supabase
      .from(TABLA)
      .update(payload as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `No se pudieron actualizar el flag cocteleria_listo del pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(
        `No se pudieron actualizar el flag cocteleria_listo del pedido ${id}: respuesta vacía`
      );
    }

    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 5) Refrescar stream de pendientes en segundo plano
    this.refrescarPedidosPendientes().catch((err) => {
      console.error(
        '[PedidoService] Error refrescando pedidos pendientes tras updateListoBartender:',
        err
      );
    });

    // 👇 NUEVO
    this.pedidosChangesSubject.next();

    return mapped;
  }

  async getPedidoPorId(id: number): Promise<PedidoRow | null> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error(`Error obteniendo pedido por id ${id}:`, error);
      return null;
    }
    if (!data) {
      return null;
    }
    return mapRowFromDb(data as PedidoDbRow);
  }

  async updateEstadoListo(id: number, estado: EstadoPedido): Promise<PedidoRow> {
    const payload: Partial<PedidoDbRow> = {
      estado,
    };

    const pedido = await this.getPedidoPorId(id);
    if (!pedido) {
      throw new Error(`No se encontró el pedido con id ${id}`);
    }
    
    console.log('Pedido antes de cocina:', pedido.cocina_listo);
    console.log('Pedido antes de coctelería:', pedido.cocteleria_listo);
    if (pedido.cocina_listo === false || pedido.cocteleria_listo === false) {
      throw new Error(`No se puede marcar como listo un pedido que no está listo en cocina o en coctelería.`);
    }
    
    // 4) Update en Supabase
    const { data, error } = await supabase
    .from(TABLA)
    .update(payload as Record<string, unknown>)
    .eq('id', id)
    .select('*')
    .single();
    
    console.log('Estado pedido: ', data.estado);
    console.log('Estado pedido cocina: ', data.cocina_listo);
    console.log('Estado pedido coctelería: ', data.cocteleria_listo);

    if (error) {
      throw new Error(
        `No se pudieron actualizar los flags del pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(
        `No se pudieron actualizar los flags del pedido ${id}: respuesta vacía`
      );
    }

    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 5) Refrescar stream de pendientes en segundo plano
    this.refrescarPedidosPendientes().catch((err) => {
      console.error(
        '[PedidoService] Error refrescando pedidos pendientes tras updateListos:',
        err
      );
    });

    // 👇 NUEVO
    this.pedidosChangesSubject.next();

    return mapped;
  }

  async updateListos(
    id: number,
    cocina_listo: boolean,
    cocteleria_listo: boolean,
    estado?: EstadoPedido
  ): Promise<PedidoRow> {
    // 1) Validaciones básicas reutilizables
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
      throw new Error('id inválido');
    }
    if (typeof cocina_listo !== 'boolean') {
      throw new Error('cocina_listo debe ser boolean');
    }
    if (typeof cocteleria_listo !== 'boolean') {
      throw new Error('cocteleria_listo debe ser boolean');
    }

    // 2) Validar "estado" si viene
    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
      throw new Error('estado no es válido');
    }

    // 3) Armar payload fuertemente tipado

    const payload: Partial<PedidoDbRow> = {
      cocina_listo,
      cocteleria_listo,
    };

    if (estado !== undefined) {
      payload.estado = estado;
    }

    // 4) Update en Supabase
    const { data, error } = await supabase
      .from(TABLA)
      .update(payload as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `No se pudieron actualizar los flags del pedido ${id}: ${error.message}`
      );
    }
    if (!data) {
      throw new Error(
        `No se pudieron actualizar los flags del pedido ${id}: respuesta vacía`
      );
    }

    const mapped = mapRowFromDb(data as PedidoDbRow);

    // 5) Refrescar stream de pendientes en segundo plano
    this.refrescarPedidosPendientes().catch((err) => {
      console.error(
        '[PedidoService] Error refrescando pedidos pendientes tras updateListos:',
        err
      );
    });

    // 👇 NUEVO
    this.pedidosChangesSubject.next();

    return mapped;
  }


  async getPedidosListosParaMozo() {
    const { data, error } = await supabase
      .from(TABLA)
      .select(`
        id,
        numero_mesa,
        items,
        monto_total,
        tiempo_elaboracion,
        cocina_listo,
        cocteleria_listo,
        estado,
        created_at,
        tipo,
        domicilio_direccion,
        domicilio_lat,
        domicilio_lng
      `)
      .eq('estado', 'listo')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error al cargar pedidos listos:', error);
      return [];
    }
    return data || [];
  }

  async getPedidosDeliveryPorEstados(estados: EstadoPedido[]): Promise<PedidoRow[]> {
    if (!Array.isArray(estados) || estados.length === 0) return [];
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('tipo', 'domicilio')
      .in('estado', estados)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error cargando pedidos delivery:', error);
      return [];
    }
    const rows = (data ?? []) as PedidoDbRow[];
    return rows.map(mapRowFromDb);
  }

  async getPedidosEntregadosPorMesa(numeroMesa: number): Promise<PedidoRow[]> {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('numero_mesa', numeroMesa)
      .eq('estado', 'entregado');

    console.log('Supabase response:', { data, error, numeroMesa });

    if (error) {
      console.error('Error cargando pedidos entregados:', error);
      return [];
    }

    return data || [];
  }

  async confirmarRecepcion(pedidoId: number) {
    const { error } = await supabase
      .from(TABLA)
      .update({ estado: 'recibido' })
      .eq('id', pedidoId);

    if (error) {
      console.error('Error confirmando recepción:', error);
      throw error;
    }
  }

  /**
   * Trae el último pedido de una mesa (id más alto).
   * Si no hay pedidos, devuelve null SIN romper el mapeo.
   */
  async getUltimoPedidoDeMesa(numero_mesa: number): Promise<PedidoRow | null> {
    if (
      typeof numero_mesa !== 'number' ||
      !Number.isFinite(numero_mesa) ||
      numero_mesa <= 0
    ) {
      throw new Error('numero_mesa es requerido y debe ser > 0');
    }

    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('numero_mesa', numero_mesa)
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error al obtener el último pedido de la mesa:', error);
      throw error;
    }

    const rows = (data ?? []) as PedidoDbRow[];
    if (!rows.length) {
      return null;
    }

    return mapRowFromDb(rows[0]);
  }
}
