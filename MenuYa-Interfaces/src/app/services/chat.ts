import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { supabase } from '../supabase.client'; // tu cliente global
import { AuthService } from '../auth.service';
import { ClientesService } from '../clientes.service';
import { PushNotificationService } from '../services/push-notification.service';
import { PedidoService } from '../services/pedido.service';

export interface Mensaje {
  id: number;
  mesa_id: number | null;
  remitente: 'cliente' | 'mozo' | 'delivery';
  mensaje: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private subscription: any = null;
  public mensajes$ = new BehaviorSubject<Mensaje[]>([]);

  constructor(
    private auth: AuthService,
    private clientesService: ClientesService,
    private pushNotificationService: PushNotificationService,
    private pedidoService: PedidoService
  ) { }

  async getDireccionDeliveryPorMesa(mesaId: number): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('menuya_pedidos')
        .select('domicilio_direccion')
        .eq('numero_mesa', mesaId)
        .eq('tipo', 'domicilio')
        .order('id', { ascending: false })
        .limit(1);

      if (error || !data || !data.length) return null;
      return data[0].domicilio_direccion || null;
    } catch (e) {
      console.error('[ChatService] getDireccionDeliveryPorMesa error:', e);
      return null;
    }
  }


  // 🔹 NUEVO: obtener dirección del cliente según la mesa (delivery)
  async getDireccionClientePorMesa(mesaId: number): Promise<string | null> {
    try {
      const cliente = await this.clientesService.getClienteByMesaId(mesaId);
      if (!cliente) return null;

      // Intentamos distintas convenciones de campo de dirección
      const posibles = [
        (cliente as any).direccion,
        (cliente as any).domicilio,
        (cliente as any).direccion_completa,
        (cliente as any).direccion_texto
      ].filter((v) => typeof v === 'string' && v.trim().length > 0);

      if (posibles.length) {
        return posibles[0] as string;
      }

      const partes = [
        (cliente as any).calle,
        (cliente as any).numero,
        (cliente as any).localidad
      ].filter(Boolean);

      return partes.length ? partes.join(' ') : null;
    } catch (err) {
      console.error('[ChatService] getDireccionClientePorMesa error:', err);
      return null;
    }
  }

  // enviar mensaje
  // enviar mensaje
  // enviar mensaje
  async enviarMensaje(
    remitente: 'cliente' | 'mozo' | 'delivery',
    mensaje: string,
    mesaId?: number | null
  ) {
    const texto = (mensaje || '').trim();
    if (!texto) return;

    // 🔹 Mesa destino base (la que viene del componente)
    let mesaDestino: number | null | undefined = mesaId;

    // 🔹 Mesa virtual delivery (si aplica)
    const mesaVirtualDelivery = this.pedidoService.getNumeroMesaDeliveryVirtual?.();
    if (
      (remitente === 'delivery' || remitente === 'cliente') &&
      (mesaDestino == null || Number.isNaN(mesaDestino as any)) &&
      typeof mesaVirtualDelivery === 'number'
    ) {
      mesaDestino = mesaVirtualDelivery;
    }

    // 🔹 Fallback genérico: si sigo sin mesa válida, la infiero del historial local
    if (
      mesaDestino == null ||
      Number.isNaN(mesaDestino as any) ||
      mesaDestino <= 0
    ) {
      const actuales = this.mensajes$.getValue();
      for (let i = actuales.length - 1; i >= 0; i--) {
        const mMesa = actuales[i]?.mesa_id;
        if (typeof mMesa === 'number' && Number.isFinite(mMesa) && mMesa > 0) {
          mesaDestino = mMesa;
          break;
        }
      }
    }

    const insertData: any = {
      remitente,
      mensaje: texto,
    };

    // 🔹 Solo seteo mesa_id si tengo una mesa numérica válida
    if (
      typeof mesaDestino === 'number' &&
      Number.isFinite(mesaDestino) &&
      mesaDestino > 0
    ) {
      insertData.mesa_id = mesaDestino;
    }

    const { error } = await supabase.from('menuya_chat_mesa').insert(insertData);

    if (error) {
      console.error('Error insertando mensaje:', error);
      return;
    }

    const fecha = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());

    const dataPayload = {
      tipo: 'chat',
      mesaId:
        typeof mesaDestino === 'number' && Number.isFinite(mesaDestino)
          ? String(mesaDestino)
          : '',
      remitente,
      route: '/chat',
    };

    // 🔹 Notificación al cliente cuando escribe mozo/delivery
    // (Título: "Nuevo mensaje de chat" — esta es la que querés dejar)
    if (remitente === 'mozo' || remitente === 'delivery') {
      this.pushNotificationService
        .sendNotificationToRole({
          role: 'cliente',
          title: 'Nuevo mensaje de chat',
          body: `${texto} - ${fecha}`,
          data: dataPayload,
        })
        .catch((err) =>
          console.error('[ChatService] push extra mozo/delivery error:', err)
        );
    }

    // 🔹 Notificaciones generales según remitente
    this.dispararPush(
      remitente,
      texto,
      typeof mesaDestino === 'number' && Number.isFinite(mesaDestino)
        ? mesaDestino
        : null
    ).catch((err) => console.error('[ChatService] push error:', err));
  }

  // traer mensajes (todos)
  async getMensajes(mesaId?: number | null) {
    const mesaVirtualDelivery = this.pedidoService.getNumeroMesaDeliveryVirtual?.();

    let query = supabase
      .from('menuya_chat_mesa')
      .select('*')
      .order('created_at', { ascending: true });

    if (mesaId != null) {
      // 🟡 Caso delivery con sala virtual (90000 + pedidoId)
      if (
        mesaId > 90000 &&
        typeof mesaVirtualDelivery === 'number' &&
        Number.isFinite(mesaVirtualDelivery)
      ) {
        // Traemos mensajes tanto de la sala virtual como de la mesa delivery 9999
        query = query.or(
          `mesa_id.eq.${mesaId},mesa_id.eq.${mesaVirtualDelivery}`
        );
      } else {
        // Caso normal: salón o mesa fija
        query = query.eq('mesa_id', mesaId);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error cargando mensajes:', error);
      return [];
    }

    // Tipamos explícito
    return (data || []) as Mensaje[];
  }

  // Suscribirse a nuevos mensajes de una mesa
  // Suscribirse a nuevos mensajes de una mesa
  subscribeMensajes(mesaId?: number | null) {
    if (this.subscription) supabase.removeChannel(this.subscription);

    const mesaVirtualDelivery = this.pedidoService.getNumeroMesaDeliveryVirtual?.();

    let channelFilter: any;

    if (mesaId != null) {
      // 🟡 Caso delivery con sala virtual (90000 + pedidoId)
      if (
        mesaId > 90000 &&
        typeof mesaVirtualDelivery === 'number' &&
        Number.isFinite(mesaVirtualDelivery)
      ) {
        // Escuchamos INSERTs para ambas mesas: sala virtual + 9999
        channelFilter = {
          event: 'INSERT',
          schema: 'public',
          table: 'menuya_chat_mesa',
          filter: `mesa_id=in.(${mesaId},${mesaVirtualDelivery})`
        };
      } else {
        // Normal: una sola mesa
        channelFilter = {
          event: 'INSERT',
          schema: 'public',
          table: 'menuya_chat_mesa',
          filter: `mesa_id=eq.${mesaId}`
        };
      }
    } else {
      // Sin mesa: escucha todo (ej. vista general del mozo)
      channelFilter = {
        event: 'INSERT',
        schema: 'public',
        table: 'menuya_chat_mesa'
      };
    }

    this.subscription = supabase
      .channel(`public:menuya_chat_mesa:${mesaId ?? 'todos'}`)
      .on('postgres_changes', channelFilter as any, (payload: any) => {
        const mensajeNuevo: Mensaje = payload.new;
        const actuales = this.mensajes$.getValue();
        this.mensajes$.next([...actuales, mensajeNuevo]);
      })
      .subscribe();
  }


  // Cancelar suscripción
  unsubscribe() {
    if (this.subscription) {
      supabase.removeChannel(this.subscription);
      this.subscription = null;
    }
  }

  getMesaDeliveryVirtual(): number {
    return this.pedidoService.getNumeroMesaDeliveryVirtual();
  }
  async getDireccionPorPedidoId(pedidoId: number): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('menuya_pedidos')
        .select('domicilio_direccion')
        .eq('id', pedidoId)
        .maybeSingle();

      if (error || !data) return null;
      return data.domicilio_direccion || null;
    } catch (err) {
      console.error('[ChatService] getDireccionPorPedidoId error:', err);
      return null;
    }
  }

  private async dispararPush(
    remitente: 'cliente' | 'mozo' | 'delivery',
    mensaje: string,
    mesaId: number | null
  ) {
    try {
      const fecha = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date());

      const mesaVirtualDelivery = this.pedidoService.getNumeroMesaDeliveryVirtual();
      const esDelivery = mesaId === mesaVirtualDelivery;

      const dataPayload = {
        tipo: 'chat',
        mesaId: mesaId != null ? String(mesaId) : '',
        remitente,
        route: '/chat',
      };

      // 🧾 Cliente escribe
      if (remitente === 'cliente') {
        if (mesaId == null || mesaId <= 100) {
          // SALÓN: mesa normal → avisar al mozo
          const mesaLabel = mesaId != null ? `Mesa ${mesaId}` : 'Cliente en sala';
          // await this.auth.notifyTargets({
          //   roles: ['mozo'],
          //   title: `${mesaLabel}: consulta`,
          //   body: `${mensaje} - ${fecha}`,
          //   data: dataPayload,
          // });
          this.pushNotificationService
          .sendNotificationToRole({
            role: 'mozo',
            title: `${mesaLabel}: consulta`,
            body: `${mensaje} - ${fecha}`,
            data: dataPayload,
          })
          .catch((err) =>
            console.error('[ChatService] push extra mozo/delivery error:', err)
          );
        } else {
          // DOMICILIO: mesa virtual → avisar al delivery con nombre del cliente
          let nombreCliente = 'Cliente';
          try {
            if (mesaId !== null && mesaId >= 100) {
              const cliente = await this.clientesService.getClienteByMesaId(mesaId);
              if (cliente) {
                const partesNombre = [cliente.nombres, cliente.apellidos].filter(Boolean);
                if (partesNombre.length) {
                  nombreCliente = partesNombre.join(' ');
                }
              }
            }
          } catch (err) {
            console.error('[ChatService] obtener cliente para delivery error:', err);
          }
          this.pushNotificationService
          .sendNotificationToRole({
            role: 'delivery',
            title: 'Mensaje de cliente a domicilio',
            body: `${nombreCliente}: ${mensaje} - ${fecha}`,
            data: dataPayload,
          })
          .catch((err) =>
            console.error('[ChatService] push extra mozo/delivery error:', err)
          );
          // await this.auth.notifyTargets({
          //   roles: ['delivery'],
          //   title: 'Mensaje de cliente a domicilio',
          //   body: `${nombreCliente}: ${mensaje} - ${fecha}`,
          //   data: dataPayload,
          // });
        }
        return;
      }

      // 🚲 Delivery escribe → avisar al mozo (puede ser que lo vea en salón / estado mesas)
      if (remitente === 'delivery') {
        const mesaLabel = mesaId != null ? `Mesa ${mesaId}` : 'Cliente en sala';
        this.pushNotificationService
        .sendNotificationToRole({
          role: 'mozo',
          title: `${mesaLabel}: consulta`,
          body: `${mensaje} - ${fecha}`,
          data: dataPayload,
        })
        .catch((err) =>
          console.error('[ChatService] push extra mozo/delivery error:', err)
        );
        // await this.auth.notifyTargets({
        //   roles: ['mozo'],
        //   title: `${mesaLabel}: consulta`,
        //   body: `${mensaje} - ${fecha}`,
        //   data: dataPayload,
        // });
        return;
      }

      // 🍽️ Mozo escribe → avisar al cliente (igual que ya tenías)
      if (remitente === 'mozo') {
        return;
      }
    } catch (err) {
      console.error('[ChatService] dispararPush error:', err);
    }
  }
}
