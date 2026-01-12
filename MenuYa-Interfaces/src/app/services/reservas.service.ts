// src/app/services/reservas.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../auth.service';
import { EmailService } from '../email.service';
import { ClientesService } from '../clientes.service';
import { SpinnerService } from '../services/spinner';
import { Subject } from 'rxjs'; // 👈 NUEVO

export interface Reserva {
  id: string;
  cliente_id: string;
  fecha_hora: string; // ISO
  personas: number;
  notas?: string | null;
  estado?: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })

export class ReservasService {
  private readonly TABLE = 'menuya_reservas';

  // 👇 Emisor para notificar cambios en reservas
  private reservasChangesSubject = new Subject<void>();
  reservasChanges$ = this.reservasChangesSubject.asObservable();

  // Guardamos el canal para evitar duplicarlo
  private reservasChannel = supabase.channel('menuya-reservas-realtime');

  constructor(
    private auth: AuthService,
    private emailService: EmailService,
    private clientesService: ClientesService,
    private spinner: SpinnerService
  ) {
    // Configurar canal Realtime para escuchar cambios en la tabla de reservas
    this.initRealtime(); // 👈 iniciamos el realtime cuando se crea el servicio
  }

  /**
   * Inicializa el canal de tiempo real sobre la tabla de reservas.
   * Cada INSERT / UPDATE / DELETE dispara reservasChanges$.
   */
  private initRealtime() {
    this.reservasChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: this.TABLE,
        },
        (payload) => {
          console.log('[ReservasService] Realtime payload:', payload);
          this.reservasChangesSubject.next();
        }
      )
      .subscribe((status) => {
        console.log('[ReservasService] Realtime status:', status);
      });
  }


  /**
   * Convierte una fecha a ISO con zona horaria de Buenos Aires (UTC-03:00).
   * Ejemplo: 2025-11-14T20:30:00-03:00
   */
  private toBuenosAiresISO(date: Date): string {
    const tz = 'America/Argentina/Buenos_Aires';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    const isoLocal = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    // Argentina (Buenos Aires) actualmente es UTC-03 todo el año
    return `${isoLocal}-03:00`;
  }

  async getCurrentApprovedCliente(): Promise<{ id: string; email: string; nombres: string; apellidos: string } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? null;
    if (!email) return null;
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('id, email, estado, nombres, apellidos')
      .ilike('email', email)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data || data.estado !== 'aprobado') return null;
    return { id: data.id, email: data.email, nombres: (data as any).nombres || '', apellidos: (data as any).apellidos || '' };
  }

  async crearReserva(input: { fecha_hora: Date; personas: number; notas?: string | null }): Promise<Reserva> {
    // Solo clientes aprobados
    const cliente = await this.getCurrentApprovedCliente();
    if (!cliente) throw new Error('Solo clientes registrados aprobados pueden reservar.');

    // Validaciones
    const now = new Date();
    const when = new Date(input.fecha_hora);
    if (isNaN(when.getTime())) throw new Error('Fecha y hora inválidas.');
    if (when.getTime() <= now.getTime()) throw new Error('La reserva debe ser en el futuro.');
    if (input.personas < 1 || input.personas > 10) throw new Error('Cantidad de personas inválida (1-10).');

    // Evitar duplicados exactos (misma fecha/hora para el mismo cliente)
    const fechaBA = this.toBuenosAiresISO(when);
    const { data: dupList, error: dupErr } = await supabase
      .from(this.TABLE)
      .select('id')
      .eq('cliente_id', cliente.id)
      .eq('fecha_hora', fechaBA)
      .limit(1);
    if (dupErr) throw dupErr;
    if ((dupList ?? []).length) throw new Error('Ya tenés una reserva en ese horario.');

    const payload = {
      cliente_id: cliente.id,
      fecha_hora: fechaBA,
      personas: input.personas,
      notas: input.notas ?? null,
    };

    const { data, error } = await supabase
      .from(this.TABLE)
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;

    // 👇 Notificar a los observadores dentro de la app
    this.reservasChangesSubject.next();

    // Disparar push a dueños/supervisores (no bloquear al usuario si falla)
    try {
      const fecha = new Date(payload.fecha_hora);
      const fechaLocal = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(fecha);
      this.auth
        .notifyRoles(
          ['dueno', 'supervisor', 'dueño'],
          'Nueva reserva',
          `Cliente ${cliente.email} reservó para ${payload.personas} • ${fechaLocal}`,
          {
            tipo: 'reserva',
            reservaId: (data as any)?.id,
            clienteId: cliente.id,
            route: '/gestion-reservas',
          }
        )
        .catch((err) => console.warn('Push roles fallo:', err));
    } catch (err) {
      console.warn('No se pudo disparar push:', err);
    }

    return data as Reserva;
  }

  async misReservas(): Promise<Reserva[]> {
    const { data, error } = await supabase
      .from(this.TABLE)
      .select('id, cliente_id, fecha_hora, personas, notas, estado, created_at')
      .order('fecha_hora', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Reserva[];
  }


async cancelarReserva(reservaId: string, notas?: string): Promise<void> {
  await this.spinner.show();
  try {
    const { data: reserva, error: fetchErr } = await supabase
      .from(this.TABLE)
      .select('id, cliente_id, fecha_hora, estado, personas, notas')
      .eq('id', reservaId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!reserva) throw new Error('Reserva no encontrada.');
    if (reserva.estado === 'cancelada') throw new Error('La reserva ya está cancelada.');

    const cliente = await this.clientesService.getClienteById(reserva.cliente_id);
    if (!cliente) throw new Error('Cliente no autenticado.');
    if (!cliente) throw new Error('Cliente asociado a la reserva no encontrado.');

    const updatePayload: any = { estado: 'cancelada' };
    if (typeof notas !== 'undefined') updatePayload.notas = notas;

    const { error: cancelErr } = await supabase
      .from(this.TABLE)
      .update(updatePayload)
      .eq('id', reservaId);
    if (cancelErr) throw cancelErr;

    // 👇 Avisar que cambió algo en reservas
    this.reservasChangesSubject.next();

    // Enviar email de estado de reserva (cancelada => tratamos como rechazada en la plantilla)
    try {
      const fechaLocal = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date((reserva as any).fecha_hora));

      await this.emailService.enviarEstadoReserva({
        destinatario: cliente.email,
        nombres: `${(cliente.nombres || '').trim()} ${(cliente.apellidos || '').trim()}`.trim(),
        estado: 'rechazada',
        fecha: fechaLocal,
        personas: (reserva as any).personas,
        notas: typeof notas !== 'undefined' ? notas : (reserva as any).notas,
      });
    } catch (e) {
      console.warn('[Reserva] Error enviando email de cancelación (continuo):', e);
    }
  } finally {
    await this.spinner.hide();
  }
}

// Confirma una reserva y notifica por email al cliente
async confirmarReserva(reservaId: string, notas?: string): Promise<void> {
  await this.spinner.show();
  try {
    const { data: reserva, error: fetchErr } = await supabase
      .from(this.TABLE)
      .select('id, cliente_id, fecha_hora, estado, personas, notas')
      .eq('id', reservaId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!reserva) throw new Error('Reserva no encontrada.');
    if (reserva.estado === 'confirmada') throw new Error('La reserva ya está confirmada.');

    const cliente = await this.clientesService.getClienteById(reserva.cliente_id);
    if (!cliente) throw new Error('Cliente asociado a la reserva no encontrado.');

    const updatePayload: any = { estado: 'confirmada' };
    if (typeof notas !== 'undefined') updatePayload.notas = notas;

    const { error: updErr } = await supabase
      .from(this.TABLE)
      .update(updatePayload)
      .eq('id', reservaId);
    if (updErr) throw updErr;

    // 👇 Avisar que cambió algo en reservas
    this.reservasChangesSubject.next();

    // Enviar email de estado de reserva (confirmada)
    try {
      const fechaLocal = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date((reserva as any).fecha_hora));

      await this.emailService.enviarEstadoReserva({
        destinatario: cliente.email,
        nombres: `${(cliente.nombres || '').trim()} ${(cliente.apellidos || '').trim()}`.trim(),
        estado: 'confirmada',
        fecha: fechaLocal,
        personas: (reserva as any).personas,
        notas: typeof notas !== 'undefined' ? notas : (reserva as any).notas,
      });
    } catch (e) {
      console.warn('[Reserva] Error enviando email de confirmación (continuo):', e);
    }
  } finally {
    await this.spinner.hide();
  }
}

  /**
   * Obtiene una reserva por su id.
   * Devuelve null si no existe.
   */
  async obtenerReservaPorId(id: string): Promise<Reserva | null> {
    const { data, error } = await supabase
      .from(this.TABLE)
      .select('id, cliente_id, fecha_hora, personas, notas, estado, created_at')
      .eq('id', id)
      .maybeSingle();

    if ((error as any) && (error as any).code !== 'PGRST116') {
      throw error as any;
    }

    return (data ?? null) as Reserva | null;
  }
}
