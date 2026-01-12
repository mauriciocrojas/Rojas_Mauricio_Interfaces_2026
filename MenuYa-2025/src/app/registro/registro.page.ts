// src/app/registro/registro.page.ts
import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController, Platform, AlertController } from '@ionic/angular';
import { AuthService } from '../auth.service';
import { supabase } from '../supabase.client';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { PushNotificationService } from '../services/push-notification.service';
import { SpinnerService } from '../services/spinner';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: false
})
export class RegistroPage implements OnInit {
  // Modo
  anonMode = false;

  // Form (modo completo)
  perfil: 'cliente' | 'maitre' | '' = '' as any;
  nombres = '';
  apellidos = '';
  dni = '';
  email = '';
  password = '';
  password2 = '';

  // Form (modo anónimo)
  nombreAnon = '';

  // UI state
  loading = false;
  errorMsg = '';
  showPwd = false;
  showPwd2 = false;
  passwordsMatch = false;
  confirmTouched = false;
  emailTaken = false;
  fotoTouched = false;

  // Foto
  fotoPreview: string | null = null; // dataURL
  fotoBlob: Blob | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private platform: Platform,
    private pushNotificationService: PushNotificationService,
    private spinner: SpinnerService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const anon = params.get('anonimo') ?? params.get('anon');
      if (anon === '1' || anon === 'true') {
        this.setAnonMode(true);
      } else if (anon === '0' || anon === 'false') {
        this.setAnonMode(false);
      }
    });
  }

  // ---- Modo ----
  toggleAnon() {
    this.anonMode = !this.anonMode;
    this.resetModeState();
  }

  private setAnonMode(value: boolean) {
    if (this.anonMode === value) return;
    this.anonMode = value;
    this.resetModeState();
  }

  private resetModeState() {
    // Limpieza mínima para evitar validaciones cruzadas
    this.errorMsg = '';
    this.emailTaken = false;
    this.password = '';
    this.password2 = '';
    this.passwordsMatch = false;
    this.confirmTouched = false;
    this.nombres = this.apellidos = this.dni = this.email = '';
  }

  // ---- Helpers UI ----
  togglePwd()  { this.showPwd  = !this.showPwd; }
  togglePwd2() { this.showPwd2 = !this.showPwd2; }

  copyPwdToConfirm() {
    this.password2 = this.password;
    this.confirmTouched = true;
    this.checkMatch();
  }

  checkMatch() {
    this.passwordsMatch = !!this.password && !!this.password2 && this.password === this.password2;
  }

  trimSpaces(field: 'nombres'|'apellidos') {
    this[field] = this[field].replace(/\s+/g, ' ').trimStart();
  }

  // ---- Cámara ----
  async tomarFoto() {
    await this.spinner.show();
    try {
      this.fotoTouched = true;
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        quality: 80,
        allowEditing: false,
        saveToGallery: false
      });
      this.fotoPreview = photo.dataUrl || null;
      if (this.fotoPreview) {
        const res = await fetch(this.fotoPreview);
        this.fotoBlob = await res.blob();
      }
    } catch (err) {
      console.error('Error al tomar foto', err);
      this.fotoPreview = null;
      this.fotoBlob = null;
      const t = await this.toastCtrl.create({
        message: 'No se pudo tomar la foto.',
        duration: 2200, position: 'top', color: 'warning'
      });
      t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  borrarFoto() {
    this.fotoPreview = null;
    this.fotoBlob = null;
  }

  // =========================================
  // QR DNI (modo completo): AUTOCOMPLETE DNI + APELLIDOS + NOMBRES
  // =========================================
  async leerQR() {
    await this.spinner.show();
    try {
      if (this.anonMode) {
        const t = await this.toastCtrl.create({
          message: 'La lectura de DNI aplica al registro completo.',
          duration: 1800, position: 'top', color: 'warning'
        });
        t.present();
        return;
      }

      const perm = await (BarcodeScanner as any).checkPermissions?.();
      if (!perm || perm.camera !== 'granted') {
        const req = await (BarcodeScanner as any).requestPermissions?.();
        if (!req || req.camera !== 'granted') {
          const t = await this.toastCtrl.create({
            message: 'Permiso de cámara denegado',
            duration: 2000, position: 'top', color: 'warning'
          });
          t.present();
          return;
        }
      }

      const { barcodes } = await (BarcodeScanner as any).scan();
      const raw = barcodes?.[0]?.rawValue ?? '';

      if (!raw) {
        const t = await this.toastCtrl.create({
          message: 'No se detectó contenido en el código.',
          duration: 2000, position: 'top', color: 'warning'
        });
        t.present();
        return;
      }

      const parsed = this.parseDniQr(raw);

      // Patch de campos
      if (parsed.dni) this.dni = parsed.dni;
      if (parsed.apellidos) this.apellidos = parsed.apellidos;
      if (parsed.nombres) this.nombres = parsed.nombres;

      const mostrado = [
        parsed.dni ? `DNI: ${parsed.dni}` : null,
        parsed.apellidos ? `Apellidos: ${parsed.apellidos}` : null,
        parsed.nombres ? `Nombres: ${parsed.nombres}` : null
      ].filter(Boolean).join(' • ');

      const t = await this.toastCtrl.create({
        message: mostrado || 'QR leído',
        duration: 2200, position: 'top', color: 'success'
      });
      t.present();

    } catch (err) {
      console.error('Error al escanear QR:', err);
      const t = await this.toastCtrl.create({
        message: 'No se pudo escanear el QR',
        duration: 2000, position: 'top', color: 'danger'
      });
      t.present();
    } finally {
      await this.spinner.hide();
    }
  }

  /**
   * Parser robusto de QR DNI (PDF417) para extraer apellidos, nombres y DNI.
   * Maneja formato con '@' y fallback sin separadores claros.
   */
  private parseDniQr(raw: string): { apellidos?: string; nombres?: string; dni?: string; sexo?: 'M'|'F' } {
    const limpio = (raw || '').trim();

    // Caso común con '@': "XXXXXXXX@APELLIDO(S)@NOMBRE(S)@SEXO@..."
    if (limpio.includes('@')) {
      const parts = limpio.split('@').map(p => (p || '').trim());
      const dni = this.findDni(limpio);

      let apellidos = '';
      let nombres = '';
      let sexo: 'M'|'F' | undefined;

      if (parts[1] && /[A-Za-zÁÉÍÓÚÜÑ]/.test(parts[1])) apellidos = this.toTitle(parts[1]);
      if (parts[2] && /[A-Za-zÁÉÍÓÚÜÑ]/.test(parts[2])) nombres = this.toTitle(parts[2]);

      const sexIdx = parts.findIndex(p => /^[MF]$/.test(p));
      if (sexIdx >= 0) sexo = parts[sexIdx] as 'M'|'F';

      return {
        apellidos: apellidos || undefined,
        nombres: nombres || undefined,
        dni: dni || undefined,
        sexo
      };
    }

    // Fallback: intentar extraer DNI y nombres en mayúsculas
    const dni = this.findDni(limpio);

    let apellidos: string | undefined;
    let nombres: string | undefined;
    let sexo: 'M'|'F' | undefined;

    const tokens = limpio.split(/[\s|,;]+/).filter(Boolean);
    const sIdx = tokens.findIndex(t => /^[MF]$/.test(t));
    if (sIdx >= 0) sexo = tokens[sIdx] as 'M'|'F';

    const letters = tokens.filter(t => /^[A-ZÁÉÍÓÚÜÑ]+$/.test(t));
    if (letters.length >= 2) {
      apellidos = this.toTitle(letters[0]);
      nombres = this.toTitle(letters.slice(1).join(' '));
    }

    return { apellidos, nombres, dni, sexo };
  }

  private findDni(text: string): string | undefined {
    const onlyDigits = text.replace(/\D/g, '');
    if (/^\d{7,8}$/.test(onlyDigits)) return onlyDigits;
    const m = text.match(/\b(\d{7,8})\b/);
    if (m) return m[1];
    return undefined;
  }

  private toTitle(s: string): string {
    return s
      .toLowerCase()
      .replace(/\b([a-záéíóúüñ])/g, (m) => m.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  // =========================
  // Helpers anónimo (sin Auth)
  // =========================
  private safeUUID() {
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        // @ts-ignore
        return crypto.randomUUID();
      }
    } catch {}
    const rnd = Math.random().toString(36).slice(2, 10);
    return `r${Date.now().toString(36)}${rnd}`;
  }

  private randomDni8() {
    // Genera 8 dígitos (>= 10_000_000) para no parecer de 7
    const n = Math.floor(10000000 + Math.random() * 90000000);
    return String(n);
  }

  // ---- Submit ----
  async onSubmit(form: NgForm) {
    if (this.loading || !form.valid || !this.fotoBlob) return;

    this.errorMsg = '';
    this.loading = true;

    try {
      if (this.anonMode) {
        await this.submitAnonimo();
      } else {
        await this.submitCompleto();
      }
    } catch (e: any) {
      console.error(e);
      if (e && e.message && e.message.includes('already registered')) {
        this.errorMsg = 'El email ya está registrado';
      }
      this.errorMsg = e?.message ?? 'Error al crear la cuenta';
      const t = await this.toastCtrl.create({
        message: `❌ ${this.errorMsg}`,
        duration: 2600, position: 'top', color: 'danger'
      });
      await t.present();
    } finally {
      this.loading = false;
    }
  }

  // ---- Flujo COMPLETO (registrado)
  private async submitCompleto() {
    await this.spinner.show();
    try {
      // Validaciones extra
      if (!['cliente','maitre'].includes(this.perfil)) throw new Error('Perfil inválido');
      if (!/^\d{7,8}$/.test((this.dni || '').trim())) throw new Error('DNI inválido');
      if (!this.passwordsMatch) throw new Error('Las claves no coinciden');

      const normalizedEmail = this.email.trim().toLowerCase();

      // <-- NUEVO: evitar que la app haga redirect automático a /home
      localStorage.setItem('suppress_auto_home', '1');

      // 1) Crear usuario Auth directamente con Supabase (sin navegar a /home)
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: this.password
      });
      if (signUpErr) {
        // limpiar marca si falla
        localStorage.removeItem('suppress_auto_home');
        throw signUpErr;
      }

      const authUserId = signUpData.user?.id;
      if (!authUserId) {
        localStorage.removeItem('suppress_auto_home');
        throw new Error('No se pudo crear el usuario');
      }

      // <-- forzar signOut inmediatamente para evitar que quede sesión activa
      try {
        await this.auth.signOut();
      } catch (err) {
        console.warn('No se pudo cerrar la sesión inmediatamente tras signUp:', err);
      }

      // 2) Subir foto
      const ext = this.fotoBlob!.type.includes('png') ? 'png' : 'jpg';
      const path = `${authUserId}/perfil.${ext}`;
      const { error: upErr } = await supabase.storage.from('clientes-fotos')
        .upload(path, this.fotoBlob!, { contentType: this.fotoBlob!.type, upsert: true });
      if (upErr) {
        localStorage.removeItem('suppress_auto_home');
        throw upErr;
      }

      const { data: publicUrl } = supabase.storage.from('clientes-fotos').getPublicUrl(path);
      const foto_url = publicUrl.publicUrl;

      // 3) Insert tabla (pendiente)
      const { error: insErr } = await supabase.from('menuya_clientes').insert({
        auth_user_id: authUserId,
        nombres: this.nombres.trim(),
        apellidos: this.apellidos.trim(),
        dni: this.dni.trim(),
        email: normalizedEmail,
        rol: this.perfil,
        foto_url,
        estado: 'pendiente'
      });
      if (insErr) {
        localStorage.removeItem('suppress_auto_home');
        throw insErr;
      }

      // ---- NOTIFICACIÓN ----
      try {
        if (this.perfil === 'maitre') {
          await this.auth.notifyTargets({
            roles: ['dueno', 'supervisor'],
            title: 'Nuevo empleado registrado',
            body: `${this.nombres.trim()} ${this.apellidos.trim()}`,
          });
          console.log('Notificación enviada a dueños/supervisores');

          this.pushNotificationService.sendNotificationToRole({
            role: 'dueño',
            title: 'Nuevo empleado registrado',
            body: `${this.nombres.trim()} ${this.apellidos.trim()}`,
            data: { tipo: 'nuevo_empleado' }
          });
        } else {
          this.pushNotificationService.sendNotificationToRole({
            role: 'dueño',
            title: 'Nuevo cliente registrado: Gestionar aprobación',
            body: `${this.nombres.trim()} ${this.apellidos.trim()}`,
            data: { tipo: 'nuevo_cliente' }
          });
          // Para clientes ya existe la notificación de "nuevo cliente" en el backend
          // console.log('Registro de cliente: se omite notificación de empleado.');
        }
      } catch (err) {
        console.error('Error enviando notificación:', err);
      }

      const t = await this.toastCtrl.create({
        message: '✅ Registro enviado. Queda "pendiente de aprobación".',
        duration: 3000, position: 'top'
      });
      await t.present();

      // Quitamos la marca y dejamos al usuario en login (sin flash a /home)
      localStorage.removeItem('suppress_auto_home');
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  // ---- Flujo ANÓNIMO (ajustado para Preferences)
  private async submitAnonimo() {
    await this.spinner.show();
    try {
      const nombre = this.nombreAnon.trim();
      if (!nombre) throw new Error('Ingresá tu nombre');
      if (!this.fotoBlob) throw new Error('Falta la foto');

      // 1) Identificador local anónimo (para carpeta y tracking local)
      const anonId = this.safeUUID();

      // 2) Subir foto a carpeta de anónimos
      const ext = this.fotoBlob!.type.includes('png') ? 'png' : 'jpg';
      const path = `anon/${anonId}/perfil.${ext}`;
      const { error: upErr } = await supabase.storage.from('clientes-fotos')
        .upload(path, this.fotoBlob!, { contentType: this.fotoBlob!.type, upsert: true });
      if (upErr) throw upErr;

      const { data: publicUrl } = supabase.storage.from('clientes-fotos').getPublicUrl(path);
      const foto_url = publicUrl.publicUrl;

      // 3) DNI sintético (evitar colisión básica)
      let dniSynth = this.randomDni8();
      for (let i = 0; i < 5; i++) {
        const { count, error: selErr } = await supabase
          .from('menuya_clientes')
          .select('id', { count: 'exact', head: true })
          .eq('dni', dniSynth);
        if (selErr) break;
        if ((count ?? 0) > 0) {
          dniSynth = this.randomDni8();
        } else {
          break;
        }
      }

      // 4) Insert directo como APROBADO con email/auth_user_id = null
      const { data: inserted, error: insErr } = await supabase
        .from('menuya_clientes')
        .insert({
          auth_user_id: null,
          nombres: nombre,
          apellidos: '-',
          dni: dniSynth,
          email: null,
          rol: 'anonimo',
          foto_url,
          estado: 'aprobado'
        })
        .select('id')
        .single();

      if (insErr) {
        // limpieza de archivo si falló el insert
        await supabase.storage.from('clientes-fotos').remove([path]).catch(() => {});
        throw insErr;
      }

      // 5) Guardar “anon info” en Preferences (lo que Home lee)
      await this.auth.setAnonInfo({ name: nombre, avatar: foto_url });

      // (opcional) seguir guardando tu sesión extendida en localStorage
      try {
        const payload = {
          anon: true,
          anonId,
          idCliente: inserted?.id ?? null,
          nombre,
          foto_url: foto_url
        };
        localStorage.setItem('menuya_anon_session', JSON.stringify(payload));
      } catch {}
      await this.pushNotificationService.initPush(String(inserted?.id ?? null), 'anonimo');

      // 6) Toast y navegar
      const t = await this.toastCtrl.create({
        message: '✅ Entraste como cliente anónimo.',
        duration: 2600, position: 'top'
      });
      await t.present();

      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }
}
