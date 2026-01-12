import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastController, IonicModule, ModalController, AlertController } from '@ionic/angular';
import { ConfirmarPagoModalComponent } from './confirmar-pago-modal.component';
import { ReactiveFormsModule } from '@angular/forms';
import { SpinnerService } from 'src/app/services/spinner';
import { MesaService } from 'src/app/services/servicio-mesa';
import { CuentaService } from 'src/app/services/cuenta.service';
import { PedidoService } from 'src/app/services/pedido.service';
import { ClientesService } from 'src/app/clientes.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/auth.service';
import { supabase } from '../../supabase.client';
import { FacturacionService } from 'src/app/services/facturacion.service';
import type { DetalleCuenta } from 'src/app/models/facturacion';
import { QrService } from '../../../app/services/qr.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-estado-mesas',
  templateUrl: './estado-mesas.page.html',
  styleUrls: ['./estado-mesas.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
})
export class EstadoMesasPage implements OnInit, OnDestroy {

  private facturacion = inject(FacturacionService);

  mesasLlibres: any[] = [];
  mesasConfirmarPago: any[] = [];
  mesasOcupadas: any[] = [];
  mesasPendientes: any[] = [];
  mesaSeleccionada: any = null;
  mesas: any[] = [];
  pedido: any = null; // lo usamos solo como referencia del último pedido cargado en UI

  private pedidosSub?: Subscription;
  private mesasSub?: Subscription;

  // QR state
  qrShownMesaNumero: number | null = null;
  qrDataUrlByMesa: Record<number, string> = {};
  qrLoadingByMesa: Record<number, boolean> = {};
  qrErrorByMesa: Record<number, string | undefined> = {};

  // Mapeo de estados para mostrar en la UI
  estados = {
    disponible: 'Disponible',
    ocupada: 'Ocupada',
    confirmar_pago: 'Confirmar pago',
    confirmar_pedido: 'Confirmar pedido'
  };

  constructor(
    private toast: ToastController,
    private modal: ModalController,
    private spinner: SpinnerService,
    private mesaService: MesaService,
    private clientesService: ClientesService,
    private router: Router,
    private authService: AuthService,
    private cuentaService: CuentaService,
    private pedidoService: PedidoService,
    private qrService: QrService,
    private pushNotificationService: PushNotificationService,
  ) { }

  async ngOnInit() {
    await this.cargarMesas();

    // 👇 NUEVO: escuchar cambios en pedidos (create/update/estado, etc.)
    this.pedidosSub = this.pedidoService.pedidosChanges$.subscribe(() => {
      console.log('[EstadoMesas] Cambio en pedidos detectado → recargar mesas');
      // Recargamos el estado de todas las mesas (incluyendo último pedido)
      this.cargarMesas().catch(err => {
        console.error('[EstadoMesas] Error recargando mesas tras cambio de pedido:', err);
      });
    });

   // 👇 NUEVO: escuchar cambios en mesas (disponibilidad, nuevas mesas, etc.)
   this.mesasSub = this.mesaService.mesasChanges$.subscribe(() => {
     console.log('[EstadoMesas] Cambio en mesas → recargar mesas');
     this.cargarMesas().catch(err =>
       console.error('[EstadoMesas] Error recargando mesas tras cambio de mesa:', err)
     );
   });
  }

  ngOnDestroy(): void {
    this.pedidosSub?.unsubscribe();
    this.mesasSub?.unsubscribe();
  }

  /**
   * Estados que consideramos como "pendiente de confirmación del mozo"
   * para que aparezca el botón de tomar pedido.
   */
  private esEstadoPendientePedido(estado: string | null | undefined): boolean {
    if (!estado) return false;
    const normalizado = String(estado).toLowerCase();
    return ['pendiente', 'solicitado', 'solicitado_mozo'].includes(normalizado);
  }

  /**
   * Muestra/oculta el QR de una mesa. Genera y cachea el Data URL si no existe.
   */
  async toggleQr(mesa: any) {
    const numero = Number(mesa?.numero_mesa ?? 0);
    if (!Number.isFinite(numero) || numero <= 0) {
      await this.presentToast('Mesa inválida', 'danger');
      return;
    }

    // Si ya está visible, oculto
    if (this.qrShownMesaNumero === numero) {
      this.qrShownMesaNumero = null;
      return;
    }

    // Mostrar y generar si no está cacheado
    this.qrErrorByMesa[numero] = undefined;
    this.qrLoadingByMesa[numero] = true;
    try {
      let dataUrl = mesa?.codigo_qr as string | undefined;
      if (!dataUrl) {
        dataUrl = this.qrDataUrlByMesa[numero];
      }
      if (!dataUrl) {
        dataUrl = await this.qrService.generarQrMesa(numero);
        this.qrDataUrlByMesa[numero] = dataUrl;
      }
      this.qrShownMesaNumero = numero;
    } catch (e: any) {
      console.error('Error generando QR:', e);
      this.qrErrorByMesa[numero] = e?.message || 'No se pudo generar el QR';
      this.qrShownMesaNumero = null;
    } finally {
      this.qrLoadingByMesa[numero] = false;
    }
  }

  private async cargarMesas() {
    // ⬇️ MODIFICACIÓN: filtrado de 9999 + orden ascendente
    const todas = await this.mesaService.getTodasMesas();
    this.mesas = (todas || [])
      .filter(m => m?.numero_mesa !== 9999)
      .sort((a, b) => a.numero_mesa - b.numero_mesa);

    this.mesasConfirmarPago = [];
    this.mesasOcupadas = [];
    this.mesasLlibres = [];
    this.mesasPendientes = [];
    this.pedido = null;

    for (let mesa of this.mesas) {
      const pagoPendiente = await this.cuentaService.getCuentaActivaPorMesa(mesa.numero_mesa);
      console.log('pagoPendiente:', pagoPendiente);

      if (pagoPendiente && pagoPendiente.estado === 'pago_pendiente') {
        this.mesasConfirmarPago.push(mesa);
      } else if (mesa.disponible) {
        this.mesasLlibres.push(mesa);
      } else {
        const pedido = await this.pedidoService.getUltimoPedidoDeMesa(mesa.numero_mesa);
        if (pedido && this.esEstadoPendientePedido(pedido.estado)) {
          this.mesasPendientes.push(mesa);
        } else {
          this.mesasOcupadas.push(mesa);
        }
      }
    }
  }

  // Indica si una mesa tiene pago pendiente para mostrar botón "Detalle / Confirmar Pago"
  estaEnConfirmarPago(mesa: any): boolean {
    return this.mesasConfirmarPago.some(m => m?.numero_mesa === mesa?.numero_mesa);
  }

  esMesaPendiente(mesa: any): boolean {
    return this.mesasPendientes.some(m => m?.numero_mesa === mesa?.numero_mesa);
  }

  // Muestra un toast
  private async presentToast(message: string, color: string = 'primary') {
    const t = await this.toast.create({ message, duration: 1600, color });
    await t.present();
  }

  prettyNombre(nombre: string): string {
    const withSpaces = (nombre ?? '').replace(/_/g, ' ');
    return withSpaces
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // /**
  //  * Tomar pedido: ahora busca SIEMPRE el último pedido de ESA mesa,
  //  * y verifica que el estado sea pendiente / solicitado para habilitar la acción.
  //  */
  // async tomarPedido(mesa: any) {
  //   const numero = Number(mesa?.numero_mesa ?? 0);
  //   if (!Number.isFinite(numero) || numero <= 0) {
  //     await this.presentToast('Mesa inválida', 'danger');
  //     return;
  //   }

  //   try {
  //     const pedido = await this.pedidoService.getUltimoPedidoDeMesa(numero);
  //     if (!pedido || !this.esEstadoPendientePedido(pedido.estado)) {
  //       await this.presentToast('No hay pedido pendiente para esta mesa.', 'warning');
  //       return;
  //     }

  //     // guardamos por si la plantilla usa this.pedido
  //     this.pedido = pedido;

  //     // Forzar siempre a array seguro
  //     const items = Array.isArray(pedido.items)
  //       ? pedido.items
  //       : (pedido.items ? Object.values(pedido.items) : []);

  //     const lineas = items.length > 0
  //       ? items.map((it: any) => {
  //         const nombre = this.prettyNombre(it?.nombre ?? 'Item');
  //         const cantidad = Number(it?.cantidad ?? 1);
  //         return `• ${cantidad} x ${nombre}`;
  //       }).join('\n')
  //       : 'No hay items en el pedido.';

  //     const mensaje = `Derivar pedido a preparar:\n${lineas}`;

  //     const toast = await this.toast.create({
  //       message: mensaje,
  //       position: 'middle',
  //       duration: 0, // permanece hasta elegir una acción
  //       buttons: [
  //         {
  //           text: 'Rechazar',
  //           role: 'cancel',
  //           handler: async () => {
  //             await this.cancelarPedido(mesa);
  //             this.refrescarMesas();
  //           }
  //         },
  //         {
  //           text: 'Confirmar',
  //           role: 'confirm',
  //           handler: async () => {
  //             await this.confirmarPedido(mesa);
  //             this.refrescarMesas();
  //           },
  //         },
  //       ],
  //     });

  //     await toast.present();
  //   } catch (e: any) {
  //     console.error('Error al mostrar confirmación del pedido:', e);
  //     await this.presentToast('No se pudo mostrar la confirmación');
  //   }
  // }

  /**
   * Tomar pedido: ahora busca SIEMPRE el último pedido de ESA mesa,
   * y verifica que el estado sea pendiente / solicitado para habilitar la acción.
   */
  async tomarPedido(mesa: any) {
    const numero = Number(mesa?.numero_mesa ?? 0);
    if (!Number.isFinite(numero) || numero <= 0) {
      await Swal.fire({
        icon: 'error',
        title: 'Mesa inválida',
        text: 'No se pudo encontrar el número de mesa.',
        customClass: {
          container: 'menuya-swal-container',
          popup: 'menuya-swal-popup',
          title: 'menuya-swal-title',
          htmlContainer: 'menuya-swal-body',
          confirmButton: 'menuya-swal-confirm',
        },
        confirmButtonText: 'Cerrar',
      });
      return;
    }

    try {
      const pedido = await this.pedidoService.getUltimoPedidoDeMesa(numero);

      if (!pedido || !this.esEstadoPendientePedido(pedido.estado)) {
        await Swal.fire({
          icon: 'info',
          title: 'Sin pedido pendiente',
          text: `No hay pedido pendiente para la mesa ${numero}.`,
          customClass: {
            container: 'menuya-swal-container',
            popup: 'menuya-swal-popup',
            title: 'menuya-swal-title',
            htmlContainer: 'menuya-swal-body',
            confirmButton: 'menuya-swal-confirm',
          },
          confirmButtonText: 'Aceptar',
        });
        return;
      }

      // guardamos por si la plantilla usa this.pedido
      this.pedido = pedido;

      // Forzar siempre a array seguro
      const items = Array.isArray(pedido.items)
        ? pedido.items
        : (pedido.items ? Object.values(pedido.items) : []);

      const lineasHtml = items.length > 0
        ? items.map((it: any) => {
            const nombre = this.prettyNombre(it?.nombre ?? 'Item');
            const cantidad = Number(it?.cantidad ?? 1);
            return `
              <li class="menuya-item-row">
                <span class="menuya-item-name">${nombre}</span>
                <span class="menuya-item-qty">x${cantidad}</span>
              </li>
            `;
          }).join('')
        : '<li class="menuya-item-row"><span class="menuya-item-name">No hay items en el pedido.</span></li>';

      const result = await Swal.fire({
        title: `Mesa ${numero}: Tomar pedido`,
        html: `
          <div class="menuya-swal-content">
            <ul class="menuya-items-list">
              ${lineasHtml}
            </ul>

            <p class="menuya-swal-footnote">
              Podés confirmar para tomar el pedido o rechazarlo.
            </p>
          </div>
        `,
        icon: 'question',
        target: document.body as HTMLElement,
        position: 'center',
        heightAuto: false,
        backdrop: true,
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Rechazar',
        reverseButtons: true,
        focusConfirm: true,
        customClass: {
          container: 'menuya-swal-container',
          popup: 'menuya-swal-popup',
          title: 'menuya-swal-title',
          htmlContainer: 'menuya-swal-body',
          confirmButton: 'menuya-swal-confirm',
          cancelButton: 'menuya-swal-cancel',
          actions: 'menuya-swal-actions',
        },
      });

      if (result.isConfirmed) {
        await this.confirmarPedido(mesa);
        this.refrescarMesas();
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        await this.cancelarPedido(mesa);
        this.refrescarMesas();
      }
    } catch (e: any) {
      console.error('Error al mostrar confirmación del pedido:', e);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo mostrar la confirmación.',
        customClass: {
          container: 'menuya-swal-container',
          popup: 'menuya-swal-popup',
          title: 'menuya-swal-title',
          htmlContainer: 'menuya-swal-body',
          confirmButton: 'menuya-swal-confirm',
        },
        confirmButtonText: 'Cerrar',
      });
    }
  }

  // Confirma el pedido: cambia estado de pedido y deja mesa ocupada
  async confirmarPedido(mesa: any) {
    const numero = Number(mesa?.numero_mesa ?? 0);
    const pedido = await this.pedidoService.getUltimoPedidoDeMesa(numero);
    if (!Number.isFinite(numero) || numero <= 0) {
      await this.presentToast('Mesa inválida', 'danger');
      return;
    }
    if (!pedido || pedido.estado !== 'pendiente') {
      await this.presentToast('No hay pedido pendiente para esta mesa.', 'warning');
      return;
    }

    try {
      await this.spinner.show();

      // 1) Cambiar estado del pedido (si existe) -> en_preparacion
      if (pedido) {
        await this.pedidoService.updateEstado(pedido.id, 'en_preparacion');
      }
      this.pushNotificationService.sendNotificationToRole({
        role: 'cocinero',
        title: `Mesa ${numero}: Nuevo pedido confirmado`,
        body: `Se hizo un nuevo pedido para cocina.`,
        data: { tipo: 'nuevo_pedido' }
      });
      this.pushNotificationService.sendNotificationToRole({
        role: 'bartender',
        title: `Mesa ${numero}: Nueva pedido confirmado`,
        body: `Se hizo un nuevo pedido para cocteleria.`,
        data: { tipo: 'nuevo_pedido' }
      });

      // TODO: notificaciones mozo/dueño/supervisor

      await this.presentToast(`Pedido confirmado en mesa ${numero}.`, 'success');
    } catch (e: any) {
      await this.presentToast(e?.message || 'Error confirmando pedido', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  // Cancelar el pedido: cambia estado de pedido y deja mesa ocupada
  async cancelarPedido(mesa: any) {
    const numero = Number(mesa?.numero_mesa ?? 0);
    const pedido = await this.pedidoService.getUltimoPedidoDeMesa(numero);
    if (!Number.isFinite(numero) || numero <= 0) {
      await this.presentToast('Mesa inválida', 'danger');
      return;
    }
    if (!pedido || pedido.estado !== 'pendiente') {
      await this.presentToast('No hay pedido pendiente para esta mesa.', 'warning');
      return;
    }

    try {
      await this.spinner.show();

      // 1) Cambiar estado de pedido (si existe) -> cancelado
      if (pedido) {
        await this.pedidoService.updateEstado(pedido.id, 'cancelado');
      }
      this.pushNotificationService.sendNotificationToRole({
        role: 'cliente',
        title: 'Pedido rechazado',
        body: `Su pedido ha sido rechazado. Por favor, modifique su orden.`,
        data: { tipo: 'pedido_rechazado' }
      });
      this.pushNotificationService.sendNotificationToRole({
        role: 'anonimo',
        title: 'Pedido rechazado',
        body: `Su pedido ha sido rechazado. Por favor, modifique su orden.`,
        data: { tipo: 'pedido_rechazado' }
      });

      // TODO: notificaciones mozo/dueño/supervisor

      await this.presentToast(`Pedido cancelado en mesa ${numero}.`, 'success');
    } catch (e: any) {
      await this.presentToast(e?.message || 'Error cancelando pedido', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  // Muestra modal con el detalle del pedido y opciones Confirmar / Cancelar
  async onDetalleConfirmarPago(mesa: any) {
    try {
      const cuenta = await this.cuentaService.getCuentaActivaPorMesa(mesa?.numero_mesa);
      if (!cuenta || cuenta.estado !== 'pago_pendiente') {
        await this.presentToast('No hay pago pendiente para esta mesa.', 'warning');
        return;
      }
      const cliente = cuenta?.cliente_id ? await this.clientesService.getClienteById(cuenta.cliente_id) : null;
      const nombre = cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Cliente no registrado';
      // Mostrar modal
      const modal = await this.modal.create({
        component: ConfirmarPagoModalComponent,
        componentProps: { cuenta, mesaNumero: mesa?.numero_mesa, nombre },
        canDismiss: true,
        initialBreakpoint: 0.85,
        breakpoints: [0, 0.85, 1]
      });
      await modal.present();
      const { role } = await modal.onWillDismiss();
      if (role === 'confirm') {
        await this.confirmarPago(mesa);
      }
    } catch (e: any) {
      await this.presentToast(e?.message || 'Error mostrando detalle', 'danger');
    }
  }

// Confirma el pago: libera mesa y cambia estado de cuenta
async confirmarPago(mesa: any) {
  const numero = Number(mesa?.numero_mesa ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) {
    await this.presentToast('Mesa inválida', 'danger');
    return;
  }

  try {
    await this.spinner.show();

    const cuenta = await this.cuentaService.getCuentaActivaPorMesa(numero);
    if (!cuenta || cuenta.estado !== 'pago_pendiente') {
      await this.presentToast('No hay pago pendiente para confirmar.', 'warning');
      return;
    }

    // Traemos pedido/cliente DENTRO del try y sin romper el flujo si no hay cliente
    const pedido = await this.pedidoService.getUltimoPedidoDeMesa(numero);

    let cliente: any = null;
    try {
      cliente = await this.clientesService.getClienteByMesaId(numero);
    } catch (e) {
      console.warn('[cliente] No se pudo obtener cliente por mesa_id (sigo):', e);
      cliente = null;
    }

    // 👇👇👇 Fallback directo a tabla menuya_clientes por mesa_id
    if (!cliente) {
      try {
        const { data: anon } = await supabase
          .from('menuya_clientes')
          .select('id, nombres, apellidos, email, dni')
          .eq('mesa_id', numero)          // mesa_id en clientes
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anon) {
          cliente = anon;
          console.info('[cliente] Tomado desde menuya_clientes por mesa_id:', anon);
        }
      } catch (e) {
        console.warn('[cliente] Fallback menuya_clientes por mesa_id falló (sigo):', e);
      }
    }
    // ☝☝☝ FIN Fallback

    // 1) Mesa disponible
    await this.mesaService.actualizarDisponibilidad(numero, true);
    // 2) Cuenta confirmada
    await this.cuentaService.confirmarPago(cuenta.id);
    // 3) Pedido finalizado (si había)
    if (pedido) await this.pedidoService.updateEstado(pedido.id, 'finalizado');
    // 4) Reset mesa_id en cliente (si había)
    if (cliente) await this.clientesService.updateMesa(cliente.id, null);

    // 5) Evento en Supabase (no bloqueante)
    try {
      await supabase.from('menuya_eventos').insert([{
        tipo: 'pago_confirmado',
        numero_mesa: numero,
        roles_destino: ['mozo', 'dueno', 'supervisor']
      }]);

      this.pushNotificationService.sendNotificationToRole({
        role: 'mozo',
        title: `Mesa: ${numero}: Pago confirmado`,
        body: `El pago ha sido confirmado. Mesa ${numero} liberada.`,
        data: { tipo: 'pago_confirmado' }
      });
      this.pushNotificationService.sendNotificationToRole({
        role: 'dueño',
        title: `Mesa: ${numero}: Pago confirmado`,
        body: `El pago ha sido confirmado. Mesa ${numero} liberada.`,
        data: { tipo: 'pago_confirmado' }
      });
    } catch (e) {
      console.warn('[eventos] No se pudo registrar el evento (ignoro):', e);
    }

    // 6) Generar y enviar factura (registrado o anónimo)
    try {
      const detalle: DetalleCuenta = {
        numeroPedido: pedido?.id ?? cuenta?.id ?? numero,
        items: (cuenta?.pedidos || []).map((it: any) => ({
          nombre: it?.nombre,
          cantidad: Number(it?.cantidad ?? 1),
          precioUnit: Number(it?.precio_unitario ?? it?.precio ?? 0),
        })),
        subtotal: Number(cuenta?.subtotal ?? 0),
        descuentoJuegos: Number(cuenta?.descuento_juego ?? 0),
        propina: Number(cuenta?.propina_monto ?? 0),
        total: Number(cuenta?.total_final ?? 0),
      };

      if (cliente?.email) {
        // ✅ Cliente registrado → email + registro
        console.info('[Factura] Enviando a', cliente.email);
        await this.facturacion.emitirYEnviarFactura({
          pedidoId: detalle.numeroPedido,
          cliente: {
            nombre: `${cliente.nombres ?? ''} ${cliente.apellidos ?? ''}`.trim() || 'Cliente',
            email: cliente.email,
            dni: cliente?.dni ?? undefined,
          },
          detalle,
          mesaNumero: numero,                // 🔴 IMPORTANTE: pasar siempre la mesa
        });
      } else {
        // ✅ Cliente anónimo → solo storage + menuya_facturas (numero_mesa)
        console.info('[Factura] Generando para cliente anónimo');
        await this.facturacion.emitirYEnviarFactura({
          pedidoId: detalle.numeroPedido,
          cliente: {
            nombre: `${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() || 'Cliente Anónimo',
            email: '', // vacío
            dni: cliente?.dni ?? undefined,
          },
          detalle,
          mesaNumero: numero,                // 🔴 IMPORTANTE: pasar siempre la mesa
        });
      }
    } catch (err) {
      console.warn('Pago OK, pero no se pudo generar/enviar factura:', err);
      await this.presentToast('Pago confirmado. Hubo un problema al generar la factura.', 'warning');
    }

    // 7) Refrescar colecciones locales
    this.mesasConfirmarPago = this.mesasConfirmarPago.filter(m => m.numero_mesa !== numero);
    const idxOcupada = this.mesasOcupadas.findIndex(m => m.numero_mesa === numero);
    if (idxOcupada >= 0) {
      const m = this.mesasOcupadas.splice(idxOcupada, 1)[0];
      m.disponible = true;
      this.mesasLlibres.push(m);
    } else {
      const idxAll = this.mesas.findIndex(m => m.numero_mesa === numero);
      if (idxAll >= 0) {
        this.mesas[idxAll].disponible = true;
        this.mesasLlibres.push(this.mesas[idxAll]);
      }
    }

    await this.presentToast(
      `Pago confirmado en mesa ${numero}. Mesa liberada.${cliente?.email ? ' Factura enviada al email del cliente ✅' : ''}`,
      'success'
    );
  } catch (e: any) {
    await this.presentToast(e?.message || 'Error confirmando pago', 'danger');
  } finally {
    await this.spinner.hide();
  }
}



  // Navega al Home
  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  // Actualiza la lista de mesas y su estado
  async refrescarMesas() {
    try {
      await this.spinner.show();
      await this.cargarMesas();
    } catch (e: any) {
      await this.presentToast(e?.message || 'No se pudo actualizar el estado de las mesas', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }
}

