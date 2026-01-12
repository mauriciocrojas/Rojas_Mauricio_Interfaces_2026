import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { PedidoDomicilioPageRoutingModule } from './pedido-domicilio-routing.module';
import { PedidoDomicilioPage } from './pedido-domicilio.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,      
    IonicModule,
    PedidoDomicilioPageRoutingModule,
  ],
  declarations: [PedidoDomicilioPage],
})
export class PedidoDomicilioPageModule {}
