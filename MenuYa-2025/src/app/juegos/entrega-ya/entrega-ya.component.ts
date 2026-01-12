import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Motion } from '@capacitor/motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { PluginListenerHandle } from '@capacitor/core';
import { GameResultsService } from 'src/app/services/game-results.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

type GameState = 'idle' | 'running' | 'won' | 'lost';

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface Obstacle extends Circle {
  type: 'patines' | 'banana' | 'aceite';
}

@Component({
  selector: 'app-entrega-ya',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './entrega-ya.component.html',
  styleUrls: ['./entrega-ya.component.scss'],
})
export class EntregaYaComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  // Entidades del juego
  private waiter: Circle = { x: 0, y: 0, r: 20 };
  private table: Circle = { x: 0, y: 0, r: 30 };
  private obstacles: Obstacle[] = [];

  // Imágenes
  private assetsLoaded = false;

  private bgImg!: HTMLImageElement;
  private waiterImg!: HTMLImageElement;
  private tableImg!: HTMLImageElement;
  private obstacleImgs: Record<Obstacle['type'], HTMLImageElement> = {
    patines: new Image(),
    banana: new Image(),
    aceite: new Image(),
  };

  // Drawing scales so the waiter and obstacle sprites appear larger on the canvas
  private readonly WAITER_IMAGE_SCALE = 3.9;
  private readonly OBSTACLE_IMAGE_SCALE = 3.4;

  // Estado del juego
  gameState: GameState = 'idle';
  statusMessage = 'Inclina el celular para ayudar al mozo a llegar a la mesa.';

  // Motion
  private tiltX = 0;
  private tiltY = 0;
  private motionListener?: PluginListenerHandle;

  // Loop
  private animationId: number | null = null;
  private lastTime = 0;

  // Sonidos
  private startSound = new Audio('../../../assets/sonidos/start.mp3');
  private winSound = new Audio('../../../assets/sonidos/win.mp3');
  private errorSound = new Audio('../../../assets/sonidos/error.mp3');

  constructor(
    private router: Router,
    private toastController: ToastController,
    private gameResultsService: GameResultsService
  ) {}

  ngOnInit() {}

  async ngAfterViewInit(): Promise<void> {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;

    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.width = canvas.width;
    this.height = canvas.height;

    // Cargamos las imágenes antes de iniciar
    await this.preloadImages();
    this.assetsLoaded = true;

    this.resetGame();
    this.render();
  }

  ngOnDestroy(): void {
    this.stopGameLoop();
    this.detachMotion();
  }

  // -----------------------------
  // CARGA DE IMÁGENES
  // -----------------------------

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.error('Error cargando imagen:', src, err);
        resolve(img); // igual resolvemos para no romper el juego
      };
      img.src = src;
    });
  }

  private async preloadImages(): Promise<void> {
    // Fondo del tablero
    this.bgImg = await this.loadImage('../../../assets/fondo.png');
    // Ajustá las rutas según tu estructura de assets
    this.waiterImg = await this.loadImage('../../../assets/mozo.svg');
    this.tableImg = await this.loadImage('../../../assets/mesa.svg');
    // Obstáculos
    this.obstacleImgs.patines = await this.loadImage('../../../assets/patines.svg');
    this.obstacleImgs.banana = await this.loadImage('../../../assets/banana.svg');
    this.obstacleImgs.aceite = await this.loadImage('../../../assets/aceite.svg');
  }

  // -----------------------------
  // CONTROL GENERAL
  // -----------------------------

  startGame(): void {
    this.resetGame();
    this.gameState = 'running';
    this.statusMessage = '';

    this.playStartSound();
    this.attachMotion();
    this.startGameLoop();
  }

  private resetGame(): void {
    this.stopGameLoop();
    this.detachMotion();

    // Mozo en esquina superior izquierda
    this.waiter.x = this.waiter.r + 10;
    this.waiter.y = this.waiter.r + 10;

    // Mesa en esquina inferior derecha
    this.table.x = this.width - this.table.r - 10;
    this.table.y = this.height - this.table.r - 10;

    // Obstáculos aleatorios en el centro
    this.obstacles = this.generateObstacles();

    this.tiltX = 0;
    this.tiltY = 0;
    this.lastTime = performance.now();

    if (this.gameState === 'idle') {
      this.statusMessage =
        'Inclina el celular para ayudar al mozo a llegar a la mesa sin chocar.';
    }

    this.render();
  }

  private async endGame(win: boolean): Promise<void> {
    this.gameState = win ? 'won' : 'lost';
    this.stopGameLoop();
    this.detachMotion();

    if (win) {
      // ✅ Caso GANAR
      this.playWinSound();
      this.statusMessage = '¡Llegaste a la mesa! 🎉';
      await this.presentToast('¡Ganaste, llegaste a la mesa! 🎉', 'success');
      const teniaDesc = await this.gameResultsService.hasDiscount();
      console.log('Descuento antes de ganar:', teniaDesc);
      await this.gameResultsService.saveResult('entrega_ya', 1, true);
      const tieneDescAhora = await this.gameResultsService.hasDiscount();
      console.log('Descuento después de ganar:', tieneDescAhora);

      if (!teniaDesc && tieneDescAhora) {
        try {
          const t = await this.toastController.create({
            message: '¡Descuento desbloqueado! 25% aplicado a tu cuenta.',
            duration: 1800,
            color: 'success',
            icon: 'pricetags-outline',
            position: 'top'
          });
          await t.present();
        } catch {}
      }
    } else {
      // ✅ Caso PERDER
      const wonOnFirstTry = false;
      this.playErrorFeedback(); // vibración + sonido de error
      this.statusMessage = '¡Perdiste!';
      await this.presentToast('¡Perdiste!', 'danger');

      await this.gameResultsService.saveResult('entrega_ya', 0, wonOnFirstTry);
      try {
        await this.gameResultsService.registerLoss();
      } catch {}

    }
  }

  // -----------------------------
  // LOOP Y FÍSICA
  // -----------------------------

  private startGameLoop(): void {
    this.lastTime = performance.now();

    const loop = (time: number) => {
      if (this.gameState !== 'running') return;

      const dt = (time - this.lastTime) / 16;
      this.lastTime = time;

      this.update(dt);
      this.render();

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  private stopGameLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private update(dt: number): void {
    if (this.gameState !== 'running') return;

    const speed = 2.2;

    this.waiter.x += this.tiltX * speed * dt;
    this.waiter.y += this.tiltY * speed * dt;

    // Colisión con bordes
    if (
      this.waiter.x - this.waiter.r <= 0 ||
      this.waiter.x + this.waiter.r >= this.width ||
      this.waiter.y - this.waiter.r <= 0 ||
      this.waiter.y + this.waiter.r >= this.height
    ) {
      this.endGame(false);
      return;
    }

    // Colisión con obstáculos
    for (const o of this.obstacles) {
      if (this.collides(this.waiter, o)) {
        this.endGame(false);
        return;
      }
    }

    // Llegó a la mesa
    if (this.collides(this.waiter, this.table)) {
      this.endGame(true);
      return;
    }
  }

  private render(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.width, this.height);

    // Fondo con imagen
    if (this.assetsLoaded && this.bgImg) {
      ctx.drawImage(this.bgImg, 0, 0, this.width, this.height);
    } else {
      // Fallback: color plano si aún no cargó
      ctx.fillStyle = '#f0ede6';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Mesa
    this.drawTable();

    // Obstáculos
    this.obstacles.forEach((o) => this.drawObstacle(o));

    // Mozo
    this.drawWaiter();
  }

  // -----------------------------
  // DIBUJO
  // -----------------------------

  private drawWaiter(): void {
    const ctx = this.ctx;
    const w = this.waiter;

    if (this.assetsLoaded && this.waiterImg) {
      const imgW = this.waiter.r * this.WAITER_IMAGE_SCALE;
      const imgH = this.waiter.r * this.WAITER_IMAGE_SCALE;

      const drawX = w.x - imgW / 2;
      const drawY = w.y - imgH / 2;

      ctx.drawImage(this.waiterImg, drawX, drawY, imgW, imgH);
    } else {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.fillStyle = '#1976d2';
      ctx.fill();
      ctx.closePath();
    }
  }

  private drawTable(): void {
    const ctx = this.ctx;
    const t = this.table;

    if (this.assetsLoaded && this.tableImg) {
      const imgW = this.table.r * 2.6;
      const imgH = this.table.r * 2.6;

      const drawX = t.x - imgW / 2;
      const drawY = t.y - imgH / 2;

      ctx.drawImage(this.tableImg, drawX, drawY, imgW, imgH);
    } else {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = '#6d4c41';
      ctx.fill();
      ctx.closePath();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Mesa', t.x, t.y);
    }
  }

  private drawObstacle(o: Obstacle): void {
    const ctx = this.ctx;
    const img = this.obstacleImgs[o.type];

    if (this.assetsLoaded && img) {
      const imgW = o.r * this.OBSTACLE_IMAGE_SCALE;
      const imgH = o.r * this.OBSTACLE_IMAGE_SCALE;

      const drawX = o.x - imgW / 2;
      const drawY = o.y - imgH / 2;

      ctx.drawImage(img, drawX, drawY, imgW, imgH);
    } else {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);

      switch (o.type) {
        case 'patines':
          ctx.fillStyle = '#9e9e9e';
          break;
        case 'banana':
          ctx.fillStyle = '#ffeb3b';
          break;
        case 'aceite':
          ctx.fillStyle = '#ff9800';
          break;
      }

      ctx.fill();
      ctx.closePath();
    }
  }

  // -----------------------------
  // GIROSCOPIO
  // -----------------------------

  private async attachMotion(): Promise<void> {
    try {
      this.motionListener = await Motion.addListener('orientation', (event: any) => {
        const gamma = event.gamma ?? 0; // izq/der
        const beta = event.beta ?? 0; // adelante/atrás

        this.tiltX = gamma / 10;
        this.tiltY = beta / 10;
      });
    } catch (err) {
      console.error('Error al suscribirse al Motion:', err);
    }
  }

  private async detachMotion(): Promise<void> {
    if (this.motionListener) {
      try {
        await this.motionListener.remove();
      } catch (err) {
        console.warn('No se pudo remover el listener de Motion', err);
      } finally {
        this.motionListener = undefined;
      }
    }
  }

  // -----------------------------
  // UTILITARIOS
  // -----------------------------

  private generateObstacles(): Obstacle[] {
    const types: Obstacle['type'][] = ['patines', 'banana', 'aceite'];
    const obstacles: Obstacle[] = [];

    const baseRadius = 25;
    const padding = 10;

    const usableMinX = baseRadius + padding;
    const usableMaxX = this.width - baseRadius - padding;
    const usableMinY = baseRadius + padding;
    const usableMaxY = this.height - baseRadius - padding;

    const totalWidth = usableMaxX - usableMinX;
    const segmentWidth = totalWidth / types.length;

    types.forEach((type, index) => {
      const r = baseRadius;

      const segMinX = usableMinX + index * segmentWidth;
      const segMaxX = segMinX + segmentWidth;

      let placed = false;
      let attempts = 0;
      let candidate: Obstacle = { x: 0, y: 0, r, type };

      while (!placed && attempts < 50) {
        attempts++;

        const x =
          segMinX + r + Math.random() * (segMaxX - segMinX - 2 * r);
        const y =
          usableMinY + r + Math.random() * (usableMaxY - usableMinY - 2 * r);

        candidate = { x, y, r, type };

        if (this.isValidObstaclePosition(candidate, obstacles)) {
          obstacles.push(candidate);
          placed = true;
        }
      }

      if (!placed) {
        const fallbackX = segMinX + segmentWidth / 2;
        const fallbackY = (usableMinY + usableMaxY) / 2;
        candidate = { x: fallbackX, y: fallbackY, r, type };
        obstacles.push(candidate);
      }
    });

    return obstacles;
  }

  private isValidObstaclePosition(
    candidate: Obstacle,
    obstacles: Obstacle[]
  ): boolean {
    const minDistanceFactor = 2.2;

    for (const o of obstacles) {
      const dx = o.x - candidate.x;
      const dy = o.y - candidate.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < (o.r + candidate.r) * minDistanceFactor) {
        return false;
      }
    }

    const waiterSafeRadius = this.waiter.r + 30;
    const dxW = candidate.x - this.waiter.x;
    const dyW = candidate.y - this.waiter.y;
    const distW = Math.sqrt(dxW * dxW + dyW * dyW);
    if (distW < candidate.r + waiterSafeRadius) {
      return false;
    }

    const tableSafeRadius = this.table.r + 40;
    const dxT = candidate.x - this.table.x;
    const dyT = candidate.y - this.table.y;
    const distT = Math.sqrt(dxT * dxT + dyT * dyT);
    if (distT < candidate.r + tableSafeRadius) {
      return false;
    }

    return true;
  }

  private collides(a: Circle, b: Circle): boolean {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= a.r + b.r;
  }

  // -----------------------------
  // SONIDOS / VIBRACIÓN / TOAST
  // -----------------------------

  private playStartSound(): void {
    this.safePlay(this.startSound);
  }

  private playWinSound(): void {
    this.safePlay(this.winSound);
  }

  private playErrorFeedback(): void {
    this.safePlay(this.errorSound);
    this.vibrate();
  }

  private safePlay(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    audio
      .play()
      .catch((err) => console.warn('No se pudo reproducir sonido', err));
  }

  private async vibrate(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (err) {
      if (navigator.vibrate) {
        navigator.vibrate(300);
      }
    }
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' | 'primary' | 'warning' = 'primary'
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1500,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  volverHome() {
    this.router.navigateByUrl('/home');
  }
}

