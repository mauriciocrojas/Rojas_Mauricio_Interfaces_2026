import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { CuentaRow, CuentaItem } from '../../services/cuenta.service';

@Component({
  selector: 'app-confirmar-pago-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  template: `
  <ion-header>
    <ion-toolbar>
      <ion-title>Confirmar Pago</ion-title>
      <ion-buttons slot="end">
        <ion-button (click)="cancelar()" aria-label="Cerrar">
          <ion-icon name="close-outline" slot="icon-only"></ion-icon>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding ion-no-scroll ion-text-wrap ion-text-center">
    <ion-list lines="none">
      <ion-list-header>
        <ion-label>
          <strong>Mesa: {{ mesaNumero }}</strong>
        </ion-label>
        <ion-label>
          <strong>Cliente: {{ nombre }}</strong>
        </ion-label>
      </ion-list-header>

      <ng-container *ngIf="items?.length; else sinItems">
        <ion-item *ngFor="let it of items">
          <ion-label>
            {{ it.cantidad }} x {{ it.nombre }}
            <p>Precio: \${{ it.precio_unitario | number:'1.2-2' }}</p>
          </ion-label>
          <ion-note slot="end">\${{ it.importe | number:'1.2-2' }}</ion-note>
        </ion-item>
      </ng-container>
      <ng-template #sinItems>
        <ion-item>
          <ion-label>Sin ítems</ion-label>
        </ion-item>
      </ng-template>
    </ion-list>

    <ion-list class="resumen" lines="none">
      <ion-item>
        <ion-label>Subtotal</ion-label>
        <ion-note slot="end">\${{ cuenta.subtotal | number:'1.2-2' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label>Descuento</ion-label>
        <ion-note slot="end">-\${{ cuenta.descuento_juego | number:'1.2-2' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label>Propina ({{ cuenta.propina_pct }}%)</ion-label>
        <ion-note slot="end">\${{ cuenta.propina_monto | number:'1.2-2' }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label><strong>Total</strong></ion-label>
        <ion-note slot="end"><strong>\${{ cuenta.total_final | number:'1.2-2' }}</strong></ion-note>
      </ion-item>
    </ion-list>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button fill="outline" color="medium" (click)="cancelar()">Cancelar</ion-button>
      </ion-buttons>
      <ion-buttons slot="end">
        <ion-button color="success" (click)="confirmar()">Confirmar</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-content>
  `,
  styles: [`
    ion-note {
      font-size: 25px
    }
    ion-list.resumen {
      margin-top: 8px;
      border-top: 1px solid var(--ion-color-step-200, #eaeaea);
    }
  `]
})
export class ConfirmarPagoModalComponent {
  @Input() cuenta!: CuentaRow;
  @Input() mesaNumero!: number;
  @Input() nombre!: string;

  constructor(private modalCtrl: ModalController) {}

  get items(): CuentaItem[] {
    const arr = (this.cuenta.pedidos ?? []) as CuentaItem[];
    return Array.isArray(arr) ? arr : [];
  }

  cancelar() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirmar() {
    this.modalCtrl.dismiss(true, 'confirm');
  }
}

