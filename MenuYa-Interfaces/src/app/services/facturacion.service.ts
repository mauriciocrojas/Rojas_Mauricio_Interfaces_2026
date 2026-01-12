import { Injectable } from '@angular/core';
import { FacturaPdfService } from './factura-pdf.service';
import type { DetalleCuenta, DatosCliente } from 'src/app/models/facturacion';
import { EmailService } from '../email.service';
import { supabase } from '../supabase.client';
import { PushNotificationService } from '../services/push-notification.service';

@Injectable({ providedIn: 'root' })
export class FacturacionService {

  private restauranteNombre = 'MenuYa';
  private restauranteDireccion = 'Avenida Mitre 750, Avellaneda';

  constructor(
    private pdfSrv: FacturaPdfService,
    private emailSrv: EmailService,
    private pushNotificationService: PushNotificationService
  ) { }

  async emitirYEnviarFactura(params: {
    pedidoId: number;
    cliente: DatosCliente;
    detalle: DetalleCuenta;
    mesaNumero?: number;
  }) {
    const fecha = new Date();

    // AAAAMMDD
    const yyyymmdd = fecha.toISOString().slice(0, 10).replace(/-/g, '');

    // HHMMSSmmm (hora, min, seg y milisegundos para que nunca se repita)
    const hhmmssmmm = fecha
      .toISOString()        // ej: 2025-11-26T23:15:42.123Z
      .slice(11, 23)        // "23:15:42.123"
      .replace(/[:.]/g, ''); // "231542123"

    // Número de factura único por emisión
    const numeroFactura = `FAC-${yyyymmdd}-${hhmmssmmm}-${params.pedidoId}`;

    // Nombre de archivo = número de factura
    const fileName = `${numeroFactura}.pdf`;


    // --- 0) Resolver mesa si no vino ---
    let mesaNumero = params.mesaNumero ?? null;
    if (mesaNumero == null) {
      try {
        const { data } = await supabase
          .from('menuya_pedidos')
          .select('numero_mesa')
          .eq('id', params.pedidoId)
          .maybeSingle();
        if (data?.numero_mesa != null) mesaNumero = Number(data.numero_mesa);
      } catch {
        // ignore
      }
    }

    // --- 0.b) Intentar leer la cuenta real de la mesa para tomar propina/descuento reales ---
    // Esto es clave para que la factura saque exactamente lo que está en la DB,
    // incluso si el front mandó el detalle sin la propina actualizada.
    let cuentaDb: {
      subtotal: number | null;
      descuento_juego: number | null;
      propina_pct: number | null;
      propina_monto: number | null;
      total_final: number | null;
    } | null = null;

    if (mesaNumero != null) {
      try {
        const { data } = await supabase
          .from('menuya_cuentas')
          .select('subtotal,descuento_juego,propina_pct,propina_monto,total_final')
          .eq('numero_mesa', mesaNumero)
          .in('estado', ['pago_confirmado', 'pagado', 'cerrada', 'liberada', 'pago_realizado'])
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          cuentaDb = data as any;
        }
      } catch (e) {
        console.warn('[Factura] No se pudo leer la cuenta de la mesa, sigo con los datos que vinieron:', e);
      }
    }

    // 👉 Recalcular total tomando primero lo que haya en la DB
    const subtotal = (cuentaDb?.subtotal ?? params.detalle.subtotal ?? 0);
    const descuento = (cuentaDb?.descuento_juego ?? params.detalle.descuentoJuegos ?? 0);
    const propina = (
      // prioridad: lo que está en la cuenta de la DB
      cuentaDb?.propina_monto ??
      // después, lo que vino en el detalle
      params.detalle.propina ??
      0
    );
    const base = Math.max(subtotal - descuento, 0);
    // si la cuenta en DB ya tiene total_final, lo usamos; si no, lo calculamos
    const totalCalc = cuentaDb?.total_final != null
      ? +(+cuentaDb.total_final).toFixed(2)
      : +(base + propina).toFixed(2);

    // forzar que el detalle tenga el total y la propina correctos
    params.detalle.subtotal = subtotal;
    params.detalle.descuentoJuegos = descuento;
    params.detalle.propina = propina;
    params.detalle.total = totalCalc;

    // --- 1) Generar PDF ---
    let pdfBase64 = '';
    let fechaFactura = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(fecha);
    try {
      const pdf = await this.pdfSrv.generarFacturaPdf({
        restauranteNombre: this.restauranteNombre,
        restauranteDireccion: this.restauranteDireccion,
        datosCliente: params.cliente,
        detalle: params.detalle,
        numeroFactura,
        fecha,
      });
      pdfBase64 = pdf.base64;
      fechaFactura = pdf.fecha;
      console.info('[Factura] PDF generado:', fileName);
    } catch (e) {
      console.error('[Factura] No se pudo generar el PDF:', e);
      throw e;
    }

    // --- 2) Subir a Storage ---
    let linkPublico: string | undefined;
    try {
      const bucket = 'facturas';
      const path = fileName;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(
          path,
          this.base64ToBlob(pdfBase64, 'application/pdf'),
          { upsert: true, contentType: 'application/pdf' }
        );
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      linkPublico = data.publicUrl;
      console.info('[Factura] Subida OK. Public URL:', linkPublico);
    } catch (e) {
      console.error('[Factura] Error subiendo a Storage:', e);
    }

    // --- 3) Email si hay ---
    const destinatario = (params.cliente?.email || '').trim();
    if (destinatario) {
      try {
        await this.emailSrv.enviarFactura({
          destinatario,
          nombres: params.cliente.nombre,
          numeroFactura,
          fecha: fechaFactura,
          totalFormateado: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
            .format(totalCalc),
          linkDescarga: linkPublico,
          pdfBase64,
          fileName,
        });
      } catch (err) {
        console.warn('[Factura] Falló el envío de email (continuo igual):', err);
      }
    }

    // --- 4) Guardar referencia para anónimo ---
    if (mesaNumero != null && linkPublico) {
      try {
        await supabase.from('menuya_facturas').insert([{
          numero_mesa: mesaNumero,
          pedido_id: params.pedidoId,
          archivo: fileName,
          url_publica: linkPublico
        }]);
        this.pushNotificationService.sendNotificationToRole({
          role: 'anonimo',
          title: `Mesa ${mesaNumero}: Factura lista para descargar`,
          body: `Click para descargar tu factura.`,
          data: {
            tipo: 'factura_lista',
            url: linkPublico      // 👈 importante
          }
        });
      } catch (e) {
        console.warn('[Factura] No se pudo insertar en menuya_facturas (sigo):', e);
      }
    }

    return { numeroFactura, fileName, linkPublico };
  }

  private base64ToBlob(b64: string, contentType: string) {
    const byteChars = atob(b64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNums);
    return new Blob([byteArray], { type: contentType });
  }
}
