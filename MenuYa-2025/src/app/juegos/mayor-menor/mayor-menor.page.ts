import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

import { ToastController } from '@ionic/angular';
import { GameResultsService } from 'src/app/services/game-results.service';

interface Carta {
  valor: number;
  palo: string;
}

@Component({
  selector: 'app-mayor-menor',
  templateUrl: './mayor-menor.page.html',
  styleUrls: ['./mayor-menor.page.scss'],
  standalone: false
})
export class MayorMenorPage implements OnInit, OnDestroy {
  mazo: Carta[] = [];
  cartaActual?: Carta;
  siguienteCarta?: Carta;

  puntaje = 0;
  mensaje = '';
  juegoTerminado = false;

  mostrarSiguienteCarta = false;
  cartaRecogidaTapada = true;

  palos = ['♠', '♥', '♦', '♣'];
  timerId: any;
  respuestaJugador: '' | 'mayor' | 'menor' | 'igual' = '';

  constructor(
    private gameResultsService: GameResultsService,
    private router: Router,
    private toast: ToastController
  ) {}

  ngOnInit(): void {
    this.iniciarJuego();
  }

  ngOnDestroy(): void {
    this.limpiarTemporizador();
  }

  iniciarJuego() {
    this.mazo = [];
    for (const palo of this.palos) {
      for (let valor = 1; valor <= 12; valor++) {
        this.mazo.push({ valor, palo });
      }
    }
    this.mazo = this.barajarMazo(this.mazo);
    this.cartaActual = this.mazo.pop()!;
    this.siguienteCarta = this.mazo.pop()!;

    this.puntaje = 0;
    this.mensaje = '';
    this.juegoTerminado = false;
    this.mostrarSiguienteCarta = false;
    this.cartaRecogidaTapada = true;
    this.respuestaJugador = '';
  }

  barajarMazo(array: Carta[]): Carta[] {
    let currentIndex = array.length, randomIndex: number;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
  }

  // ⬇⬇⬇ AHORA ES ASYNC
  async adivinar(respuesta: 'mayor' | 'menor' | 'igual') {
    if (!this.cartaActual || !this.siguienteCarta || this.juegoTerminado) return;

    this.respuestaJugador = respuesta;

    let correcta: 'mayor' | 'menor' | 'igual' = 'igual';
    if (this.siguienteCarta.valor > this.cartaActual.valor) correcta = 'mayor';
    else if (this.siguienteCarta.valor < this.cartaActual.valor) correcta = 'menor';

    if (respuesta === correcta) {
      this.puntaje++;
      this.mensaje = '¡Correcto!';
    } else {
      this.mensaje = `¡Perdiste! Era ${correcta.toUpperCase()}. Puntaje final: ${this.puntaje}`;
      this.juegoTerminado = true;
      await this.guardarResultado(false);
      try {
        await this.gameResultsService.registerLoss();
      } catch {}
    }

    this.mostrarSiguienteCarta = true;
    this.cartaRecogidaTapada = false;

    this.limpiarTemporizador();
    this.timerId = setTimeout(async () => {
      if (!this.juegoTerminado) {
        this.cartaActual = this.siguienteCarta;
        this.siguienteCarta = this.mazo.pop();

        if (!this.siguienteCarta) {
          this.mensaje = `¡Felicitaciones! Completaste el mazo. Puntaje final: ${this.puntaje}`;
          this.juegoTerminado = true;

          // ⚠️ Todo esto ahora es async
          const teniaDesc = await this.gameResultsService.hasDiscount();
          await this.guardarResultado(true);
          const tieneDescAhora = await this.gameResultsService.hasDiscount();
          if (!teniaDesc && tieneDescAhora) {
            try {
              const t = await this.toast.create({
                message: '¡Descuento desbloqueado! 20% aplicado a tu cuenta.',
                duration: 1800,
                color: 'success',
                icon: 'pricetags-outline',
                position: 'top'
              });
              await t.present();
            } catch {}
          }
        } else {
          this.cartaRecogidaTapada = true;
          this.mostrarSiguienteCarta = false;
          this.respuestaJugador = '';
          this.mensaje = '';
        }
      }
      this.timerId = null;
    }, 2000);
  }

  limpiarTemporizador() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  reiniciar() {
    this.limpiarTemporizador();
    this.iniciarJuego();
  }

  volverHome() {
    this.router.navigateByUrl('/home');
  }

  // ⬇⬇⬇ AHORA ES ASYNC Y USA AWAIT
  private async guardarResultado(wonOnFirstTry: boolean = false) {
    try {
      await this.gameResultsService.saveResult('mayor_menor', this.puntaje, wonOnFirstTry);
    } catch (e) {
      console.error('[MayorMenor] Error guardando resultado', e);
    }
  }
}
