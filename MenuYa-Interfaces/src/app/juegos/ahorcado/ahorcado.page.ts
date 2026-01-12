import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { GameResultsService } from 'src/app/services/game-results.service';

@Component({
  selector: 'app-ahorcado',
  templateUrl: './ahorcado.page.html',
  styleUrls: ['./ahorcado.page.scss'],
  standalone: false
})
export class AhorcadoPage implements OnInit {
  abecedario: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  palabras: { palabra: string, pista: string }[] = [
    { palabra: 'ARGENTINA',    pista: 'País campeón del mundo' },
    { palabra: 'PROGRAMACION', pista: 'Actividad informática donde se escribe código' },
    { palabra: 'VOLCAN',       pista: 'Fenómeno geológico que erupciona' },
    { palabra: 'BIBLIOTECA',   pista: 'Lugar lleno de libros' },
    { palabra: 'AEROPUERTO',   pista: 'Lugar donde despegan aviones' }
  ];

  palabraSecreta = '';
  pista = '';
  palabraMostrada = '';
  letrasErradas: string[] = [];
  intentos = 5;
  juegoTerminado = false;
  mensaje = '';
  puntaje = 0;

  constructor(
    private gameResultsService: GameResultsService,
    private router: Router,
    private toast: ToastController
  ) {}

  ngOnInit(): void {
    this.reiniciar();
  }

  async elegirLetra(letra: string) {
    if (
      this.letrasErradas.includes(letra) ||
      this.palabraMostrada.includes(letra) ||
      this.juegoTerminado
    ) return;

    let nuevaPalabra = '';
    let letraEncontrada = false;

    for (let i = 0; i < this.palabraSecreta.length; i++) {
      if (this.palabraSecreta[i] === letra) {
        nuevaPalabra += letra + ' ';
        letraEncontrada = true;
      } else {
        nuevaPalabra += this.palabraMostrada[i * 2] + ' ';
      }
    }

    this.palabraMostrada = nuevaPalabra.trim();

    if (!letraEncontrada) {
      this.letrasErradas.push(letra);
      this.intentos--;
    }

    // ✅ Ganó
    if (!this.palabraMostrada.includes('_')) {
      this.juegoTerminado = true;
      this.puntaje += this.intentos;
      const wonOnFirstTry = true; // nunca falló
      this.mensaje = `¡Ganaste! Te quedaban ${this.intentos} vidas. Puntaje: ${this.puntaje}`;

      const teniaDesc = await this.gameResultsService.hasDiscount();
      await this.guardarResultado(wonOnFirstTry);
      const tieneDescAhora = await this.gameResultsService.hasDiscount();
      if (!teniaDesc && tieneDescAhora) {
        try {
          const t = await this.toast.create({
            message: '¡Descuento desbloqueado! 10% aplicado a tu cuenta.',
            duration: 1800,
            color: 'success',
            icon: 'pricetags-outline',
            position: 'top'
          });
          await t.present();
        } catch {}
      }
    }

    // ❌ Perdió
    if (this.intentos <= 0 && !this.juegoTerminado) {
      this.juegoTerminado = true;
      this.mensaje = `¡Perdiste! La palabra era: ${this.palabraSecreta}`;
      this.puntaje = 0;
      
      await this.guardarResultado(false);
      try {
        await this.gameResultsService.registerLoss();
      } catch {}

    }
  }

  reiniciar() {
    const seleccion = this.palabras[Math.floor(Math.random() * this.palabras.length)];
    this.palabraSecreta = seleccion.palabra;
    this.pista = seleccion.pista;
    this.palabraMostrada = '_ '.repeat(this.palabraSecreta.length).trim();
    this.letrasErradas = [];
    this.intentos = 5;
    this.juegoTerminado = false;
    this.mensaje = '';
    this.puntaje = 0;
  }

  volverHome() {
    this.router.navigate(['/home']);
  }

  private async guardarResultado(wonOnFirstTry: boolean = false) {
    try {
      await this.gameResultsService.saveResult('ahorcado', this.puntaje, wonOnFirstTry);
    } catch (e) {
      console.warn('No se pudo guardar el resultado', e);
    }
  }
}
