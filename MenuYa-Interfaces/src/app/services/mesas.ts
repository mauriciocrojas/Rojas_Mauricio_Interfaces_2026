// src/app/services/mesas.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Subject } from 'rxjs';
import { AuthService } from '../auth.service';
import { ToastController } from '@ionic/angular';
import { Mesa } from './servicio-mesa';

@Injectable({ providedIn: 'root' })
export class MesaService {
  // Estado maître
  selectedClienteId: number | null = null;
  selectedMesaNumero: number | null = null;

  // NUEVO: exposiciones públicas que la UI ya usa
  clientesEnEspera: any[] = [];    // ...existing usage in templates...
  mesasDisponibles: any[] = [];

  // NUEVO: realtime channels y notifier
  private clientesSub: RealtimeChannel | null = null;
  private mesasSub: RealtimeChannel | null = null;
  private _realtimeStarted = false;
  // Emite events: { type: 'clientes'|'mesas' }
  public updates$ = new Subject<{ type: string }>();

  // (legacy) Si en algún lado usabas clientesList, lo mantenemos sincronizado
  clientesList: any[] = [];

  // Estado del cliente actual (para UI)
  enEsperaActual: boolean | null = null;

  constructor(
    private toast: ToastController,
    private auth: AuthService
  ) {}

  // ====== Lógica maître ======
  async loadClientesYMesaDisponibles() {
    try {
      // Clientes: en_espera = TRUE y sin mesa
      const { data: clientes, error: errClientes } = await supabase
        .from('menuya_clientes')
        .select('id, nombres, apellidos, email, mesa_id, en_espera, created_at')
        .eq('en_espera', true)
        .is('mesa_id', null)
        .order('apellidos', { ascending: true });

      if (errClientes) throw errClientes;

      // Actualizamos ambas propiedades para no romper nada
      this.clientesEnEspera = clientes ?? [];
      this.clientesList = clientes ?? [];

      // Mesas disponibles
      const { data: mesas, error: errMesas } = await supabase
        .from('menuya_mesas')
        .select('*')
        .eq('disponible', true)
        .order('numero_mesa', { ascending: true });

      if (errMesas) throw errMesas;
      this.mesasDisponibles = mesas ?? [];
    } catch (err) {
      console.error('Error cargando clientes/mesas:', err);
      const t = await this.toast.create({
        message: 'No se pudo cargar clientes o mesas',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    }
  }

  async asignarMesa(clienteId: number, numeroMesa: number) {
    // Cliente sin mesa y en espera
    const { data: cli, error: e1 } = await supabase
      .from('menuya_clientes')
      .select('mesa_id, en_espera')
      .eq('id', clienteId)
      .single();

    if (e1) throw e1;

    if (cli?.mesa_id) {
      throw new Error(`El cliente ya tiene asignada la mesa ${cli.mesa_id}`);
    }
    if (cli?.en_espera !== true) {
      throw new Error('El cliente no está en lista de espera.');
    }

    // Mesa no ocupada
    const { data: otroCliente, error: e2 } = await supabase
      .from('menuya_clientes')
      .select('id')
      .eq('mesa_id', numeroMesa)
      .maybeSingle();

    if (e2) throw e2;
    if (otroCliente) {
      throw new Error(`La mesa ${numeroMesa} ya está ocupada por otro cliente`);
    }

    // Asignar mesa (no tocamos en_espera acá)
    const { error: e3 } = await supabase
      .from('menuya_clientes')
      .update({ mesa_id: numeroMesa, en_espera: true })
      .eq('id', clienteId);

    await this.actualizarDisponibilidad(numeroMesa, false);
    if (e3) throw e3;

    return `Mesa ${numeroMesa} asignada al cliente correctamente.`;
  }

  /**
   * v2: Asigna una mesa cuando el id del cliente es string.
   * - Mantiene la misma lógica que `asignarMesa`.
   * - Valida que el cliente esté en espera y sin mesa asignada.
   * - Verifica que la mesa no esté ocupada por otro cliente.
   * - Actualiza disponibilidad de la mesa a false.
   */
  async asignarMesaV2(clienteId: string, numeroMesa: number, fecha_reservada: string) {
    // Cliente sin mesa y en espera
    const { data: cli, error: e1 } = await supabase
      .from('menuya_clientes')
      .select('mesa_id, en_espera')
      .eq('id', clienteId)
      .single();

    if (e1) throw e1;

    if (cli?.mesa_id) {
      throw new Error(`El cliente ya tiene asignada la mesa ${cli.mesa_id}`);
    }

    // Mesa no ocupada
    const { data: otroCliente, error: e2 } = await supabase
      .from('menuya_clientes')
      .select('id')
      .eq('mesa_id', numeroMesa)
      .maybeSingle();

    if (e2) throw e2;
    if (otroCliente) {
      throw new Error(`La mesa ${numeroMesa} ya está ocupada por otro cliente`);
    }

    // Asignar mesa (no tocamos en_espera aquí)
    const { error: e3 } = await supabase
      .from('menuya_clientes')
      .update({ mesa_id: numeroMesa, en_espera: true })
      .eq('id', clienteId);

    await this.actualizarDisponibilidadV2(numeroMesa, false, true, fecha_reservada);
    if (e3) throw e3;

    return `Mesa ${numeroMesa} asignada al cliente correctamente.`;
  }

  // ====== Estado del cliente ======
  async obtenerMesaCliente(clienteId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('mesa_id')
      .eq('id', clienteId)
      .single();

    if (error) throw error;
    return (data as any)?.mesa_id ?? null;
  }

  async obtenerEnEspera(clienteId: number): Promise<boolean | null> {
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('en_espera')
      .eq('id', clienteId)
      .single();

    if (error) return null;
    return (data as any)?.en_espera ?? null;
  }

  async setEnEspera(clienteId: number, valor: boolean): Promise<void> {
    const { error } = await supabase
      .from('menuya_clientes')
      .update({ en_espera: valor })
      .eq('id', clienteId);

    if (error) throw error;
  }

  /**
   * Actualiza el campo `disponible` de una mesa por su `numero_mesa`.
   */
  async actualizarDisponibilidad(numero_mesa: number, disponible: boolean): Promise<Mesa> {
    if (typeof numero_mesa !== 'number' || !Number.isFinite(numero_mesa) || numero_mesa <= 0) {
      throw new Error('numero_mesa inválido');
    }

    const { data, error } = await supabase
      .from('menuya_mesas')
      .update({ disponible })
      .eq('numero_mesa', numero_mesa)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Error al actualizar disponibilidad de la mesa ${numero_mesa}: ${error.message}`);
    }

    return data as Mesa;
  }

  /**
   * v2: Actualiza disponibilidad e indica que la mesa quedó reservada.
   * - Además de `disponible`, setea `reservada = TRUE`.
   * - Mantiene validaciones del número de mesa.
   */
  async actualizarDisponibilidadV2(numero_mesa: number, disponible: boolean, reservada: boolean, fecha_reservada: string): Promise<Mesa> {
    if (typeof numero_mesa !== 'number' || !Number.isFinite(numero_mesa) || numero_mesa <= 0) {
      throw new Error('numero_mesa inválido');
    }

    const { data, error } = await supabase
      .from('menuya_mesas')
      .update({ disponible, reservada, fecha_reservada })
      .eq('numero_mesa', numero_mesa)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Error al actualizar mesa ${numero_mesa}: ${error.message}`);
    }

    return data;
  }

  /**
   * Devuelve solo las mesas disponibles y válidas para asignar.
   * Criterios:
   *  - `disponible` = TRUE
   *  - `numero_mesa` != 9999 (mesa reservada para pruebas/placeholder)
   * Ordena por `numero_mesa` ascendente.
   */
  async obtenerMesasDisponiblesValidas(): Promise<any[]> {
    const { data, error } = await supabase
      .from('menuya_mesas')
      .select('numero_mesa, cantidad_comensales, tipo, disponible, foto')
      .eq('disponible', true)
      .eq('reservada', false)
      .neq('numero_mesa', 9999)
      .order('numero_mesa', { ascending: true });

    if (error) {
      console.error('[MesaService] obtenerMesasDisponiblesValidas error:', error);
      throw error;
    }

    return data ?? [];
  }

  // Inicia watchers Realtime (idempotente)
  async startRealtimeWatch() {
    if (this._realtimeStarted) return;
    this._realtimeStarted = true;

    try {
      // Cliente changes: cualquier cambio en menuya_clientes (nuevo, update, delete)
      this.clientesSub = supabase
        .channel('mesa_service_clientes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menuya_clientes' },
          async (_payload) => {
            // recargar listados (implementado en el servicio)
            try { await this.loadClientesYMesaDisponibles(); } catch (e) { console.warn('[MESAS] reload clientes error', e); }
            this.updates$.next({ type: 'clientes' });
          }
        )
        .subscribe((s) => console.log('[MESAS] clientesSub status', s));
    } catch (err) {
      console.warn('[MESAS] error creando clientesSub', err);
    }

    try {
      // Mesas changes: cualquier cambio en menú de mesas (disponibilidad)
      this.mesasSub = supabase
        .channel('mesa_service_mesas')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menuya_mesas' },
          async (_payload) => {
            try { await this.loadClientesYMesaDisponibles(); } catch (e) { console.warn('[MESAS] reload mesas error', e); }
            this.updates$.next({ type: 'mesas' });
          }
        )
        .subscribe((s) => console.log('[MESAS] mesasSub status', s));
    } catch (err) {
      console.warn('[MESAS] error creando mesasSub', err);
    }
  }

  // Detiene watchers y limpia recursos
  stopRealtimeWatch() {
    if (!this._realtimeStarted) return;
    this._realtimeStarted = false;

    try {
      if (this.clientesSub) {
        supabase.removeChannel(this.clientesSub);
        this.clientesSub = null;
      }
    } catch (e) { console.warn('[MESAS] error removing clientesSub', e); }

    try {
      if (this.mesasSub) {
        supabase.removeChannel(this.mesasSub);
        this.mesasSub = null;
      }
    } catch (e) { console.warn('[MESAS] error removing mesasSub', e); }
  }
}
