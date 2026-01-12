import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth.service';
import { ClientesService, Cliente } from '../clientes.service';
import { EmailService } from '../email.service';
import { MesaService } from '../services/mesas';
import { CuentaService } from '../services/cuenta.service';

import { supabase } from '../supabase.client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { QrService } from '../services/qr.service';
import { SpinnerService } from '../services/spinner';

import { PedidoService, PedidoRow, EstadoPedido, mapRowFromDb } from '../services/pedido.service';
import { FacturacionService } from '../services/facturacion.service';
import type { DetalleCuenta, DatosCliente } from '../models/facturacion';
import { PushNotificationService } from '../services/push-notification.service';
import * as L from 'leaflet';
import Swal from 'sweetalert2';

type PedidoFiltrado = PedidoRow & {
  itemsFiltrados: { nombre: string; cantidad: number; categoria: string }[];
  _minCustom?: number; // minutos custom en confirmación boss
};

// ➕ VM solo para la grilla del dueño/supervisor
type PedidoDeliveryBossVM = PedidoRow & { _minCustom?: number };

// ➕ NUEVO: VM para pagos pendientes de delivery
type CuentaDeliveryPendiente = {
  cuentaId: number;
  pedidoId: number;
  numero_mesa: number | null;
  total: number | null;
  estado: string | null;
  domicilio_direccion: string | null;
  created_at: string | null;
};


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  // Sesión
  email: string | null = null;
  role: 'dueno' | 'supervisor' | 'bartender' | 'cocinero' | 'maitre' | 'mozo' | 'cliente' | 'delivery' | 'anonimo' | null = null;
  firstName = '';

  //DivisionPedidos
  homePedidoTab: 'local' | 'domicilio' = 'local';

  deliveryTab: 'asignados' | 'pagos' = 'asignados';


  // Anónimo
  isAnon = false;
  anonName = '';
  anonAvatar: string | null = null;

  // 🔹 Descarga de factura (solo anónimo)
  anonFacturaLink: string | null = null;
  anonFacturaNombre: string | null = null;
  mostrarFacturaAnonima = false;

  private waitlistSub: RealtimeChannel | null = null;
  private pedidosMesaSub: RealtimeChannel | null = null;
  private pedidosListosSub: RealtimeChannel | null = null; // watcher pedidos listos para mozo
  private pedidosDeliveryPendientesBossSub: RealtimeChannel | null = null; // watcher delivery pendientes dueño

  // UI/Estado
  isLoading = true;
  errorMsg = '';

  // KPIs
  stats = { todayOrders: 0, reservations: 0, occupancy: 0 };

  // Pendientes (solo dueño/supervisor)
  pendientes: Cliente[] = [];
  isLoadingPend = false;
  //
  // Estado interno
  private clienteIdActual: number | null = null;
  private mesaSub: RealtimeChannel | null = null;
  private facturaSub: RealtimeChannel | null = null;
  private deliverySub: RealtimeChannel | null = null;
  private pedidoDeliverySub: RealtimeChannel | null = null;

  // watcher de pedidos por mesa (salón) para actualizar estados en tiempo real

  // watchers en tiempo real para el panel del MAÎTRE
  private maitreClientesSub: RealtimeChannel | null = null;
  private maitreMesasSub: RealtimeChannel | null = null;
  // recordar última mesa
  private lastMesaUsada: number | null = null;
  private ultimoPedidoIdParaFactura: number | null = null;
  private readonly SALA_CHAT_DELIVERY_OFFSET = 90000;

  //Pedidos pendientes de preparacion
  pedidosPendientes: PedidoFiltrado[] = [];
  isLoadingPedidos = false;

  pedidos: PedidoRow[] = [];
  pedidosEntregados: PedidoRow[] = [];

  // --------------------- LOCAL (ya lo tenías) ---------------------
  pedidosRecibidos: PedidoRow | null = null;
  pedidoRecibido = false;
  puedePedirCuenta = false;
  pedidoCancelado = false;
  pedidoPendiente = false;
  pedidoEnPreparacion = false;
  pedidoListo = false;
  pedidoEntregado = false;

  // --------------------- FLAG PARA QR DE MESA CON PEDIDO EN CURSO ---------------------

  qrMesaConPedidoEnCurso = false;

  // --------------------- DELIVERY (cliente) ---------------------
  pedidoDelivery: PedidoRow | null = null;
  pedidoDeliveryPendiente = false;
  pedidoDeliveryEnPreparacion = false;
  pedidoDeliveryListo = false;
  pedidoDeliveryEntregado = false;
  pedidoDeliveryRecibido = false;
  pedidoDeliveryCancelado = false;
  pedidosDeliveryListos: PedidoRow[] = [];
  isLoadingDeliveryCourier = false;
  pedidoRutaSeleccionado: PedidoRow | null = null;

  pedidoDeliveryPagado = false;


  private pedidosRecogidosDelivery = new Set<number>();

  // ===================== DELIVERY: pagos pendientes =====================
  cuentasDeliveryPendientes: CuentaDeliveryPendiente[] = [];
  isLoadingCuentasDelivery = false;
  private cuentasDeliverySub: RealtimeChannel | null = null;


  // --------------------- DELIVERY (dueño/supervisor) ---------------------
  pedidosDeliveryPendientesBoss: PedidoDeliveryBossVM[] = [];
  isLoadingDeliveryBoss = false;
  @ViewChild('mapaRutaEntrega') mapaRutaEntrega?: ElementRef<HTMLDivElement>;
  private mapaRuta: L.Map | null = null;
  private markerRestaurante: L.Marker | null = null;
  private markerCliente: L.Marker | null = null;
  private rutaPolyline: L.Polyline | null = null;
  private leafletConfigured = false;
  private readonly RESTO_COORDS = {
    lat: -34.662364149318925,
    lng: -58.36489070185021,
  };
  constructor(
    private auth: AuthService,
    private router: Router,
    private toast: ToastController,
    private clientes: ClientesService,
    private emailSrv: EmailService,
    public mesaService: MesaService,
    private cuentaService: CuentaService,
    private QrService: QrService,
    private spinner: SpinnerService,
    private pedidoService: PedidoService,
    private facturacion: FacturacionService,
    private pushNotificationService: PushNotificationService
  ) { }

async ionViewWillEnter() {
  this.qrMesaConPedidoEnCurso = false;

  // 🛡️ FIX: Si el rol es nulo (ej. tras navegar), intentamos deducirlo
  if (!this.role) {
    const userRole = await this.auth.getUserRole();
    if (userRole === 'cliente' || userRole === 'cliente registrado') {
      this.role = 'cliente';
    }
  }

  // Si vuelvo de hacer un pedido a domicilio, me aseguro de traer el último pedido
  if (this.role === 'cliente') {
    await this.cargarPedidoDeliveryActual();
  }

  // 🔹 DUEÑO / SUPERVISOR: al volver a la app, recargo la lista y rearmo watcher
  if (this.role === 'dueno' || this.role === 'supervisor') {
    await this.cargarPedidosDeliveryPendientesBoss();

    // por si el canal se cayó mientras la app estaba en background
    if (!this.pedidosDeliveryPendientesBossSub) {
      this.armarWatcherPedidosDeliveryPendientesBoss();
    }
  }

  // 🔹 MOZO: recargar pedidos listos y asegurar watcher
  if (this.role === 'mozo') {
    await this.cargarPedidosListos();
    if (!this.pedidosListosSub) {
      this.armarWatcherPedidosListosMozo();
    }
  }

  // 🔹 DELIVERY: al volver al frente SIEMPRE rearmamos watchers
  if (this.role === 'delivery') {
    await this.cargarPedidosParaDelivery();
    await this.cargarCuentasDeliveryPendientes();

    // estos métodos ya limpian el canal anterior si existe
    this.armarWatcherPedidosDelivery();
    this.armarWatcherCuentasDelivery();
  }
}

  async ngOnInit() {
    await this.spinner.show();
    try {
      this.qrMesaConPedidoEnCurso = false
      // recuperar lastMesaUsada
      const memo = localStorage.getItem('menuya_last_mesa');
      this.lastMesaUsada = memo ? Number(memo) : null;

      await this.loadSessionAndData();
      await this.loadPendientesIfBoss();

      if (this.role === 'maitre') {
        // Carga inicial de lista de espera + mesas
        await this.mesaService.loadClientesYMesaDisponibles();

        // Watchers en tiempo real para la lista de espera y mesas
        this.armarWatcherWaitlist();   // cambios en menuya_clientes (en_espera true/false)
        this.armarWatcherMaitre();     // cambios en clientes y en menuya_mesas
      }

      await this.resolverClienteYArrancarWatcher();

      if (this.role === 'cocinero' || this.role === 'bartender') {
        this.isLoadingPedidos = true;
        await this.cargarPedidos();
        this.isLoadingPedidos = false;
      }

      // 🧾 MOZO: cargar pedidos listos y armar watcher en tiempo real
      if (this.role === 'mozo') {
        await this.cargarPedidosListos();
        this.armarWatcherPedidosListosMozo();
      }


      if (this.role === 'cliente' || this.role === 'anonimo') {
        await this.cargarPedidosEntregados();
        await this.cargarPedidosRecibidos();
      }

      // 🔹 delivery: si es cliente y no tiene mesa, intentamos ver si tiene un pedido a domicilio
      if (this.role === 'cliente') {
        await this.cargarPedidoDeliveryActual();
      }

      // 🔹 Si es anónimo, armamos watcher de pago/factura
      if (this.role === 'anonimo') {
        this.mostrarFacturaAnonima = false;
        await this.armarWatcherFacturaAnonima();
      }

      // 🔹 NUEVO: si es dueño/supervisor, cargar pedidos delivery pendientes para confirmar + watcher
      if (this.role === 'dueno' || this.role === 'supervisor') {
        await this.cargarPedidosDeliveryPendientesBoss();
        this.armarWatcherPedidosDeliveryPendientesBoss();
      }

    } finally {
      await this.spinner.hide();
    }
    if (this.role === 'delivery') {
      await this.cargarPedidosParaDelivery();
      await this.cargarCuentasDeliveryPendientes();
      this.armarWatcherPedidosDelivery();
      this.armarWatcherCuentasDelivery();
    }
  }

  ngOnDestroy(): void {
    this.qrMesaConPedidoEnCurso = false
    if (this.mesaSub) {
      try { supabase.removeChannel(this.mesaSub); } catch { }
      this.mesaSub = null;
    }
    if (this.facturaSub) {
      try { supabase.removeChannel(this.facturaSub); } catch { }
      this.facturaSub = null;
    }
    if (this.deliverySub) {
      try { supabase.removeChannel(this.deliverySub); } catch { }
      this.deliverySub = null;
    }
    if (this.pedidoDeliverySub) {
      try { supabase.removeChannel(this.pedidoDeliverySub); } catch { }
      this.pedidoDeliverySub = null;
    }
    if (this.cuentasDeliverySub) {
      try { supabase.removeChannel(this.cuentasDeliverySub); } catch { }
      this.cuentasDeliverySub = null;
    }
    if (this.pedidosDeliveryPendientesBossSub) {
      try { supabase.removeChannel(this.pedidosDeliveryPendientesBossSub); } catch { }
      this.pedidosDeliveryPendientesBossSub = null;
    }

    // liberar watchers del módulo maître
    // liberar watchers del módulo maître
    this.liberarWatcherMaitre();

    // liberar watcher de lista de espera
    if (this.waitlistSub) {
      try { supabase.removeChannel(this.waitlistSub); } catch { }
      this.waitlistSub = null;
    }


    // liberar watcher de pedidos listos del mozo
    this.liberarWatcherPedidosListosMozo();


    this.destruirMapaRuta();

  }
pedidoRecogido(id: number): boolean {
  return this.pedidosRecogidosDelivery.has(id);
}
  // Estados donde el cliente puede completar/ver encuestas y seguir viendo la cuenta
  esEstadoPostEntregaDelivery(estado: string | null | undefined): boolean {
    if (!estado) return false;
    return estado === 'recibido' || estado === 'pagado' || estado === 'finalizado';
  }

async marcarPedidoRecogido(pedido: PedidoRow) {
  await this.spinner.show();          // ⬅️ Spinner antes de todo

  try {
    // Solo cambio visual local
    this.pedidosRecogidosDelivery.add(pedido.id);

    const t = await this.toast.create({
      message: `Pedido #${pedido.id} recogido. Ahora podés marcarlo como entregado cuando llegues al cliente.`,
      duration: 1800,
      color: 'tertiary',
      icon: 'bicycle-outline',
    });
    await t.present();

  } catch (err) {
    console.error(err);

    const t = await this.toast.create({
      message: 'Hubo un problema al marcar el pedido como recogido.',
      duration: 1800,
      color: 'danger',
      icon: 'alert-circle-outline'
    });
    await t.present();

  } finally {
    await this.spinner.hide();        // ⬅️ Asegura que siempre se cierre
  }
}


  // watcher real-time para pedidos delivery pendientes del dueño/supervisor
  private armarWatcherPedidosDeliveryPendientesBoss() {
    // Limpio watcher anterior si existía
    if (this.pedidosDeliveryPendientesBossSub) {
      try { supabase.removeChannel(this.pedidosDeliveryPendientesBossSub); } catch { }
      this.pedidosDeliveryPendientesBossSub = null;
    }

    // Solo aplica a dueño o supervisor
    if (this.role !== 'dueno' && this.role !== 'supervisor') return;

    this.pedidosDeliveryPendientesBossSub = supabase
      .channel('watcher_delivery_pendientes_boss')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'menuya_pedidos',
          filter: 'tipo=eq.domicilio'   // escucho solo pedidos a domicilio
        },
        async (payload) => {
          const nuevo = (payload as any).new;
          const viejo = (payload as any).old;

          const eraPendiente = viejo?.estado === 'pendiente';
          const esPendiente = nuevo?.estado === 'pendiente';

          // Si un pedido entra o sale de "pendiente", recargo la lista del dueño
          if (eraPendiente || esPendiente) {
            try {
              await this.cargarPedidosDeliveryPendientesBoss();
            } catch (err) {
              console.error('[HOME] Error refrescando pendientes boss:', err);
            }
          }
        }
      )
      .subscribe((s) => console.log('[HOME] watcher boss pendientes status:', s));
  }

  // ---------------------------------------------------------------------
  async verificarSiPuedePedirCuenta() {
    try {
      const mesaNum = this.mesaService.selectedMesaNumero;
      if (!mesaNum) {
        this.puedePedirCuenta = false;
        return;
      }

      const { data, error } = await supabase
        .from('menuya_pedidos')
        .select('id')
        .eq('numero_mesa', mesaNum)
        .in('estado', ['recibido']);

      if (error) {
        console.error('Error verificando pedidos:', error);
        this.puedePedirCuenta = false;
        return;
      }

      this.puedePedirCuenta = Array.isArray(data) && data.length > 0;
    } catch (err) {
      console.error('Error verificando si puede pedir cuenta:', err);
      this.puedePedirCuenta = false;
    }
  }
  // ---------------------------------------------------------------------

  private resetFlagsLocal() {
    this.pedidoRecibido = false;
    this.pedidoCancelado = false;
    this.pedidoPendiente = false;
    this.pedidoEnPreparacion = false;
    this.pedidoListo = false;
    this.pedidoEntregado = false;
  }

  private resetFlagsDelivery() {
    this.pedidoDeliveryPendiente = false;
    this.pedidoDeliveryEnPreparacion = false;
    this.pedidoDeliveryListo = false;
    this.pedidoDeliveryEntregado = false;
    this.pedidoDeliveryRecibido = false;
    this.pedidoDeliveryCancelado = false;
  }

  private aplicarFlagsDeliveryDesdeEstado(estado: EstadoPedido | null) {
    this.resetFlagsDelivery();
    switch (estado) {
      case 'pendiente':
        this.pedidoDeliveryPendiente = true;
        break;
      case 'en_preparacion':
        this.pedidoDeliveryEnPreparacion = true;
        break;
      case 'listo':
        this.pedidoDeliveryListo = true;
        break;
      case 'entregado':
        this.pedidoDeliveryEntregado = true;
        break;
      case 'recibido':
        this.pedidoDeliveryRecibido = true;
        break;
      case 'cancelado':
        this.pedidoDeliveryCancelado = true;
        break;
    }
  }

  // --------------------- DELIVERY: cargar pedido actual (cliente) ---------------------
private async cargarPedidoDeliveryActual(fromWatcher = false) {
  // Solo para cliente registrado
  if (this.role !== 'cliente') return;

  // 1. Intentar recuperar datos del servicio
  let ctx = this.pedidoService.getContextoDomicilio();
  let ultimoId = this.pedidoService.getUltimoPedidoDeliveryId();

  // 2. [FIX] RESPALDO: Si el servicio está vacío, intentar recuperar de localStorage
  if (!ultimoId) {
    const backupId = localStorage.getItem('menuya_last_delivery_id');
    if (backupId) ultimoId = Number(backupId);
  }

  // 3. Si definitivamente no hay datos ni en servicio ni en storage, limpiar y salir
  if ((!ctx || !ctx.direccion) && !ultimoId) {
    this.pedidoDelivery = null;
    this.resetFlagsDelivery();
    this.pedidoDeliveryPagado = false;
    this.liberarWatcherPedidoDelivery();
    return;
  }

  const mesaDelivery = this.getDeliveryVirtualMesa();

  // 4. Buscar el pedido
  let query = supabase
    .from('menuya_pedidos')
    .select('*')
    .eq('numero_mesa', mesaDelivery)
    .order('id', { ascending: false })
    .limit(1);

  if (ultimoId) {
    query = query.eq('id', ultimoId);
  } else if (ctx?.direccion) {
    query = query.eq('domicilio_direccion', ctx.direccion);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[HOME] Error cargando pedido delivery:', error);
    this.pedidoDelivery = null;
    this.resetFlagsDelivery();
    this.pedidoDeliveryPagado = false;
    this.liberarWatcherPedidoDelivery();
    return;
  }

  if (!data || !data.length) {
    this.pedidoDelivery = null;
    this.resetFlagsDelivery();
    this.pedidoDeliveryPagado = false;
    this.liberarWatcherPedidoDelivery();
    // Si no encontramos nada en la base, limpiamos el storage por si era basura vieja
    localStorage.removeItem('menuya_last_delivery_id');
    return;
  }

  const row = data[0] as any;

  this.pedidoDelivery = {
    id: Number(row.id),
    numero_mesa: Number(row.numero_mesa),
    items: row.items ?? null,
    monto_total: row.monto_total != null ? Number(row.monto_total) : null,
    tiempo_elaboracion: row.tiempo_elaboracion ?? null,
    cocina_listo: row.cocina_listo ?? null,
    cocteleria_listo: row.cocteleria_listo ?? null,
    estado: row.estado ?? null,
    created_at: row.created_at ?? null,
    tipo: row.tipo ?? 'domicilio',
    domicilio_direccion: row.domicilio_direccion ?? ctx?.direccion ?? null,
    domicilio_lat: row.domicilio_lat ?? null,
    domicilio_lng: row.domicilio_lng ?? null,
  };

  // [FIX] Guardar ID recuperado en localStorage para persistencia al navegar
  if (this.pedidoDelivery.id) {
    localStorage.setItem('menuya_last_delivery_id', String(this.pedidoDelivery.id));
    this.pedidoService.setUltimoPedidoDeliveryId(this.pedidoDelivery.id);
  }

  this.aplicarFlagsDeliveryDesdeEstado(this.pedidoDelivery.estado ?? null);

  // Verificar pagos
  await this.actualizarFlagPedidoDeliveryPagado(mesaDelivery);

  // [FIX] Forzar visualización de la pestaña
  if (this.pedidoDelivery && this.pedidoDelivery.estado !== 'finalizado') {
    this.homePedidoTab = 'domicilio';
  }

  if (!fromWatcher) {
    this.armarWatcherPedidoDelivery(this.pedidoDelivery.id);
  }

  // Restaurar contexto si faltaba
  if ((!ctx || !ctx.direccion) && this.pedidoDelivery.domicilio_direccion) {
    this.pedidoService.setContextoDomicilio({
      direccion: this.pedidoDelivery.domicilio_direccion,
      lat: this.pedidoDelivery.domicilio_lat ?? null,
      lng: this.pedidoDelivery.domicilio_lng ?? null
    });
  }
}


  // 🔍 Verifica en menuya_cuentas si la cuenta del pedido delivery ya está pagada
// 🔍 Verifica en menuya_cuentas si la cuenta de ESTE pedido delivery ya está pagada
private async actualizarFlagPedidoDeliveryPagado(mesaDelivery: number) {
  // por las dudas, reseteamos
  this.pedidoDeliveryPagado = false;

  // si todavía no tenemos pedido cargado, no hay nada que chequear
  if (!this.pedidoDelivery) return;

  const pedidoId = this.pedidoDelivery.id;

  try {
    const { data, error } = await supabase
      .from('menuya_cuentas')
      .select('id, estado')
      .eq('pedido_id', pedidoId) // 👈 ahora ligamos por pedido, NO por mesa
      .in('estado', ['confirmado', 'pagado']) // estados “finales”
      .order('pagado_en', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[HOME] Error consultando cuenta delivery por pedido_id:', error);
      return;
    }

    // [CAMBIO] Si hay datos, es porque está pagado.
    if (data) {
      this.pedidoDeliveryPagado = true;

      // 🗑️ LIMPIEZA CRÍTICA:
      // Borramos el ID del storage para que al volver de otra pantalla (ej. encuestas)
      // la app NO vuelva a cargar este pedido viejo.
      localStorage.removeItem('menuya_last_delivery_id');
      this.pedidoService.clearUltimoPedidoDeliveryId();
      this.pedidoService.clearContextoDomicilio();
      
    } else {
      this.pedidoDeliveryPagado = false;
    }

  } catch (e) {
    console.warn('[HOME] Error actualizando flag pedidoDeliveryPagado:', e);
    this.pedidoDeliveryPagado = false;
  }
}



  // ---------------------------------------------------------------------

  private normalizeRole(r: string | null): typeof this.role {
    if (!r) return null;
    const base = r.toLowerCase().trim();

    return base
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n')
      .replace('cliente registrado', 'cliente')
      .replace('cliente anonimo', 'anonimo')
      .replace('repartidor', 'delivery') as typeof this.role;
  }

  displayRole(r: typeof this.role): string {
    if (!r) return '';
    const map: Record<string, string> = {
      dueno: 'Dueño',
      supervisor: 'Supervisor',
      bartender: 'Bartender',
      cocinero: 'Cocinero',
      maitre: 'Maître',
      mozo: 'Mozo',
      cliente: 'Cliente',
      delivery: 'Repartidor',
      anonimo: 'Anónimo',
    };
    return map[r] ?? r.charAt(0).toUpperCase() + r.slice(1);
  }

  get roleLabel(): string {
    if (this.role) {
      return this.displayRole(this.role);
    }
    if (this.isAnon) {
      return this.displayRole('anonimo');
    }
    return 'Invitado';
  }

  get roleIconName(): string {
    const icons: Record<string, string> = {
      dueno: 'storefront-outline',
      supervisor: 'briefcase-outline',
      bartender: 'wine-outline',
      cocinero: 'flame-outline',
      maitre: 'people-circle-outline',
      mozo: 'restaurant-outline',
      cliente: 'person-circle-outline',
      delivery: 'bicycle-outline',
      anonimo: 'eye-off-outline',
    };
    const resolvedRole = this.role ?? (this.isAnon ? 'anonimo' : null);
    return resolvedRole ? (icons[resolvedRole] ?? 'person-circle-outline') : 'person-circle-outline';
  }

  isRoleDueno(): boolean {
    return this.role === 'dueno';
  }

  isRoleMaitre(): boolean {
    return this.role === 'maitre';
  }

  private deriveFirstName(email: string | null): string {
    if (!email) return '';
    const raw = email.split('@')[0] ?? '';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
  }

  private async loadSessionAndData() {
    this.isLoading = true;
    this.errorMsg = '';
    try {
      await Promise.all([this.loadSession(), this.loadStats()]);
    } catch (err) {
      this.errorMsg = 'No se pudo cargar la información.';
      console.error(err);
      const t = await this.toast.create({
        message: this.errorMsg,
        duration: 1600,
        color: 'danger',
        icon: 'warning-outline',
      });
      await t.present();
    } finally {
      this.isLoading = false;
    }
  }

  private async loadSession() {
    const email = await this.auth.getUserEmail();
    let rawRole = await this.auth.getUserRole();
    if (rawRole == null) {
      rawRole = await this.auth.getClienteRole();
      if (rawRole == null) {
        console.warn('No se pudo obtener el rol del usuario');
      }
    }

    const anon = await this.auth.getAnonInfo();
    console.log('[HOME] anon JSON ->', JSON.stringify(anon));

    this.email = email;
    this.role = this.normalizeRole(rawRole);

    // 👤 CLIENTE REGISTRADO -> toma nombre desde menuya_clientes
    if (email && this.role === 'cliente') {
      const { data, error } = await supabase
        .from('menuya_clientes')
        .select('nombres')
        .eq('email', email)
        .single();

      if (!error && data?.nombres) {
        this.firstName = data.nombres.split(' ')[0];
      } else {
        this.firstName = this.deriveFirstName(email);
      }

      // 👨‍🍳 EMPLEADOS (dueño, supervisor, mozo, cocinero, bartender, maître, delivery)
    } else if (email && this.role && this.role !== 'anonimo') {
      const { data, error } = await supabase
        .from('menuya_empleados')
        .select('nombre, apellido')
        .eq('email', email)
        .maybeSingle();

      if (!error && data) {
        const nombres = (data as any).nombres || (data as any).nombre || '';
        const base = (nombres as string).trim() || (data as any).apellidos || '';
        this.firstName = base
          ? base.split(' ')[0]
          : this.deriveFirstName(email);
      } else {
        this.firstName = this.deriveFirstName(email);
      }

      // 🔐 resto de casos (sin email, anon, etc.)
    } else {
      this.firstName = this.deriveFirstName(email);
    }

    this.isAnon = !!(anon?.isAnon);
    this.anonName = anon?.name || '';
    this.anonAvatar = anon?.avatar || null;

    if (!this.email && this.isAnon) {
      this.role = 'anonimo';
    }

    console.info(
      '[HOME] session email:',
      this.email,
      'role:',
      this.role,
      'isAnon:',
      this.isAnon,
      'firstName:',
      this.firstName
    );
  }

  private async loadStats() {
    await new Promise((res) => setTimeout(res, 300));
    this.stats = { todayOrders: 37, reservations: 18, occupancy: 72 };
  }

  private async loadPendientesIfBoss() {
    const isBoss = this.role === 'dueno' || this.role === 'supervisor';
    if (isBoss) {
      this.isLoadingPend = true;
      try {
        this.pendientes = await this.clientes.listarPendientes();
      } catch (e) {
        console.error('[HOME] error pendientes:', e);
        const t = await this.toast.create({
          message: 'No se pudo cargar pendientes',
          duration: 1500,
          color: 'warning',
          icon: 'warning-outline'
        });
        await t.present();
      } finally {
        this.isLoadingPend = false;
      }
    } else {
      this.pendientes = [];
    }
  }

  // ====== Navegación ======
  async goToEncuestas() {
    const soloResultados = this.pedidoRecibido !== true;
    await this.spinner.show();
    try {
      const extras: any = {};
      if (soloResultados) {
        extras.queryParams = { soloResultados: '1' };
      }
      this.router.navigate(['/encuestas'], extras);
    } finally {
      await this.spinner.hide();
    }
  }

  async irAEncuestasDelivery() {
    await this.spinner.show();
    try {
      this.router.navigate(['/encuestas'], {
        queryParams: { origen: 'delivery' }
      });
    } finally {
      await this.spinner.hide();
    }
  }

  async goToRegistro() {
    await this.spinner.show();
    try {
      this.router.navigate(['/registro']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToMenu() {
    await this.spinner.show();
    try {
      this.router.navigate(['/lista-productos']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToJuegos() {
    await this.spinner.show();
    try {
      this.router.navigate(['/juegos']);
    } finally {
      await this.spinner.hide();
    }
  }



  async goToConsultaMozo() {
    await this.spinner.show();
    try {
      this.router.navigate(['/chat'], {
        queryParams: {
          mesaId: this.mesaService.selectedMesaNumero ?? 0,
          remitente: this.role ?? (this.isAnon ? 'anonimo' : 'cliente')
        }
      });
    } finally {
      await this.spinner.hide();
    }
  }

  async goToAgregarBebida() {
    await this.spinner.show();
    try {
      this.router.navigate(['/alta-producto']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToAgregarComida() {
    await this.spinner.show();
    try {
      this.router.navigate(['/alta-producto']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToAgregarMesa() {
    await this.spinner.show();
    try {
      this.router.navigate(['/alta-mesa']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToCarta() {
    await this.spinner.show();
    try {
      this.router.navigate(['/carta']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToPedidosPendientes() {
    await this.spinner.show();
    try {
      this.router.navigate(['/pedidos-pendientes']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToAltaEmpleado() {
    await this.spinner.show();
    try {
      this.router.navigate(['/alta-empleado']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToReserva() {
    await this.spinner.show();
    try {
      this.router.navigate(['/reserva-mesa']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToGestionReservas() {
    await this.spinner.show();
    try {
      await this.router.navigate(['/gestion-reservas']);
    } finally {
      await this.spinner.hide();
    }
  }

  async goToGestionClientes() {
    await this.spinner.show();
    try {
      await this.router.navigate(['/clientes-pendientes']);
    } finally {
      await this.spinner.hide();
    }
  }

  goToPedidosDeliveryBoss() {
    this.router.navigate(['/pedidos-delivery']);
  }

  async irAPedidoDomicilio() {
    await this.spinner.show();
    try {
      await this.router.navigate(['/pedido-domicilio']);
    } finally {
      await this.spinner.hide();
    }
  }

  async refresh(ev: CustomEvent) {
    await this.spinner.show();
    try {
      this.isLoading = true;
      await Promise.all([this.loadSession(), this.loadStats()]);
      await this.loadPendientesIfBoss();
      await this.resolverClienteYArrancarWatcher();

      if (this.role === 'cliente') {
        await this.cargarPedidoDeliveryActual();
      }

      if (this.role === 'anonimo') {
        await this.armarWatcherFacturaAnonima();
        await this.buscarFacturaAnonima();
      }

      // NUEVO: refrescar listados de delivery pendientes para dueño/supervisor
      if (this.role === 'dueno' || this.role === 'supervisor') {
        await this.cargarPedidosDeliveryPendientesBoss();
      }
      if (this.role === 'delivery') {
        await this.cargarPedidosParaDelivery();
        await this.cargarCuentasDeliveryPendientes();

        // rearmamos siempre los canales para evitar conexiones “zombies”
        this.armarWatcherPedidosDelivery();
        this.armarWatcherCuentasDelivery();
      }


      // 🔴 si es maître, refrescamos la grilla por las dudas
      // 🔴 si es maître, refrescamos la grilla y rearmamos watchers
      if (this.role === 'maitre') {
        await this.mesaService.loadClientesYMesaDisponibles();
        this.armarWatcherWaitlist();
        this.armarWatcherMaitre();
      }

    } finally {
      (ev.detail as any).complete?.();
      this.isLoading = false;
      await this.spinner.hide();
    }
  }

  async aprobarCliente(c: Cliente) {
    await this.spinner.show();
    try {
      await this.clientes.actualizarEstado(c.id, 'aprobado');
      await this.emailSrv.enviarEstadoRegistro(c.email as any, (c as any).nombres, 'aprobado');
      this.pendientes = this.pendientes.filter(x => x.id !== c.id);
      const t = await this.toast.create({
        message: 'Cliente aprobado y notificado',
        duration: 1300,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();
    } catch (e) {
      console.error(e);
      const t = await this.toast.create({
        message: 'Error al aprobar/notificar',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  async rechazarCliente(c: Cliente) {
    await this.spinner.show();
    try {
      await this.clientes.actualizarEstado(c.id, 'rechazado');
      await this.emailSrv.enviarEstadoRegistro(c.email as any, (c as any).nombres, 'rechazado');
      this.pendientes = this.pendientes.filter(x => x.id !== c.id);
      const t = await this.toast.create({
        message: 'Cliente rechazado y notificado',
        duration: 1300,
        color: 'medium',
        icon: 'remove-circle'
      });
      await t.present();
    } catch (e) {
      console.error(e);
      const t = await this.toast.create({
        message: 'Error al rechazar/notificar',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  async logout() {
    await this.spinner.show();
    try {
      if (this.isAnon && this.auth.signOutAnon) {
        await this.auth.signOutAnon();
      }
      await this.auth.signOut();

      const t = await this.toast.create({
        message: 'Sesión cerrada',
        duration: 1400,
        color: 'dark',
        icon: 'log-out-outline',
      });
      await t.present();
    } catch (err) {
      console.error(err);
      const t = await this.toast.create({
        message: 'No se pudo cerrar la sesión',
        duration: 1600,
        color: 'danger',
        icon: 'warning-outline',
      });
      await t.present();
    } finally {
      this.email = null;
      this.role = null;
      this.firstName = '';
      this.isAnon = false;
      this.anonName = '';
      this.anonAvatar = null;
      this.anonFacturaLink = null;
      this.anonFacturaNombre = null;
      this.mostrarFacturaAnonima = false;

      this.mesaService.selectedMesaNumero = null;
      this.mesaService.selectedClienteId = null;
      this.mesaService.enEsperaActual = null;

      if (this.mesaSub) {
        try { supabase.removeChannel(this.mesaSub); } catch { }
        this.mesaSub = null;
      }
      if (this.facturaSub) {
        try { supabase.removeChannel(this.facturaSub); } catch { }
        this.facturaSub = null;
      }
      if (this.deliverySub) {
        try { supabase.removeChannel(this.deliverySub); } catch { }
        this.deliverySub = null;
      }
      if (this.pedidoDeliverySub) {
        try { supabase.removeChannel(this.pedidoDeliverySub); } catch { }
        this.pedidoDeliverySub = null;
      }
      if (this.pedidoDeliverySub) {
        try { supabase.removeChannel(this.pedidoDeliverySub); } catch { }
        this.pedidoDeliverySub = null;
      }
      if (this.pedidosListosSub) {                       // 🔴 NUEVO
        try { supabase.removeChannel(this.pedidosListosSub); } catch { }
        this.pedidosListosSub = null;
      }

      // limpiar watcher de pedidos por mesa
      this.liberarWatcherPedidosMesa();

      // limpiar watchers maître
      this.liberarWatcherMaitre();

      this.lastMesaUsada = null;
      localStorage.removeItem('menuya_last_mesa');

      this.router.navigateByUrl('/login', { replaceUrl: true });
      await this.spinner.hide();
    }
  }

  async asignarMesaHome() {
    const clienteId = this.mesaService.selectedClienteId;
    const mesaNum = this.mesaService.selectedMesaNumero;

    if (clienteId == null || mesaNum == null) {
      const toast = await this.toast.create({
        message: 'Seleccioná cliente y mesa primero',
        duration: 1500,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    await this.spinner.show();
    try {
      const msg = await this.mesaService.asignarMesa(clienteId, mesaNum);

      const toast = await this.toast.create({
        message: msg,
        duration: 1600,
        color: 'success'
      });
      await toast.present();
      this.pushNotificationService.sendNotificationToRole({
        role: 'cliente',
        title: 'Su mesa ha sido asignada',
        body: `Te hemos asignado la mesa número ${mesaNum}.`,
        data: { tipo: 'mesa_asignada' }
      });
      await this.mesaService.loadClientesYMesaDisponibles();
      this.mesaService.selectedClienteId = null;
      this.mesaService.selectedMesaNumero = null;

    } catch (err: any) {
      const toast = await this.toast.create({
        message: err.message || 'Error al asignar la mesa',
        duration: 2000,
        color: 'danger',
        icon: 'alert-circle'
      });
      await toast.present();
      console.error('Error asignando mesa:', err);
    } finally {
      await this.spinner.hide();
    }
  }

  async abrirChat() {
    await this.spinner.show();
    try {
      (document.activeElement as HTMLElement)?.blur();

      if (this.role === 'mozo') {
        this.router.navigate(['/chat'], { queryParams: { remitente: 'mozo' } });
        return;
      }

      if (!this.tieneMesaAsignada() || this.mesaService.enEsperaActual !== false) return;

      this.router.navigate(['/chat'], {
        queryParams: {
          mesaId: this.mesaService.selectedMesaNumero ?? 0,
          remitente: this.role ?? 'cliente'
        }
      });
    } finally {
      await this.spinner.hide();
    }
  }

  async estadoMesas() {
    await this.spinner.show();
    try {
      (document.activeElement as HTMLElement)?.blur();
      if (this.role === 'mozo') {
        this.router.navigate(['/estado-mesas']);
        return;
      }
    } finally {
      await this.spinner.hide();
    }
  }

  tieneMesaAsignada(): boolean {
    return !!this.mesaService.selectedMesaNumero;
  }

  async simularQrIngreso() {
    await this.spinner.show();
    try {
      const valor = await this.QrService.scanOnce();
      if (!valor) {
        await this.mostrarAlerta('QR sin contenido', 'No se detectó contenido en el QR');
        return;
      }

      const clienteId = await this.resolverClienteIdActual();
      if (!clienteId) throw new Error('No se encontró el cliente actual.');
      if (valor !== 'INGRESO_ESPERA') {
        throw new Error('No tienes mesa asignada.');
      }
      else {
        await this.mesaService.setEnEspera(clienteId, true);
        this.mesaService.enEsperaActual = true;
        await this.notificarIngresoListaEspera(clienteId);

        const t = await this.toast.create({
          message: '📩 Registrado en lista de espera.',
          duration: 1600,
          color: 'success',
          icon: 'time'
        });
        await t.present();
      }
    } catch (e: any) {
      this.mostrarAlerta('Error en escaneo de QR', e?.message || 'No se pudo escanear el QR');
      // const t = await this.toast.create({
      //   message: e?.message || 'No se pudo simular el QR de ingreso',
      //   duration: 1800,
      //   color: 'danger',
      //   icon: 'alert-circle'
      // });
      // await t.present();
    }
    finally {
      await this.spinner.hide();
    }
  }

  async mostrarAlerta(titulo: string, mensaje: string) {
    await Swal.fire({
      // icon: 'info',
      title: titulo,
      text: mensaje,
      // confirmButtonText: 'Entendido',
      toast: true,
      position: 'top',
      timer: 2500,
      timerProgressBar: true,
      showConfirmButton: false,
      background: '#000000bb',
      color: '#ffffffff',
    });
  }

  async scanQrEstadoPedido() {
    await this.spinner.show();
    try {
      const valor = await this.QrService.scanOnce();
      // const valor = '2'; // Simulación de escaneo de QR con número de mesa "2"
      // const valor = null; // Simulación de escaneo de QR sin contenido
      if (!valor) {
        await this.mostrarAlerta('QR sin contenido', 'No se detectó contenido en el QR');
        return;
      }
      const numero = this.parseMesaNumeroFromQr(valor);

      const clienteId = await this.resolverClienteIdActual();
      if (!clienteId) throw new Error('No se encontró el cliente actual.');

      const mesaAsignada = await this.mesaService.obtenerMesaCliente(clienteId);
      if (!mesaAsignada) throw new Error('Aún no tenés una mesa asignada por el maître.');

      if (mesaAsignada !== numero) {
        throw new Error(`El QR escaneado (mesa ${numero}) no coincide con tu mesa (${mesaAsignada}).`);
      }
      else {
        this.qrMesaConPedidoEnCurso = true
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch (e: any) {
      await this.mostrarAlerta('Error en escaneo de QR', e?.message || 'No se pudo escanear el QR');
    }
    finally {
      await this.spinner.hide();
    }
  }

  async scanQrMesa() {
    await this.spinner.show();
    try {
      try {
        const valor = await this.QrService.scanOnce();
        if (!valor) {
          await this.mostrarAlerta('QR sin contenido', 'No se detectó contenido en el QR');
          return;
        }

        const numero = this.parseMesaNumeroFromQr(valor);
        if (numero == null || Number.isNaN(numero) || numero <= 0) {
          const t = await this.toast.create({
            message: 'El QR no contiene un número de mesa válido',
            duration: 1800,
            color: 'danger',
            icon: 'alert-circle'
          });
          await t.present();
          return;
        }

        const clienteId = await this.resolverClienteIdActual();
        if (!clienteId) throw new Error('No se encontró el cliente actual.');

        const mesaAsignada = await this.mesaService.obtenerMesaCliente(clienteId);
        if (!mesaAsignada) throw new Error('Aún no tenés una mesa asignada por el maître.');

        if (mesaAsignada !== numero) {
          throw new Error(`El QR escaneado (${numero}) no coincide con tu mesa (${mesaAsignada}).`);
        }

        await this.mesaService.setEnEspera(clienteId, false);
        this.mesaService.enEsperaActual = false;

        this.lastMesaUsada = numero;
        localStorage.setItem('menuya_last_mesa', String(numero));

        const t = await this.toast.create({
          message: `¡Mesa ${numero} verificada! Menú, chat y juegos habilitados.`,
          duration: 1800,
          color: 'success',
          icon: 'checkmark-circle'
        });
        await t.present();
      } catch (e: any) {
        const t = await this.toast.create({
          message: e?.message || 'No se pudo verificar el QR de mesa',
          duration: 1800,
          color: 'danger',
          icon: 'alert-circle'
        });
        await t.present();
      }

      await this.verificarSiPuedePedirCuenta();
      await this.cargarPedidosEntregados();
      await this.cargarPedidosRecibidos();

      if (this.role === 'anonimo') {
        await this.armarWatcherFacturaAnonima();
        await this.buscarFacturaAnonima();
      }
    } finally {
      await this.spinner.hide();
    }
  }

  private parseMesaNumeroFromQr(valor: string): number | null {
    const v = (valor || '').trim();
    if (!v) return null;

    if (/^\d+$/.test(v)) return parseInt(v, 10);

    try {
      const obj = JSON.parse(v);
      if (obj && typeof obj === 'object') {
        const cand = (obj as any).numero_mesa ?? (obj as any).mesa ?? (obj as any).numero;
        if (typeof cand === 'number') return cand;
        if (typeof cand === 'string' && /^\d+$/.test(cand)) return parseInt(cand, 10);
      }
    } catch { }

    try {
      const url = new URL(v);
      const cand = url.searchParams.get('mesa') || url.searchParams.get('numero_mesa') || url.searchParams.get('numero');
      if (cand && /^\d+$/.test(cand)) return parseInt(cand, 10);
    } catch { }

    const m = v.match(/mesa[^0-9]*(\d+)/i);
    if (m && m[1]) return parseInt(m[1], 10);

    return null;
  }

  private async resolverClienteYArrancarWatcher() {
    this.clienteIdActual = await this.resolverClienteIdActual();
    await this.cargarMesaYEsperaActual();
    await this.cargarPedidosEntregados();
    await this.cargarPedidosRecibidos();
    if (this.clienteIdActual) {
      this.armarWatcherCliente(this.clienteIdActual);
    }
    await this.cargarPedidosEntregados();

    if (this.role === 'anonimo') {
      await this.armarWatcherFacturaAnonima();
    }
  }

  private async resolverClienteIdActual(): Promise<number | null> {
    const email = await this.auth.getUserEmail();
    if (email) {
      const { data, error } = await supabase
        .from('menuya_clientes')
        .select('id')
        .eq('email', email)
        .single();
      if (error) return null;
      return (data as any)?.id ?? null;
    }

    if (this.isAnon) {
      const { data, error } = await supabase
        .from('menuya_clientes')
        .select('id')
        .is('email', null)
        .neq('estado', 'rechazado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return (data as any)?.id ?? null;
    }

    return null;
  }

  private async cargarMesaYEsperaActual() {
    if (!this.clienteIdActual) return;
    const [mesa, enEspera] = await Promise.all([
      this.mesaService.obtenerMesaCliente(this.clienteIdActual),
      this.mesaService.obtenerEnEspera(this.clienteIdActual),
    ]);
    this.mesaService.selectedMesaNumero = mesa ?? null;
    this.mesaService.enEsperaActual = typeof enEspera === 'boolean' ? enEspera : null;

    if (typeof mesa === 'number' && mesa > 0) {
      this.lastMesaUsada = mesa;
      localStorage.setItem('menuya_last_mesa', String(mesa));
    }

    // armar watcher de pedidos por mesa para actualizar estados en tiempo real
    this.armarWatcherPedidosMesa();
  }

  private armarWatcherCliente(clienteId: number) {
    if (this.mesaSub) {
      try { supabase.removeChannel(this.mesaSub); } catch { }
      this.mesaSub = null;
    }

    this.mesaSub = supabase
      .channel(`cliente_${clienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_clientes', filter: `id=eq.${clienteId}` },
        async (_payload) => {
          await this.cargarMesaYEsperaActual();
          const mesaN = this.mesaService.selectedMesaNumero;
          if (typeof mesaN === 'number' && mesaN > 0 && this.mesaService.enEsperaActual === true) {
            const t = await this.toast.create({
              message: `✅ ¡Te asignaron la mesa ${mesaN}! Escanea el QR de tu mesa para continuar.`,
              duration: 1800,
              color: 'success',
              icon: 'checkmark-circle'
            });
            await t.present();
          }
          if (this.mesaService.enEsperaActual === false) {
            const t = await this.toast.create({
              message: `🎉 Mesa verificada. Ya podés ver el menú, chatear con el mozo y jugar.`,
              duration: 1800,
              color: 'primary',
              icon: 'restaurant'
            });
            await t.present();
          }

          if (this.role === 'anonimo') {
            await this.buscarFacturaAnonima();
          }
        }
      )
      .subscribe((status) => console.log('[HOME] watcher cliente status:', status));
  }

  // watcher para que al mozo se le actualicen en tiempo real los pedidos listos
  private armarWatcherPedidosListosMozo() {
    this.liberarWatcherPedidosListosMozo();
    if (this.role !== 'mozo') return;

    this.pedidosListosSub = supabase
      .channel('mozo_pedidos_listos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'menuya_pedidos',
          filter: 'estado=eq.listo', // solo cuando un pedido queda en "listo"
        },
        async () => {
          try {
            await this.cargarPedidosListos(); // reutilizamos tu método actual
          } catch (err) {
            console.error('[HOME] Error recargando pedidos listos para mozo:', err);
          }
        }
      )
      .subscribe((status) => console.log('[HOME] watcher pedidos listos mozo status:', status));
  }

  // helper para liberar watcher de pedidos listos del mozo
  private liberarWatcherPedidosListosMozo() {
    if (this.pedidosListosSub) {
      try { supabase.removeChannel(this.pedidosListosSub); } catch { }
      this.pedidosListosSub = null;
    }
  }


  private armarWatcherWaitlist() {
    if (this.waitlistSub) {
      try { supabase.removeChannel(this.waitlistSub); } catch { }
      this.waitlistSub = null;
    }
    if (this.role !== 'maitre') return;

    this.waitlistSub = supabase
      .channel('maitre_waitlist')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_clientes' },
        async () => {
          try {
            await this.mesaService.loadClientesYMesaDisponibles();
          } catch (err) {
            console.error('[HOME] Error recargando lista de espera:', err);
          }
        }
      )
      .subscribe((status) => console.log('[HOME] waitlist watcher status:', status));
  }

  private armarWatcherPedidosDelivery() {
    if (this.deliverySub) {
      try { supabase.removeChannel(this.deliverySub); } catch { }
      this.deliverySub = null;
    }
    this.deliverySub = supabase
      .channel('pedidos_delivery')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_pedidos', filter: 'tipo=eq.domicilio' },
        async () => {
          await this.cargarPedidosParaDelivery();
        }
      )
      .subscribe((status) => console.log('[HOME] watcher delivery status:', status));
  }

  // 🔄 WATCHER: pedido a domicilio del cliente (estado en tiempo real)
private armarWatcherPedidoDelivery(pedidoId?: number) {
  // limpiamos cualquier watcher anterior
  this.liberarWatcherPedidoDelivery();

  // solo aplica al cliente registrado que hizo el pedido
  if (this.role !== 'cliente') return;

  // usamos la "mesa virtual" de delivery para este cliente
  const mesaVirtual = this.getDeliveryVirtualMesa();

  this.pedidoDeliverySub = supabase
    .channel(`pedido_delivery_mesa_${mesaVirtual}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'menuya_pedidos',
        // escuchamos SOLO pedidos a domicilio
        filter: 'tipo=eq.domicilio'
      },
      async (payload) => {
        const nuevo = (payload as any)?.new;
        if (!nuevo) return;

        // si el cambio no es de la mesa virtual de delivery, lo ignoramos
        if (Number(nuevo.numero_mesa) !== mesaVirtual) return;

        // ante CUALQUIER cambio del pedido (estado, items, cocina_listo, etc.)
        // recargamos el pedido y re-aplicamos los flags de estado
        try {
          await this.cargarPedidoDeliveryActual(true); // fromWatcher = true
        } catch (err) {
          console.error('[HOME] Error recargando pedido delivery en watcher:', err);
        }
      }
    )
    .subscribe((status) => {
      console.log('[HOME] watcher pedido delivery cliente status:', status);
    });
}


  private async armarWatcherFacturaAnonima() {
    if (this.facturaSub) {
      try { supabase.removeChannel(this.facturaSub); } catch { }
      this.facturaSub = null;
    }
    if (this.role !== 'anonimo') return;

    const mesa = this.mesaService.selectedMesaNumero ?? this.lastMesaUsada;
    if (!mesa) return;

    const ch = supabase.channel(`factura_mesa_${mesa}`);

    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'menuya_facturas', filter: `numero_mesa=eq.${mesa}` },
      async (payload) => {
        const fila = payload?.new as any;
        if (fila?.url_publica && fila?.archivo) {
          this.anonFacturaLink = fila.url_publica;
          this.anonFacturaNombre = fila.archivo;
          this.mostrarFacturaAnonima = true;
          const t = await this.toast.create({
            message: '📄 ¡Tu factura está lista para descargar!',
            duration: 1500, color: 'primary', icon: 'document-text'
          });
          await t.present();
        } else {
          await this.buscarFacturaAnonima();
        }
      }
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menuya_cuentas', filter: `numero_mesa=eq.${mesa}` },
      async () => { await this.buscarFacturaAnonima(); }
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menuya_pedidos', filter: `numero_mesa=eq.${mesa}` },
      async () => { await this.buscarFacturaAnonima(); }
    );

    this.facturaSub = ch.subscribe((s) => console.log('[HOME] watcher factura status:', s));
    await this.buscarFacturaAnonima();
  }

  // watcher para el MAÎTRE (lista de espera + mesas disponibles)
  private armarWatcherMaitre() {
    if (this.role !== 'maitre') {
      return;
    }

    this.liberarWatcherMaitre();

    // Cambios en clientes (en_espera, estado, etc.)
    this.maitreClientesSub = supabase
      .channel('maitre_clientes_espera')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_clientes' },
        async () => {
          // Cargamos de nuevo lista de espera + mesas en un solo lugar
          await this.mesaService.loadClientesYMesaDisponibles();
        }
      )
      .subscribe((status) => console.log('[HOME] watcher maître clientes status:', status));

    // Cambios en mesas (disponibilidad, asignaciones, etc.)
    this.maitreMesasSub = supabase
      .channel('maitre_mesas_disponibles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_mesas' },
        async () => {
          await this.mesaService.loadClientesYMesaDisponibles();
        }
      )
      .subscribe((status) => console.log('[HOME] watcher maître mesas status:', status));
  }

  // helper para limpiar los watchers del maître
  private liberarWatcherMaitre() {
    if (this.maitreClientesSub) {
      try { supabase.removeChannel(this.maitreClientesSub); } catch { }
      this.maitreClientesSub = null;
    }
    if (this.maitreMesasSub) {
      try { supabase.removeChannel(this.maitreMesasSub); } catch { }
      this.maitreMesasSub = null;
    }
  }

  // watcher para pedidos de la mesa actual (salón) -> actualiza estados automáticamente
  private armarWatcherPedidosMesa() {
    const mesaRef = this.mesaService.selectedMesaNumero ?? this.lastMesaUsada;
    if (!mesaRef) {
      this.liberarWatcherPedidosMesa();
      return;
    }

    this.liberarWatcherPedidosMesa();

    this.pedidosMesaSub = supabase
      .channel(`pedidos_mesa_${mesaRef}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_pedidos', filter: `numero_mesa=eq.${mesaRef}` },
        async () => {
          await this.cargarPedidosRecibidos();
          await this.cargarPedidosEntregados();
          if (this.role === 'anonimo') {
            await this.buscarFacturaAnonima();
          }
        }
      )
      .subscribe((status) => console.log('[HOME] watcher pedidos mesa status:', status));
  }

  // helper para limpiar watcher de pedidos por mesa
  private liberarWatcherPedidosMesa() {
    if (this.pedidosMesaSub) {
      try { supabase.removeChannel(this.pedidosMesaSub); } catch { }
      this.pedidosMesaSub = null;
    }
  }

  async cargarPedidos() {
    try {
      const pedidos: PedidoRow[] = await this.pedidoService.getTodos();

      this.pedidosPendientes = pedidos
        .map(p => {
          const itemsArray = Array.isArray(p.items) ? p.items : [];

          let itemsFiltrados = [];
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
    } catch (error) {
      console.error('Error cargando pedidos', error);
    }
  }

  async marcarListo(pedido: PedidoFiltrado) {
    await this.spinner.show();
    try {
      const tieneComida = pedido.itemsFiltrados.some(i => i.categoria === 'Comida');
      const tieneBebida = pedido.itemsFiltrados.some(i => i.categoria === 'Bebida');
      let cocinaListo = pedido.cocina_listo ?? false;
      let cocteleriaListo = pedido.cocteleria_listo ?? false;

      await new Promise(res => setTimeout(res, 500));

      if (this.role === 'cocinero') {
        cocinaListo = true;
      } else if (this.role === 'bartender') {
        cocteleriaListo = true;
      }

      const mesa = pedido.numero_mesa;
      const nuevoEstado: EstadoPedido = (cocinaListo && cocteleriaListo) ? 'listo' : 'en_preparacion';

      const actualizado = await this.pedidoService.updateListos(
        pedido.id,
        cocinaListo,
        cocteleriaListo,
        nuevoEstado
      );

      await this.cargarPedidos();

      const esDelivery = this.isDeliveryPedido(actualizado);

      if (nuevoEstado === 'listo' && esDelivery) {
        await this.notificarPedidoListo(actualizado);
      }

      if (nuevoEstado === 'listo') {
        this.pedidosPendientes = this.pedidosPendientes.filter(p => p.id !== pedido.id);
      }

      // 🔔 Notificaciones según rol y tipo de pedido
      if (this.role === 'cocinero') {
        if (!esDelivery) {
          // ✅ Delivery: aviso al repartidor
          this.pushNotificationService.sendNotificationToRole({
            role: 'mozo',
            title: `Mesa ${mesa}: Pedido de cocina listo para entregar`,
            body: `Cocina: Pedido #${pedido.id} de la mesa ${mesa} está listo para ser entregado.`,
            data: { tipo: 'pedido_listo' }
          });
        }

      }
      if (this.role === 'bartender') {
        if (!esDelivery) {
          // ✅ Delivery: aviso al repartidor
          this.pushNotificationService.sendNotificationToRole({
            role: 'mozo',
            title: `Mesa ${mesa}: Pedido de bartender listo para entregar`,
            body: `Coctelería: Pedido #${pedido.id} de la mesa ${mesa} está listo para ser entregado.`,
            data: { tipo: 'pedido_listo' }
          });

        }
      }

    } catch (err) {
      console.error('Error al marcar pedido listo:', err);
    } finally {
      await this.spinner.hide();
    }
  }


  async cargarPedidosListos() {
    this.isLoading = true;
    try {
      const todos = await this.pedidoService.getPedidosListosParaMozo();

      // ⛔ filtrar solo pedidos de salón (tipo null o 'salon')
      this.pedidos = todos.filter(p =>
        p.tipo === null ||
        p.tipo === '' ||
        p.tipo === 'salon' ||
        !p.tipo // por compatibilidad con datos viejos
      );
    } finally {
      this.isLoading = false;
    }
  }


  async entregarPedido(pedido: PedidoRow) {
    await this.spinner.show();
    try {
      await this.pedidoService.updateEstado(pedido.id, 'entregado');

      this.pedidos = this.pedidos.filter(x => x.id !== pedido.id);

      const t = await this.toast.create({
        message: `${this.isDeliveryPedido(pedido) ? `Pedido a domicilio #${pedido.id}` : `Pedido de mesa ${pedido.numero_mesa}`} entregado ✅`,
        duration: 1800,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();
    } catch (e) {
      console.error('Error entregando pedido:', e);
      const t = await this.toast.create({
        message: 'Error al marcar el pedido como entregado',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  async cargarPedidosEntregados() {
    if (!this.mesaService.selectedMesaNumero) return;
    this.pedidosEntregados = await this.pedidoService.getPedidosEntregadosPorMesa(
      this.mesaService.selectedMesaNumero
    );
    await this.verificarSiPuedePedirCuenta();
  }

  async cargarPedidosRecibidos() {
    if (!this.mesaService.selectedMesaNumero) return;
    this.pedidosRecibidos = await this.pedidoService.getUltimoPedidoDeMesa(this.mesaService.selectedMesaNumero);
    console.log('Pedidos recibidos cargados:', this.pedidosRecibidos);

    this.resetFlagsLocal();

    if (!this.pedidosRecibidos) {
      this.pedidoRecibido = false;
      return;
    } else if (this.pedidosRecibidos.estado === 'recibido') {
      this.pedidoRecibido = true;
    } else if (this.pedidosRecibidos.estado === 'cancelado') {
      this.pedidoCancelado = true;
    } else if (this.pedidosRecibidos.estado === 'pendiente') {
      this.pedidoPendiente = true;
    } else if (this.pedidosRecibidos.estado === 'en_preparacion') {
      this.pedidoEnPreparacion = true;
    }
    else if (this.pedidosRecibidos.estado === 'listo') {
      this.pedidoListo = true;
    }
    else if (this.pedidosRecibidos.estado === 'entregado') {
      this.pedidoEntregado = true;
    }
  }

  // ⬇️ Ajuste: agrega el tiempo estimado (≈ X min) cuando es delivery
  normalizarEstadoPedido(p: PedidoRow): string {
    if (!p || !p.estado) return 'Pendiente';
    const map: Record<string, string> = {
      pendiente: 'Pendiente',
      en_preparacion: 'En preparación',
      listo: 'Listo para entregar',
      entregado: 'Entregado',
      recibido: 'Recibido',
      cancelado: 'Cancelado',
    };
    const base = map[p.estado] ?? p.estado;
    const isDelivery = (p as any).tipo === 'domicilio';
    const mins = Number((p as any).tiempo_elaboracion ?? 0);
    if (isDelivery && mins > 0 && p.estado !== 'cancelado') {
      return `${base} (≈ ${mins} min)`;
    }
    return base;
  }

  estadoBadgeColor(estado: EstadoPedido | null): string {
    switch (estado) {
      case 'pendiente':
        return 'medium';
      case 'en_preparacion':
        return 'warning';
      case 'listo':
        return 'tertiary';
      case 'entregado':
      case 'recibido':
        return 'primary';
      case 'cancelado':
        return 'danger';
      default:
        return 'medium';
    }
  }

  puedeChatearConDelivery(pedido?: PedidoRow | null): boolean {
    if (!pedido) {
      return false;
    }
    const estado = pedido.estado || null;
    return estado === 'listo' || estado === 'entregado' || estado === 'recibido';
  }

  estadoProgress(estado: EstadoPedido | null): number {
    switch (estado) {
      case 'pendiente':
        return 0.25;
      case 'en_preparacion':
        return 0.5;
      case 'listo':
        return 0.75;
      case 'entregado':
      case 'recibido':
      case 'cancelado':
        return 1;
      default:
        return 0.1;
    }
  }

  // NUEVO: índice de estado para stepper
  estadoIndex(estado: EstadoPedido | null): number {
    const order: EstadoPedido[] = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'recibido', 'cancelado'];
    const idx = order.indexOf((estado || 'pendiente') as EstadoPedido);
    return idx < 0 ? 0 : idx;
  }

  async refrescarEstadoPedido() {
    await this.spinner.show();
    try {
      await this.cargarPedidosRecibidos();
      await this.cargarPedidosEntregados();

      // delivery también
      if (this.role === 'cliente') {
        await this.cargarPedidoDeliveryActual();
      }

      if (this.role === 'anonimo') {
        await this.buscarFacturaAnonima();
      }

      const t = await this.toast.create({
        message: 'Estado actualizado',
        duration: 1200,
        color: 'success',
        icon: 'refresh'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  async confirmarRecepcion(pedido: PedidoRow) {
    await this.spinner.show();
    try {
      await this.pedidoService.confirmarRecepcion(pedido.id);
      this.qrMesaConPedidoEnCurso = false;
      // si era entrega en local (mesa), lo sacamos de la lista estándar
      this.pedidosEntregados = this.pedidosEntregados.filter(x => x.id !== pedido.id);

      // ⚠️ DELIVERY: ahora NO destruimos el pedidoDelivery, lo dejamos para que
      // el cliente pueda ir al módulo de cuenta y abonar.
      if (this.pedidoDelivery && this.pedidoDelivery.id === pedido.id && this.isDeliveryPedido(pedido)) {
        // actualizamos el estado local a "recibido"
        this.pedidoDelivery = {
          ...this.pedidoDelivery,
          estado: 'recibido'
        };
        this.aplicarFlagsDeliveryDesdeEstado('recibido');
        this.pedidoDeliveryRecibido = true; // para que aparezca la card de "Gracias por tu pedido"

        // ya no hace falta seguir escuchando cambios de este pedido
        this.liberarWatcherPedidoDelivery();

        // limpiamos contexto de tracking del último pedido delivery
        this.pedidoService.clearContextoDomicilio();
        this.pedidoService.clearUltimoPedidoDeliveryId();
      }

      const t = await this.toast.create({
        message: `Pedido confirmado ✅ ¡A disfrutar!`,
        duration: 1800,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();

      await this.cargarPedidosRecibidos();
      await this.verificarSiPuedePedirCuenta();

      if (this.role === 'anonimo') {
        await this.buscarFacturaAnonima();
      }
    } catch {
      const t = await this.toast.create({
        message: 'Error confirmando recepciónn',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  goToCuenta() {
    if (!this.tieneMesaAsignada() || this.mesaService.enEsperaActual !== false) return;
    this.router.navigate(['/cuenta'], {
      queryParams: { mesa: this.mesaService.selectedMesaNumero ?? 0 }
    });
  }

  private async getCandidatosPedidoIdsMesa(): Promise<number[]> {
    const ids = new Set<number>();

    if (this.pedidosRecibidos?.id) ids.add(this.pedidosRecibidos.id);
    (this.pedidosEntregados || []).forEach(p => p?.id && ids.add(p.id));

    const mesaRef = this.mesaService.selectedMesaNumero ?? this.lastMesaUsada;

    if (mesaRef) {
      const { data } = await supabase
        .from('menuya_pedidos')
        .select('id')
        .eq('numero_mesa', mesaRef)
        .order('id', { ascending: false })
        .limit(10);
      (data || []).forEach(r => r?.id && ids.add(r.id));
    }

    if (!ids.size && mesaRef) {
      const pid = await this.getUltimoPedidoIdDeCuentaPagadaParaMesa(mesaRef);
      if (pid) ids.add(pid);
    }

    return Array.from(ids.values());
  }

  private async getUltimoPedidoIdDeCuentaPagadaParaMesa(mesaNum: number): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('menuya_cuentas')
        .select('id, pedidos, estado, pagado_en, updated_at')
        .eq('numero_mesa', mesaNum)
        .in('estado', ['pagada', 'pagado', 'cerrada', 'confirmada'])
        .order('pagado_en', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const pedidosArr = Array.isArray((data as any).pedidos) ? (data as any).pedidos : [];
      const onlyIds = pedidosArr
        .map((p: any) => (typeof p?.id === 'number' ? p.id : null))
        .filter((x: number | null) => typeof x === 'number') as number[];

      if (!onlyIds.length) return null;

      const pid = Math.max(...onlyIds);
      this.ultimoPedidoIdParaFactura = pid;
      return pid;
    } catch (e) {
      console.warn('[Factura] No se pudo resolver pedidoId por mesa:', e);
      return null;
    }
  }

  async buscarFacturaAnonima() {
    try {
      this.anonFacturaLink = null;
      this.anonFacturaNombre = null;
      this.mostrarFacturaAnonima = false;

      if (this.role !== 'anonimo') return;

      const mesaRef = this.mesaService.selectedMesaNumero ?? this.lastMesaUsada;
      if (!mesaRef) return;

      const { data: reg, error: errReg } = await supabase
        .from('menuya_facturas')
        .select('archivo, url_publica, created_at')
        .eq('numero_mesa', mesaRef)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!errReg && reg && reg.length) {
        this.anonFacturaNombre = reg[0].archivo;
        this.anonFacturaLink = reg[0].url_publica;
        this.mostrarFacturaAnonima = true;
        return;
      }

      const candidatos = await this.getCandidatosPedidoIdsMesa();
      if (!candidatos.length) return;

      const { data: archivos, error } = await (supabase as any)
        .storage
        .from('facturas')
        .list('', { limit: 1000, sortBy: { column: 'updated_at', order: 'desc' } });

      if (error) {
        console.warn('[Factura] No se pudieron listar archivos:', error);
        return;
      }

      const match = (name: string, id: number) =>
        name.endsWith(`-${id}.pdf`) ||
        name.endsWith(`-P${id}.pdf`) ||
        name.includes(`P${id}.pdf`) ||
        name.includes(`-M${mesaRef}-P${id}.pdf`);

      let candidato = (archivos || []).find((a: any) => candidatos.some(id => match(a.name, id)));

      if (!candidato) {
        const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        candidato = (archivos || []).find((a: any) =>
          a.name.startsWith(`FAC-${hoy}-M${mesaRef}-`) || a.name.startsWith(`FAC-${hoy}-`)
        );
      }

      if (!candidato) return;

      const { data: pub } = (supabase as any).storage.from('facturas').getPublicUrl(candidato.name);
      if (pub?.publicUrl) {
        this.anonFacturaLink = pub.publicUrl;
        this.anonFacturaNombre = candidato.name;
        this.mostrarFacturaAnonima = true;

        this.pushNotificationService.sendNotificationToRole({
          role: 'anonimo',
          title: `Mesa ${mesaRef}: Factura lista para descargar`,
          body: `Click para descargar tu factura.`,
          data: {
            tipo: 'factura_lista',
            url: pub.publicUrl      // 👈 importante
          }
        });

        const t = await this.toast.create({
          message: '📄 ¡Tu factura está lista para descargar!',
          duration: 1500,
          color: 'primary',
          icon: 'document-text'
        });
        await t.present();
      }
    } catch (e) {
      console.error('[Factura] Error buscando factura anónima:', e);
      this.mostrarFacturaAnonima = false;
    }
  }

  goToCuentaDelivery() {
    if (!this.pedidoDelivery) return;
    this.router.navigate(['/cuenta'], {
      queryParams: {
        tipo: 'delivery',
        pedidoId: this.pedidoDelivery.id,
        domicilio: this.pedidoDelivery.domicilio_direccion || ''
      }
    });
  }

  // ===================== NUEVO: Dueño/Supervisor confirma Delivery =====================

  private async cargarPedidosDeliveryPendientesBoss() {
    this.isLoadingDeliveryBoss = true;
    try {
      const { data, error } = await supabase
        .from('menuya_pedidos')
        .select('*')
        .eq('tipo', 'domicilio')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[HOME] Error cargando delivery pendientes:', error);
        this.pedidosDeliveryPendientesBoss = [];
        return;
      }

      this.pedidosDeliveryPendientesBoss = (data || []).map((row: any) => ({
        id: Number(row.id),
        numero_mesa: Number(row.numero_mesa),
        items: row.items ?? null,
        monto_total: row.monto_total != null ? Number(row.monto_total) : null,
        tiempo_elaboracion: row.tiempo_elaboracion ?? null,
        cocina_listo: row.cocina_listo ?? null,
        cocteleria_listo: row.cocteleria_listo ?? null,
        estado: row.estado ?? null,
        created_at: row.created_at ?? null,
        tipo: row.tipo ?? 'domicilio',
        domicilio_direccion: row.domicilio_direccion ?? null,
        domicilio_lat: row.domicilio_lat ?? null,
        domicilio_lng: row.domicilio_lng ?? null,
        _minCustom: undefined, // 👈 para el input de minutos custom en la UI
      }));
    } finally {
      this.isLoadingDeliveryBoss = false;
    }
  }

  async cargarPedidosParaDelivery() {
    if (this.role !== 'delivery') return;
    this.isLoadingDeliveryCourier = true;
    try {
      this.pedidosDeliveryListos = await this.pedidoService.getPedidosDeliveryPorEstados(['listo']);
      if (this.pedidoRutaSeleccionado) {
        const sigueDisponible = this.pedidosDeliveryListos.some(p => p.id === this.pedidoRutaSeleccionado?.id);
        if (!sigueDisponible) {
          this.pedidoRutaSeleccionado = null;
          this.destruirMapaRuta();
        }
      }
    } catch (error) {
      console.error('[HOME] Error cargando pedidos para delivery:', error);
      const t = await this.toast.create({
        message: 'No se pudieron cargar los pedidos a domicilio.',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      this.isLoadingDeliveryCourier = false;
    }
  }

  // ===================== DELIVERY: cuentas pendientes de pago =====================

  private async cargarCuentasDeliveryPendientes() {
    if (this.role !== 'delivery') {
      this.cuentasDeliveryPendientes = [];
      return;
    }

    this.isLoadingCuentasDelivery = true;
    try {
      // 1) Traemos todas las cuentas con estado PAGO_PENDIENTE
      const { data: cuentas, error: errC } = await supabase
        .from('menuya_cuentas')
        .select('id, numero_mesa, estado, pedidos, total_final, created_at')
        .eq('estado', 'pago_pendiente')
        .order('created_at', { ascending: true });

      if (errC) {
        console.error('[HOME] Error cargando cuentas delivery pago_pendiente:', errC);
        this.cuentasDeliveryPendientes = [];
        return;
      }

      if (!cuentas || !cuentas.length) {
        this.cuentasDeliveryPendientes = [];
        return;
      }

      // 2) Extraemos todos los IDs de pedidos referenciados en esas cuentas
      const allPedidoIds = new Set<number>();
      for (const c of cuentas) {
        const arr = Array.isArray((c as any).pedidos) ? (c as any).pedidos : [];
        for (const it of arr) {
          let pid: number | null = null;

          if (typeof it === 'number') {
            pid = it;
          } else if (typeof it === 'string' && /^\d+$/.test(it)) {
            pid = Number(it);
          } else if (it && typeof it === 'object') {
            if (typeof (it as any).id === 'number') {
              pid = (it as any).id;
            } else if (typeof (it as any).pedido_id === 'number') {
              pid = (it as any).pedido_id;
            }
          }

          if (pid) {
            allPedidoIds.add(pid);
          }
        }
      }

      // 3) Traemos esos pedidos (si hay IDs) para filtrar por tipo=domicilio y estado=recibido
      const pedidosMap = new Map<number, any>();

      if (allPedidoIds.size > 0) {
        const { data: pedidos, error: errP } = await supabase
          .from('menuya_pedidos')
          .select('id, tipo, estado, domicilio_direccion, numero_mesa')
          .in('id', Array.from(allPedidoIds.values()));

        if (errP) {
          console.error('[HOME] Error cargando pedidos para cuentas delivery:', errP);
        } else {
          (pedidos || []).forEach((p: any) => pedidosMap.set(p.id, p));
        }
      }

      const result: CuentaDeliveryPendiente[] = [];

      // 4) Por cada cuenta, buscamos el pedido delivery recibido
      for (const c of cuentas) {
        const cuentaNumeroMesa = (c as any).numero_mesa ?? null;
        const arr = Array.isArray((c as any).pedidos) ? (c as any).pedidos : [];
        let matchPedido: any | null = null;

        // 4.a) Primer intento: por IDs desde el jsonb pedidos
        for (const it of arr) {
          let pid: number | null = null;

          if (typeof it === 'number') {
            pid = it;
          } else if (typeof it === 'string' && /^\d+$/.test(it)) {
            pid = Number(it);
          } else if (it && typeof it === 'object') {
            if (typeof (it as any).id === 'number') {
              pid = (it as any).id;
            } else if (typeof (it as any).pedido_id === 'number') {
              pid = (it as any).pedido_id;
            }
          }

          if (!pid) continue;

          const p = pedidosMap.get(pid);
          if (p && p.tipo === 'domicilio' && p.estado === 'recibido') {
            matchPedido = p;
            break;
          }
        }

        // 4.b) Fallback: si no encontramos por IDs, buscamos por numero_mesa
        if (!matchPedido && cuentaNumeroMesa != null) {
          const { data: pedFallback, error: errF } = await supabase
            .from('menuya_pedidos')
            .select('id, tipo, estado, domicilio_direccion, numero_mesa')
            .eq('numero_mesa', cuentaNumeroMesa)
            .eq('tipo', 'domicilio')
            .eq('estado', 'recibido')
            .order('id', { ascending: false })
            .limit(1);

          if (!errF && pedFallback && pedFallback.length) {
            matchPedido = pedFallback[0];
          }
        }

        // 4.c) Si encontramos pedido válido, lo agregamos al resultado
        if (matchPedido && matchPedido.tipo === 'domicilio' && matchPedido.estado === 'recibido') {
          result.push({
            cuentaId: Number((c as any).id),
            pedidoId: Number(matchPedido.id),
            numero_mesa: cuentaNumeroMesa,
            total: (c as any).total_final != null ? Number((c as any).total_final) : null,
            estado: (c as any).estado ?? null,
            domicilio_direccion: matchPedido.domicilio_direccion ?? null,
            created_at: (c as any).created_at ?? null
          });
        }
      }

      this.cuentasDeliveryPendientes = result;
    } catch (e) {
      console.error('[HOME] Error general cargando cuentas delivery pendientes:', e);
      this.cuentasDeliveryPendientes = [];
    } finally {
      this.isLoadingCuentasDelivery = false;
    }
  }

  async confirmarPagoDelivery(cuenta: CuentaDeliveryPendiente) {
    await this.spinner.show();
    try {
      // 1) Confirmamos pago de la cuenta
      await this.cuentaService.confirmarPago(cuenta.cuentaId);

      // 2) Buscar el pedido asociado
      const { data, error: errPed } = await supabase
        .from('menuya_pedidos')
        .select('*')
        .eq('id', cuenta.pedidoId)
        .maybeSingle();

      if (errPed) {
        console.error('[HOME] Error buscando pedido para factura delivery:', errPed);
        throw new Error('No se encontró el pedido para generar la factura.');
      }

      if (!data) {
        console.warn(
          '[HOME] No se encontró el pedido para emitir factura delivery. pedidoId =',
          cuenta.pedidoId
        );
        throw new Error('No se encontró el pedido para generar la factura.');
      }

      // Usamos el mapper del PedidoService para respetar el tipo PedidoRow
      const pedido = mapRowFromDb(data as any);

      // 3) Genera y envía la factura usando la misma lógica de FacturacionService
      await this.emitirFacturaDelivery(pedido);

      // 4) PUSH al dueño avisando que el delivery confirmó el pago
      this.pushNotificationService.sendNotificationToRole({
        role: 'dueño',
        title: 'Pago confirmado por el repartidor',
        body: `El repartidor confirmó el pago del pedido #${cuenta.pedidoId}.`,
        data: { tipo: 'pago_confirmado_delivery' }
      });

      // 5) Toast local para el delivery
      const t = await this.toast.create({
        message: `Pago del pedido #${cuenta.pedidoId} confirmado y factura enviada 📄`,
        duration: 1800,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();

      // 6) Refrescar listado de cuentas pendientes
      await this.cargarCuentasDeliveryPendientes();
    } catch (e: any) {
      console.error('[HOME] confirmarPagoDelivery error:', e);
      const t = await this.toast.create({
        message: e?.message || 'No se pudo confirmar el pago.',
        duration: 1800,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }





  private armarWatcherCuentasDelivery() {
    this.liberarWatcherCuentasDelivery();
    if (this.role !== 'delivery') return;

    this.cuentasDeliverySub = supabase
      .channel('cuentas_delivery')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menuya_cuentas' },
        async (payload) => {
          const nueva = (payload as any)?.new;
          const vieja = (payload as any)?.old;
          const estadoNuevo = nueva?.estado ?? null;
          const estadoViejo = vieja?.estado ?? null;

          if (estadoNuevo === 'pago_pendiente' || estadoViejo === 'pago_pendiente') {
            await this.cargarCuentasDeliveryPendientes();
          }
        }
      )
      .subscribe((status) => console.log('[HOME] watcher cuentas delivery status:', status));
  }


  private liberarWatcherCuentasDelivery() {
    if (this.cuentasDeliverySub) {
      try { supabase.removeChannel(this.cuentasDeliverySub); } catch { }
      this.cuentasDeliverySub = null;
    }
  }


  async confirmarPedidoDelivery(pedido: PedidoRow, minutos: number) {
    await this.spinner.show();
    try {
      const { error } = await supabase
        .from('menuya_pedidos')
        .update({
          estado: 'en_preparacion',
          tiempo_elaboracion: minutos,
          cocina_listo: false,
          cocteleria_listo: false
        })
        .eq('id', pedido.id);

      if (error) throw error;

      // 🔔 PUSH a cocina (pedido a domicilio)
      this.pushNotificationService.sendNotificationToRole({
        role: 'cocinero',
        title: `Pedido a domicilio #${pedido.id} confirmado`,
        body: `Nuevo pedido para cocina. Tiempo estimado: ${minutos} minutos.`,
        data: { tipo: 'pedido_delivery_confirmado', pedidoId: pedido.id }
      });

      // 🔔 PUSH a bartender (pedido a domicilio)
      this.pushNotificationService.sendNotificationToRole({
        role: 'bartender',
        title: `Pedido a domicilio #${pedido.id} confirmado`,
        body: `Nuevo pedido para cocteleria. Tiempo estimado: ${minutos} minutos.`,
        data: { tipo: 'pedido_delivery_confirmado' }
      });

      // 👉 NO se avisa al delivery acá, porque él recibe push cuando debe entregar,
      // no cuando cocina/bar reciben pedido.

      // Refrescar vistas
      await this.cargarPedidosDeliveryPendientesBoss();
      await this.cargarPedidos(); // cocina/bar

      const t = await this.toast.create({
        message: `✅ Pedido #${pedido.id} confirmado (${minutos}′).`,
        duration: 1600,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();

    } catch (e) {
      console.error('[HOME] confirmarPedidoDelivery error:', e);
      const t = await this.toast.create({
        message: 'No se pudo confirmar el pedido',
        duration: 1600,
        color: 'danger',
        icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }



  async rechazarPedidoDelivery(pedido: PedidoRow) {
    await this.spinner.show();
    try {
      const { error } = await supabase
        .from('menuya_pedidos')
        .update({ estado: 'cancelado' })
        .eq('id', pedido.id);

      if (error) throw error;

      await this.cargarPedidosDeliveryPendientesBoss();

      const t = await this.toast.create({
        message: `🛑 Pedido #${pedido.id} rechazado.`,
        duration: 1500, color: 'medium', icon: 'close-circle'
      });
      await t.present();

      // Opcional: notificar al cliente por correo/push con el motivo
    } catch (e) {
      console.error('[HOME] rechazarPedidoDelivery error:', e);
      const t = await this.toast.create({
        message: 'No se pudo rechazar el pedido',
        duration: 1600, color: 'danger', icon: 'alert-circle'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  // ===================== Helpers NUEVOS (delivery label/mesa virtual) =====================

  private getDeliveryVirtualMesa(): number {
    try {
      const fn = (this.pedidoService as any).getNumeroMesaDeliveryVirtual;
      const v = typeof fn === 'function' ? Number(fn()) : 9999;
      return Number.isFinite(v) && v > 0 ? v : 9999;
    } catch {
      return 9999;
    }
  }

  private salaChatDelivery(pedidoId: number): number {
    const base = Number(pedidoId) || 0;
    return this.SALA_CHAT_DELIVERY_OFFSET + Math.abs(base);
  }

  async abrirChatDeliveryCliente() {
    await this.spinner.show();
    try {
      if (!this.pedidoDelivery) return;
      const sala = this.salaChatDelivery(this.pedidoDelivery.id);
      this.router.navigate(['/chat'], {
        queryParams: {
          mesaId: sala,
          remitente: 'cliente'
        }
      });
    } finally {
      await this.spinner.hide();
    }
  }

  async abrirChatDeliveryRepartidor(pedido: PedidoRow) {
  await this.spinner.show();
  try {
    const sala = this.salaChatDelivery(pedido.id);
    await this.router.navigate(['/chat'], {
      queryParams: {
        mesaId: sala,
        remitente: 'delivery'
      }
    });
  } finally {
    await this.spinner.hide();
  }
}


  async mostrarRutaPedido(pedido: PedidoRow) {
    const lat = Number(pedido.domicilio_lat);
    const lng = Number(pedido.domicilio_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const t = await this.toast.create({
        message: 'Este pedido no tiene coordenadas guardadas.',
        duration: 1800,
        color: 'warning',
        icon: 'alert-circle'
      });
      await t.present();
      return;
    }
    this.pedidoRutaSeleccionado = pedido;
    setTimeout(() => this.renderizarMapaRuta(), 200);
  }

  private renderizarMapaRuta() {
    if (!this.pedidoRutaSeleccionado || !this.mapaRutaEntrega) return;
    const lat = Number(this.pedidoRutaSeleccionado.domicilio_lat);
    const lng = Number(this.pedidoRutaSeleccionado.domicilio_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    this.ensureLeafletIcons();

    if (!this.mapaRuta) {
      this.mapaRuta = L.map(this.mapaRutaEntrega.nativeElement, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this.mapaRuta);
    } else {
      this.mapaRuta.invalidateSize();
    }

    this.markerRestaurante?.remove();
    this.markerCliente?.remove();
    this.rutaPolyline?.remove();

    const origen: [number, number] = [this.RESTO_COORDS.lat, this.RESTO_COORDS.lng];
    const destino: [number, number] = [lat, lng];

    const iconRestaurante = L.divIcon({
      className: 'map-pin map-pin--resto',
      html: '<div class="pin-body"></div><div class="pin-dot"></div>',
iconSize: [34, 48],
iconAnchor: [17, 48],
    });

    const iconCliente = L.divIcon({
      className: 'map-pin map-pin--cliente',
      html: '<div class="pin-body"></div><div class="pin-dot"></div>',
iconSize: [34, 48],
iconAnchor: [17, 48],
    });


    this.markerRestaurante = L.marker(origen, { icon: iconRestaurante })
      .addTo(this.mapaRuta!)
      .bindPopup('Restaurante');

    this.markerCliente = L.marker(destino, { icon: iconCliente })
      .addTo(this.mapaRuta!)
      .bindPopup(this.pedidoRutaSeleccionado.domicilio_direccion || 'Cliente');

    this.rutaPolyline = L.polyline([origen, destino], { color: '#0078ff', weight: 4, opacity: 0.75 }).addTo(this.mapaRuta!);
    this.mapaRuta!.fitBounds(this.rutaPolyline.getBounds(), { padding: [20, 20] });
  }

  private ensureLeafletIcons() {
    if (this.leafletConfigured) return;
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });
    this.leafletConfigured = true;
  }

  private destruirMapaRuta() {
    if (this.mapaRuta) {
      try { this.mapaRuta.remove(); } catch { }
      this.mapaRuta = null;
    }
    this.markerCliente = null;
    this.markerRestaurante = null;
    this.rutaPolyline = null;
  }

  private liberarWatcherPedidoDelivery() {
    if (this.pedidoDeliverySub) {
      try { supabase.removeChannel(this.pedidoDeliverySub); } catch { }
      this.pedidoDeliverySub = null;
    }
  }

  private async notificarPedidoListo(pedido: PedidoRow) {
    if (!this.isDeliveryPedido(pedido)) return;
    try {
      const direccion = pedido.domicilio_direccion ? ` -> ${pedido.domicilio_direccion}` : '';
      await this.auth.notifyRoles(
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

    // Abrevia direcciones largas para los paneles de delivery
  shortDireccion(dir: string | null | undefined, max: number = 70): string {
    if (!dir) return '—';
    const clean = String(dir).trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1) + '…';
  }


  private async notificarIngresoListaEspera(clienteId: number) {
    try {
      const baseNombre =
        this.role === 'anonimo'
          ? (this.anonName || 'Cliente anonimo')
          : (this.firstName || this.email || 'Cliente');
      const nombre = (baseNombre || 'Cliente').trim() || 'Cliente';
      await this.auth.notifyRoles(
        ['maitre'],
        'Nuevo cliente en espera',
        `${nombre} ingreso a la lista de espera.`,
        { tipo: 'waitlist', clienteId, route: '/home' }
      );
      this.pushNotificationService.sendNotificationToRole({
        role: 'maître',
        title: 'Nuevo cliente en lista de espera',
        body: `${nombre} ingreso a la lista de espera.`,
        data: { tipo: 'nuevo_cliente' }
      });
    } catch (err) {
      console.error('[HOME] Error enviando push al maitre:', err);
    }
  }

  private mapItemsFacturaDesdePedido(pedido: PedidoRow) {
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    return items.map((item: any) => {
      const precio = Number(item?.precio_unitario ?? item?.precio ?? 0);
      const cantidad = Number(item?.cantidad ?? 1);
      return {
        nombre: item?.nombre ?? 'Item',
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
        precioUnit: Number.isFinite(precio) ? precio : 0,
      };
    });
  }

  private construirDetalleDelivery(pedido: PedidoRow): DetalleCuenta {
    const items = this.mapItemsFacturaDesdePedido(pedido);
    const subtotal = items.reduce((acc, item) => acc + item.precioUnit * item.cantidad, 0);
    const total = pedido.monto_total != null ? Number(pedido.monto_total) : subtotal;
    return {
      numeroPedido: pedido.id,
      items,
      subtotal,
      descuentoJuegos: 0,
      propina: 0,
      total,
    };
  }

  obtenerItemsPedido(pedido: PedidoRow | null) {
    if (!pedido) return [];
    return this.mapItemsFacturaDesdePedido(pedido);
  }

  totalPedido(pedido: PedidoRow | null): number {
    if (!pedido) return 0;
    if (pedido.monto_total != null) return Number(pedido.monto_total);
    return this.obtenerItemsPedido(pedido).reduce((acc, item) => acc + item.precioUnit * item.cantidad, 0);
  }

  private async emitirFacturaDelivery(pedido: PedidoRow) {
    await this.spinner.show();

    try {
      // 👉 1) Mesa del pedido (virtual o real)
      const mesa = pedido.numero_mesa ?? this.getDeliveryVirtualMesa();

      // 👉 2) Buscar la última cuenta de esa mesa TRAYENDO LOS TOTALES Y PROPINAS
      // [CAMBIO]: Agregamos subtotal, descuento_juego, propina_monto, total_final al select
      const { data: cuenta, error: errCuenta } = await supabase
        .from('menuya_cuentas')
        .select('cliente_id, subtotal, descuento_juego, propina_monto, total_final') 
        .eq('numero_mesa', mesa)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errCuenta) {
        console.warn('[HOME] Error obteniendo cuenta delivery:', errCuenta);
      }

      const domicilioPedido = (pedido as any).domicilio_direccion || undefined;

      // 👉 Datos por defecto
      let datosCliente: DatosCliente = {
        nombre: 'Cliente Delivery',
        email: '',
        domicilio: domicilioPedido
      };

      // 👉 3) Si hay cliente_id, traemos nombre completo, dni y mail reales
      if (cuenta?.cliente_id) {
        const { data: cli, error: errCli } = await supabase
          .from('menuya_clientes')
          .select('nombres, apellidos, dni, email')
          .eq('id', cuenta.cliente_id)
          .maybeSingle();

        if (errCli) {
          console.warn('[HOME] Error leyendo cliente delivery:', errCli);
        }

        if (cli) {
          const nombreCompleto = `${cli.nombres ?? ''} ${cli.apellidos ?? ''}`.trim();

          datosCliente = {
            nombre: nombreCompleto || 'Cliente Delivery',
            email: cli.email || '',
            dni: cli.dni || undefined,
            domicilio: domicilioPedido
          };
        }
      }

      console.info('[HOME] Cliente para factura delivery:', datosCliente);

      // 👉 4) [CORRECCIÓN PRINCIPAL] Construimos el detalle usando los datos de la DB (Cuenta)
      // Si usamos 'construirDetalleDelivery' pone propina en 0. 
      // Aquí tomamos la lógica de 'EstadoMesasPage'.
      
      const items = this.mapItemsFacturaDesdePedido(pedido);
      
      // Si la cuenta no trajo datos (raro), calculamos un fallback básico
      const fallbackSubtotal = items.reduce((acc, item) => acc + item.precioUnit * item.cantidad, 0);
      const fallbackTotal = pedido.monto_total != null ? Number(pedido.monto_total) : fallbackSubtotal;

      const detalle: DetalleCuenta = {
        numeroPedido: pedido.id,
        items,
        // Usamos los valores de la cuenta si existen, sino el fallback
        subtotal: cuenta?.subtotal != null ? Number(cuenta.subtotal) : fallbackSubtotal,
        descuentoJuegos: cuenta?.descuento_juego != null ? Number(cuenta.descuento_juego) : 0,
        propina: cuenta?.propina_monto != null ? Number(cuenta.propina_monto) : 0,
        total: cuenta?.total_final != null ? Number(cuenta.total_final) : fallbackTotal,
      };

      // 👉 5) Genera y envía la factura
      await this.facturacion.emitirYEnviarFactura({
        pedidoId: pedido.id,
        cliente: datosCliente,
        detalle,
        mesaNumero: mesa
      });

      const t = await this.toast.create({
        message: 'Factura generada y enviada por correo.',
        duration: 1600,
        color: 'success',
        icon: 'document-text'
      });
      await t.present();

    } catch (err) {
      console.error('[HOME] Error emitiendo factura delivery:', err);

      const t = await this.toast.create({
        message: 'No se pudo generar la factura automáticamente.',
        duration: 1800,
        color: 'warning',
        icon: 'alert-circle'
      });
      await t.present();

    } finally {
      await this.spinner.hide();
    }
  }



async entregarPedidoDelivery(pedido: PedidoRow) {
  await this.spinner.show();   // ⬅️ Mostrar spinner

  try {
    await this.pedidoService.updateEstado(pedido.id, 'entregado');

    const t = await this.toast.create({
      message: `Pedido #${pedido.id} marcado como entregado.`,
      duration: 1600,
      color: 'success',
      icon: 'checkmark-done'
    });
    await t.present();

    await this.cargarPedidosParaDelivery();

    if (this.pedidoDelivery && this.pedidoDelivery.id === pedido.id) {
      this.pedidoDelivery.estado = 'entregado';
      this.aplicarFlagsDeliveryDesdeEstado('entregado');
    }

  } catch (error) {
    console.error('[HOME] entregarPedidoDelivery error:', error);

    const t = await this.toast.create({
      message: 'No se pudo marcar el pedido como entregado.',
      duration: 1800,
      color: 'danger',
      icon: 'alert-circle'
    });
    await t.present();

  } finally {
    await this.spinner.hide();   // ⬅️ Se oculta siempre
  }
}


  isDeliveryPedido(p: PedidoRow | PedidoFiltrado | null | undefined): boolean {
    if (!p) return false;
    return (p as any).tipo === 'domicilio' || p.numero_mesa === this.getDeliveryVirtualMesa();
  }

  displayDestino(p: PedidoRow | PedidoFiltrado): string {
    return this.isDeliveryPedido(p)
      ? `Pedido a domicilio #${p.id}`
      : `Mesa ${p.numero_mesa}`;
  }
}
