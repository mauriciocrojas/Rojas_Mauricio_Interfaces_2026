import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class SpinnerService {
  private loading?: HTMLIonLoadingElement;

  constructor(private loadingCtrl: LoadingController) {}

  async show(): Promise<void> {
    if (this.loading) return;

    this.loading = await this.loadingCtrl.create({
      spinner: null,            // sin spinner nativo
      backdropDismiss: false,
      translucent: true,
      animated: true,
      cssClass: 'app-loading',
      message: ''               // nunca undefined
    });

    await this.loading.present();
  }

  async hide(): Promise<void> {
    if (!this.loading) return;
    await this.loading.dismiss();
    this.loading = undefined;
  }

  async wrap<T>(work: Promise<T>): Promise<T> {
    await this.show();
    try { return await work; }
    finally { await this.hide(); }
  }
}
