// game-results.service.ts
import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { AuthService } from '../auth.service';

interface GameResult { game: string; score: number; at: string }

@Injectable({ providedIn: 'root' })
export class GameResultsService {
  private KEY = 'menuya_game_results';
  private DISCOUNT_KEY = 'menuya_discount_applied';
  private LOSS_KEY = 'menuya_any_game_loss';
  private PORCENTAJE_DESCUENTO_KEY = 'menuya_descuento_porcentaje';

  private clientKeyCache: string | null = null;

  constructor(
    private toast: ToastController,
    private auth: AuthService
  ) {}

  /** Helpers genéricos ******************************************/

  private async getItem(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }

  private async setItem(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  private async removeItem(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  private async resolveClientKey(): Promise<string> {
    // if (this.clientKeyCache) return this.clientKeyCache;

    try {
      const email = await this.auth.getUserEmail();
      let key: string;

      if (email) {
        key = 'user:' + email.toLowerCase();
      } else {
        // Anónimo
        let anonId = await this.getItem('menuya_anon_id');
        if (!anonId) {
          anonId = 'anon:' + Math.random().toString(36).slice(2) + Date.now();
          await this.setItem('menuya_anon_id', anonId);
        }
        key = anonId;
      }

      this.clientKeyCache = key;
      await this.setItem('menuya_client_key', key);
      return key;
    } catch (err) {
      console.warn('[Juegos] Error resolviendo clientKey, usando "global"', err);
      return 'global';
    }
  }

  private getScopedKey(base: string, clientKey: string): string {
    return `${base}:${clientKey}`;
  }

  /** Resultados de juegos ******************************************/

  async saveResult(game: string, score: number, wonOnFirstTry: boolean = false) {
    const now = new Date().toISOString();
    const clientKey = await this.resolveClientKey();
    console.log('Client key for saving result:', clientKey);
    const resultsKey = this.getScopedKey(this.KEY, clientKey);

    const list = await this.getAll();
    list.push({ game, score, at: now });
    await this.setItem(resultsKey, JSON.stringify(list));

    console.info('[Juegos] Resultado guardado:', game, 'score=', score, 'wonOnFirstTry=', wonOnFirstTry);

    const ya = await this.hasDiscount();
    const perdio = await this.hasAnyLoss();

    if (ya) {
      console.info('[Juegos] Descuento ya otorgado anteriormente. Juego:', game);
    } else if (wonOnFirstTry && !perdio) {
      console.info('[Juegos] Descuento otorgado por ganar en primer intento. Juego:', game);
      await this.applyDiscount(game);
    } else {
      const reason = !wonOnFirstTry
        ? 'no ganó en primer intento'
        : (perdio ? 'ya tuvo una derrota previa' : 'condición no cumplida');
      console.info('[Juegos] No se otorga descuento (' + reason + '). Juego:', game);
    }
  }

  async getAll(): Promise<GameResult[]> {
    try {
      const ck = await this.getItem('menuya_client_key');
      const key = ck ? this.getScopedKey(this.KEY, ck) : this.KEY;
      const raw = await this.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Descuento *****************************************************/

  private async applyDiscount(game: string) {
    const clientKey = await this.resolveClientKey();
    const discountKey = this.getScopedKey(this.DISCOUNT_KEY, clientKey);
    const key = this.getScopedKey(this.PORCENTAJE_DESCUENTO_KEY, clientKey);
    await this.setItem(discountKey, 'true');
    if (game == 'escape_galactico') {
      console.info('[Juegos] Descuento del 20% aplicado para el juego Escape Galáctico.');
      await this.setItem(key, '20');
    } else if (game == 'mayor_menor') {
      console.info('[Juegos] Descuento del 15% aplicado para el juego Mayor o Menor.');
      await this.setItem(key, '15');
    } else if (game == 'entrega_ya') {
      console.info('[Juegos] Descuento del 25% aplicado para el juego Entrega Ya.');
      await this.setItem(key, '25');
    } else {
      console.info('[Juegos] Descuento del 10% aplicado para el juego', game);
      await this.setItem(key, '10');
    }
  }

  async getDiscountPercentage(): Promise<number> {
    const ck = await this.getItem('menuya_client_key');
    if (!ck) return 0;
    const key = this.getScopedKey(this.PORCENTAJE_DESCUENTO_KEY, ck);
    console.log('Discount percentage key:', key);
    const val = await this.getItem(key);
    console.log('Discount percentage value:', val);
    return val ? parseInt(val, 10) : 0;
  }

  async hasDiscount(): Promise<boolean> {
    const ck = await this.getItem('menuya_client_key');
    if (!ck) return false;
    const key = this.getScopedKey(this.DISCOUNT_KEY, ck);
    const val = await this.getItem(key);
    return val === 'true';
  }

  async clearDiscount() {
    const ck = await this.getItem('menuya_client_key');
    const key = ck ? this.getScopedKey(this.DISCOUNT_KEY, ck) : this.DISCOUNT_KEY;
    const porcentajeKey = ck ? this.getScopedKey(this.PORCENTAJE_DESCUENTO_KEY, ck) : this.PORCENTAJE_DESCUENTO_KEY;
    await this.removeItem(key);
    await this.removeItem(porcentajeKey);
  }

  /** Derrotas ******************************************************/

  // Registrar una derrota en cualquier juego (anula el beneficio de primer intento)
  async registerLoss() {
    try {
      let ck = await this.getItem('menuya_client_key');
      if (!ck) {
        const clientKey = await this.resolveClientKey();
        ck = this.getScopedKey(this.KEY, clientKey);
      }
      const key = this.getScopedKey(this.LOSS_KEY, ck);
      await this.setItem(key, 'true');
    } catch {}
  }

  async hasAnyLoss(): Promise<boolean> {
    try {
      const ck = await this.getItem('menuya_client_key');
      console.log('Client key for loss check:', ck);
      if (!ck) {
          return false;
      } 
      const key = this.getScopedKey(this.LOSS_KEY, ck);
      console.log('Loss key:', key);
      const val = await this.getItem(key);
      console.log('Loss value:', val);
      return val === 'true';
    } catch {
      return false;
    }
  }
}