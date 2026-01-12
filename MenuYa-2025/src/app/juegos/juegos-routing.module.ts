import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { JuegosPage } from './juegos.page';

const routes: Routes = [
  {
    path: '',
    component: JuegosPage,
    children: [
      { path: '', redirectTo: 'ahorcado', pathMatch: 'full' },
      {
        path: 'ahorcado',
        loadChildren: () =>
          import('./ahorcado/ahorcado.module').then(m => m.AhorcadoPageModule)
      },
      {
        path: 'mayor-menor',
        loadChildren: () =>
          import('./mayor-menor/mayor-menor.module').then(m => m.MayorMenorPageModule)
      },
      {
        path: 'escape-galactico',
        loadChildren: () =>
          import('./escape-galactico/escape-galactico.module').then(m => m.EscapeGalacticoPageModule)
      },
      {
        path: 'entrega-ya',
        loadComponent: () => import('./entrega-ya/entrega-ya.component').then( m => m.EntregaYaComponent)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class JuegosPageRoutingModule { }
