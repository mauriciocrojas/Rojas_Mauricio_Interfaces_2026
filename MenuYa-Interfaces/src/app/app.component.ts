import { Component, OnInit } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { StatusBar } from '@capacitor/status-bar';
import { AudioService } from './services/servicio-audio';
import { App } from '@capacitor/app';
import { AuthService } from './auth.service';
import { register } from 'swiper/element/bundle';
import { PushNotificationService } from './services/push-notification.service';
import { supabase } from './supabase.client';
import { ThemeService } from './core/theme/theme.service';

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
    private pushNotificationService: PushNotificationService,
    private themeService: ThemeService // ✅ INYECTADO
  ) {
    this.initializeApp();
  }

  async ngOnInit() {
    // ✅ 0) APLICAR TEMA AL ARRANQUE (antes de todo)
    // await this.themeService.loadAndApply();

    // ✅ si estás en nativo, pinta StatusBar con el color del tema
    if (this.platform.is('capacitor')) {
      await this.applyStatusBarThemeColor();
    }

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
    this.platform.ready().then(async () => {
      this.isActive = true;
      this.audio.playStart(); // suena al entrar

      // Evita que el contenido se superponga a la barra de estado
      StatusBar.setOverlaysWebView({ overlay: false });

      App.addListener('appStateChange', (state) => {
        this.isActive = !!state.isActive;
        if (!state.isActive) {
          this.audio.playClose();
        }
      });
    });
  }

  // ✅ Lee el color primario ya aplicado por el tema y lo manda al StatusBar
  private async applyStatusBarThemeColor() {
    try {
      // Preferimos --ion-color-primary si lo estás mapeando (lo ideal en Ionic)
      let color = getComputedStyle(document.documentElement)
        .getPropertyValue('--ion-color-primary')
        .trim();

      // Fallback a tu token custom si hiciera falta
      if (!color) {
        color = getComputedStyle(document.documentElement)
          .getPropertyValue('--app-primary')
          .trim();
      }

      // Fallback final (si por lo que sea no hay nada)
      if (!color) color = '#687FE5';

      await StatusBar.setBackgroundColor({ color });
    } catch (e) {
      console.log('[AppComponent] No pude setear StatusBar color:', e);
    }
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
}
