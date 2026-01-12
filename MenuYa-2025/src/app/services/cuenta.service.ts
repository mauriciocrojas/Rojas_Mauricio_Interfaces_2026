// src/app/services/cuenta.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

export type EstadoCuenta =
  | 'solicitada'
  | 'propina_habilitada'
  | 'pago_pendiente'
  | 'pagado'
  | 'confirmado';

export interface CuentaItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export interface CuentaRow {
  id: number;
  numero_mesa: number;
  cliente_id: string | null; // UUID
  pedidos: CuentaItem[];
  subtotal: number;
  descuento_juego: number;
  propina_pct: number;
  propina_monto: number;
  total_final: number;
  estado: EstadoCuenta;
  qr_propina_token: string | null;
  created_at: string;
  updated_at: string;
}

// Ajustá esta lista a los valores REALES del enum public.estadoPedido
const ESTADOS_PEDIDO_FACTURABLES = ['recibido'] as const;

@Injectable({ providedIn: 'root' })
export class CuentaService {
  async getPedidosParaCuenta(numeroMesa: number) {
    const { data, error } = await supabase
      .from('menuya_pedidos')
      .select('items, monto_total, numero_mesa, created_at, estado')
      .eq('numero_mesa', numeroMesa)
      .in('estado', ESTADOS_PEDIDO_FACTURABLES as any)
      .order('id', { ascending: false })
      .limit(1);

    if (error) throw error;
    const pedidos = (data || []) as any[];

    const detalle: CuentaItem[] = [];
    let subtotal = 0;

    for (const p of pedidos) {
      const items = Array.isArray(p.items) ? p.items : [];
      for (const it of items) {
        const nombre = it?.nombre ?? 'Item';
        const cantidad = Number(it?.cantidad ?? 1);
        const precio = Number(it?.precio ?? it?.precio_unitario ?? 0);
        const importe = +(precio * cantidad).toFixed(2);
        detalle.push({ nombre, cantidad, precio_unitario: precio, importe });
        subtotal += importe;
      }
    }

    return { detalle, subtotal: +subtotal.toFixed(2) };
  }

  calcularTotales(subtotal: number, descuentoJuego: number, propinaPct: number) {
    const base = Math.max(subtotal - (descuentoJuego || 0), 0);
    const propina_monto = +(base * (propinaPct / 100)).toFixed(2);
    const total_final = +(base + propina_monto).toFixed(2);
    return { propina_monto, total_final };
  }

  async crearCuenta(
    numeroMesa: number,
    clienteId: string | null,      // UUID
    pedidosDet: CuentaItem[],
    subtotal: number,
    descuentoJuego: number,
      pedidoId?: number | null      // 👈 NUEVO parámetro opcional

  ) {
    const { propina_monto, total_final } = this.calcularTotales(subtotal, descuentoJuego, 0);

    const { data, error } = await supabase
      .from('menuya_cuentas')
      .insert([{
        numero_mesa: numeroMesa,
        cliente_id: clienteId,
        pedidos: pedidosDet,
        subtotal,
        descuento_juego: descuentoJuego ?? 0,
        propina_pct: 0,
        propina_monto,
        total_final,
        estado: 'solicitada',
          pedido_id: pedidoId ?? null  // 👈 acá

      }])
      .select('*')
      .single();

    if (error) throw error;
    return data as unknown as CuentaRow;
  }

  async getCuentaActivaPorMesa(numeroMesa: number) {
    const { data, error } = await supabase
      .from('menuya_cuentas')
      .select('*')
      .eq('numero_mesa', numeroMesa)
      .in('estado', ['solicitada', 'propina_habilitada', 'pago_pendiente'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as CuentaRow | null;
  }

  async habilitarPropina(cuentaId: number, token?: string) {
    const { data, error } = await supabase
      .from('menuya_cuentas')
      .update({ estado: 'propina_habilitada', qr_propina_token: token ?? null })
      .eq('id', cuentaId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CuentaRow;
  }

  /**
   * Setea la propina y recalcula total_final en la misma fila.
   */
  async setPropina(cuentaId: number, propinaPct: number) {
    // leo lo mínimo que necesito para el cálculo
    const { data: cta, error: e1 } = await supabase
      .from('menuya_cuentas')
      .select('subtotal, descuento_juego')
      .eq('id', cuentaId)
      .single();
    if (e1) throw e1;

    const { propina_monto, total_final } = this.calcularTotales(
      cta.subtotal,
      cta.descuento_juego,
      propinaPct
    );

    const { data, error } = await supabase
      .from('menuya_cuentas')
      .update({
        propina_pct: propinaPct,
        propina_monto,
        total_final
      })
      .eq('id', cuentaId)
      .select('*')
      .single();

    if (error) throw error;
    return data as CuentaRow;
  }

  /**
   * Al pagar, nos aseguramos de que la fila tenga total_final correcto,
   * por si el front venía con una propina simulada y la grabó recién.
   */
  async pagar(cuentaId: number) {
    // traigo lo que hay para recalcular
    const { data: cta, error: e1 } = await supabase
      .from('menuya_cuentas')
      .select('subtotal, descuento_juego, propina_pct')
      .eq('id', cuentaId)
      .single();
    if (e1) throw e1;

    const { propina_monto, total_final } = this.calcularTotales(
      cta.subtotal,
      cta.descuento_juego,
      cta.propina_pct ?? 0
    );

    const { data, error } = await supabase
      .from('menuya_cuentas')
      .update({
        estado: 'pago_pendiente',
        propina_monto,
        total_final
      })
      .eq('id', cuentaId)
      .select('*')
      .single();

    if (error) throw error;
    return data as CuentaRow;
  }

  /**
   * Cuando el mozo confirma, dejamos el estado en 'confirmado'
   * y por las dudas recalculamos total_final si hiciera falta.
   */
  async confirmarPago(cuentaId: number) {
    const { data: cta, error: e1 } = await supabase
      .from('menuya_cuentas')
      .select('subtotal, descuento_juego, propina_pct')
      .eq('id', cuentaId)
      .single();
    if (e1) throw e1;

    const { propina_monto, total_final } = this.calcularTotales(
      cta.subtotal,
      cta.descuento_juego,
      cta.propina_pct ?? 0
    );

    const { data, error } = await supabase
      .from('menuya_cuentas')
      .update({
        estado: 'confirmado',
        propina_monto,
        total_final
      })
      .eq('id', cuentaId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CuentaRow;
  }
}
