import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-juegos',
  templateUrl: './juegos.page.html',
  styleUrls: ['./juegos.page.scss'],
  standalone: false
})
export class JuegosPage implements OnInit, OnDestroy {
  selected = 'ahorcado';
  private sub?: Subscription;

  constructor(private router: Router, private route: ActivatedRoute) {}

  // 👇 Se llama cada vez que la vista vuelve a ser visible (Ionic cache)
  ionViewWillEnter() {
    this.syncFromUrl();
  }

  ngOnInit(): void {
    // También escuchamos cambios de navegación dentro de /juegos/*
    this.sub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.syncFromUrl());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  selectGame(game: string) {
    this.selected = game;
    this.onSegmentChange({ detail: { value: game } } as any); // reutilizás tu lógica actual
  }

  onSegmentChange(ev: CustomEvent) {
    const value = (ev.detail as any).value as string;
    if (!value) return;
    this.selected = value;
    // Navegación a la sub-ruta elegida
    this.router.navigate([value], { relativeTo: this.route });
  }

  private syncFromUrl() {
    // /juegos/ahorcado  o  /juegos/mayor-menor
    const url = this.router.url.split('?')[0].split('#')[0];
    const parts = url.split('/');       // ["", "juegos", "ahorcado"]
    const child = parts[2] || 'ahorcado';
    if (this.selected !== child) this.selected = child;
  }
}
