import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../../app/auth.service';
import { SpinnerService } from '../../../app/services/spinner';
import {
  ProductoService,
  ProductoRow,
  ProductoConUrls
} from '../../services/servicio-alta-producto';

@Component({
  selector: 'app-carta',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // 👈 NECESARIO para usar swiper-*
  templateUrl: './carta.page.html',
  styleUrls: ['./carta.page.scss'],
})
export class CartaPage implements OnInit {

  role: string | null = null;
  defaultCategoria: 'Comida' | 'Bebida' | '' = '';
  isLoading = false;

  productosFiltrados: ProductoConUrls[] = [];

  // 🔴 NUEVO: para desuscribirnos
  private productosSub?: Subscription;

  constructor(
    private authService: AuthService,
    private spinnerService: SpinnerService,
    private router: Router,
    private toastController: ToastController,
    private productoService: ProductoService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    await this.spinnerService.show();

    try {
      this.role = await this.authService.getUserRole();
      this.defaultCategoria = this.categoriaPorRol(this.role);

      if (!this.defaultCategoria) {
        this.productosFiltrados = [];
        return;
      }

      // 🔴 NUEVO: suscripción en tiempo real
      this.productosSub = this.productoService
        .observarProductosPorCategoria(this.defaultCategoria)
        .subscribe({
          next: (productos) => {
            this.productosFiltrados = productos;
            if (this.isLoading) {
              this.isLoading = false;
              this.spinnerService.hide().catch(() => {});
            }
          },
          error: async (err) => {
            console.error('[CartaPage] Error al observar productos', err);
            await this.mostrarErrorToast('No se pudo cargar la carta. Intenta nuevamente.');
            if (this.isLoading) {
              this.isLoading = false;
              await this.spinnerService.hide();
            }
          }
        });
    } catch (error) {
      console.error('No se pudo obtener el rol del usuario o configurar la carta', error);
      this.role = null;
      this.defaultCategoria = '';
      await this.mostrarErrorToast('No se pudo cargar la carta. Intenta nuevamente.');
    } finally {
      // Si no hay categoría, cerramos spinner acá
      if (!this.defaultCategoria) {
        this.isLoading = false;
        await this.spinnerService.hide();
      }
    }
  }

  // 🔴 NUEVO: evitar memory leaks
  ngOnDestroy(): void {
    this.productosSub?.unsubscribe();
  }

  // private async cargarCarta(): Promise<void> {
  //   if (!this.defaultCategoria) {
  //     this.productosFiltrados = [];
  //     return;
  //   }

  //   this.productosFiltrados =
  //     await this.productoService.listarProductosPorCategoria(this.defaultCategoria);
  // }

  private categoriaPorRol(role: string | null): 'Comida' | 'Bebida' | '' {
    if (role === 'cocinero') return 'Comida';
    if (role === 'bartender') return 'Bebida';
    return '';
  }

  async goHome(): Promise<void> {
    await this.spinnerService.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinnerService.hide().catch(() => {});
    }
  }

  prettyNombre(nombre: string | null | undefined): string {
    const safe = (nombre ?? '').replace(/_/g, ' ');
    return safe
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  trackByProducto(index: number, item: ProductoRow & { urls_imagenes: string[] }): any {
    return (item as any).id ?? item.nombre ?? index;
  }

  private async mostrarErrorToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
