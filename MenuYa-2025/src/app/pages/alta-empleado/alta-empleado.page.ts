// src/app/pages/alta-empleado/alta-empleado.page.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { EmpleadoService } from '../../services/servicio-alta-empleado';
import { SpinnerService } from '../../../app/services/spinner';
import { Router } from '@angular/router';

// 🔄 Usamos el MISMO plugin que en el alta de cliente:
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

@Component({
  selector: 'app-alta-empleado',
  templateUrl: './alta-empleado.page.html',
  styleUrls: ['./alta-empleado.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule
  ]
})
export class AltaEmpleadoPage implements OnInit {

  empleadoForm!: FormGroup;
  fotoEmpleado: string | null = null;
  roles = ['maître', 'mozo', 'cocinero', 'bartender', 'delivery'];

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private empleadoService: EmpleadoService,
    private spinner: SpinnerService,
    private toastController: ToastController
  ) { }

  ngOnInit() {
    this.empleadoForm = this.fb.group({
      nombres: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ\s]+$/)]],
      apellidos: ['', [Validators.required, Validators.pattern(/^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ\s]+$/)]],
      dni: ['', [Validators.required, Validators.pattern(/^\d{7,8}$/)]],
      cuil: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rol: ['', [Validators.required]],
    });
  }

  // =========================
  // Cámara
  // =========================
  async tomarFoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      this.fotoEmpleado = image.dataUrl ?? null;
    } catch (err) {
      console.error('Error al tomar foto', err);
      this.fotoEmpleado = null;
      await this.presentToast('No se pudo tomar la foto.', 'warning');
    }
  }

  // =========================
  // LECTURA QR DNI (MISMA LÓGICA QUE REGISTRO)
  // =========================
  async leerQR() {
    try {
      // 1) Permisos
      const perm = await (BarcodeScanner as any).checkPermissions?.();
      if (!perm || perm.camera !== 'granted') {
        const req = await (BarcodeScanner as any).requestPermissions?.();
        if (!req || req.camera !== 'granted') {
          await this.presentToast('Permiso de cámara denegado', 'warning');
          return;
        }
      }

      // 2) Escanear
      const { barcodes } = await (BarcodeScanner as any).scan();
      const raw = barcodes?.[0]?.rawValue ?? '';

      if (!raw) {
        await this.presentToast('No se detectó contenido en el código.', 'warning');
        return;
      }

      // 3) Parseo “inteligente” del DNI argentino (PDF417)
      const parsed = this.parseDniQr(raw);

      // 4) Patch de campos
      const patch: any = {};
      if (parsed.apellidos) patch.apellidos = parsed.apellidos;
      if (parsed.nombres) patch.nombres = parsed.nombres;
      if (parsed.dni) patch.dni = parsed.dni;

      // Intento de autocalcular CUIL si vino sexo + DNI
      if (parsed.dni && parsed.sexo) {
        const cuil = this.tryCalcCuil(parsed.sexo, parsed.dni);
        if (cuil) patch.cuil = cuil;
      }

      this.empleadoForm.patchValue(patch);

      const mostrado = [
        parsed.dni ? `DNI: ${parsed.dni}` : null,
        parsed.apellidos ? `Apellidos: ${parsed.apellidos}` : null,
        parsed.nombres ? `Nombres: ${parsed.nombres}` : null
      ].filter(Boolean).join(' • ');

      await this.presentToast(mostrado || 'QR leído', 'success');

    } catch (err) {
      console.error('Error al escanear QR:', err);
      await this.presentToast('No se pudo escanear el QR', 'danger');
    }
  }

  /**
   * Intenta parsear el QR del DNI (PDF417) en sus distintos formatos.
   * Devuelve apellidos, nombres, dni y (si se puede) sexo.
   *
   * Notas:
   * - Hay DNIs con separador '@' (muy común): "XXXXXXXX@APELLIDO@NOMBRES@SEXO@..."
   * - Otros devuelven una “línea larga” donde igualmente se pueden extraer números y mayúsculas.
   * - Fallback: si no encontramos nombres, al menos extraemos DNI de 7-8 dígitos.
   */
  private parseDniQr(raw: string): { apellidos?: string; nombres?: string; dni?: string; sexo?: 'M'|'F' } {
    const limpio = (raw || '').trim();

    // 1) Formato común con '@'
    if (limpio.includes('@')) {
      const parts = limpio.split('@').map(p => (p || '').trim());
      // Heurística: buscamos primera ocurrencia de 7/8 dígitos como DNI
      const dni = this.findDni(limpio);

      // En muchos QR con '@': [0]=DNI, [1]=APELLIDO(S), [2]=NOMBRE(S), [3]=SEXO (M/F)
      let apellidos = '';
      let nombres = '';
      let sexo: 'M'|'F' | undefined;

      // Si parts[1] y parts[2] parecen ser texto, los tomamos
      if (parts[1] && /[A-Za-zÁÉÍÓÚÜÑ]/.test(parts[1])) apellidos = this.toTitle(parts[1]);
      if (parts[2] && /[A-Za-zÁÉÍÓÚÜÑ]/.test(parts[2])) nombres = this.toTitle(parts[2]);

      // Sexo en parts[3] (a veces más adelante)
      const sexIdx = parts.findIndex(p => /^[MF]$/.test(p));
      if (sexIdx >= 0) sexo = parts[sexIdx] as 'M'|'F';

      return {
        apellidos: apellidos || undefined,
        nombres: nombres || undefined,
        dni: dni || undefined,
        sexo
      };
    }

    // 2) Si no hay '@', probamos extraer DNI y posibles nombres en mayúsculas
    const dni = this.findDni(limpio);

    // Heurística mínima para nombres/apellidos en mayúsculas separados por espacio
    // (si viene algo tipo "ROJAS MAURICIO 12345678 M")
    let apellidos: string | undefined;
    let nombres: string | undefined;
    let sexo: 'M'|'F' | undefined;

    const tokens = limpio.split(/[\s|,;]+/).filter(Boolean);
    // Buscamos sexo
    const sIdx = tokens.findIndex(t => /^[MF]$/.test(t));
    if (sIdx >= 0) sexo = tokens[sIdx] as 'M'|'F';

    // Tomamos primer bloque de letras como apellido y el siguiente como nombres
    const letters = tokens.filter(t => /^[A-ZÁÉÍÓÚÜÑ]+$/.test(t));
    if (letters.length >= 2) {
      apellidos = this.toTitle(letters[0]);
      nombres = this.toTitle(letters.slice(1).join(' '));
    }

    return { apellidos, nombres, dni, sexo };
  }

  private findDni(text: string): string | undefined {
    // 1) “solo dígitos” en toda la tira
    const onlyDigits = text.replace(/\D/g, '');
    if (/^\d{7,8}$/.test(onlyDigits)) return onlyDigits;

    // 2) primer match aislado de 7 u 8 dígitos
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

  /**
   * Intenta calcular el CUIL a partir de sexo ('M'|'F') y DNI.
   * Regla simple:
   *  - M -> prefijo 20
   *  - F -> prefijo 27
   *  - Dígito verificador con algoritmo estándar.
   * (Si algo no cierra, devuelve null)
   */
  private tryCalcCuil(sexo: 'M'|'F', dni: string): string | null {
    if (!/^\d{7,8}$/.test(dni)) return null;
    const pref = sexo === 'F' ? '27' : '20';
    const base = pref + dni.padStart(8, '0');
    const dv = this.calcCuitDv(base);
    if (dv == null) return null;
    return base + dv;
  }

  /**
   * Cálculo del dígito verificador de CUIT/CUIL.
   * Ponderadores: 5 4 3 2 7 6 5 4 3 2
   */
  private calcCuitDv(base10: string): number | null {
    if (!/^\d{10}$/.test(base10)) return null;
    const pesos = [5,4,3,2,7,6,5,4,3,2];
    const sum = base10.split('').reduce((acc, d, i) => acc + parseInt(d, 10) * pesos[i], 0);
    const resto = sum % 11;
    let dv = 11 - resto;
    if (dv === 11) dv = 0;
    if (dv === 10) {
      // Caso especial: debería cambiar prefijo a 23 y recalcular,
      // pero para no complicar, devolvemos null (o podríamos intentar el 23).
      return null;
    }
    return dv;
  }

  // =========================
  // Validaciones helpers
  // =========================
  isInvalid(campo: string) {
    const control = this.empleadoForm.get(campo);
    return control?.invalid && (control.dirty || control.touched);
  }

  // =========================
  // Submit
  // =========================
  async onSubmit() {
    if (this.empleadoForm.invalid || !this.fotoEmpleado) {
      this.empleadoForm.markAllAsTouched();
      await this.presentToast('Revisá los datos requeridos y la foto.', 'warning');
      return;
    }

    const empleadoData = { ...this.empleadoForm.value, foto: this.fotoEmpleado };

    try {
      await this.spinner.show();
      await this.empleadoService.registrarEmpleado(empleadoData);
      await this.presentToast('Empleado registrado correctamente ✅', 'success');
      this.empleadoForm.reset();
      this.fotoEmpleado = null;
    } catch (err: any) {
      console.error('Error registrando empleado:', err);
      await this.presentToast('Ocurrió un error al registrar el empleado.', 'danger');
    } finally {
      await this.spinner.hide();
    }
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      color,
      duration: 3000,
      position: 'top',
    });
    await toast.present();
  }
}
