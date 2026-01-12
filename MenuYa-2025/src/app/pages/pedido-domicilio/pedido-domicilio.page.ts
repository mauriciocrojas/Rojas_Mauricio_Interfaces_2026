import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastController } from '@ionic/angular';
import * as L from 'leaflet';
import { Router } from '@angular/router';
import { PedidoService } from '../../services/pedido.service';
import { SpinnerService } from '../../../app/services/spinner';

type NomReverse = { display_name?: string };
type NomSearch  = { lat: string; lon: string; display_name: string; address?: any };

@Component({
  selector: 'app-pedido-domicilio',
  templateUrl: './pedido-domicilio.page.html',
  styleUrls: ['./pedido-domicilio.page.scss'],
  standalone: false, // 👈 no-standalone (usa módulo)
})
export class PedidoDomicilioPage implements OnInit, OnDestroy {
  direccionTexto = '';
  mapa!: L.Map;
  marker: L.Marker | null = null;
  lat: number | null = null;
  lng: number | null = null;
  isPlacing = false;

  // 👇 para el autocomplete
  sugerencias: NomSearch[] = [];
  private buscarTimer: any = null;

  constructor(
    private toast: ToastController,
    private router: Router,
    private pedidoSrv: PedidoService,
    private spinner: SpinnerService
  ) {}

  ngOnInit(): void {
    // Íconos Leaflet (asegurate de copiar PNGs a assets/leaflet/)
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    setTimeout(() => {
      this.mapa = L.map('mapa', { zoomControl: true }).setView([-34.6037, -58.3816], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this.mapa);

      setTimeout(() => this.mapa.invalidateSize(), 200);

      // click en el mapa → pin + reverse geocoding
      this.mapa.on('click', (e: L.LeafletMouseEvent) =>
        this.setMarcador(e.latlng.lat, e.latlng.lng, true)
      );

      // centrar en ubicación del usuario (opcional)
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          pos => this.mapa.setView([pos.coords.latitude, pos.coords.longitude], 15),
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.mapa) {
      this.mapa.off();
      this.mapa.remove();
    }
  }

  // Coloca/mueve el pin; si reverse=true, completa el input.
  private setMarcador(lat: number, lng: number, reverse = false) {
    this.lat = lat;
    this.lng = lng;

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.mapa);
      this.marker.on('dragend', (ev: L.LeafletEvent) => {
        const p = (ev.target as L.Marker).getLatLng();
        this.lat = p.lat;
        this.lng = p.lng;
        this.reverseGeocode(p.lat, p.lng);
      });
    }
    if (reverse) this.reverseGeocode(lat, lng);
  }

  // 🔎 Debounce para el (ionInput)
  debouncedBuscar() {
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => this.buscarAhora(), 350);
  }

  // 🔎 Buscar por texto (Nominatim) → llena this.sugerencias
  async buscarAhora() {
    const q = (this.direccionTexto || '').trim();
    if (!q) { this.sugerencias = []; return; }

    try {

      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ar&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es', 'User-Agent': 'MenuYa/1.0 (mailto:menuya2025@gmail.com)' }
      });
      const data = (await res.json()) as NomSearch[];
      this.sugerencias = (data || []).slice(0, 6);
    } catch {
      this.sugerencias = [];
    } 
  }

  // Al elegir sugerencia → centra, pone pin, completa input y cierra lista
  seleccionarSugerencia(s: NomSearch) {
    const la = parseFloat(s.lat), lo = parseFloat(s.lon);
    this.mapa.setView([la, lo], 17);
    this.setMarcador(la, lo, false);
    this.direccionTexto = s.display_name;
    this.sugerencias = [];
  }

  // Reverse geocoding (pin → texto)
  private async reverseGeocode(lat: number, lon: number) {
    try {
      await this.spinner.show();

      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es', 'User-Agent': 'MenuYa/1.0 (mailto:menuya2025@gmail.com)' }
      });
      const data = (await res.json()) as NomReverse;
      if (data?.display_name) this.direccionTexto = data.display_name;
    } catch {
    } finally {
      await this.spinner.hide();
    }
  }

  async continuarAlMenu() {
    if (!this.direccionTexto && (this.lat == null || this.lng == null)) {
      const t = await this.toast.create({
        message: 'Indicá una dirección o marcá el punto en el mapa',
        duration: 1600, color: 'warning', icon: 'alert-circle'
      });
      return t.present();
    }

    await this.spinner.show();
    try {
      this.pedidoSrv.setContextoDomicilio({
        direccion: this.direccionTexto || null,
        lat: this.lat, lng: this.lng
      });

      await this.router.navigate(['/lista-productos'], { queryParams: { tipo: 'domicilio' } });
    } finally {
      await this.spinner.hide();
    }
  }

  async goHome() {
    await this.spinner.show();
    try {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } finally {
      await this.spinner.hide();
    }
  }
}
