import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MayorMenorPage } from './mayor-menor.page';

const routes: Routes = [
  { path: '', component: MayorMenorPage } // /juegos/mayormenor
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MayorMenorPageRoutingModule {}
