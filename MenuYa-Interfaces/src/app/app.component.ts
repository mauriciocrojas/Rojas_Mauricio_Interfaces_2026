import { Component, OnInit } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { StatusBar } from '@capacitor/status-bar';
import { AudioService } from './services/servicio-audio';
import { App } from '@capacitor/app';
import { AuthService } from './auth.service';
// import { ActionPerformed, PushNotificationSchema, PushNotifications, Token } from '@capacitor/push-notifications';
import { register } from 'swiper/element/bundle';
import { PushNotificationService } from './services/push-notification.service';
import { supabase } from './supabase.client';

register();

type Rol =
  | 'dueño'
  | 'maître'
  | 'mozo'
  | 'cocinero'
  | 'bartender'
  | 'delivery'
  | 'cliente'
  | 'anonimo';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  role: string | null = null;
  private isActive = false;
  
  constructor(
    private platform: Platform,
    private audio: AudioService,
    private auth: AuthService,
    private toastCtrl: ToastController,
    private pushNotificationService: PushNotificationService
  ) {
    this.initializeApp();
  }

  async ngOnInit() {
    // 1) Cargar rol del usuario (puede ser 'cliente', 'mozo', etc.)
    this.role = await this.auth.getUserRole(); // getUserRole son empleados
    if (!this.role) {
      this.role = await this.auth.getClienteRole(); // getRoleCliente son clientes
      console.log('Rol de cliente cargado:', this.role);
    }
    console.log('Rol cargado:', this.role);

    // 2) Mapear rol a EmpleadoRol (solo empleados; clientes no)
    const rol = this.mapRol(this.role);
    if (!rol) {
      console.log('[AppComponent] Rol no valido para push, skip initPush');
      return;
    }

    // 3) Solo en entorno nativo
    if (!this.platform.is('capacitor')) {
      console.log('[AppComponent] No es plataforma nativa, no inicializo push');
      return;
    }

    // 4) Obtener usuario autenticado actual
    const { data: { user } } = await supabase.auth.getUser();
    const authUserId = user?.id;

    if (!authUserId) {
      console.log('[AppComponent] No hay usuario autenticado al arrancar, no initPush');
      return;
    }

    // 5) Reenganchar push usando el mismo servicio que el login
    await this.pushNotificationService.initPush(authUserId, rol);
  }

  private initializeApp() {
    this.platform.ready().then(() => {
      this.isActive = true;
      this.audio.playStart(); // suena al entrar
      
      // Evita que el contenido se superponga a la barra de estado
      StatusBar.setOverlaysWebView({ overlay: false });
      // Opcional: cambia el color de la barra de estado
      StatusBar.setBackgroundColor({ color: '#687FE5' });

      App.addListener('appStateChange', (state) => {
        this.isActive = !!state.isActive;
        if (!state.isActive) {
          this.audio.playClose();
        }
      });
    });
  }

  // Helper: normaliza el rol a Rol (o null si no aplica)
  private mapRol(role: string | null): Rol | null {
    if (!role) return null;
    const r = role.toLowerCase();

    if (r === 'dueño' || r === 'dueno') return 'dueño';
    if (r === 'maître' || r === 'maitre') return 'maître';
    if (r === 'mozo') return 'mozo';
    if (r === 'cocinero') return 'cocinero';
    if (r === 'bartender') return 'bartender';
    if (r === 'delivery') return 'delivery';
    if (r === 'cliente') return 'cliente';
    if (r === 'anonimo') return 'anonimo';
    return null;
  }

  // initPush() {
  //   console.log('Initializing Push');

  //   // Request permission to use push notifications (Capacitor)
  //   PushNotifications.requestPermissions().then((result) => {
  //     if (result.receive === 'granted') {
  //       PushNotifications.register();
  //     }
  //   });

  //   // Registration success
  //   PushNotifications.addListener('registration', async (token: Token) => {
  //     await this.auth.savePushToken(token.value);
  //   });

  //   // Registration error
  //   PushNotifications.addListener('registrationError', (error: any) => {
  //     console.error('Error en el registro de notificaciones:', error);
  //   });

  //   // Foreground notifications: mostrar toast cuando la app est� activa
  //   PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
  //     console.log('Push received:', notification);
  //     if (this.isActive) {
  //       const title = notification.title || notification.data?.title || 'Notificaci�n';
  //       const body = notification.body || notification.data?.body || '';
  //       const t = await this.toastCtrl.create({ message: `${title}: ${body}`.trim(), duration: 2500, position: 'top' });
  //       t.present();
  //     }
  //   });

  //   // Tap en notificación local (foreground)
  //   /* LocalNotifications.addListener('localNotificationActionPerformed', (event: LocalActionPerformed) => {
  //     console.log('Local notification action:', event);
  //     // TODO: navegar a pantallas según event.notification?.extra
  //   }); */

  //   // Tapping notifications
  //   PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
  //     console.log('Push action performed:', notification);
  //   });
  // }
}


