import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { EscapeGalacticoPageRoutingModule } from './escape-galactico-routing.module';
import { EscapeGalacticoPage } from './escape-galactico.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, EscapeGalacticoPageRoutingModule],
  declarations: [EscapeGalacticoPage]
})
export class EscapeGalacticoPageModule {}
