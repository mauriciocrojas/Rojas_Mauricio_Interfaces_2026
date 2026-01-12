import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';

type Gesto = 'izquierda' | 'derecha' | 'adelante' | 'atras' | 'reinicio';

interface ConfigMovimiento {
  umbralGiro: number; // grados izquierda/derecha (gamma)
  umbralInclinacion: number; // grados adelante/atrás (beta)
  histeresis: number; // zona neutra para rearmar
  pausaMs: number; // tiempo mínimo entre gestos iguales
  ventanaSacudidaMs: number; // ventana para alternancias izq-der
  alternanciasSacudida: number; // alternancias para disparar reinicio
}

@Injectable({ providedIn: 'root' })
export class ServicioMovimiento {
  private emisor$ = new Subject<Gesto>();
  private escuchando = false;
  private ultimoEnvio: Partial<Record<Gesto, number>> = {};
  private ultimaDir: 'izquierda' | 'derecha' | null = null;
  private alternancias = 0;
  private ultimoCambio = 0;
  private puedeGiro = true;
  private puedeInclinacion = true;

  private cfg: ConfigMovimiento = {
    umbralGiro: 28,
    umbralInclinacion: 16,
    histeresis: 10,
    pausaMs: 900,
    ventanaSacudidaMs: 1200,
    alternanciasSacudida: 3,
  };

  constructor(private zona: NgZone) {}

  get gestos(): Observable<Gesto> {
    return this.emisor$.asObservable();
  }

  async pedirPermisoSiHaceFalta(): Promise<boolean> {
    const w = window as any;
    const necesita = typeof w.DeviceMotionEvent !== 'undefined' && typeof w.DeviceMotionEvent.requestPermission === 'function';
    if (necesita) {
      try {
        const res = await w.DeviceMotionEvent.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  iniciar(): void {
    if (this.escuchando) return;
    this.escuchando = true;
    window.addEventListener('deviceorientation', this.onOrientacion, true);
  }

  detener(): void {
    if (!this.escuchando) return;
    this.escuchando = false;
    window.removeEventListener('deviceorientation', this.onOrientacion, true);
  }

  private emitir(ev: Gesto) {
    const ahora = Date.now();
    const ult = this.ultimoEnvio[ev] ?? 0;
    if (ahora - ult < this.cfg.pausaMs) return;
    this.ultimoEnvio[ev] = ahora;
    this.zona.run(() => this.emisor$.next(ev));
  }

  private onOrientacion = (e: DeviceOrientationEvent) => {
    const gamma = (e.gamma ?? 0); // + derecha, - izquierda
    const beta = (e.beta ?? 0);   // +/- adelante/atrás según dispositivo

    const { umbralGiro, umbralInclinacion, histeresis } = this.cfg;
    const esAndroid = /Android/i.test(navigator?.userAgent || '');

    // Izquierda / Derecha con zona neutra para rearmar
    if (Math.abs(gamma) <= histeresis) {
      this.puedeGiro = true;
    } else if (this.puedeGiro && gamma <= -umbralGiro) {
      this.emitir('izquierda');
      this.manejarSacudida('izquierda');
      this.puedeGiro = false;
    } else if (this.puedeGiro && gamma >= umbralGiro) {
      this.emitir('derecha');
      this.manejarSacudida('derecha');
      this.puedeGiro = false;
    }

    // Adelante / Atrás
    if (beta <= -umbralInclinacion) {
      this.emitir('adelante');
    } else if (beta >= umbralInclinacion) {
      this.emitir('atras');
    }
  };

  private manejarSacudida(dir: 'izquierda' | 'derecha') {
    const ahora = Date.now();
    if (!this.ultimaDir) {
      this.ultimaDir = dir;
      this.alternancias = 0;
      this.ultimoCambio = ahora;
      return;
    }
    if (dir !== this.ultimaDir) {
      if (ahora - this.ultimoCambio <= this.cfg.ventanaSacudidaMs) {
        this.alternancias += 1;
        this.ultimoCambio = ahora;
        if (this.alternancias >= this.cfg.alternanciasSacudida) {
          this.alternancias = 0;
          this.ultimaDir = dir;
          this.emitir('reinicio');
        }
      } else {
        this.alternancias = 0;
        this.ultimoCambio = ahora;
      }
      this.ultimaDir = dir;
    } else {
      if (ahora - this.ultimoCambio > this.cfg.ventanaSacudidaMs) {
        this.alternancias = 0;
        this.ultimoCambio = ahora;
      }
    }
  }
}
