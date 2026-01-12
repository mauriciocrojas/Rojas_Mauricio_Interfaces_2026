import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ReactiveFormsModule } from '@angular/forms';
import { QrService } from 'src/app/services/qr.service';
// import { AuthService } from 'src/app/auth.service';
// import { ClientesService } from 'src/app/clientes.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-post-pago',
  standalone : true,
  templateUrl: './post-pago.page.html',
  styleUrls: ['./post-pago.page.scss'],
  imports: [CommonModule, IonicModule, ReactiveFormsModule]
})
export class PostPagoPage implements OnInit {

  constructor(private qrS: QrService, private router: Router) { }

  ngOnInit() {
  }
  
  async scanear() {
    const data = await this.qrS.scanOnce();
    // const data = 5;
    console.log('Datos del QR:', data);
    if (data) {
      // Aquí puedes manejar los datos escaneados, por ejemplo, navegar a otra página
      console.log('QR escaneado con éxito:', data);
      this.router.navigate(['/encuestas']);
    } else {
      console.log('No se escaneó ningún QR.');
    } 
  }

  goHome() {
    this.router.navigate(['/home']);
  }
}