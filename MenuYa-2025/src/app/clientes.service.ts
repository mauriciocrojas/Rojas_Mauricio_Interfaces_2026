// src/app/services/clientes.service.ts
import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';
import { BehaviorSubject, Observable } from 'rxjs';

export type Cliente = {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  foto_url?: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  created_at: string;
  mesa_id: number | null;
  auth_user_id?: string | null;
  rol?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly TABLE = 'menuya_clientes';

  private pendientesSubject = new BehaviorSubject<Cliente[]>([]);
  pendientes$: Observable<Cliente[]> = this.pendientesSubject.asObservable();

  private pendientesRealtimeInitialized = false;

  constructor() {
    // Opcion 1: inicializar acá y marcar el flag
    this.pendientesRealtimeInitialized = true;
    this.initPendientesRealtime();
  }

  observePendientes(): Observable<Cliente[]> {
    // Si preferís inicializar lazy, podés NO llamar en el constructor
    // y dejar solo este bloque:
    //
    // if (!this.pendientesRealtimeInitialized) {
    //   this.pendientesRealtimeInitialized = true;
    //   this.initPendientesRealtime();
    // }

    return this.pendientes$;
  }

  private async initPendientesRealtime() {
    console.log('[ClientesService] initPendientesRealtime');

    // 1) Carga inicial
    try {
      const rows = await this.listarPendientes();
      this.pendientesSubject.next(rows);
    } catch (err) {
      console.error('[ClientesService] initPendientesRealtime listarPendientes error:', err);
    }

    // 2) Suscripción Realtime
    supabase
      .channel('rt-clientes-pendientes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: this.TABLE },
        payload => {
          const nuevo = payload.new as Cliente;
          console.log('[ClientesService] INSERT payload:', payload);

          if (nuevo.estado === 'pendiente') {
            const actuales = this.pendientesSubject.getValue();
            if (!actuales.some(c => c.id === nuevo.id)) {
              this.pendientesSubject.next([...actuales, nuevo]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: this.TABLE },
        payload => {
          const actualizado = payload.new as Cliente;
          console.log('[ClientesService] UPDATE payload:', payload);

          const actuales = this.pendientesSubject.getValue();
          const yaExiste = actuales.some(c => c.id === actualizado.id);

          if (actualizado.estado !== 'pendiente') {
            if (yaExiste) {
              this.pendientesSubject.next(
                actuales.filter(c => c.id !== actualizado.id)
              );
            }
          } else {
            if (yaExiste) {
              this.pendientesSubject.next(
                actuales.map(c => (c.id === actualizado.id ? actualizado : c))
              );
            } else {
              this.pendientesSubject.next([...actuales, actualizado]);
            }
          }
        }
      )
      .subscribe(status => {
        console.info('[ClientesService] Realtime pendientes status:', status);
      });
  }

  /**
   * Lista clientes en estado 'pendiente'.
   * - Usa selección de columnas explícita para evitar datos innecesarios.
   * - Ordena por apellido y created_at (asc).
   * - Loguea length y errores para debug (RLS suele aparecer como "permission denied").
   */
  async listarPendientes(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from(this.TABLE)
      .select('id, nombres, apellidos, dni, email, foto_url, estado, created_at')
      .eq('estado', 'pendiente')
      .order('apellidos', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ClientesService] listarPendientes error:', error);
      throw error;
    }

    const rows = (data ?? []) as Cliente[];
    console.info('[ClientesService] listarPendientes rows:', rows.length);
    return rows;
  }

  /**
   * Contador rápido para validar si hay pendientes (útil para descartar RLS vs. falta de datos).
   */
  async contarPendientes(): Promise<number> {
    const { count, error } = await supabase
      .from(this.TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente');

    if (error) {
      console.error('[ClientesService] contarPendientes error:', error);
      throw error;
    }

    console.info('[ClientesService] contarPendientes:', count ?? 0);
    return count ?? 0;
  }

  /**
   * Actualiza el estado de un cliente y devuelve el registro actualizado.
   */
  async actualizarEstado(
    id: string,
    estado: 'aprobado' | 'rechazado'
  ): Promise<Cliente> {
    const { data, error } = await supabase
      .from(this.TABLE)
      .update({ estado })
      .eq('id', id)
      .select('id, nombres, apellidos, dni, email, foto_url, estado, created_at, mesa_id, auth_user_id, rol')
      .single();

    if (error) {
      console.error('[ClientesService] actualizarEstado error:', error);
      throw error;
    }

    console.info('[ClientesService] actualizarEstado OK ->', id, '=>', estado);
    return data as Cliente;
  }

  async getClienteIdByEmail(email: string | null): Promise<number | null> {
    if (!email) return null;

    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('id')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error obteniendo id de cliente:', error);
      return null;
    }

    return data?.id ?? null;
  }

  async getClienteByEmail(email: string): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('*')
      .eq('email', email)
      .single();
    if (error) {
      console.error('Error obteniendo cliente por email:', error);
      return null;
    }
    return data as Cliente;
  }

  async getClienteById(id: string): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error('Error obteniendo cliente por id:', error);
      return null;
    }
    return data as Cliente;
  }

  async getClienteByMesaId(mesa_id: number): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from(this.TABLE)
      .select('id, nombres, apellidos, dni, email, foto_url, estado, created_at, mesa_id, auth_user_id, rol')
      .eq('mesa_id', mesa_id)
      .maybeSingle();                // ← evita throw cuando hay 0 filas

    if (error && error.code !== 'PGRST116') {
      console.error('Error obteniendo cliente por mesa_id:', error);
      throw error;
    }
    return data ?? null;
  }


  async updateMesa(cliente_id: string, mesa_id: number | null): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('menuya_clientes')
      .update({ mesa_id })
      .eq('id', cliente_id)
      .select('*')
      .single();
    if (error) {
      console.error('Error actualizando mesa_id del cliente:', error);
      return null;
    }
    return data as Cliente;
  }
}
