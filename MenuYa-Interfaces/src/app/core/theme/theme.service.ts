import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_THEME_ID, THEMES } from './themes';
import { THEME_ASSETS, ThemeSound } from './theme-assets';
import { ThemeConfig, ThemeId } from './theme.model';

export type BaseThemeId = Exclude<ThemeId, 'custom'>;

const KEY_THEME_ID = 'app_theme_id';
const KEY_THEME_CUSTOM = 'app_theme_custom';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private theme$ = new BehaviorSubject<ThemeConfig>(this.getThemeById(DEFAULT_THEME_ID));
  themeChanges$ = this.theme$.asObservable();

  get currentTheme(): ThemeConfig {
    return this.theme$.value;
  }

  async init(): Promise<void> {
    const savedId = await this.loadSavedThemeId();

    // Si está guardado DARK => volver nativo y salir
    if (savedId === 'dark') {
      this.resetToAppDefault();
      return;
    }

    if (savedId) {
      await this.applySavedTheme(savedId);
      return;
    }

    // Default
    this.apply(this.getThemeById(DEFAULT_THEME_ID));
  }

  private async applySavedTheme(id: ThemeId): Promise<void> {
    if (id === 'dark') {
      this.resetToAppDefault();
      return;
    }

    if (id === 'custom') {
      const custom = await Preferences.get({ key: KEY_THEME_CUSTOM });
      if (custom.value) {
        const cfg = JSON.parse(custom.value) as ThemeConfig;
        this.apply(cfg);
        return;
      }
    }

    this.apply(this.getThemeById(id));
  }

  async setTheme(id: ThemeId): Promise<void> {
    // ✅ DARK = volver a la app original (NO Theme Engine)
    if (id === 'dark') {
      await Preferences.set({ key: KEY_THEME_ID, value: 'dark' });
      this.resetToAppDefault();
      return;
    }

    if (id === 'custom') {
      // Si todavía no hay custom guardado, clonamos “profesional” como base
      const base = this.getThemeById(DEFAULT_THEME_ID);
      const customCfg: ThemeConfig = { ...base, id: 'custom', label: 'Custom' };
      await Preferences.set({ key: KEY_THEME_CUSTOM, value: JSON.stringify(customCfg) });
      await Preferences.set({ key: KEY_THEME_ID, value: 'custom' });
      this.apply(customCfg);
      return;
    }

    await Preferences.set({ key: KEY_THEME_ID, value: id });
    this.apply(this.getThemeById(id));
  }

  async saveCustom(config: ThemeConfig): Promise<void> {
    await Preferences.set({ key: KEY_THEME_CUSTOM, value: JSON.stringify(config) });
    await Preferences.set({ key: KEY_THEME_ID, value: 'custom' });
    this.apply(config);
  }

  getAsset(which: 'logo' | 'background', themeId?: ThemeId): string {
    const id = themeId ?? this.currentTheme.id;
    return THEME_ASSETS[id][which];
  }

  async loadSavedThemeId(): Promise<ThemeId | null> {
    const saved = await Preferences.get({ key: KEY_THEME_ID });
    return (saved.value as ThemeId | null) ?? null;
  }

  getIconVariant(themeId?: ThemeId) {
    const id = themeId ?? this.currentTheme.id;
    return THEME_ASSETS[id].iconVariant;
  }

  getSoundPath(sound: ThemeSound, themeId?: ThemeId): string {
    const id = themeId ?? this.currentTheme.id;
    return THEME_ASSETS[id].sounds[sound];
  }

  private getThemeById(id: ThemeId): ThemeConfig {
    if (id === 'custom') return { ...THEMES[DEFAULT_THEME_ID], id: 'custom', label: 'Custom' };
    return THEMES[id as BaseThemeId];
  }

  private hexToRgb(hex: string): string {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r},${g},${b}`;
  }

  private apply(theme: ThemeConfig): void {
    this.theme$.next(theme);

    // 1) Clase en body (para estilos por tema)
    const body = document.body;
    body.classList.remove(
      'theme-profesional',
      'theme-argentina',
      'theme-naif',
      'theme-light',
      'theme-dark',
      'theme-custom'
    );
    body.classList.add(`theme-${theme.id}`);
    body.classList.toggle('primary-fullwidth', theme.layout.primaryButtonFullWidth);

    // 2) Variables globales (tokens)
    const root = document.documentElement;
    root.style.setProperty('--app-primary', theme.tokens.primary);
    root.style.setProperty('--app-secondary', theme.tokens.secondary);
    root.style.setProperty('--app-bg', theme.tokens.background);
    root.style.setProperty('--app-surface', theme.tokens.surface);
    root.style.setProperty('--app-text', theme.tokens.text);
    root.style.setProperty('--app-font-family', theme.tokens.fontFamily);
    root.style.setProperty('--app-font-size-base', `${theme.tokens.fontSizeBasePx}px`);
    root.style.setProperty('--app-btn-radius', `${theme.tokens.btnRadiusPx}px`);

    // 2.b) Variables de Ionic (para que TODO lo que use --ion-color-primary cambie)
    root.style.setProperty('--ion-color-primary', theme.tokens.primary);
    root.style.setProperty('--ion-color-primary-rgb', this.hexToRgb(theme.tokens.primary));
    root.style.setProperty('--ion-color-primary-contrast', '#ffffff');
    root.style.setProperty('--ion-color-primary-contrast-rgb', '255,255,255');
    root.style.setProperty('--ion-text-color', theme.tokens.text);
    root.style.setProperty('--ion-background-color', theme.tokens.background);

    // 2.b.1) Superficies
    root.style.setProperty('--ion-card-background', theme.tokens.surface);
    root.style.setProperty('--ion-item-background', theme.tokens.surface);
    root.style.setProperty('--ion-toolbar-background', theme.tokens.surface);
    root.style.setProperty('--ion-tab-bar-background', theme.tokens.surface);

    // 2.b.2) Texto secundario / placeholder
    root.style.setProperty('--ion-text-color-step-400', theme.tokens.text);
    root.style.setProperty(
      '--ion-placeholder-color',
      'color-mix(in oklab, var(--ion-text-color), transparent 55%)'
    );
    root.style.setProperty(
      '--ion-color-step-600',
      'color-mix(in oklab, var(--ion-text-color), transparent 45%)'
    );

    // 2.b.3) Bordes y “steps”
    const isLight = theme.id === 'light';

    root.style.setProperty(
      '--ion-border-color',
      isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.08)'
    );

    root.style.setProperty('--ion-color-step-50', isLight ? '#F3F4F6' : '#0B0F1A');
    root.style.setProperty('--ion-color-step-100', isLight ? '#E5E7EB' : '#0F1626');
    root.style.setProperty('--ion-color-step-150', isLight ? '#D1D5DB' : '#131C2F');
    root.style.setProperty('--ion-color-step-200', isLight ? '#9CA3AF' : '#18233A');
    root.style.setProperty('--ion-color-step-250', isLight ? '#6B7280' : '#1D2A46');

    // 2.b.4) Secondary
    root.style.setProperty('--ion-color-secondary', theme.tokens.secondary);
    root.style.setProperty('--ion-color-secondary-rgb', this.hexToRgb(theme.tokens.secondary));
    root.style.setProperty('--ion-color-secondary-contrast', isLight ? '#0F172A' : '#ffffff');
    root.style.setProperty(
      '--ion-color-secondary-contrast-rgb',
      isLight ? '15,23,42' : '255,255,255'
    );

    // 2.b.5) “surface tint”
    root.style.setProperty('--ion-color-light', isLight ? '#ffffff' : 'rgba(255,255,255,0.06)');

    // 2.c) Imágenes por tema
    root.style.setProperty('--app-bg-image', `url("${this.getAsset('background', theme.id)}")`);
    root.style.setProperty('--app-logo-image', `url("${this.getAsset('logo', theme.id)}")`);

    root.style.setProperty('--app-icon-variant', this.getIconVariant(theme.id)); // 'outline' | 'sharp'

    // 3) Layout
    root.style.setProperty('--app-action-justify', theme.layout.actionBarJustify);
    root.style.setProperty('--app-primary-fullwidth', theme.layout.primaryButtonFullWidth ? '1' : '0');
  }

  private resetToAppDefault(): void {
    const body = document.body;
    body.classList.remove(
      'theme-profesional',
      'theme-argentina',
      'theme-naif',
      'theme-light',
      'theme-dark',
      'theme-custom'
    );
    body.classList.remove('primary-fullwidth');

    const root = document.documentElement;

    // Tokens app
    root.style.removeProperty('--app-primary');
    root.style.removeProperty('--app-secondary');
    root.style.removeProperty('--app-bg');
    root.style.removeProperty('--app-surface');
    root.style.removeProperty('--app-text');
    root.style.removeProperty('--app-font-family');
    root.style.removeProperty('--app-font-size-base');
    root.style.removeProperty('--app-btn-radius');
    root.style.removeProperty('--app-action-justify');
    root.style.removeProperty('--app-primary-fullwidth');
    root.style.removeProperty('--app-bg-image');
    root.style.removeProperty('--app-logo-image');
    root.style.removeProperty('--app-icon-variant');

    // Ionic (volver al :root original)
    root.style.removeProperty('--ion-color-primary');
    root.style.removeProperty('--ion-color-primary-rgb');
    root.style.removeProperty('--ion-color-primary-contrast');
    root.style.removeProperty('--ion-color-primary-contrast-rgb');
    root.style.removeProperty('--ion-text-color');
    root.style.removeProperty('--ion-background-color');
  }
}
