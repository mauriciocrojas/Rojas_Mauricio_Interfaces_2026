import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EscapeGalacticoPage } from './escape-galactico.page';

const routes: Routes = [
  {
    path: '',
    component: EscapeGalacticoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EscapeGalacticoPageRoutingModule {}
