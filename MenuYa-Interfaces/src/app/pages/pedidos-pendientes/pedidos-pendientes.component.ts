import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../../app/auth.service';
import { SpinnerService } from '../../../app/services/spinner';
import { PedidoService, EstadoPedido, PedidoRow } from '../../../app/services/pedido.service';
import { PushNotificationService } from '../../services/push-notification.service';

type PedidoFiltrado = PedidoRow & {
  itemsFiltrados: { nombre: string; cantidad: number; categoria: string }[];
  _minCustom?: number; // minutos custom en confirmación boss
};

@Component({
  selector: 'app-pedidos-pendientes',
  templateUrl: './pedidos-pendientes.component.html',
  styleUrls: ['./pedidos-pendientes.component.scss'],
  standalone: true, 
  imports: [
    CommonModule,
    IonicModule,
  ],
})
export class PedidosPendientesComponent  implements OnInit, OnDestroy {

  role: string | null = null;
  pedidosPendientes: PedidoFiltrado[] = [];
  isLoadingPedidos = false;

  private pedidosSub?: Subscription; // 👈 NUEVO

  constructor(private router: Router, private authService: AuthService, private pedidoService: PedidoService, 
    private spinner: SpinnerService, private pushNotificationService: PushNotificationService, private toastController: ToastController) { }

  async ngOnInit() {
    try {
      this.role = await this.authService.getUserRole();
      this.isLoadingPedidos = true;

      this.pedidosSub = this.pedidoService
        .observarPedidosPendientes()
        .subscribe({
          next: (pedidos: PedidoRow[]) => {
            this.pedidosPendientes = this.mapearPedidosPendientesPorRol(pedidos);
            this.isLoadingPedidos = false;
          },
          error: (err) => {
            console.error('Error observando pedidos pendientes:', err);
            this.isLoadingPedidos = false;
            this.mostrarErrorToast('No se pudieron cargar los pedidos pendientes.');
          }
        });

    } catch (error) {
      console.error('Error al obtener el rol del usuario:', error);
      this.isLoadingPedidos = false;
      this.mostrarErrorToast('No se pudo determinar el rol del usuario.');
    }
  }

  ngOnDestroy(): void {
    this.pedidosSub?.unsubscribe();
  }

  private async mostrarErrorToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger'
    });
    await toast.present();
  }

  private mapearPedidosPendientesPorRol(pedidos: PedidoRow[]): PedidoFiltrado[] {
    return pedidos
      .map(p => {
        const itemsArray = Array.isArray(p.items) ? p.items : [];

        let itemsFiltrados: { nombre: string; cantidad: number; categoria: string }[] = [];

        if (this.role === 'cocinero') {
          itemsFiltrados = itemsArray.filter((i: any) => i.categoria === 'Comida');
        } else if (this.role === 'bartender') {
          itemsFiltrados = itemsArray.filter((i: any) => i.categoria === 'Bebida');
        } else {
          itemsFiltrados = itemsArray;
        }

        return { ...p, itemsFiltrados };
      })
      .filter(p => p.itemsFiltrados.length > 0)
      .filter(p => {
        if (this.role === 'cocinero') return !p.cocina_listo;
        if (this.role === 'bartender') return !p.cocteleria_listo;
        return true;
      });
  }


  async goHome(): Promise<void> {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  prettyNombre(nombre: string | null | undefined): string {
    const safe = (nombre ?? '').replace(/_/g, ' ');
    return safe
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // async cargarPedidos() {
  //   try {
  //     const pedidos: PedidoRow[] = await this.pedidoService.getTodos();

  //     this.pedidosPendientes = pedidos
  //       .map(p => {
  //         const itemsArray = Array.isArray(p.items) ? p.items : [];

  //         let itemsFiltrados = [];
  //         if (this.role === 'cocinero') {
  //           itemsFiltrados = itemsArray.filter((i: any) => i.categoria === 'Comida');
  //         } else if (this.role === 'bartender') {
  //           itemsFiltrados = itemsArray.filter((i: any) => i.categoria === 'Bebida');
  //         } else {
  //           itemsFiltrados = itemsArray;
  //         }

  //         return { ...p, itemsFiltrados };
  //       })
  //       .filter(p => p.itemsFiltrados.length > 0)
  //       .filter(p => {
  //         if (this.role === 'cocinero') return !p.cocina_listo;
  //         if (this.role === 'bartender') return !p.cocteleria_listo;
  //         return true;
  //       });
  //   } catch (error) {
  //     console.error('Error cargando pedidos', error);
  //   }
  // }

  async marcarListo(pedido: PedidoFiltrado) {
    // ✅ Solo estos roles pueden marcar listo
    if (this.role !== 'cocinero' && this.role !== 'bartender') {
      console.warn('[PedidosPendientes] Rol sin permiso para marcar listo:', this.role);
      return;
    }

    await this.spinner.show();
    try {
      // Estado actual de los flags
      const cocinaActual = !!pedido.cocina_listo;
      const barraActual  = !!pedido.cocteleria_listo;

      // 1️⃣ Solo se actualiza el flag correspondiente al rol
      if (this.role === 'cocinero') {
        this.pedidoService.updateListoCocina(pedido.id, true);
      } else if (this.role === 'bartender') {
        this.pedidoService.updateListoBartender(pedido.id, true);
      }

      const actualizado = await this.pedidoService.updateEstadoListo(pedido.id, "listo");
      const esDelivery = this.isDeliveryPedido(actualizado);
      let estadoToSend = actualizado.estado;

      if (estadoToSend === 'listo' && esDelivery) {
        await this.notificarPedidoListo(actualizado);
      }
      
      const mesa = actualizado.numero_mesa;

      // 🔔 Notificaciones según rol y tipo de pedido
      if (this.role === 'cocinero') {
        this.pushNotificationService.sendNotificationToRole({
          role: 'mozo',
          title: `Mesa ${mesa}: Pedido de cocina listo para entregar`,
          body: `Cocina: Pedido #${pedido.id} de la mesa ${mesa} está listo para ser entregado.`,
          data: { tipo: 'pedido_listo' }
        });
      } else if (this.role === 'bartender') {
        this.pushNotificationService.sendNotificationToRole({
          role: 'mozo',
          title: `Mesa ${mesa}: Pedido de bartender listo para entregar`,
          body: `Coctelería: Pedido #${pedido.id} de la mesa ${mesa} está listo para ser entregado.`,
          data: { tipo: 'pedido_listo' }
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al marcar el pedido como listo.';
      if (errorMessage.includes('No se puede marcar como listo un pedido que no está listo en cocina o en coctelería.')) {
        console.warn('[PedidosPendientes] Intento de marcar listo pedido no listo en cocina/coctelería');
      } else {
        this.mostrarErrorToast(errorMessage);
      }
    } finally {
      await this.spinner.hide();
    }
  }

  isDeliveryPedido(p: PedidoRow | PedidoFiltrado | null | undefined): boolean {
    if (!p) return false;
    return (p as any).tipo === 'domicilio' || p.numero_mesa === this.getDeliveryVirtualMesa();
  }

  private getDeliveryVirtualMesa(): number {
    try {
      const fn = (this.pedidoService as any).getNumeroMesaDeliveryVirtual;
      const v = typeof fn === 'function' ? Number(fn()) : 9999;
      return Number.isFinite(v) && v > 0 ? v : 9999;
    } catch {
      return 9999;
    }
  }

  private async notificarPedidoListo(pedido: PedidoRow) {
    if (!this.isDeliveryPedido(pedido)) return;
    try {
      const direccion = pedido.domicilio_direccion ? ` -> ${pedido.domicilio_direccion}` : '';
      await this.authService.notifyRoles(
        ['delivery'],
        'Pedido listo para entregar',
        `Pedido #${pedido.id}${direccion}`,
        { pedidoId: pedido.id }
      );
      this.pushNotificationService.sendNotificationToRole({
        role: 'delivery',
        title: 'Pedido listo para entregar',
        body: `Pedido #${pedido.id}${direccion}`,
        data: { tipo: 'pedido.id' }
      });
    } catch (err) {
      console.error('[HOME] Error enviando push al delivery:', err);
    }
  }
}
