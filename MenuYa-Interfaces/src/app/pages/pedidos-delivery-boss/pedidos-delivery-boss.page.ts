import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from 'src/app/supabase.client';
import { PedidoRow } from 'src/app/services/pedido.service';
import { SpinnerService } from 'src/app/services/spinner';
import { PushNotificationService } from 'src/app/services/push-notification.service';

interface PedidoDeliveryBossVM extends PedidoRow {
  _minCustom?: number;
}

@Component({
  selector: 'app-pedidos-delivery-boss',
  templateUrl: './pedidos-delivery-boss.page.html',
  styleUrls: ['./pedidos-delivery-boss.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class PedidosDeliveryBossPage implements OnInit, OnDestroy {
  pedidos: PedidoDeliveryBossVM[] = [];
  isLoading = false;
  private watcher: RealtimeChannel | null = null;

  constructor(
    private toast: ToastController,
    private router: Router,
    private spinner: SpinnerService,
    private pushNotificationService: PushNotificationService,
  ) {}

  async ngOnInit() {
    await this.cargarPedidos();
    this.armarWatcher();
  }

  ngOnDestroy(): void {
    if (this.watcher) {
      try { supabase.removeChannel(this.watcher); } catch {}
      this.watcher = null;
    }
  }

  async cargarPedidos(event?: CustomEvent) {
    if (!event) {
      this.isLoading = true;
    }
    try {
      const { data, error } = await supabase
        .from('menuya_pedidos')
        .select('*')
        .eq('tipo', 'domicilio')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[BOSS DELIVERY] Error cargando pedidos:', error);
        this.pedidos = [];
        await this.showToast('No se pudieron cargar los pedidos pendientes.', 'danger');
        return;
      }

      this.pedidos = (data || []).map((row: any) => ({
        ...(row as PedidoRow),
        id: Number(row.id),
        numero_mesa: Number(row.numero_mesa),
        monto_total: row.monto_total != null ? Number(row.monto_total) : null,
        _minCustom: undefined,
      }));
    } finally {
      this.isLoading = false;
      event?.detail.complete();
    }
  }

  private armarWatcher() {
    this.watcher = supabase
      .channel('watcher_delivery_pendientes_boss_page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_pedidos', filter: 'tipo=eq.domicilio' },
        async (payload) => {
          const nuevo = (payload as any).new;
          const viejo = (payload as any).old;
          const eraPendiente = viejo?.estado === 'pendiente';
          const esPendiente = nuevo?.estado === 'pendiente';
          if (eraPendiente || esPendiente) {
            await this.cargarPedidos();
          }
        }
      )
      .subscribe();
  }

  async confirmarPedidoDelivery(pedido: PedidoDeliveryBossVM, minutos: number) {
    await this.spinner.show();
    try {
      const { error } = await supabase
        .from('menuya_pedidos')
        .update({
          estado: 'en_preparacion',
          tiempo_elaboracion: minutos,
          cocina_listo: false,
          cocteleria_listo: false,
        })
        .eq('id', pedido.id);

      if (error) throw error;

      this.pushNotificationService.sendNotificationToRole({
        role: 'cocinero',
        title: `Pedido a domicilio #${pedido.id} confirmado`,
        body: `Nuevo pedido para cocina. Tiempo estimado: ${minutos} minutos.`,
        data: { tipo: 'pedido_delivery_confirmado', pedidoId: pedido.id },
      });

      this.pushNotificationService.sendNotificationToRole({
        role: 'bartender',
        title: `Pedido a domicilio #${pedido.id} confirmado`,
        body: `Nuevo pedido para cocteleria. Tiempo estimado: ${minutos} minutos.`,
        data: { tipo: 'pedido_delivery_confirmado' },
      });

      await this.showToast(`Pedido #${pedido.id} confirmado (${minutos} min).`, 'success');
      await this.cargarPedidos();
    } catch (e) {
      console.error('[BOSS DELIVERY] confirmarPedidoDelivery error:', e);
      await this.showToast('No se pudo confirmar el pedido', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  async rechazarPedidoDelivery(pedido: PedidoDeliveryBossVM) {
    await this.spinner.show();
    try {
      const { error } = await supabase
        .from('menuya_pedidos')
        .update({ estado: 'cancelado' })
        .eq('id', pedido.id);

      if (error) throw error;

      await this.showToast(`Pedido #${pedido.id} rechazado.`, 'medium');
      await this.cargarPedidos();
    } catch (e) {
      console.error('[BOSS DELIVERY] rechazarPedidoDelivery error:', e);
      await this.showToast('No se pudo rechazar el pedido', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  private async showToast(message: string, color: 'primary' | 'success' | 'danger' | 'medium' = 'primary') {
    const t = await this.toast.create({ message, duration: 1600, color, position: 'top' });
    await t.present();
  }
}
