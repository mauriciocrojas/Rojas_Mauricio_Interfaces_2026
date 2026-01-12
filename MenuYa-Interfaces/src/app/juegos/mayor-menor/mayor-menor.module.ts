import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { MayorMenorPage } from './mayor-menor.page';

const routes: Routes = [
  { path: '', component: MayorMenorPage }
];

@NgModule({
  declarations: [MayorMenorPage],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ]
})
export class MayorMenorPageModule {}
