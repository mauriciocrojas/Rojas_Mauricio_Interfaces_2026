import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService, Mensaje } from '../../services/chat';
import { CommonModule } from '@angular/common';   
import { FormsModule } from '@angular/forms';     
import { IonicModule, IonContent, ToastController } from '@ionic/angular';  
import { PushNotificationService } from '../../services/push-notification.service';
import { Router } from '@angular/router';
import { SpinnerService } from '../../services/spinner';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ChatPage implements OnInit, AfterViewInit {

  @ViewChild(IonContent) private content!: IonContent;
  private scrollTimer: any = null;

  mensajes: Mensaje[] = [];
  nuevoMensaje = '';
  mesaId: number | null = null;
  remitente: 'cliente' | 'mozo' | 'delivery' = 'cliente';
  direccionCliente: string | null = null;

  constructor(
    private chatService: ChatService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastController,
    private pushNotificationService: PushNotificationService,
    private spinner: SpinnerService
  ) {}

  ngOnInit() {
  this.route.queryParams.subscribe(params => {
    // Mesa inicial (puede venir vacía)
    const mesaParam = Number(params['mesaId']);
    this.mesaId = Number.isFinite(mesaParam) ? mesaParam : null;

    // Remitente según param
    const remitenteParam = String(params['remitente'] || '').toLowerCase();
    this.remitente =
      remitenteParam === 'mozo' || remitenteParam === 'delivery'
        ? (remitenteParam as any)
        : 'cliente';

    // Suscripción realtime (si hay mesa inicial)
    this.chatService.subscribeMensajes(this.mesaId ?? undefined);

    // Carga inicial
    this.cargarMensajes();

    // Dirección si la mesa inicial es delivery
    this.actualizarDireccionCliente();
  });

  this.chatService.mensajes$.subscribe(msjs => {
    this.mensajes = msjs;

    // 👇 Inferir mesa si no vino por parámetro
    const mesaFromMensajes =
      msjs.find(m => typeof m.mesa_id === 'number' && m.mesa_id > 100)?.mesa_id ?? null;

    if (mesaFromMensajes && mesaFromMensajes > 100 && this.mesaId !== mesaFromMensajes) {
      // Actualizo y vuelvo a pedir direccion
      this.mesaId = mesaFromMensajes;
      this.actualizarDireccionCliente();
    } else if (this.mesaId != null && this.mesaId > 100 && !this.direccionCliente) {
      // Si ya sé que es delivery pero aún no levanté dirección
      this.actualizarDireccionCliente();
    }

    this.scrollToBottom();
  });
}


  ngAfterViewInit(): void {
    // Asegura ir al final cuando la vista está lista
    this.scrollToBottom();
  }

  private abreviarDireccion(dir: string): string {
    if (!dir) return '';
    return dir.length > 40 ? dir.substring(0, 40) + '...' : dir;
  }

private async actualizarDireccionCliente() {
  if (this.mesaId == null) {
    this.direccionCliente = null;
    return;
  }

  let direccion: string | null = null;

  // 🟢 Caso A: mesa virtual delivery REAL (9999)
  if (this.mesaId === this.chatService.getMesaDeliveryVirtual()) {
    direccion = await this.chatService.getDireccionDeliveryPorMesa(9999);
  }

  // 🟢 Caso B: sala virtual generada (90000 + pedidoId)
  else if (this.mesaId > 90000) {
    const pedidoId = this.mesaId - 90000;
    direccion = await this.chatService.getDireccionPorPedidoId(pedidoId);
  }

  this.direccionCliente = direccion ? this.abreviarDireccion(direccion) : null;
}


  async cargarMensajesPeriodicamente() {
    if (this.mesaId == null) return;

    await this.cargarMensajes();  // carga inicial
    setInterval(() => this.cargarMensajes(), 3000); // refresco cada 3s
  }


  
  
  ajustarHoraAR(createdAt: string | null | undefined): string {
    if (!createdAt) return '';

    try {
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return '';

      // Restamos 3 horas para llevar de UTC a Argentina
      const argMs = d.getTime() - 3 * 60 * 60 * 1000;
      const argDate = new Date(argMs);

      return argDate.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  async enviarMensaje() {
    const contenido = this.nuevoMensaje.trim();
    if (!contenido) return;

    let mesaDestino = this.mesaId;
    if (
      this.remitente === 'mozo' &&
      (mesaDestino == null || Number.isNaN(mesaDestino) || mesaDestino <= 0)
    ) {
      mesaDestino = this.obtenerMesaDesdeHistorial();
    }

    if (
      this.remitente === 'mozo' &&
      (mesaDestino == null || Number.isNaN(mesaDestino) || mesaDestino <= 0)
    ) {
      const t = await this.toast.create({
        message: 'Seleccioná la consulta (mesa) antes de responder.',
        duration: 1800,
        color: 'warning',
        icon: 'chatbubble-ellipses'
      });
      await t.present();
      return;
    }

    await this.chatService.enviarMensaje(this.remitente, contenido, mesaDestino ?? undefined);
    if (this.remitente === 'mozo' && typeof mesaDestino === 'number' && mesaDestino > 0) {
      this.mesaId = mesaDestino;
      this.actualizarDireccionCliente();
    }
    this.nuevoMensaje = '';
    this.scrollToBottom();
  }

  async cargarMensajes() {
    const mensajes = await this.chatService.getMensajes(this.mesaId ?? undefined);
    this.chatService.mensajes$.next(mensajes); // inicializa una vez

    // 👉 Si no tengo mesaId > 100 pero en los mensajes aparece, lo tomo de ahí
    const mesaFromMensajes =
      mensajes.find(m => typeof m.mesa_id === 'number' && m.mesa_id > 100)?.mesa_id ?? null;

    if (mesaFromMensajes && mesaFromMensajes > 100 && this.mesaId !== mesaFromMensajes) {
      this.mesaId = mesaFromMensajes;
      this.actualizarDireccionCliente();
    } else if (this.mesaId != null && this.mesaId > 100 && !this.direccionCliente) {
      // refuerzo: si ya sé que es delivery y aún no tengo dirección, la vuelvo a pedir
      this.actualizarDireccionCliente();
    }

    this.scrollToBottom();
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigate(['/home']);
    } finally {
      await this.spinner.hide();
    }
  }

  private scrollToBottom() {
    if (!this.content) return;
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.content.scrollToBottom(200).catch(() => {});
    }, 50);
  }

  private obtenerMesaDesdeHistorial(): number | null {
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const mesa = this.mensajes[i]?.mesa_id;
      if (typeof mesa === 'number' && Number.isFinite(mesa) && mesa > 0) {
        return mesa;
      }
    }
    return null;
  }

  getEtiquetaRol(m: Mensaje): string | null {
    if (!m) return null;

    if ((m as any).remitente === 'mozo') {
      return 'Mozo';
    }

    if ((m as any).remitente === 'delivery') {
      return 'Repartidor';
    }

    return null;
  }

}
