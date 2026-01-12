import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Mesa, MesaService } from '../../services/servicio-mesa';
import { SpinnerService } from '../../../app/services/spinner';
import { QrService } from '../../../app/services/qr.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-alta-mesa',
  templateUrl: './alta-mesa.page.html',
  styleUrls: ['./alta-mesa.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
})
export class AltaMesaPage implements OnInit {
  mesaForm!: FormGroup;
  tipo = ['VIP', 'Estándar'];
  selectedFile?: File;
  foto: string | null = null;
  previewUrl?: string; // para vista previa
  submitted = false;

  constructor(private fb: FormBuilder, private router: Router, private mesaService: MesaService, 
    private readonly toastController: ToastController, private spinner: SpinnerService, private qrService: QrService) {}

  async ngOnInit(): Promise<void> {
    this.mesaForm = this.fb.group({
      numero_mesa: [null, [Validators.required, Validators.min(1)]],
      cantidad_comensales: [null, [Validators.required, Validators.min(1)]],
      tipo: ['Estándar', Validators.required]
    });
  }

  isInvalid(controlName: string): boolean {
    const control = this.mesaForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched || this.submitted);
  }

  // Manejar selección de archivo + preview
  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.clearImage();
      return;
    }

    const file = input.files[0];
    // No validamos acá: el servicio ya valida tipo/tamaño y mostrará el error
    this.selectedFile = file;

    // Preview
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
  }

  clearImage() {
    this.selectedFile = undefined;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = undefined;
    }
  }

  async tomarFoto() {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    });
    this.foto = image.webPath ?? null;
    if (image.webPath) {
      const res = await fetch(image.webPath);
      const blob = await res.blob();
      this.selectedFile = new File([blob], `mesa-${Date.now()}.jpg`, {
        type: blob.type || 'image/jpeg',
      });
    } else {
      this.selectedFile = undefined;
    }
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;

    if (this.mesaForm.invalid) {
      this.mesaForm.markAllAsTouched();
      await this.presentToast('Revisá los datos del formulario.', 'danger');
      return;
    }

    // Generar el QR de la mesa y adjuntarlo al payload
    let payload: Omit<Mesa, 'foto' | 'bucket_imagenes'>;

    try {
      await this.spinner.show();
      const codigoQr = await this.qrService.generarQrMesa(this.mesaForm.value.numero_mesa);
      payload = {
        numero_mesa: Number(this.mesaForm.value.numero_mesa),
        cantidad_comensales: Number(this.mesaForm.value.cantidad_comensales),
        tipo: String(this.mesaForm.value.tipo),
        disponible: true,
        codigo_qr: codigoQr,
      } as Omit<Mesa, 'foto' | 'bucket_imagenes'>;
      const mesaCreada = await this.mesaService.crearMesa(payload, this.selectedFile);
      console.log('Mesa registrada:', mesaCreada);
      await this.presentToast('Mesa registrada correctamente ✅', 'success');

      this.mesaForm.reset();
      this.foto = null;
      this.submitted = false;
      this.router.navigateByUrl('/estado-mesas', { replaceUrl: true });
    } catch (error: any) {
      await this.presentToast(error?.message || 'Error al registrar la mesa.', 'danger');
      this.clearImage();
    } finally {
      // Pase lo que pase, cerramos el overlay
      await this.spinner.hide();
    }
  }

  async goHome(): Promise<void> {
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
