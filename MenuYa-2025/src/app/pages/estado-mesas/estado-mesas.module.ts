import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { EstadoMesasPageRoutingModule } from './estado-mesas-routing.module';

import { EstadoMesasPage } from './estado-mesas.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EstadoMesasPageRoutingModule,
    EstadoMesasPage
  ],
  declarations: []
})
export class EstadoMesasPageModule {}
