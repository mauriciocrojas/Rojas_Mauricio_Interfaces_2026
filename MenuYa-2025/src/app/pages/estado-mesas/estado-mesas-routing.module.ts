import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EstadoMesasPage } from './estado-mesas.page';

const routes: Routes = [
  {
    path: '',
    component: EstadoMesasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EstadoMesasPageRoutingModule {}
