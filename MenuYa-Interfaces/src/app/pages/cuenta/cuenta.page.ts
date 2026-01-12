import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastController, ActionSheetController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { supabase } from '../../supabase.client';
import { CuentaService, CuentaRow } from '../../services/cuenta.service';
import { MesaService } from '../../services/mesas';
import { AuthService } from '../../auth.service';
import { GameResultsService } from 'src/app/services/game-results.service';
import { QrService } from 'src/app/services/qr.service';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SpinnerService } from '../../../app/services/spinner';
import { PushNotificationService } from '../../services/push-notification.service';

@Component({
  selector: 'app-cuenta',
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  standalone: false
})
export class CuentaPage implements OnInit, OnDestroy {
  role: 'dueno' | 'supervisor' | 'bartender' | 'cocinero' | 'maitre' | 'mozo' | 'cliente' | 'anonimo' | null = null;

  mesaNumero: number | null = null;
  clienteId: string | null = null; // UUID
esDelivery = false;
private pedidoDeliveryId: number | null = null;

  cuenta: CuentaRow | null = null;
  cargando = false;
  errorMsg = '';

  descuento_juego_detectado = 0;
  descuento = 0;
  private simPropinaPct: number | null = null;
  private cuentaChannel: RealtimeChannel | null = null;

  

  // 👇 NUEVO: cacheamos si el cliente tiene premio de juegos
  private tieneDescuentoJuego = false;

  propinas = [
    { label: 'Malo (0%)', value: 0 },
    { label: 'Regular (5%)', value: 5 },
    { label: 'Bueno (10%)', value: 10 },
    { label: 'Muy bueno (15%)', value: 15 },
    { label: 'Excelente (20%)', value: 20 },
  ];

  constructor(
    private cuentaSrv: CuentaService,
    private mesaSrv: MesaService,
    private auth: AuthService,
    private toast: ToastController,
    private route: ActivatedRoute,
    private router: Router,
    private gameResultsService: GameResultsService,
    private qrService: QrService,
    private actionSheetCtrl: ActionSheetController,
    private spinner: SpinnerService,
    private pushNotificationService: PushNotificationService
  ) { }

  async ngOnInit() {
    this.role = this.normalizarRol(await this.auth.getUserRole());
    this.mesaNumero = this.mesaSrv.selectedMesaNumero ?? null;

    const pedidoIdQS = Number(this.route.snapshot.queryParamMap.get('pedidoId'));
if (!Number.isNaN(pedidoIdQS) && pedidoIdQS > 0) {
  this.pedidoDeliveryId = pedidoIdQS;
}

    const mesaQuery = Number(this.route.snapshot.queryParamMap.get('mesa'));
    if (mesaQuery) this.mesaNumero = mesaQuery;

    // Detectar si es pedido a domicilio por querystring
    const tipoPedido =
      this.route.snapshot.queryParamMap.get('tipo_pedido') ||
      this.route.snapshot.queryParamMap.get('tipo') ||
      this.route.snapshot.queryParamMap.get('modo');

    this.esDelivery =
      tipoPedido === 'domicilio' ||
      tipoPedido === 'delivery';

    // Si viene mesa 9999, también lo consideramos delivery
    if (!this.esDelivery && this.mesaNumero === 9999) {
      this.esDelivery = true;
    }

    // Para delivery, si no vino mesa seteada, usamos 9999 internamente
    if (this.esDelivery && !this.mesaNumero) {
      this.mesaNumero = 9999;
    }

    this.clienteId = await this.resolverClienteUuidActual();

    // 👇 NUEVO: resolvemos una sola vez si tiene descuento de juegos
    try {
      this.tieneDescuentoJuego = await this.gameResultsService.hasDiscount();
      this.descuento = this.tieneDescuentoJuego ? await this.gameResultsService.getDiscountPercentage() : 0;
      console.log('Descuento de juegos detectado:', this.tieneDescuentoJuego, 'Porcentaje:', (this.descuento/100));
    } catch {
      this.tieneDescuentoJuego = false;
    }

    // Validación de mesa SOLO para pedidos de salón
    if (!this.mesaNumero && !this.esDelivery) {
      await this.presentToast('No tenés mesa asignada.', 'warning');
      this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }

    await this.cargarCuenta();
  }

  ngOnDestroy(): void {
    if (this.cuentaChannel) {
      this.cuentaChannel.unsubscribe();
      this.cuentaChannel = null;
    }
  }

  private async presentToast(message: string, color: string = 'primary', duration = 1600) {
    const t = await this.toast.create({ message, duration, color, position: 'top' });
    await t.present();
  }

  private normalizarRol(r: string | null): any {
    if (!r) return null;
    const v = r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (v.includes('cliente anonimo')) return 'anonimo';
    if (v.includes('cliente registrado')) return 'cliente';
    return v as any;
  }

  normalizarNombreProducto(n: string): string {
    return n.trim().toLowerCase().replace(/[_\s]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  private async resolverClienteUuidActual(): Promise<string | null> {
    const email = await this.auth.getUserEmail();
    if (!email) return null;

    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('id')
      .eq('email', email)
      .single();

    if (error) return null;
    return (data as any)?.id ?? null;
  }

  async cargarCuenta() {
    if (!this.mesaNumero) return;
    this.cargando = true;
    this.errorMsg = '';

    await this.spinner.show();
    try {
      const existente = await this.cuentaSrv.getCuentaActivaPorMesa(this.mesaNumero);
      if (existente) {
        this.cuenta = existente;
        this.descuento_juego_detectado = existente.descuento_juego ?? 0;
        this.suscribirseACuenta(String(existente.id));
        return;
      }

      const { detalle, subtotal } = await this.cuentaSrv.getPedidosParaCuenta(this.mesaNumero);

      // 🔄 ANTES: this.gameResultsService?.hasDiscount?.() === true;
      // AHORA: usamos la flag resuelta en ngOnInit
      this.descuento_juego_detectado = this.tieneDescuentoJuego ? +(subtotal * (this.descuento / 100)).toFixed(2) : 0;

      const cta = await this.cuentaSrv.crearCuenta(
        this.mesaNumero,
        this.clienteId,
        detalle,
        subtotal,
        this.descuento_juego_detectado,
          this.pedidoDeliveryId // 👈 nuevo param opcional

      );
      this.cuenta = cta;

      await supabase.from('menuya_eventos').insert([{
        tipo: 'cuenta_solicitada',
        numero_mesa: this.mesaNumero,
        roles_destino: ['mozo', 'dueno', 'supervisor']
      }]);

      this.pushNotificationService.sendNotificationToRole({
        role: 'mozo',
        title: `Mesa ${this.mesaNumero}: 🧾 Solicitud de cuenta`,
        body: `La mesa ${this.mesaNumero} ha solicitado la cuenta.`,
        data: { tipo: 'nuevo_pedido' }
      });

      await this.presentToast('🧾 Cuenta solicitada.', 'primary', 1400);

      this.suscribirseACuenta(String(cta.id));

    } catch (e: any) {
      this.errorMsg = e?.message || 'No se pudo cargar/crear la cuenta';
      await this.presentToast(this.errorMsg, 'danger', 1700);
    } finally {
      this.cargando = false;
      await this.spinner.hide();
    }
  }

private suscribirseACuenta(cuentaId: string) {
  if (this.cuentaChannel) {
    this.cuentaChannel.unsubscribe();
    this.cuentaChannel = null;
  }

  this.cuentaChannel = supabase
    .channel(`cuenta-${cuentaId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'menuya_cuentas',
        filter: `id=eq.${cuentaId}`,
      },
      async (payload) => {
        const nueva = payload.new as any;
        const estadoAnterior = this.cuenta?.estado;
        this.cuenta = nueva;

        if (estadoAnterior !== nueva.estado) {
          await this.presentToast(`Estado actualizado: ${nueva.estado}`, 'success', 1400);

          const estadoFinal = (nueva.estado || '').toLowerCase();
          const esPagoConfirmado =
            estadoFinal === 'confirmado' ||
            estadoFinal === 'pagado' ||
            estadoFinal === 'cerrada' ||
            estadoFinal === 'liberada';

          if (esPagoConfirmado) {

            // 👉 Distinto mensaje según si es salón o domicilio
            if (this.esDelivery) {
              if (this.role === 'cliente') {
                await this.presentToast(
                  '✅ Pago confirmado de tu pedido a domicilio. Te enviamos la factura por correo.',
                  'success',
                  2200
                );
              } else if (this.role === 'anonimo') {
                await this.presentToast(
                  '✅ Pago confirmado de tu pedido. Descargá tu factura.',
                  'success',
                  2200
                );
              } else {
                await this.presentToast(
                  '✅ Pago confirmado del pedido a domicilio.',
                  'success',
                  2000
                );
              }
            } else {
              if (this.role === 'cliente') {
                await this.presentToast(
                  '✅ Pago confirmado. Te enviamos la factura por correo.',
                  'success',
                  1800
                );
              } else if (this.role === 'anonimo') {
                await this.presentToast(
                  '✅ Pago confirmado de tu pedido. Descargá tu factura.',
                  'success',
                  2200
                );
              } else {
                await this.presentToast(
                  '✅ Pago confirmado y mesa liberada.',
                  'success',
                  1600
                );
              }
            }

            this.mesaSrv.selectedMesaNumero = null;
            this.router.navigateByUrl('/home', { replaceUrl: true });
          }
        }
      }
    )
    .subscribe();
}


  async habilitarPropina() {
    if (!this.cuenta) return;
    await this.spinner.show();
    try {
      const token = `prop-${Date.now()}`;
      this.cuenta = await this.cuentaSrv.habilitarPropina(this.cuenta.id, token);
      if (this.simPropinaPct !== null) {
        this.cuenta = await this.cuentaSrv.setPropina(this.cuenta.id, this.simPropinaPct);
        this.simPropinaPct = null;
      }
      await this.presentToast('✅ Propina habilitada.', 'success', 1200);
    } catch (e: any) {
      await this.presentToast(e?.message || 'Error habilitando propina', 'danger', 1600);
    } finally {
      await this.spinner.hide();
    }
  }

  get cuentaEstaConfirmada(): boolean {
    const est = this.cuenta?.estado as string | undefined;
    if (!est) return false;
    return est === 'pago_confirmado' || est === 'pagado' || est === 'cerrada';
  }

  get puedeDarPropinaBtn(): boolean {
    return this.cuenta?.estado === 'solicitada';
  }

  get puedePagarBtn(): boolean {
    const est = this.cuenta?.estado;
    return est === 'propina_habilitada' || est === 'solicitada';
  }

  private async elegirPropinaDesdeQR(opciones: number[]): Promise<number | null> {
    const buttons: any[] = opciones.map(o => {
      return {
        text: `${o}%`,
        handler: () => {
          this.actionSheetCtrl.dismiss(o, 'ok');
        }
      };
    });

    buttons.push({
      text: 'Cancelar',
      role: 'cancel'
    });

    const sheet = await this.actionSheetCtrl.create({
      header: 'Elegí el porcentaje de propina',
      buttons
    });

    await sheet.present();
    const { role, data } = await sheet.onDidDismiss();

    if (role === 'ok') {
      return data as number;
    }
    return null;
  }

  // ESCANEA QR DE PROPINA - ahora permite elegir
  async scanearQRpropina() {
    const scan = await this.qrService.scanOnce();
    console.log('QR leído:', scan);

    if (!scan) {
      await this.presentToast('No se pudo escanear el código QR. Intentalo de nuevo.', 'danger', 3000);
      return;
    }

    // Formato nuevo: PROPINA|...|OPTS=0,5,10,15,20
    if (scan.startsWith('PROPINA|')) {
      const partes = scan.split('|');
      const optsPart = partes.find(p => p.startsWith('OPTS='));
      const optsStr = optsPart ? optsPart.replace('OPTS=', '') : '0,5,10,15,20';
      const opciones = optsStr.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));

      const elegido = await this.elegirPropinaDesdeQR(opciones);
      if (elegido === null) {
        await this.presentToast('No se aplicó propina.', 'medium', 1300);
        return;
      }

      await this.aplicarOsimularPropina(elegido);
      return;
    }

    // Formato viejo: sólo "20"
    const pct = Number(scan) || 0;
    await this.aplicarOsimularPropina(pct);
  }

  private async aplicarOsimularPropina(pct: number) {
    if (this.puedeEditarPropina && this.cuenta) {
      await this.spinner.show();
      try {
        const actualizada = await this.cuentaSrv.setPropina(this.cuenta.id, pct);
        this.cuenta = actualizada;
        this.simPropinaPct = null;
        await this.presentToast(`Propina aplicada: ${pct}%`, 'success', 1200);
      } catch (e: any) {
        await this.presentToast(e?.message || 'No se pudo aplicar la propina', 'danger', 1500);
      } finally {
        await this.spinner.hide();
      }
    } else {
      this.simPropinaPct = pct;
      await this.presentToast(`Propina: ${pct}%`, 'medium', 1400);
    }
  }

  async abrirModalPropina() {
    await this.presentToast('Para elegir propina usá el QR de propinas.', 'medium', 2000);
  }

  async pagar() {
    if (!this.cuenta) return;
    await this.spinner.show();
    try {
      // si la propina estaba simulada (porque el QR se leyó antes de habilitar), la persisto AHORA
      if (this.simPropinaPct !== null) {
        const actualizada = await this.cuentaSrv.setPropina(this.cuenta.id, this.simPropinaPct);
        this.cuenta = actualizada;
        this.simPropinaPct = null;
      }

      // ahora sí pago
      this.cuenta = await this.cuentaSrv.pagar(this.cuenta.id);

      await supabase.from('menuya_eventos').insert([{
        tipo: 'pago_realizado',
        numero_mesa: this.mesaNumero,
        roles_destino: ['mozo', 'dueno', 'supervisor']
      }]);

      // Notificación según tipo de pedido
      if (this.esDelivery) {
        this.pushNotificationService.sendNotificationToRole({
          role: 'delivery',
          title: 'Pago realizado en pedido a domicilio',
          body: 'Confirmar el pago del pedido a domicilio.',
          data: { tipo: 'nuevo_pedido' }
        });
        this.pushNotificationService.sendNotificationToRole({
          role: 'dueño',
          title: 'Pago realizado en pedido a domicilio',
          body: 'Confirmación de pago pendiente del repartidor.',
          data: { tipo: 'nuevo_pedido' }
        });
      } else {
        this.pushNotificationService.sendNotificationToRole({
          role: 'mozo',
          title: `Mesa ${this.mesaNumero}: Confirmación de pago`,
          body: `Confirmar pago de la mesa ${this.mesaNumero}`,
          data: { tipo: 'nuevo_pedido' }
        });
        this.pushNotificationService.sendNotificationToRole({
          role: 'dueño',
          title: `Mesa ${this.mesaNumero}: Confirmación de pago`,
          body: `Confirmar pago de la mesa ${this.mesaNumero}`,
          data: { tipo: 'nuevo_pedido' }
        });
      }

      if (this.esDelivery) {
        await this.presentToast('💳 Pago realizado. Esperando confirmación del repartidor…', 'tertiary', 1800);
      } else {
        await this.presentToast('💳 Pago realizado. Esperando confirmación del mozo…', 'tertiary', 1800);
      }

      if (this.tieneDescuentoJuego) {
        await this.gameResultsService.clearDiscount();
        this.tieneDescuentoJuego = false;
        this.descuento = 0;
      }
    } catch (e: any) {
      await this.presentToast(e?.message || 'Error al pagar', 'danger', 1600);
    } finally {
      await this.spinner.hide();
    }
  }

  async reenviarAvisoPago() {
    if (!this.cuenta || !this.mesaNumero) return;
    await this.spinner.show();
    try {
      await supabase.from('menuya_eventos').insert([{
        tipo: 'pago_realizado',
        numero_mesa: this.mesaNumero,
        roles_destino: ['mozo', 'dueno', 'supervisor']
      }]);
      this.pushNotificationService.sendNotificationToRole({
        role: 'mozo',
        title: `Mesa ${this.mesaNumero}: Confirmación de pago`,
        body: `La mesa ${this.mesaNumero} ha realizado el pago. Confirmar.`,
        data: { tipo: 'nuevo_pedido' }
      });
      await this.presentToast('🔔 Aviso reenviado al mozo.', 'medium', 1200);
    } catch (e: any) {
      await this.presentToast(e?.message || 'No se pudo reenviar el aviso', 'danger', 1500);
    } finally {
      await this.spinner.hide();
    }
  }

  async confirmarPagoYLiberarMesa() {
    // pendiente según tu flujo
  }

  get puedeEditarPropina(): boolean {
    return this.cuenta?.estado === 'propina_habilitada';
  }
  get puedePagar() {
    return this.cuenta?.estado === 'propina_habilitada' || this.cuenta?.estado === 'solicitada';
  }

  get d_subtotal(): number {
    return this.cuenta?.subtotal ?? 0;
  }

  get d_descuento(): number {
    const ya = this.cuenta?.descuento_juego ?? 0;
    if (ya > 0) return ya;

    // 🔄 ANTES: consultaba al servicio (sync) dentro del getter.
    // AHORA: usamos la flag resuelta en ngOnInit.
    return this.tieneDescuentoJuego ? +(this.d_subtotal * (this.descuento / 100)).toFixed(2) : 0;
  }

  get d_base(): number {
    return Math.max(this.d_subtotal - this.d_descuento, 0);
  }

  get d_propinaPct(): number {
    if (this.simPropinaPct !== null) return this.simPropinaPct;
    return this.cuenta?.propina_pct ?? 0;
  }
  get d_propinaMonto(): number {
    return +(this.d_base * (this.d_propinaPct / 100)).toFixed(2);
  }

  get d_total(): number {
    return +(this.d_base + this.d_propinaMonto).toFixed(2);
  }

  get propinaEsSimulada(): boolean {
    return this.simPropinaPct !== null && !this.puedeEditarPropina;
  }
}
