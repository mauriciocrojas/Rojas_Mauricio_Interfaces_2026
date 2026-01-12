import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PostPagoPage } from './post-pago.page';

const routes: Routes = [
  {
    path: '',
    component: PostPagoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PostPagoPageRoutingModule {}
