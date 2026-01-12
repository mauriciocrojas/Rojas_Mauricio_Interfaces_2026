// src/app/services/push-notification.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import { Platform } from '@ionic/angular';
import { supabase } from '../supabase.client';
import { Browser } from '@capacitor/browser';

interface SendNotificationByRolePayload {
  role: EmpleadoRol;
  title: string;
  body: string;
  data?: any;
}

type EmpleadoRol = 'dueño' | 'maître' | 'mozo' | 'cocinero' | 'bartender' | 'delivery' | 'cliente' | 'anonimo';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  // Base de tus Edge Functions
  private functionsBaseUrl = `https://vjthgijqloomeatknoxz.supabase.co/functions/v1`;

    // 👇 para no inicializar varias veces
  private initializedForUser: string | null = null;

  constructor(
    private http: HttpClient,
    private platform: Platform
  ) {}

  async initPush(userId: string, role: EmpleadoRol) {

    // Si ya inicializamos para este user, no hacemos nada
    if (this.initializedForUser === userId) {
      console.log('[Push] Ya inicializado para este usuario, skip');
      return;
    }

    if (!this.platform.is('capacitor')) {
      console.log('Push no disponible en navegador');
      return;
    }

    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive !== 'granted') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Permiso de notificaciones denegado');
      return;
    }

    await PushNotifications.register();
    this.addListeners(userId, role);
    this.initializedForUser = userId;
  }

  private addListeners(userId: string, role: EmpleadoRol) {
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Token de notificación:', token.value);
      await this.registrarTokenEnSupabase(userId, role, token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error registrando push:', error);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('Notificación en foreground:', notification);
        // Si luego querés mostrar toast acá, se puede inyectar ToastController en este servicio.
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('Usuario abrió la notificación:', action.notification);
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (notification) => {
        const data: any = notification.notification.data;

        if (data?.tipo === 'factura_lista' && data?.url) {
          await Browser.open({
            url: data.url, // 👈 abre la factura en el navegador / webview
          });
        }
      }
    );
  }

private async registrarTokenEnSupabase(
    userId: string,
    role: EmpleadoRol,
    token: string
  ) {
    console.log('[Push] Llamando registrar-token ⬆️', {
      user_id: userId,
      role,
      token,
    });

    const { data, error } = await supabase.functions.invoke('registrar-token', {
      body: {
        user_id: userId,   // 👈 NOMBRE EXACTO
        role,              // 👈 NOMBRE EXACTO
        token,             // 👈 NOMBRE EXACTO
      },
    });

    if (error) {
      console.error('[Push] Error registrar-token ❌', error);
      throw error;
    }

    console.log('[Push] Respuesta registrar-token ✅', data);
    return data;
  }

  async sendNotificationToRole(payload: SendNotificationByRolePayload) {
    try {
      const res = await fetch(
        'https://vjthgijqloomeatknoxz.functions.supabase.co/enviar-notificacion-rol',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

    if (!res.ok) throw new Error('Error al enviar notificación');
    console.log('Notificación enviada correctamente');
    } catch (err) 
    {
      console.error(err);
    }
  }
}
