import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { IconNamePipe } from '../core/theme/icon-name.pipe';

@NgModule({
  declarations: [IconNamePipe],
  imports: [CommonModule, IonicModule],
  exports: [IconNamePipe],
})
export class SharedModule {}
