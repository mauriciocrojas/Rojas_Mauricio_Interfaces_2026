// src/app/services/encuestas.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

export type EncuestaRatings = {
  servicio: number;
  comida: number;
  precio_calidad: number;
  experiencia: number;
};

export type EncuestaInsert = {
  cliente_id: string | number;
  mesa_id: number;
  ratings: EncuestaRatings;
  comentario?: string | null;
};

export type EncuestaRow = {
  id: number;
  cliente_id: string | number;
  mesa_id: number;
  created_at: string;
  ratings: EncuestaRatings;
  comentario?: string | null;
};

export type Distribucion = { [k in 1|2|3|4|5]: number } & { total: number; promedio: number };

export type Estadisticas = {
  servicio: Distribucion;
  comida: Distribucion;
  precio_calidad: Distribucion;
  experiencia: Distribucion;
  porFecha: Array<{ fecha: string; promedioExperiencia: number; total: number }>;
  totalEncuestas: number;
};

@Injectable({ providedIn: 'root' })
export class EncuestasService {
  private readonly TABLE = 'menuya_encuestas';

  async yaRespondioHoy(clienteId: string | number, mesaId: number): Promise<boolean> {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from(this.TABLE)
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('mesa_id', mesaId)
      .gte('created_at', inicioHoy.toISOString());

    if (error) {
      console.error('[EncuestasService] yaRespondioHoy error:', error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  async guardarEncuesta(payload: EncuestaInsert): Promise<void> {
    const row = {
      cliente_id: payload.cliente_id,
      mesa_id: payload.mesa_id,
      ratings: payload.ratings as any,
      comentario: payload.comentario ?? null,
    };

    const { error } = await supabase.from(this.TABLE).insert(row);
    if (error) {
      console.error('[EncuestasService] guardarEncuesta error:', error);
      throw error;
    }
  }

  async obtenerEncuestas(mesaId?: number): Promise<EncuestaRow[]> {
    let query = supabase
      .from(this.TABLE)
      .select('id, cliente_id, mesa_id, created_at, ratings, comentario')
      .order('created_at', { ascending: true });

    if (mesaId && Number.isFinite(mesaId)) {
      query = query.eq('mesa_id', mesaId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[EncuestasService] obtenerEncuestas error:', error);
      return [];
    }
    return (data ?? []) as EncuestaRow[];
  }

  private initDistribucion(): Distribucion {
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, promedio: 0 } as Distribucion;
  }

  calcularEstadisticas(rows: EncuestaRow[]): Estadisticas {
    const campos: (keyof EncuestaRatings)[] = [
      'servicio',
      'comida',
      'precio_calidad',
      'experiencia',
    ];

    const dist: Record<keyof EncuestaRatings, Distribucion> = {
      servicio: this.initDistribucion(),
      comida: this.initDistribucion(),
      precio_calidad: this.initDistribucion(),
      experiencia: this.initDistribucion(),
    } as any;

    const porFechaMap = new Map<string, { suma: number; total: number }>();

    for (const r of rows) {
      for (const c of campos) {
        const v = Number((r.ratings as any)?.[c]) || 0;
        if (v >= 1 && v <= 5) {
          (dist[c] as any)[v] = (dist[c] as any)[v] + 1;
          dist[c].total += 1;
        }
      }

      // experiencia promedio por día
      const fecha = (r.created_at || '').slice(0, 10);
      const vExp = Number((r.ratings as any)?.experiencia) || 0;
      if (vExp >= 1 && vExp <= 5) {
        const prev = porFechaMap.get(fecha) || { suma: 0, total: 0 };
        prev.suma += vExp;
        prev.total += 1;
        porFechaMap.set(fecha, prev);
      }
    }

    for (const c of campos) {
      const d = dist[c];
      if (d.total > 0) {
        const sum = (1 * d[1]) + (2 * d[2]) + (3 * d[3]) + (4 * d[4]) + (5 * d[5]);
        d.promedio = sum / d.total;
      }
    }

    const porFecha = Array.from(porFechaMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, v]) => ({ fecha, promedioExperiencia: v.suma / v.total, total: v.total }));

    return {
      servicio: dist.servicio,
      comida: dist.comida,
      precio_calidad: dist.precio_calidad,
      experiencia: dist.experiencia,
      porFecha,
      totalEncuestas: rows.length,
    };
  }
}
