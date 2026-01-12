import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PostPagoPageRoutingModule } from './post-pago-routing.module';

import { PostPagoPage } from './post-pago.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PostPagoPageRoutingModule,
    PostPagoPage
  ],
  declarations: []
})
export class PostPagoPageModule {}
