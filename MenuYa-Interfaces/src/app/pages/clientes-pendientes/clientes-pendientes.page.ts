import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastController, IonicModule } from '@ionic/angular';
import { Cliente, ClientesService } from 'src/app/clientes.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { EmailService } from '../../email.service';
import { SpinnerService } from '../../services/spinner';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-clientes-pendientes',
  standalone: true,
  templateUrl: './clientes-pendientes.page.html',
  styleUrls: ['./clientes-pendientes.page.scss'],
  imports: [IonicModule, CommonModule]
})
export class ClientesPendientesPage implements OnInit, OnDestroy {

  pendientes: Cliente[] = [];
  isLoadingPend = false;
  isLoading = true;
  errorMsg = '';
  role: any = '';

  private pendientesSub?: Subscription;

  constructor(
    private pushNotificationService: PushNotificationService,
    private toastController: ToastController,
    private clientes: ClientesService,
    private emailSrv: EmailService,
    private spinner: SpinnerService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.isLoadingPend = true;

    this.pendientesSub = this.clientes.observePendientes().subscribe({
      next: (lista) => {
        this.pendientes = lista;
        this.isLoadingPend = false;
      },
      error: async (err) => {
        console.error('[Clientes pendientes] error observando pendientes:', err);
        this.isLoadingPend = false;
        const t = await this.toastController.create({
          message: 'No se pudo cargar pendientes',
          duration: 1500,
          color: 'warning',
          icon: 'warning-outline'
        });
        await t.present();
      }
    });
  }

  ngOnDestroy(): void {
    this.pendientesSub?.unsubscribe();
  }

  async aprobarCliente(c: Cliente) {
    await this.spinner.show();
    try {
      await this.clientes.actualizarEstado(c.id, 'aprobado');
      await this.emailSrv.enviarEstadoRegistro(c.email as any, (c as any).nombres, 'aprobado');

      const t = await this.toastController.create({
        message: 'Cliente aprobado y notificado',
        duration: 1300,
        color: 'success',
        icon: 'checkmark-circle'
      });
      await t.present();
    } catch (e) {
      console.error(e);
      const t = await this.toastController.create({
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
      // ❌ Tampoco hace falta tocar this.pendientes acá.

      const t = await this.toastController.create({
        message: 'Cliente rechazado y notificado',
        duration: 1300,
        color: 'medium',
        icon: 'remove-circle'
      });
      await t.present();
    } catch (e) {
      console.error(e);
      const t = await this.toastController.create({
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

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home');
    } finally {
      await this.spinner.hide();
    }
  }
}
