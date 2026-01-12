import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ReservasService, Reserva } from '../../services/reservas.service';
import { MesaService } from '../../services/mesas';
import { ClientesService } from '../../clientes.service';
import { BehaviorSubject, Observable, forkJoin, from, of, Subscription } from 'rxjs';
import { map, switchMap, tap, catchError, shareReplay } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SpinnerService } from '../../services/spinner';

@Component({
  selector: 'app-gestion-reservas',
  templateUrl: 'gestion-reservas.component.html',
  styleUrls: ['gestion-reservas.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class GestionReservasComponent implements OnDestroy {
  // Disparador de recarga manual
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  // Suscripción al realtime
  private reservasRtSub?: Subscription;

  cargando = true;
  errorMsg: string | null = null;
  rechazoEditId: string | null = null;
  rechazoNotas: string = '';
  asignacionActiva: { clienteId: string; reservaId: string; nombre: string } | null = null;
  mesasDisponibles: Array<{ numero_mesa: number; tipo: string }> = [];
  cargandoMesas = false;
  mesasError: string | null = null;

  // Tipo para la UI combinando reserva + datos del cliente
  reservas$!: Observable<Array<(Reserva & { nombreCompleto: string; estado: string | null })>>;

  constructor(
    private reservasService: ReservasService,
    private clientesService: ClientesService,
    private toastController: ToastController,
    private router: Router,
    private mesaService: MesaService,
    private spinner: SpinnerService
  ) {
    this.reservas$ = this.refresh$.pipe(
      tap(() => {
        this.cargando = true;
        this.errorMsg = null;
      }),
      switchMap(() => from(this.reservasService.misReservas())),
      // Filtrar solo pendientes (estado null o 'pendiente')
      map((reservas) => (reservas || []).filter((r) => !r.estado || r.estado === 'pendiente')),
      switchMap((reservas) => {
        if (!reservas || reservas.length === 0) {
          return of([]);
        }
        return forkJoin(
          reservas.map((r) =>
            from(this.clientesService.getClienteById(r.cliente_id)).pipe(
              map((cliente) => ({
                ...r,
                nombreCompleto: cliente
                  ? `${(cliente.nombres || '').trim()} ${(cliente.apellidos || '').trim()}`.trim()
                  : 'Cliente',
                estado: r.estado ?? null,
              }))
            )
          )
        );
      }),
      tap(() => (this.cargando = false)),
      catchError((err) => {
        console.error('[GestionReservas] Error cargando reservas:', err);
        this.errorMsg = 'No se pudieron cargar las reservas.';
        this.cargando = false;
        return of([]);
      }),
      shareReplay(1)
    );

    // 👇 Escuchar cambios en tiempo real de reservas
    this.reservasRtSub = this.reservasService.reservasChanges$.subscribe(() => {
      console.log('[GestionReservas] Cambio en reservas detectado → refresco lista');
      this.refresh$.next();
      this.reservasService.misReservas().then((r) =>
        console.log('[GestionReservas] Estado actual de reservas:', r)
      );
    });
  }

  ngOnInit() {
    this.refresh$.next();
  }

  ngOnDestroy() {
    this.reservasRtSub?.unsubscribe();
  }

  trackById(_: number, item: { id: string }) {
    return item.id;
  }

  async confirmar(reserva: Reserva & { nombreCompleto: string; estado: string | null }) {
    await this.spinner.show();
    try {
      await this.reservasService.confirmarReserva(reserva.id);
      await this.presentToast('Reserva confirmada', 'success');
      // Activar panel de asignación y cargar mesas disponibles
      this.asignacionActiva = {
        clienteId: reserva.cliente_id,
        reservaId: reserva.id,
        nombre: reserva.nombreCompleto || 'Cliente'
      };
      await this.cargarMesasDisponiblesValidas();
      // Refrescar la lista de pendientes (la reserva confirmada ya no aparecerá)
      this.refresh$.next();
    } catch (e: any) {
      console.error('Error al confirmar:', e);
      await this.presentToast(e?.message || 'Error al confirmar', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }


  rechazar(reservaId: string) {
    this.rechazoEditId = reservaId;
    this.rechazoNotas = '';
  }

  cancelarRechazo() {
    this.rechazoEditId = null;
    this.rechazoNotas = '';
  }

  async enviarRechazo(reservaId: string) {
    const motivo = (this.rechazoNotas || '').trim();
    if (!motivo) {
      await this.presentToast('Ingresa un motivo del rechazo', 'warning');
      return;
    }

    await this.spinner.show();
    try {
      await this.reservasService.cancelarReserva(reservaId, motivo);
      await this.presentToast('Reserva rechazada', 'medium');
      this.cancelarRechazo();
      this.refresh$.next();
    } catch (e: any) {
      console.error('Error al rechazar:', e);
      await this.presentToast(e?.message || 'Error al rechazar', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }


  doRefresh(ev: CustomEvent) {
    this.refresh$.next();
    // pequeña demora para UX
    setTimeout(() => (ev.target as any)?.complete?.(), 200);
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'medium') {
    const toast = await this.toastController.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home');
    } finally {
      await this.spinner.hide();
    }
  }

  async cargarMesasDisponiblesValidas() {
    this.cargandoMesas = true;
    this.mesasError = null;
    try {
      const mesas = await this.mesaService.obtenerMesasDisponiblesValidas();
      // Garantizamos que existan los campos requeridos
      this.mesasDisponibles = (mesas || []).map((m: any) => ({
        numero_mesa: m.numero_mesa,
        tipo: m.tipo
      }));
    } catch (e: any) {
      console.error('Error cargando mesas disponibles:', e);
      this.mesasError = 'No se pudieron cargar las mesas disponibles.';
      this.mesasDisponibles = [];
    } finally {
      this.cargandoMesas = false;
    }
  }

  async asignarMesa(numeroMesa: number) {
    if (!this.asignacionActiva) return;

    await this.spinner.show();
    try {
      const fecha_reserva = await this.reservasService.obtenerReservaPorId(this.asignacionActiva.reservaId);
      await this.mesaService.asignarMesaV2(
        this.asignacionActiva.clienteId,
        numeroMesa,
        fecha_reserva?.fecha_hora ?? ''
      );
      await this.presentToast(`Mesa ${numeroMesa} asignada`, 'success');
      // Opcional: recargar mesas para quitar la asignada
      await this.cargarMesasDisponiblesValidas();
      // Cerrar panel al asignar
      this.cancelarAsignacion();
    } catch (e: any) {
      console.error('Error asignando mesa:', e);
      await this.presentToast(e?.message || 'Error asignando mesa', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  cancelarAsignacion() {
    this.asignacionActiva = null;
    this.mesasDisponibles = [];
    this.mesasError = null;
    this.cargandoMesas = false;
  }
}
