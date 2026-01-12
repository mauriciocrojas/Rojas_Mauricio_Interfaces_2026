import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { SplashAnimPageRoutingModule } from './splash-anim-routing.module';
import { SplashAnimPage } from './splash-anim.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SplashAnimPageRoutingModule
  ],
  declarations: [SplashAnimPage]
})
export class SplashAnimPageModule {}
