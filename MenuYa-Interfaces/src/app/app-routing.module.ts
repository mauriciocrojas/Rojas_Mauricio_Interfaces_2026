import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { WaitlistGuard } from './waitlist.guard';

const routes: Routes = [
  // Inicio: splash animado
  { path: '', loadChildren: () => import('./pages/splash-anim/splash-anim.module').then(m => m.SplashAnimPageModule) },

  // Otras páginas
  { path: 'login', loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule) },
  { path: 'home', loadChildren: () => import('./home/home.module').then(m => m.HomePageModule) },
  { path: 'registro', loadChildren: () => import('./registro/registro.module').then(m => m.RegistroPageModule) },
  { path: 'juegos', loadChildren: () => import('./juegos/juegos.module').then(m => m.JuegosPageModule), canActivate: [WaitlistGuard] },

  // (opcional) acceso directo
  { path: 'splash-anim', loadChildren: () => import('./pages/splash-anim/splash-anim.module').then(m => m.SplashAnimPageModule) },

  // Página standalone
  {
    path: 'alta-empleado',
    loadComponent: () =>
      import('./pages/alta-empleado/alta-empleado.page').then(m => m.AltaEmpleadoPage)
  },
  {
    path: 'alta-producto',
    loadComponent: () =>
      import('./pages/alta-producto/alta-producto.page').then(m => m.AltaProductoPage)
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./pages/chat/chat.page').then(m => m.ChatPage),
    canActivate: [WaitlistGuard]
  },
  {
    path: 'alta-mesa',
    loadComponent: () =>
      import('./pages/alta-mesa/alta-mesa.page').then(m => m.AltaMesaPage)
  },
  {
    path: 'lista-productos',
    loadComponent: () => import('./pages/lista-productos/lista-productos.page').then(m => m.ListaProductosPage),
    canActivate: [WaitlistGuard]
  },
  {
    path: 'cuenta',
    loadChildren: () =>
      import('./pages/cuenta/cuenta.module').then(m => m.CuentaPageModule),
    canActivate: [WaitlistGuard]
  },
  {
    path: 'encuestas',
    loadComponent: () => import('./pages/encuestas/encuestas.page').then(m => m.EncuestasPage)
  },
  {
    path: 'estado-mesas',
    loadComponent: () => import('./pages/estado-mesas/estado-mesas.page').then(m => m.EstadoMesasPage)
  },
  {
  path: 'post-pago',
  loadComponent: () => import('./pages/post-pago/post-pago.page').then(m => m.PostPagoPage)
  },
  {
    path: 'pedido-domicilio',
    loadChildren: () =>
      import('./pages/pedido-domicilio/pedido-domicilio.module')
        .then(m => m.PedidoDomicilioPageModule),
  },
  {
    path: 'reserva-mesa',
    loadComponent: () => import('./pages/reserva-mesa/reserva-mesa.page').then( m => m.ReservaMesaPage)
  },
  {
    path: 'gestion-reservas',
    loadComponent: () => import('./pages/gestion-reservas/gestion-reservas.component').then( m => m.GestionReservasComponent)
  },
  {
    path: 'clientes-pendientes',
    loadComponent: () => import('./pages/clientes-pendientes/clientes-pendientes.page').then( m => m.ClientesPendientesPage)
  },
  {
    path: 'carta',
    loadComponent: () => import('./pages/carta/carta.page').then( m => m.CartaPage)
  },
  {
    path: 'pedidos-pendientes',
    loadComponent: () => import('./pages/pedidos-pendientes/pedidos-pendientes.component').then( m => m.PedidosPendientesComponent)
  },
  {
    path: 'pedidos-delivery',
    loadComponent: () => import('./pages/pedidos-delivery-boss/pedidos-delivery-boss.page').then( m => m.PedidosDeliveryBossPage)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule { }


