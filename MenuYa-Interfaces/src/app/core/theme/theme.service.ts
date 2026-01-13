import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { ThemeConfig, ThemeId } from './theme.model';
import { DEFAULT_THEME_ID, THEMES, BaseThemeId } from './themes';
import { THEME_ASSETS, ThemeSound } from './theme-assets';

const KEY_THEME_ID = 'app_theme_id';
const KEY_THEME_CUSTOM = 'app_theme_custom'; // opcional

@Injectable({ providedIn: 'root' })
export class ThemeService {
    private theme$ = new BehaviorSubject<ThemeConfig>(THEMES[DEFAULT_THEME_ID]);

    get currentTheme() {
        return this.theme$.value;
    }

    themeChanges() {
        return this.theme$.asObservable();
    }

    async loadAndApply(): Promise<void> {
        const saved = await Preferences.get({ key: KEY_THEME_ID });
        const raw = saved.value as ThemeId | null;
        const id: ThemeId = raw ?? DEFAULT_THEME_ID;

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


        // 3) Layout
        root.style.setProperty('--app-action-justify', theme.layout.actionBarJustify);
        root.style.setProperty('--app-primary-fullwidth', theme.layout.primaryButtonFullWidth ? '1' : '0');
    }
}
