// src/app/login/login.page.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth.service';
import { Haptics } from '@capacitor/haptics';
import { AudioService } from '../services/servicio-audio';
import { supabase } from '../supabase.client';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { SpinnerService } from '../../app/services/spinner';
import { PushNotificationService } from '../services/push-notification.service';
import { ActionSheetController } from '@ionic/angular';
import { ThemeService } from '../core/theme/theme.service';
import { ThemeId } from '../core/theme/theme.model';



type PresetKey = 'Cliente registrado' | 'Dueno' | 'Cocinero' | 'Bartender' | 'Mozo' | 'Maitre' | 'Delivery';

type EmpleadoRol = 'dueño' | 'maître' | 'mozo' | 'cocinero' | 'bartender' | 'delivery' | 'cliente' | 'anonimo';

interface Preset {
  key: PresetKey;
  label: string;
  email: string;
  password: string;
  initials: string;
  avatar?: string | null;
  short: string;
  shape: 'shape-hex' | 'shape-kite' | 'shape-squircle';
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit, OnDestroy {
  email = '';
  password = '';
  remember = false;
  loading = false;
  errorMsg = '';
  showPwd = false;


  // UI helpers
  capsLockOn = false;
  strengthValue = 0; // 0..1
  strengthLabel: 'Débil' | 'Media' | 'Fuerte' | '' = '';
  strengthColor: 'danger' | 'warning' | 'success' | 'medium' = 'medium';

  presets: Preset[] = [
    {
      key: 'Dueno',
      label: 'Dueño',
      email: 'markzeg@gmail.com',
      password: '123456',
      initials: 'D',
      avatar: 'assets/quick-users/dueno.png',
      short: this.shortenEmail('markzeg@gmail.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Cocinero',
      label: 'Cocinero',
      email: 'vyshsvh@gmail.com',
      password: '123456',
      initials: 'C',
      avatar: 'assets/quick-users/cocinero.png',
      short: this.shortenEmail('vyshsvh@gmail.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Bartender',
      label: 'Bartender',
      email: 'asda@gmail.com',
      password: '123456',
      initials: 'B',
      avatar: 'assets/quick-users/bartender.png',
      short: this.shortenEmail('asda@gmail.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Maitre',
      label: 'Maitre',
      email: 'maitre@gmail.com',
      password: '123456',
      initials: 'MT',
      avatar: 'assets/quick-users/maitre.png',
      short: this.shortenEmail('maitre@gmail.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Mozo',
      label: 'Mozo',
      email: 'jsjsjs@haha.com',
      password: '123456',
      initials: 'MZ',
      avatar: 'assets/quick-users/mozo.png',
      short: this.shortenEmail('jsjsjs@haha.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Delivery',
      label: 'Repartidor',
      email: 'delivery122@gmail.com',
      password: '123456',
      initials: 'RP',
      avatar: 'assets/quick-users/delivery.png',
      short: this.shortenEmail('delivery122@gmail.com'),
      shape: 'shape-squircle',
    },
    {
      key: 'Cliente registrado',
      label: 'Cliente registrado',
      email: 'prueba10@gmail.com',
      password: '123456',
      initials: 'CR',
      avatar: 'assets/quick-users/cliente.png',
      short: this.shortenEmail('prueba10@gmail.com'),
      shape: 'shape-squircle',
    },
  ];


  constructor(
    private auth: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private audio: AudioService,
    private spinner: SpinnerService,
    private pushService: PushNotificationService,
    private actionSheetCtrl: ActionSheetController,
    private themeService: ThemeService,

  ) {
    const saved = localStorage.getItem('login_email');
    if (saved) this.email = saved;
  }

  private authSub: any;

  private async oauthPostValidation() {
    // Si estamos en un flujo de registro que creó una sesión temporal, suprimir la redirección automática
    if (localStorage.getItem('suppress_auto_home') === '1') {
      console.log('[LOGIN] oauthPostValidation suppressed due to registration flow');
      localStorage.removeItem('suppress_auto_home');
      return;
    }

    // Reutiliza la lógica de validación con la sesión actual (OAuth)
    const { data: { user } } = await supabase.auth.getUser();
    const authUserId = user?.id;
    const authEmail = user?.email?.trim().toLowerCase();
    if (!authUserId || !authEmail) return;

    async function singleOrNull<T>(q: any): Promise<T | null> {
      const { data, error } = await q.limit(1);
      if (error && error.code !== 'PGRST116') throw error;
      return (data && Array.isArray(data) && data.length) ? data[0] as T : null;
    }

    type ClienteRow = { estado: 'pendiente' | 'aprobado' | 'rechazado' };
    const cliente = await singleOrNull<ClienteRow>(
      supabase.from('menuya_clientes')
        .select('estado')
        .eq('auth_user_id', authUserId)
    );

    type ClienteRow2 = { auth_user_id: string | null, email: string, rol: string };
    const cliente_push = await singleOrNull<ClienteRow2>(
      supabase.from('menuya_clientes')
        .select('auth_user_id, email, rol')
        .eq('auth_user_id', authUserId)
    );

    type EmpleadoRow = { auth_id: string | null, email: string, rol: string };
    let empleado = await singleOrNull<EmpleadoRow>(
      supabase.from('menuya_empleados')
        .select('auth_id, email, rol')
        .eq('auth_id', authUserId)
    );

    if (!empleado) {
      empleado = await singleOrNull<EmpleadoRow>(
        supabase.from('menuya_empleados')
          .select('auth_id, email, rol')
          .ilike('email', authEmail)
      );
      if (empleado) {
        try {
          await supabase.from('menuya_empleados')
            .update({ auth_id: authUserId })
            .ilike('email', authEmail);
        } catch { }
      }
    }

    let allow = false;
    let rejectionMsg = ''; // <-- ya no usamos el mensaje genérico

    if (cliente) {
      if (cliente.estado === 'aprobado') allow = true;
      else if (cliente.estado === 'pendiente') rejectionMsg = 'Tu registro está pendiente de aprobación. Te avisaremos por correo.';
      else if (cliente.estado === 'rechazado') rejectionMsg = 'Tu registro fue rechazado. No podés ingresar.';
    }
    if (!allow && empleado) allow = true;

    // Si no hay motivo explícito de rechazo, no bloqueamos (antes rechazaba usuarios sin perfil)
    if (!allow && !rejectionMsg) {
      allow = true;
    }

    if (!allow && rejectionMsg) {
      await this.auth.signOut();
      this.errorMsg = rejectionMsg;
      const t = await this.toastCtrl.create({
        message: rejectionMsg,
        duration: 2800,
        position: 'top',
        color: rejectionMsg.includes('rechazado') ? 'danger' : 'warning'
      });
      await t.present();
      return;
    }

    // 👇 AQUÍ: ya sabemos que puede entrar, recién ahora registramos el push
    if (empleado?.rol) {
      await this.pushService.initPush(authUserId, empleado.rol as EmpleadoRol);
    }
    else {
      if (cliente_push) {
        // Clientes registrados usan rol 'cliente'
        await this.pushService.initPush(String(cliente_push.auth_user_id), cliente_push.rol as EmpleadoRol);
      }
    }

    try { await Haptics.impact({ style: 'Medium' as any }); } catch { }
    try { await (this.audio as any)?.playOpen?.(); } catch { }

    const t = await this.toastCtrl.create({
      message: '✅ Inicio de sesión correcto',
      duration: 1500,
      position: 'top',
    });
    await t.present();

    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  ngOnInit(): void {
    // Si vuelve de OAuth (Google), al establecerse la sesión validamos acceso
    this.authSub = this.auth.onAuthStateChange(async (signedIn) => {
      // también comprobamos aquí la marca para evitar race conditions
      if (localStorage.getItem('suppress_auto_home') === '1') {
        console.log('[LOGIN] authStateChange suppressed due to registration flow');
        localStorage.removeItem('suppress_auto_home');
        return;
      }
      if (signedIn) {
        try {
          await this.oauthPostValidation();
        } catch { }
      }
    });
    // Si ya hay sesión al cargar (p.ej. web tras redirect), validamos
    supabase.auth.getSession().then(async ({ data }) => {
      if (data?.session) {
        try { await this.oauthPostValidation(); } catch { }
      }
    });
  }

  ngOnDestroy(): void {
    try { this.authSub?.data?.subscription?.unsubscribe?.(); } catch { }
    try { this.authSub?.subscription?.unsubscribe?.(); } catch { }
  }

  async signInWithGoogle() {
    if (this.loading) return;
    this.errorMsg = '';
    this.loading = true;
    await this.spinner.show();

    try {
      if (Capacitor.isNativePlatform() && environment.googleWebClientId) {
        await this.auth.signInWithGoogleNative();
        // No hay redirect; onAuthStateChange y/o chequeo de sesión disparan la validación
        await this.oauthPostValidation();
      } else {
        await this.auth.signInWithProvider('google');
        // Web: redirige y vuelve; la validación se maneja al volver
      }
    } catch (e: any) {
      try { await Haptics.vibrate({ duration: 300 }); } catch { }
      this.errorMsg = e?.message ?? 'No se pudo iniciar sesión con Google';
      const t = await this.toastCtrl.create({
        message: `${this.errorMsg}`,
        duration: 2400,
        position: 'top',
        color: 'danger'
      });
      await t.present();
    } finally {
      await this.spinner.hide();
      this.loading = false;
    }
  }

  /* ===== Eventos de UI ===== */
  togglePwd() { this.showPwd = !this.showPwd; }

  onPwdKeydown(ev: KeyboardEvent) {
    try {
      this.capsLockOn = !!ev.getModifierState?.('CapsLock');
    } catch { this.capsLockOn = false; }
  }

  onPasswordInput() {
    this.computeStrength(this.password);
  }

  /* ===== Presets ===== */
  async quickFill(key: PresetKey, form: NgForm) {
    if (this.loading) return;
    const p = this.presets.find(x => x.key === key);
    if (!p) return;

    this.email = p.email;
    this.password = p.password;
    this.computeStrength(this.password);

    setTimeout(() => {
      form.control.updateValueAndValidity();
      form.controls['email']?.markAsTouched();
      form.controls['password']?.markAsTouched?.();
    }, 0);

    try { await Haptics.impact({ style: 'Light' as any }); } catch { }
    // 👇 Solo autocomplete: NO se dispara el submit acá
  }

  /* ===== Helpers ===== */
  private shortenEmail(email: string): string {
    const [user, domain] = email.split('@');
    return domain ? `${user}@…` : email;
  }

  private computeStrength(pwd: string) {
    if (!pwd) {
      this.strengthValue = 0;
      this.strengthLabel = '';
      this.strengthColor = 'medium';
      return;
    }

    const lengthScore = Math.min(pwd.length / 12, 1);
    let variety = 0;
    if (/[a-z]/.test(pwd)) variety++;
    if (/[A-Z]/.test(pwd)) variety++;
    if (/[0-9]/.test(pwd)) variety++;
    if (/[^A-Za-z0-9]/.test(pwd)) variety++;
    const varietyScore = variety / 4;

    const score = Math.min(1, (lengthScore * 0.6 + varietyScore * 0.4));
    this.strengthValue = score;

    if (score < 0.35) {
      this.strengthLabel = 'Débil';
      this.strengthColor = 'danger';
    } else if (score < 0.7) {
      this.strengthLabel = 'Media';
      this.strengthColor = 'warning';
    } else {
      this.strengthLabel = 'Fuerte';
      this.strengthColor = 'success';
    }
  }

  /* ===== Submit ===== */
  async onSubmit(form: NgForm) {
    if (this.loading || !form.valid) return;
    this.errorMsg = '';
    this.loading = true;
    await this.spinner.show();

    try {
      // 1) Autenticación con AuthService
      const user = await this.auth.signIn(this.email.trim(), this.password);
      if (!user?.id) throw new Error('No se pudo iniciar sesión');

      const authUserId: string = user.id;
      const authEmail: string = (user.email ?? this.email).trim().toLowerCase();

      // helper: "single o null" con manejo de PGRST116 (no rows)
      async function singleOrNull<T>(q: any): Promise<T | null> {
        const { data, error } = await q.limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        return (data && Array.isArray(data) && data.length) ? data[0] as T : null;
      }

      // 2) Cliente por auth_user_id (con estado)
      type ClienteRow = { estado: 'pendiente' | 'aprobado' | 'rechazado' };
      const cliente = await singleOrNull<ClienteRow>(
        supabase.from('menuya_clientes')
          .select('estado')
          .eq('auth_user_id', authUserId)
      );

      // 3) Empleado por auth_id (FK a auth.users) o fallback por email
      //    Esquema de tu tabla:
      //    id, auth_id, nombre, apellido, dni, cuil, email, rol, foto, created_at
      type EmpleadoRow = { auth_id: string | null, email: string, rol: string };
      let empleado = await singleOrNull<EmpleadoRow>(
        supabase.from('menuya_empleados')
          .select('auth_id, email, rol')
          .eq('auth_id', authUserId)
      );

      if (!empleado) {
        // Si todavía no seteaste auth_id, intentá por email (case-insensitive)
        empleado = await singleOrNull<EmpleadoRow>(
          supabase.from('menuya_empleados')
            .select('auth_id, email, rol')
            .ilike('email', authEmail)
        );

        // 👇 IMPORTANTE: si lo encontraste por email, persistí el auth_id
        if (empleado) {
          try {
            await supabase.from('menuya_empleados')
              .update({ auth_id: authUserId })
              .ilike('email', authEmail);

            // reflejar en memoria
            empleado.auth_id = authUserId;
          } catch {
            // podés loguear si querés
          }
        }
      }


      // 4) Reglas de acceso
      // - Cliente: solo si estado = 'aprobado'
      // - Empleado: alcanza con que exista un registro (no hay columna "estado")
      let allow = false;
      let rejectionMsg = ''; // <-- quitamos el mensaje genérico

      if (cliente) {
        if (cliente.estado === 'aprobado') {
          allow = true;
        } else if (cliente.estado === 'pendiente') {
          rejectionMsg = '⚠️ Tu registro está pendiente de aprobación. Te avisaremos por correo.';
        } else if (cliente.estado === 'rechazado') {
          rejectionMsg = '❌ Tu registro fue rechazado. No podés ingresar.';
        }
      }

      if (!allow && empleado) {
        // Si hay fila en empleados, habilitamos el acceso
        allow = true;
      }

      // Permitir acceso si no hay un motivo explícito de rechazo (antes se rechazaba por no tener perfil)
      if (!allow && !rejectionMsg) {
        allow = true;
      }

      if (!allow && rejectionMsg) {
        await this.auth.signOut();
        this.errorMsg = rejectionMsg;
        const t = await this.toastCtrl.create({
          message: rejectionMsg,
          duration: 2800,
          position: 'top',
          color: rejectionMsg.startsWith('❌') ? 'danger' : 'warning',
        });
        await t.present();
        return;
      }

      // 👇 AQUÍ: usuario validado, registramos push si es empleado
      if (empleado?.rol) {
        await this.pushService.initPush(authUserId, empleado.rol as EmpleadoRol);
      }

      if (this.remember) {
        localStorage.setItem('login_email', this.email.trim());
      } else {
        localStorage.removeItem('login_email');
      }

      try { await Haptics.impact({ style: 'Medium' as any }); } catch { }
      try { await (this.audio as any)?.playOpen?.(); } catch { }

      await this.router.navigateByUrl('/home', { replaceUrl: true });

    } catch (e: any) {
      try { await Haptics.vibrate({ duration: 300 }); } catch { }
      try { await (this.audio as any)?.playClose?.(); } catch { }

      this.errorMsg = e?.message ?? 'Error de autenticación';
      const t = await this.toastCtrl.create({
        message: `❌ ${this.errorMsg}`,
        duration: 2000,
        position: 'top',
        color: 'danger',
      });
      await t.present();
    } finally {
      await this.spinner.hide();
      this.loading = false;
    }
  }

  async logout() {
    try { await this.auth.signOut(); } catch { }
    try { await (this.audio as any)?.playClose?.(); } catch { }
  }

  get strengthLabelClass() {
    return {
      weak: this.strengthColor === 'danger',
      medium: this.strengthColor === 'warning',
      strong: this.strengthColor === 'success',
    };
  }


  async openThemePicker() {
  const sheet = await this.actionSheetCtrl.create({
    header: 'Elegí un tema',
    buttons: [
      {
        text: 'Profesional',
        icon: 'briefcase-outline',
        handler: async () => this.applyTheme('profesional'),
      },
      {
        text: 'Argentina',
        icon: 'flag-outline',
        handler: async () => this.applyTheme('argentina'),
      },
      {
        text: 'Naif',
        icon: 'color-palette-outline',
        handler: async () => this.applyTheme('naif'),
      },
      {
        text: 'Modo oscuro (por defecto)',
        icon: 'moon-outline',
        handler: async () => this.applyTheme('dark'),
      },
      {
        text: 'Modo claro',
        icon: 'sunny-outline',
        handler: async () => this.applyTheme('light'),
      },
      {
        text: 'Custom (configurable)',
        icon: 'construct-outline',
        handler: async () => this.applyTheme('custom'),
      },
      {
        text: 'Cancelar',
        role: 'cancel',
        icon: 'close-outline',
      },
    ],
  });

  await sheet.present();
}

private async applyTheme(id: ThemeId) {
  await this.themeService.setTheme(id);

  const t = await this.toastCtrl.create({
    message: `🎨 Tema aplicado: ${id}`,
    duration: 1300,
    position: 'top',
  });
  await t.present();
}

}
