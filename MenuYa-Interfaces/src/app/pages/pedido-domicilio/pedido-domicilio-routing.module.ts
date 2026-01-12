import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PedidoDomicilioPage } from './pedido-domicilio.page';

const routes: Routes = [
  {
    path: '',
    component: PedidoDomicilioPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PedidoDomicilioPageRoutingModule {}
