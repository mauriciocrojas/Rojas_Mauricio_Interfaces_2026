import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SplashAnimPage } from './splash-anim.page';

const routes: Routes = [
  { path: '', component: SplashAnimPage } // esta página es la raíz del módulo
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SplashAnimPageRoutingModule {}
