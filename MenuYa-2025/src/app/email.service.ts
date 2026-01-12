// src/app/services/email.service.ts
import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_prvd5g7';
const EMAILJS_TEMPLATE_ID = 'template_vofo5xo';
const EMAILJS_TEMPLATE_RESERVAS = 'template_634f0wp'; // plantilla alternativa para reservas
const EMAILJS_PUBLIC_KEY  = 'EvOo6_7MpdAIgd_At';

const FROM_EMAIL = 'menuya2025@gmail.com';
const FROM_NAME  = 'MenuYa Notificaciones';

// ~30KB de margen para variables (evitamos 50KB)
const VARS_SIZE_SOFT_LIMIT = 30 * 1024;
// ~400KB para adjunto base64 (suele pasar), ajustá si querés.
const ATTACH_BASE64_SOFT_LIMIT = 400 * 1024;

@Injectable({ providedIn: 'root' })
export class EmailService {

  private buildParams(
    destinatario: string,
    nombres: string,
    estado: 'aprobado' | 'rechazado'
  ) {
    const aprobado = estado === 'aprobado';
    const color_estado = aprobado ? '#28a745' : '#E44D3D';
    const titulo = aprobado ? '¡Registro aprobado!' : 'Registro rechazado';
    const estado_texto = aprobado
      ? 'Nos alegra informarte que tu registro en MenuYa fue APROBADO. Ya podés iniciar sesión y empezar a usar la aplicación. ¡Bienvenido!'
      : 'Lamentamos informarte que tu registro en MenuYa fue RECHAZADO. Si pensás que se trata de un error, por favor contactá a nuestro equipo de soporte.';

    return {
      to_email: destinatario,
      to_name: nombres,
      from_email: FROM_EMAIL,
      from_name: FROM_NAME,
      subject: aprobado ? '¡Tu registro fue aprobado!' : 'Estado de tu registro: Rechazado',
      titulo,
      estado_texto,
      color_estado,
      year: new Date().getFullYear()
    };
  }

  async enviarEstadoRegistro(
    destinatario: string,
    nombres: string,
    estado: 'aprobado' | 'rechazado'
  ) {
    const params = this.buildParams(destinatario, nombres, estado);
    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, {
      publicKey: EMAILJS_PUBLIC_KEY
    });
  }

  async enviarFactura(params: {
  destinatario: string;
  nombres: string;
  numeroFactura: string;
  fecha: string;
  totalFormateado: string;
  linkDescarga?: string;
  pdfBase64: string;   // requerido
  fileName: string;
}) {
  const vars = {
    to_email: params.destinatario,
    to_name: params.nombres,
    from_email: FROM_EMAIL,
    from_name: FROM_NAME,
    subject: `Tu factura ${params.numeroFactura} - MenuYa`,
    titulo: `¡Gracias por tu pago!`,
    estado_texto:
      `Adjuntamos tu factura ${params.numeroFactura} del ${params.fecha}. ` +
      `Importe total: ${params.totalFormateado}.` +
      (params.linkDescarga ? ` Descargala desde acá: ${params.linkDescarga}` : ''),
    color_estado: '#28a745',
    year: new Date().getFullYear(),
    factura_numero: params.numeroFactura,
    factura_fecha: params.fecha,
    factura_total: params.totalFormateado,
    factura_link: params.linkDescarga || '',
  };

  // Tamaño estimado del PDF (bytes). Si > ~2.5MB muchos servicios lo descartan.
  const pdfBytes = (params.pdfBase64.length * 3) / 4 - (params.pdfBase64.endsWith('==') ? 2 : params.pdfBase64.endsWith('=') ? 1 : 0);
  if (pdfBytes > 2.5 * 1024 * 1024) {
    console.warn(`[Email] PDF grande (${Math.round(pdfBytes/1024)} KB). Algunos proveedores lo rechazan.`);
  }

  const dataUri = `data:application/pdf;base64,${params.pdfBase64}`;

  try {
    console.info('[Email] Enviando SIEMPRE con adjunto PDF...');
    const r = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      vars,
      {
        publicKey: EMAILJS_PUBLIC_KEY,
        attachments: [{ name: params.fileName, data: dataUri }],
      } as any
    );
    console.info('[Email] OK con adjunto:', r);
    return r;
  } catch (err) {
    console.error('[Email] Error con adjunto:', err);
    throw err; 
  }
  }

  // Enviar estado de reserva (confirmada o rechazada) con colores y fuente por defecto actualizados
  async enviarEstadoReserva(input: {
    destinatario: string;
    nombres: string;
    estado: 'confirmada' | 'rechazada';
    fecha?: string;           // ej: 12/03/2025 20:30
    personas?: number;        // ej: 4
    mesa?: number | string;   // opcional
    notas?: string;           // opcional
    override?: {              // opcional: personalizar tema
      fontFamily?: string;
      primaryColor?: string;
      accentColor?: string;
      confirmColor?: string;
      rejectColor?: string;
    }
  }) {
    const isConfirmada = (input.estado || '').toLowerCase() === 'confirmada';

    // Tema por defecto actualizado (colores y fuente)
    const FONT_FAMILY = input.override?.fontFamily ?? 'Inter, Segoe UI, Roboto, Arial, sans-serif';
    const PRIMARY_COLOR = input.override?.primaryColor ?? '#687FE5';  // azul/violeta app
    const ACCENT_COLOR  = input.override?.accentColor  ?? '#FFC107';  // amber
    const CONFIRM_COLOR = input.override?.confirmColor ?? '#22C55E';  // verde
    const REJECT_COLOR  = input.override?.rejectColor  ?? '#EF4444';  // rojo

    const color_estado = isConfirmada ? CONFIRM_COLOR : REJECT_COLOR;
    const titulo = isConfirmada ? 'Reserva confirmada' : 'Reserva rechazada';
    const subject = isConfirmada ? 'Tu reserva fue confirmada' : 'Estado de tu reserva: Rechazada';

    const detalles: string[] = [];
    if (input.fecha) detalles.push(`Fecha/hora: ${input.fecha}`);
    if (typeof input.personas === 'number') detalles.push(`Personas: ${input.personas}`);
    if (input.mesa !== undefined && input.mesa !== null && `${input.mesa}`.length) detalles.push(`Mesa: ${input.mesa}`);
    if (input.notas) detalles.push(`Notas: ${input.notas}`);

    const info = detalles.length ? `\n\n${detalles.join(' | ')}` : '';
    const estado_texto = isConfirmada
      ? `Confirmamos tu reserva. ${info}`.trim()
      : `Lamentamos informarte que tu reserva fue rechazada. ${info}`.trim();

    const vars: any = {
      to_email: input.destinatario,
      to_name: input.nombres,
      from_email: FROM_EMAIL,
      from_name: FROM_NAME,
      subject,
      titulo,
      estado_texto,
      color_estado,
      year: new Date().getFullYear(),

      // Extras para plantilla (si la usas):
      primary_color: PRIMARY_COLOR,
      accent_color: ACCENT_COLOR,
      font_family: FONT_FAMILY,
      reserva_fecha: input.fecha || '',
      reserva_personas: (typeof input.personas === 'number') ? String(input.personas) : '',
      reserva_mesa: (input.mesa != null) ? String(input.mesa) : '',
    };

    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_RESERVAS, vars, {
      publicKey: EMAILJS_PUBLIC_KEY
    });
  }


}
