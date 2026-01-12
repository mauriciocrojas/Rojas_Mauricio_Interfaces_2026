import {
  Component,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
  AfterViewInit,
  OnDestroy,
  ViewChildren,
  ViewChild,
  QueryList,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Producto,
  ProductoService,
  ProductoRow
} from 'src/app/services/servicio-alta-producto';
import {
  PedidoService,
  EstadoPedido,
  PedidoRow as PedidoRowData,
  PedidoUpdate
} from 'src/app/services/pedido.service';
import { ReactiveFormsModule } from '@angular/forms';
import { SpinnerService } from 'src/app/services/spinner';
import {
  ToastController,
  IonicModule,
  ModalController,
  IonContent
} from '@ionic/angular';
import { AuthService } from 'src/app/auth.service';
import { ClientesService } from 'src/app/clientes.service';
import { Router, ActivatedRoute } from '@angular/router';
import { GameResultsService } from '../../services/game-results.service';
import { ServicioMovimiento } from '../../services/servicio-movimiento';
import { Subscription } from 'rxjs';
import { PushNotificationService } from '../../services/push-notification.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-lista-productos',
  templateUrl: './lista-productos.page.html',
  styleUrls: ['./lista-productos.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ListaProductosPage implements OnInit, AfterViewInit, OnDestroy {
  productos: Array<ProductoRow & { urls_imagenes: string[] }> = [];
  isLoading = false;
  sesion: any = null;
  cliente: any = null;
  mesaId: string | null = null;
  pedidos: PedidoRowData[] = [];
  pedidoCreado: PedidoRowData | null = null;
  pedidosLoading = false;

  // NUEVO: para saber si es cliente registrado (tiene email)
  esClienteRegistrado = false;
  modoDelivery = false;

  // NUEVO: cache de si tiene descuento por juegos
  private tieneDescuentoJuego = false;

  cantidadPorProducto: Record<string, number> = {};
  pedido: Array<{ producto: ProductoRow & { urls_imagenes: string[] }, cantidad: number }> = [];

  slideOpts = { initialSlide: 0, speed: 300, pager: true };

  @ViewChildren('carrusel') carouseles!: QueryList<ElementRef<any>>;
  @ViewChildren('tarjetaProducto') tarjetas!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild(IonContent, { static: false }) content?: IonContent;

  currentProductIndex = 0;
  private subGesto?: Subscription;

  movimientoActivo = false;
  private puedeInclinacionLocal = true;
  private calibradoOrientacion = false;
  private adelanteEsPositivo: boolean | null = null;
  private ultimaAccionProductoTs = 0;
  private onOrientacionLocal = (e: DeviceOrientationEvent) => {
    const gamma = (e.gamma ?? 0);
    const beta = (e.beta ?? 0);
    const umbralGiro = 28;
    const umbralInc = 16;
    const histeresis = 10;
    if (Math.abs(gamma) > umbralGiro / 2) return;
    if (Math.abs(beta) <= histeresis) { this.puedeInclinacionLocal = true; return; }
    if (!this.puedeInclinacionLocal) return;
    if (!this.calibradoOrientacion && Math.abs(beta) > umbralInc) {
      this.adelanteEsPositivo = beta > 0;
      this.calibradoOrientacion = true;
    }
    const adelantePos = this.adelanteEsPositivo ?? true;
    const esAdelante = adelantePos ? (beta >= umbralInc) : (beta <= -umbralInc);
    const esAtras = adelantePos ? (beta <= -umbralInc) : (beta >= umbralInc);
    if (esAdelante) {
      this.siguienteProducto();
      this.puedeInclinacionLocal = false;
    } else if (esAtras) {
      this.productoAnterior();
      this.puedeInclinacionLocal = false;
    }
  };

  constructor(
    private productoService: ProductoService,
    private spinnerService: SpinnerService,
    private toastController: ToastController,
    private authService: AuthService,
    private clientesService: ClientesService,
    private router: Router,
    private route: ActivatedRoute,
    private pedidoService: PedidoService,
    private modalController: ModalController,
    public gameResultsService: GameResultsService,
    private movimiento: ServicioMovimiento,
    private pushNotificationService: PushNotificationService
  ) {
    this.productoService = productoService;
    this.spinnerService = spinnerService;
    this.toastController = toastController;
    this.authService = authService;
    this.clientesService = clientesService;
    this.router = router;
    this.pedidoService = pedidoService;
    this.pushNotificationService = pushNotificationService;
  }

  ngAfterViewInit() {
    this.carouseles?.changes?.subscribe(() => this.enfocarProductoActual());
    this.tarjetas?.changes?.subscribe(() => this.enfocarProductoActual());
    setTimeout(() => this.enfocarProductoActual(), 0);
  }

  ngOnDestroy(): void {
    this.subGesto?.unsubscribe();
    this.movimiento.detener();
    try { window.removeEventListener('deviceorientation', this.onOrientacionLocal as any, true); } catch { }
  }

  async ngOnInit() {
    const tipoParam =
      this.route.snapshot.queryParamMap.get('tipo') ||
      this.route.snapshot.queryParamMap.get('tipo_pedido');
    const tipoNormalizado = (tipoParam || '').toLowerCase();
    this.modoDelivery = tipoNormalizado === 'domicilio' || tipoNormalizado === 'delivery';

    this.cargarProductos();

    const email = await this.authService.getUserEmail();
    if (email) {
      console.log('Email usuario actual:', email);
      this.esClienteRegistrado = true; // 👈 clave para permitir delivery
      this.cliente = await this.clientesService.getClienteByEmail(String(email));
      console.log('Cliente cargado:', this.cliente);
      this.mesaId = this.cliente?.mesa_id ?? null;
      console.log('Mesa ID:', this.mesaId);
    } else if (!email) {
      // anónimo
      const clienteAnonimo = localStorage.getItem('menuya_anon_session');
      if (clienteAnonimo) {
        let cliente = JSON.parse(clienteAnonimo);
        let idCliente = cliente?.idCliente ?? null;
        this.cliente = await this.clientesService.getClienteById(idCliente);
        this.mesaId = this.cliente?.mesa_id ?? null;
        console.log('Cliente anónimo cargado:', this.cliente);
        console.log('Mesa ID (anónimo):', this.mesaId);
      }
      // si es anónimo, no habilitamos delivery
      this.esClienteRegistrado = false;
    }

    // 👇 NUEVO: resolver una sola vez si tiene descuento por juegos
    try {
      this.tieneDescuentoJuego = await this.gameResultsService.hasDiscount();
    } catch {
      this.tieneDescuentoJuego = false;
    }
  }

  private async cargarProductos() {
    this.spinnerService.show();
    try {
      const productos = await this.productoService.listarProductosConImagenes();
      this.productos = productos ?? [];
      for (const p of this.productos) {
        const key = this.productKey(p);
        if (!(key in this.cantidadPorProducto)) {
          this.cantidadPorProducto[key] = 0;
        }
      }
      console.log('Productos cargados:', this.productos);
      this.currentProductIndex = 0;
      setTimeout(() => this.enfocarProductoActual(), 0);
    } catch (error) {
      console.error('Error al cargar productos:', error);
      this.presentToast('Error al cargar productos');
    } finally {
      this.spinnerService.hide();
    }
  }

  productKey(p: { nombre: string }): string {
    return (p?.nombre ?? '').toString();
  }

  private obtenerSwiperActual(): any | null {
    const arr = this.carouseles?.toArray?.() ?? [];
    const el = arr[this.currentProductIndex]?.nativeElement;
    return el?.swiper ?? null;
  }

  siguienteFoto(): void {
    const arr = this.carouseles?.toArray?.() ?? [];
    const el = arr[this.currentProductIndex]?.nativeElement as any;
    const swiper = el?.swiper;
    if (swiper?.slideNext) {
      swiper.slideNext(300);
    } else {
      setTimeout(() => {
        const s2 = el?.swiper;
        if (s2?.slideNext) s2.slideNext(300);
      }, 120);
    }
  }

  fotoAnterior(): void {
    const arr = this.carouseles?.toArray?.() ?? [];
    const el = arr[this.currentProductIndex]?.nativeElement as any;
    const swiper = el?.swiper;
    if (swiper?.slidePrev) {
      swiper.slidePrev(300);
    } else {
      setTimeout(() => {
        const s2 = el?.swiper;
        if (s2?.slidePrev) s2.slidePrev(300);
      }, 120);
    }
  }

  private async enfocarProductoActual(): Promise<void> {
    const cards = this.tarjetas?.toArray?.() ?? [];
    const card = cards[this.currentProductIndex]?.nativeElement as HTMLElement | undefined;
    if (!card) return;
    try {
      const y = Math.max(0, (card.offsetTop ?? 0) - 8);
      if (this.content && (this.content as any).scrollToPoint) {
        await this.content.scrollToPoint(0, y, 400);
      } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    } catch { }
  }

  siguienteProducto(): void {
    if (!this.productos?.length) return;
    this.currentProductIndex = Math.min(this.productos.length - 1, this.currentProductIndex + 1);
    this.enfocarProductoActual();
  }

  productoAnterior(): void {
    if (!this.productos?.length) return;
    this.currentProductIndex = Math.max(0, this.currentProductIndex - 1);
    this.enfocarProductoActual();
  }

  irPrimerProducto(): void {
    if (!this.productos?.length) return;
    this.currentProductIndex = 0;
    const arr = this.carouseles?.toArray?.() ?? [];
    const el = arr[this.currentProductIndex]?.nativeElement as any;
    const swiper = el?.swiper;
    if (swiper?.slideTo) { try { swiper.slideTo(0, 300); } catch { } }
    else {
      setTimeout(() => {
        const s2 = el?.swiper;
        if (s2?.slideTo) try { s2.slideTo(0, 300); } catch { }
      }, 120);
    }
    if (this.content?.scrollToTop) {
      this.content.scrollToTop(400);
    } else {
      this.enfocarProductoActual();
    }
  }

  prettyNombre(nombre: string): string {
    const withSpaces = (nombre ?? '').replace(/_/g, ' ');
    return withSpaces
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private onGesto(g: 'izquierda' | 'derecha' | 'adelante' | 'atras' | 'reinicio') {
    switch (g) {
      case 'izquierda':
        this.siguienteFoto();
        break;
      case 'derecha':
        this.fotoAnterior();
        break;
      case 'adelante':
        this.siguienteProducto();
        this.ultimaAccionProductoTs = Date.now();
        break;
      case 'atras':
        // Se deshabilita el retroceso de producto para evitar rebotes involuntarios
        break;
      case 'reinicio':
        if (Date.now() - this.ultimaAccionProductoTs < 1200) return;
        this.irPrimerProducto();
        this.ultimaAccionProductoTs = Date.now();
        break;
    }
  }

  async toggleMovimiento() {
    if (!this.movimientoActivo) {
      try {
        const ok = await this.movimiento.pedirPermisoSiHaceFalta();
        if (!ok) {
          await this.presentToast('Permiso denegado para sensores');
          return;
        }
        this.movimiento.iniciar();
        this.subGesto = this.movimiento.gestos.subscribe((g) => this.onGesto(g as any));
        try { window.addEventListener('deviceorientation', this.onOrientacionLocal as any, true); } catch { }
        this.movimientoActivo = true;
        await this.presentToast('Control por movimiento activado');
      } catch (e) {
        console.warn('No se pudo activar movimiento', e);
        await this.presentToast('No se pudo activar movimiento');
      }
    } else {
      try {
        this.subGesto?.unsubscribe();
        this.movimiento.detener();
        try { window.removeEventListener('deviceorientation', this.onOrientacionLocal as any, true); } catch { }
      } finally {
        this.movimientoActivo = false;
        await this.presentToast('Control por movimiento desactivado');
      }
    }
  }

  cantidadDe(p: ProductoRow): number {
    return this.cantidadPorProducto[this.productKey(p)] ?? 0;
  }

  incrementar(p: ProductoRow): void {
    const key = this.productKey(p);
    this.cantidadPorProducto[key] = (this.cantidadPorProducto[key] ?? 0) + 1;
  }

  decrementar(p: ProductoRow): void {
    const key = this.productKey(p);
    const actual = this.cantidadPorProducto[key] ?? 0;
    this.cantidadPorProducto[key] = Math.max(0, actual - 1);
  }

  async agregarAlPedido(p: ProductoRow & { urls_imagenes: string[] }) {
    const key = this.productKey(p);
    const cantidad = this.cantidadPorProducto[key] ?? 0;
    if (cantidad <= 0) {
      await this.presentToast('Selecciona una cantidad primero');
      return;
    }

    const idx = this.pedido.findIndex((li) => this.productKey(li.producto) === key);
    if (idx >= 0) {
      this.pedido[idx] = {
        producto: this.pedido[idx].producto,
        cantidad: this.pedido[idx].cantidad + cantidad
      };
    } else {
      this.pedido.push({ producto: p, cantidad });
    }

    this.cantidadPorProducto[key] = 0;
    console.log('Pedido actualizado:', this.pedido);
    await this.presentToast('Agregado al pedido');
  }

  get importeTotal(): number {
    let total = this.pedido.reduce(
      (acc, li) => acc + (Number(li.producto.precio) || 0) * (li.cantidad || 0),
      0
    );

    // ANTES: this.gameResultsService?.hasDiscount?.()
    // AHORA: usamos la flag resuelta en ngOnInit
    if (this.tieneDescuentoJuego) {
      total = total * 0.9;
    }

    return total;
  }

  get tiempoTotal(): number {
    if (!this.pedido.length) return 0;
    return this.pedido.reduce((max, li) => {
      const t = Number(li.producto.tiempo) || 0;
      return t > max ? t : max;
    }, 0);
  }

  minutosLabel(n: number): string {
    return n === 1 ? 'MINUTO' : 'MINUTOS';
  }

  formatearMoneda(valor: number): string {
    if (!Number.isFinite(valor)) return '$ 0';
    try {
      return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
      }).format(valor);
    } catch {
      return `$ ${Math.round(valor)}`;
    }
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color: 'light',
    });
    toast.present();
  }

  goHome(): void {
    this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  goToChat(): void {
    this.router.navigate(['/chat'], {
      queryParams: { mesa_id: this.mesaId ?? this.cliente?.mesa_id ?? '',
                    remitente: 'cliente'
       }
    });
  }

  private parseNumeroMesa(): number | null {
    const n =
      typeof this.mesaId === 'string'
        ? Number(this.mesaId)
        : Number(this.cliente?.mesa_id);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private buildItemsPayload() {
    return this.pedido.map((li) => ({
      nombre: li.producto?.nombre ?? '',
      cantidad: li.cantidad ?? 0,
      precio_unitario: Number(li.producto?.precio) || 0,
      subtotal: (Number(li.producto?.precio) || 0) * (li.cantidad ?? 0),
      categoria: li.producto?.categoria ?? '',
    }));
  }

  private calcularFlagsIniciales(items: Array<{ categoria?: string }>) {
    const normalizar = (valor?: string | null) => (valor || '').toLowerCase();
    const tieneComida = items.some(it => {
      const cat = normalizar(it.categoria);
      return cat.includes('comida') || cat.includes('plato') || cat.includes('comidas');
    });
    const tieneBebida = items.some(it => {
      const cat = normalizar(it.categoria);
      return cat.includes('bebida') || cat.includes('tragos') || cat.includes('barra');
    });
    return {
      cocinaListo: !tieneComida,
      cocteleriaListo: !tieneBebida
    };
  }

  async crearPedidoDesdeCarrito() {
    if (!this.pedido.length) {
      await this.presentToast('No hay items en el pedido');
      return;
    }

    const numero_mesa = this.modoDelivery ? null : this.parseNumeroMesa();

    const itemsPayload = this.buildItemsPayload();
    const flagsIniciales = this.calcularFlagsIniciales(itemsPayload);

    // 🟢 CASO NORMAL: SALÓN (con mesa)
    if (numero_mesa) {
      this.spinnerService.show();
      try {
        const creado = await this.pedidoService.createPedido({
          numero_mesa,
          items: itemsPayload,
          monto_total: this.importeTotal,
          tiempo_elaboracion: this.tiempoTotal,
          cocina_listo: flagsIniciales.cocinaListo,
          cocteleria_listo: flagsIniciales.cocteleriaListo,
          estado: 'pendiente',
          tipo: 'salon'
        });

        // 🔔 Push al mozo (ESTO YA LO TENÍAS)
        this.pushNotificationService.sendNotificationToRole({
          role: 'mozo',
          title: 'Nuevo pedido en mesa',
          body: `Se ha creado un nuevo pedido en la mesa ${numero_mesa}.`,
          data: { tipo: 'nuevo_pedido' }
        });

        this.pedidoCreado = creado;
        this.pedido = [];
        await this.presentToast('Pedido creado correctamente');
        this.goHome();
      } catch (error: any) {
        console.error('Error al crear pedido:', error);
        await this.presentToast(error?.message ?? 'Error al crear el pedido');
      } finally {
        this.spinnerService.hide();
      }
      return;
    }

    // 🟠 SIN MESA -> DELIVERY
    if (!this.esClienteRegistrado) {
      await this.presentToast('Solo los clientes registrados pueden pedir a domicilio');
      return;
    }

    const ctx = this.pedidoService.getContextoDomicilio();
    if (!ctx || !ctx.direccion) {
      await this.presentToast('Falta dirección de entrega');
      return;
    }

    this.spinnerService.show();
    try {
      const creado = await this.pedidoService.createPedido({
        numero_mesa: this.pedidoService.getNumeroMesaDeliveryVirtual(),
        items: itemsPayload,
        monto_total: this.importeTotal,
        tiempo_elaboracion: this.tiempoTotal,
        cocina_listo: flagsIniciales.cocinaListo,
        cocteleria_listo: flagsIniciales.cocteleriaListo,
        estado: 'pendiente',
        tipo: 'domicilio',
        domicilio_direccion: ctx.direccion,
        domicilio_lat: ctx.lat,
        domicilio_lng: ctx.lng,
      });

      // 🔔 NUEVO: push al dueño cuando se crea un pedido a domicilio
      const direccionLabel = ctx.direccion || '';
      this.pushNotificationService.sendNotificationToRole({
        role: 'dueño',
        title: 'Nuevo pedido a domicilio',
        body: `Pedido #${creado.id} a domicilio -> Confirmalo o rechazalo.`,
        data: {
          tipo: 'nuevo_pedido_delivery'
        }
      });

      this.pedidoCreado = creado;
      this.pedido = [];
      await this.presentToast('Pedido delivery creado correctamente');
      this.goHome();
    } catch (error: any) {
      console.error('Error al crear pedido delivery:', error);
      await this.presentToast(error?.message ?? 'Error al crear el pedido delivery');
    } finally {
      this.spinnerService.hide();
    }
  }

  async actualizarPedido(id: number, patch: PedidoUpdate) {
    if (!id || id <= 0) {
      await this.presentToast('Id de pedido inválido');
      return;
    }
    this.spinnerService.show();
    try {
      const actualizado = await this.pedidoService.updatePedido(id, patch);
      await this.presentToast(`Pedido #${actualizado.id} actualizado`);
    } catch (error: any) {
      console.error('Error al actualizar pedido:', error);
      await this.presentToast(error?.message ?? 'Error al actualizar el pedido');
    } finally {
      this.spinnerService.hide();
    }
  }

  async cambiarEstadoPedido(id: number, estado: EstadoPedido) {
    if (!id || id <= 0) {
      await this.presentToast('Id de pedido inválido');
      return;
    }
    this.spinnerService.show();
    try {
      const res = await this.pedidoService.updateEstado(id, estado);
      await this.presentToast(`Estado de pedido #${res.id} -> ${res.estado}`);
    } catch (error: any) {
      console.error('Error al cambiar estado del pedido:', error);
      await this.presentToast(error?.message ?? 'Error al cambiar estado');
    } finally {
      this.spinnerService.hide();
    }
  }

  async consultarTodosPedidos() {
    this.pedidosLoading = true;
    try {
      this.pedidos = await this.pedidoService.getTodos();
      await this.presentToast(`Pedidos cargados: ${this.pedidos.length}`);
    } catch (error: any) {
      console.error('Error al obtener pedidos:', error);
      await this.presentToast(error?.message ?? 'Error al obtener pedidos');
    } finally {
      this.pedidosLoading = false;
    }
  }

  async consultarPedidosPorMiMesa() {
    const numero_mesa = this.parseNumeroMesa();
    if (!numero_mesa) {
      await this.presentToast('No se encontró un número de mesa válido');
      return;
    }
    this.pedidosLoading = true;
    try {
      this.pedidos = await this.pedidoService.getPorNumeroMesa(numero_mesa);
      await this.presentToast(`Pedidos de mesa ${numero_mesa}: ${this.pedidos.length}`);
    } catch (error: any) {
      console.error('Error al obtener pedidos por mesa:', error);
      await this.presentToast(error?.message ?? 'Error al obtener pedidos de tu mesa');
    } finally {
      this.pedidosLoading = false;
    }
  }

  async actualizarListos(id: number, cocina_listo: boolean, cocteleria_listo: boolean) {
    if (!id || id <= 0) {
      await this.presentToast('Id de pedido inválido');
      return;
    }
    this.spinnerService.show();
    try {
      const res = await this.pedidoService.updateListos(id, cocina_listo, cocteleria_listo);
      await this.presentToast(
        `Listos -> Cocina: ${!!res.cocina_listo}, Coctelería: ${!!res.cocteleria_listo}`
      );
    } catch (error: any) {
      console.error('Error al actualizar flags de listos:', error);
      await this.presentToast(error?.message ?? 'Error al actualizar flags');
    } finally {
      this.spinnerService.hide();
    }
  }

  async confirmarPedidoConToast() {
    if (!this.pedido.length) {
      await this.presentToast('No hay items en el pedido');
      return;
    }

    const lineas = this.pedido
      .filter((li) => (li?.cantidad ?? 0) > 0)
      .map((li) => `${this.prettyNombre(li.producto.nombre)} x ${li.cantidad}`)
      .join('\n');

    if (!lineas.length) {
      await this.presentToast('No hay cantidades seleccionadas');
      return;
    }
    const mensaje = `Confirmar pedido:\n${lineas}`;
    try {
      const toast = await this.toastController.create({
        message: mensaje,
        position: 'middle',
        duration: 0,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Confirmar',
            role: 'confirm',
            handler: async () => {
              await this.crearPedidoDesdeCarrito();
            },
          },
        ],
      });
      await toast.present();
    } catch (e: any) {
      console.error('Error al mostrar confirmación del pedido:', e);
      await this.presentToast('No se pudo mostrar la confirmación');
    }
  }

  async testSweetAlert() {
    console.log('testSweetAlert() llamado');
    await Swal.fire('Funciona 🎉', 'SweetAlert2 está andando', 'success');
  }

  async confirmarPedidoConSweetAlert() {
    if (!this.pedido.length) {
      await this.presentToast('No hay items en el pedido');
      return;
    }

    const itemsValidos = this.pedido.filter((li) => (li?.cantidad ?? 0) > 0);

    if (!itemsValidos.length) {
      await this.presentToast('No hay cantidades seleccionadas');
      return;
    }

    const lineasHtml = itemsValidos
      .map(
        (li) => `
          <li class="menuya-item-row">
            <span class="menuya-item-name">${this.prettyNombre(li.producto.nombre)}</span>
            <span class="menuya-item-qty">x${li.cantidad}</span>
          </li>
        `
      )
      .join('');

    const total = this.formatearMoneda(this.importeTotal);
    const tiempo = this.tiempoTotal;
    const labelTiempo = this.minutosLabel(tiempo);

    try {
      const result = await Swal.fire({
        title: 'Revisa tu pedido',
        html: `
          <div class="menuya-swal-content">
            <div class="menuya-swal-header">
              <div class="menuya-swal-header-text">
                <p>Estos son los productos que vas a pedir</p>
              </div>
            </div>

            <ul class="menuya-items-list">
              ${lineasHtml}
            </ul>

            <div class="menuya-summary-row">
              <div class="menuya-summary-label">Total</div>
              <div class="menuya-summary-value">${total}</div>
            </div>

            <div class="menuya-time-chip">
              ⏱ ${tiempo} ${labelTiempo} (estimado)
            </div>
          </div>
        `,
        icon: 'question',

        target: document.body as HTMLElement,
        position: 'center',
        heightAuto: false,
        backdrop: true,

        showCancelButton: true,
        confirmButtonText: 'Enviar pedido',
        cancelButtonText: 'Seguir eligiendo',
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
        await this.crearPedidoDesdeCarrito();
      }
    } catch (e: any) {
      console.error('Error al mostrar confirmación del pedido:', e);
      await this.presentToast('No se pudo mostrar la confirmación');
    }
  }
}