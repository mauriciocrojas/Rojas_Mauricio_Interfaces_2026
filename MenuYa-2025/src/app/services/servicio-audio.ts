import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  playStart() {
    const audio = new Audio('../../assets/sonidos/abrir.mp3');
    audio.play().catch(err => console.log('No se pudo reproducir el abrir:', err));
  }

  playClose() {
    const audio = new Audio('../../assets/sonidos/cerrar.mp3');
    audio.play().catch(err => console.log('No se pudo reproducir el cerrar:', err));
  }
}
