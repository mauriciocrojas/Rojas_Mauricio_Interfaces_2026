// src/app/pages/cuenta/cuenta.module.ts
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CuentaPageRoutingModule } from './cuenta-routing.module';
import { CuentaPage } from './cuenta.page';

@NgModule({
  declarations: [CuentaPage],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CuentaPageRoutingModule,
  ],
  // opcional, pero ayuda si tenés otros web components
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CuentaPageModule {}
