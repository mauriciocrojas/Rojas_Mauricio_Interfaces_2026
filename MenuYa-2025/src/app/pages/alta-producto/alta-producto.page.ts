import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Producto, ProductoService, DomainError, ProductoRow } from '../../services/servicio-alta-producto';
import { AuthService } from '../../../app/auth.service';
import { SpinnerService } from '../../../app/services/spinner';

@Component({
  selector: 'app-alta-producto',
  templateUrl: './alta-producto.page.html',
  styleUrls: ['./alta-producto.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ReactiveFormsModule],
})
export class AltaProductoPage implements OnInit {
  productoForm!: FormGroup;
  categorias = ['Bebida', 'Comida'];
  submitted = false;
  selectedFiles: File[] = [];
  isSubmitting = false;
  role: string | null = null;  // dueno/supervisor/bartender/cocinero/maitre/cliente/anonimo
  defaultCategoria = '';
  previewUrls: string[] = [];
  private readonly maxFiles = 3;
  productosFiltrados: Array<ProductoRow & { urls_imagenes: string[] }> = [];
  mostrarListado = false;


  constructor(
    private fb: FormBuilder,
    private router: Router,
    private productoService: ProductoService,
    private readonly toastController: ToastController,
    private auth: AuthService,
    private spinner: SpinnerService
  ) {
    this.buildProductoForm('');
  }

  async ngOnInit(): Promise<void> {
    try {
      this.role = await this.auth.getUserRole();
    } catch (error) {
      console.error('No se pudo obtener el rol del usuario', error);
      this.role = null;
    }

    this.defaultCategoria = this.categoriaPorRol(this.role);
    this.productoForm.patchValue({ categoria: this.defaultCategoria });
  }

  private buildProductoForm(categoria: string): void {
    this.productoForm = this.fb.group({
      nombre: [
        '',
        [
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(/^[A-Za-z0-9\s\u00C0-\u017F]+$/),
        ],
      ],
      descripcion: [
        '',
        [
          Validators.required,
          Validators.maxLength(200),
          Validators.pattern(/^[A-Za-z0-9\s\u00C0-\u017F]+$/),
        ],
      ],
      precio: [null, [Validators.required, Validators.min(0)]],
      tiempo: [null, [Validators.required, Validators.min(0)]],
      categoria: [categoria, Validators.required],
    });
  }

  isInvalid(controlName: string): boolean {
    const control = this.productoForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched || this.submitted);
  }

  // async seleccionarFoto(indice: number): Promise<void> {
  //   try {
  //     const image = await Camera.getPhoto({
  //       quality: 90,
  //       allowEditing: false,
  //       resultType: CameraResultType.DataUrl,
  //       source: CameraSource.Prompt,
  //     });

  //     this.fotos[indice] = image.dataUrl ?? '';
  //   } catch (error: any) {
  //     const message = error?.message?.toLowerCase() ?? '';
  //     if (message.includes('user cancelled') || message.includes('user cancelled photos app')) {
  //       return;
  //     }

  //     console.error('Error al obtener la foto:', error);
  //     alert('No se pudo obtener la imagen. Intente nuevamente.');
  //   }
  // }

  private revokePreviews(): void {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls = [];
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const fileList = input?.files;
    if (!fileList) {
      this.selectedFiles = [];
      return;
    }

    const files = Array.from(fileList);
    if (files.length > this.maxFiles) {
      this.selectedFiles = files.slice(0, this.maxFiles);
      await this.presentToast(`Solo puedes seleccionar hasta ${this.maxFiles} imágenes.`, 'warning');
      return;
    }

    this.selectedFiles = files;
    this.revokePreviews();
    this.selectedFiles = files.slice(0, this.maxFiles);
    this.previewUrls = this.selectedFiles.map((file) => URL.createObjectURL(file));
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;

    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      await this.presentToast('Revisá los datos del formulario.', 'danger');
      return;
    }

    if (this.selectedFiles.length > this.maxFiles) {
      await this.presentToast(`Solo puedes subir hasta ${this.maxFiles} imágenes.`, 'danger');
      return;
    }

    const { nombre, descripcion, categoria } = this.productoForm.value;
    const precio = Number(this.productoForm.value.precio);
    const tiempo = Number(this.productoForm.value.tiempo);

    const producto: Producto = {
      nombre: (nombre ?? '').toString(),
      descripcion: (descripcion ?? '').toString(),
      categoria: (categoria ?? '').toString(),
      precio,
      tiempo,
    };

    this.isSubmitting = true;
    await this.spinner.show();
    try {
      await this.productoService.crearProducto(producto, this.selectedFiles);
      await this.presentToast('Producto creado correctamente.', 'success');
      this.productoForm.reset({ categoria: this.defaultCategoria });
      this.revokePreviews();
      this.selectedFiles = [];
      this.submitted = false;
      // await this.cargarProductosFiltrados();
      this.router.navigateByUrl('/carta', { replaceUrl: true });
    } catch (error) {
      const message =
        error instanceof DomainError ? error.message : 'Ocurrió un error al crear el producto.';
      await this.presentToast(message, 'danger');
    } finally {
      this.isSubmitting = false;
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

  private categoriaPorRol(role: string | null): 'Comida' | 'Bebida' | '' {
    if (role === 'cocinero') return 'Comida';
    if (role === 'bartender') return 'Bebida';
    return '';
  }

  // async cargarProductosFiltrados(): Promise<void> {
  //   try {
  //     const categoria = this.categoriaPorRol(this.role);
  //     const todos = await this.productoService.listarProductosConImagenes();
  //     this.productosFiltrados = categoria
  //       ? todos.filter((p) => (p.categoria || '').toLowerCase() === categoria.toLowerCase())
  //       : [];
  //     this.mostrarListado = this.productosFiltrados.length > 0;
  //     if (!this.mostrarListado) {
  //       await this.presentToast('No hay productos para mostrar.', 'warning');
  //     }
  //   } catch (e) {
  //     await this.presentToast('No se pudieron obtener los productos.', 'danger');
  //     this.mostrarListado = false;
  //   }
  // }
}


