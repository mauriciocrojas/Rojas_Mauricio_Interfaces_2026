import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { StorageError } from '@supabase/storage-js';
import { Subject, Observable } from 'rxjs';

const TABLA = 'menuya_mesas';
const BUCKET = 'menuYa_mesas_imagenes';

// Definición de la entidad Mesa
export interface Mesa {
  numero_mesa: number; // número de la mesa (único)
  cantidad_comensales: number;
  tipo: string; // VIP / Estándar
  disponible: boolean; // true si está disponible, false si está ocupada o reservada
  foto: string | null
  bucket_imagenes: string; 
  codigo_qr?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MesaService {
  private supabase = supabase;

  // 🔔 Eventos de cambios de mesas (para estado_mesas, etc.)
  private mesasChangesSubject = new Subject<void>();
  mesasChanges$: Observable<void> = this.mesasChangesSubject.asObservable();

  private mesasRealtimeInitialized = false

  constructor() {
    this.initMesasRealtime();
  }

  /**
   * Inicializa Realtime sobre menuya_mesas.
   * Cada cambio (INSERT/UPDATE/DELETE) dispara mesasChanges$.
   */
  private initMesasRealtime() {
    if (this.mesasRealtimeInitialized) return;
    this.mesasRealtimeInitialized = true;

    console.log('[MesaService] initMesasRealtime');

    this.supabase
      .channel('rt-menuya-mesas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLA },
        (payload) => {
          console.log('[MesaService] Realtime mesas payload:', payload);
          // Notificar a los observadores (EstadoMesasPage, etc.)
          this.mesasChangesSubject.next();
        }
      )
      .subscribe((status) => {
        console.log('[MesaService] Realtime mesas status:', status);
      });
  }

  /**
  * Valida tipo y tamaño de imagen antes de subir
  */
  private validarImagen(file: File): void {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (!tiposPermitidos.includes(file.type)) {
      throw new Error('Tipo de archivo no permitido. Solo se permiten JPG y PNG.');
    }

    // if (file.size > maxSize) {
    //   throw new Error('El archivo excede el tamaño máximo permitido de 2MB.');
    // }
  }

  /**
   * Sube la imagen de la mesa al bucket y devuelve el path
   */
  private async subirImagenMesa(file: File, numeroMesa: number): Promise<string> {
    this.validarImagen(file);

    const path = `mesa_${numeroMesa}_${Date.now()}.${file.name.split('.').pop()}`;

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true });

    if (error) {
      throw new Error(`Error al subir la imagen: ${error.message}`);
    }

    return path;
  }

  /**
   * Crea una nueva mesa en la tabla y guarda su imagen
   */
  async crearMesa(mesa: Omit<Mesa, 'foto' | 'bucket_imagenes'>, file?: File): Promise<Mesa> {
    let pathFoto: string | null = null;

    const existeMesa = await this.getMesaPorId(mesa.numero_mesa);
    if (existeMesa) {
      throw new Error(`Ya existe una mesa con el número ${mesa.numero_mesa}.`);
    }
    
    if (file) {
      pathFoto = await this.subirImagenMesa(file, mesa.numero_mesa);
    }

    const { data, error } = await this.supabase
      .from(TABLA)
      .insert({
        ...mesa,
        foto: pathFoto,
        // bucket_imagenes: BUCKET
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar mesa: ${error.message}`);
    }

    this.mesasChangesSubject.next();
    
    return data as Mesa;
  }

  async getMesaPorId(numero_mesa: number): Promise<Mesa | null> {
    const { data, error } = await this.supabase
      .from(TABLA)
      .select('*')
      .eq('numero_mesa', numero_mesa)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al traer la mesa con numero_mesa ${numero_mesa}: ${error.message}`);
    }

    return (data ?? null) as Mesa | null;
  }

  /**
   * Trae todas las mesas
   */
  async getTodasMesas(): Promise<Mesa[]> {
    const { data, error } = await this.supabase
      .from(TABLA)
      .select('*');

    if (error) {
      throw new Error(`Error al traer todas las mesas: ${error.message}`);
    }

    return data as Mesa[];
  }

  /**
   * Actualiza el campo `disponible` de una mesa por su `numero_mesa`.
   */
  async actualizarDisponibilidad(numero_mesa: number, disponible: boolean): Promise<Mesa> {
    if (typeof numero_mesa !== 'number' || !Number.isFinite(numero_mesa) || numero_mesa <= 0) {
      throw new Error('numero_mesa inválido');
    }

    const { data, error } = await this.supabase
      .from(TABLA)
      .update({ disponible })
      .eq('numero_mesa', numero_mesa)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Error al actualizar disponibilidad de la mesa ${numero_mesa}: ${error.message}`);
    }

    this.mesasChangesSubject.next();

    return data as Mesa;
  }
}
