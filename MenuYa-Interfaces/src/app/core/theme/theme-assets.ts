import { ThemeId } from './theme.model';

export type ThemeSound = 'start' | 'close' | 'click';

export const THEME_ASSETS: Record<ThemeId, {
  logo: string;
  background: string;
  iconVariant: 'outline' | 'sharp';
  sounds: Record<ThemeSound, string>;
}> = {
  profesional: {
    logo: 'url("/assets/app-icon.png")'
,
    background: 'assets/theme/profesional/bg.png',
    iconVariant: 'outline',
    sounds: {
      start: 'assets/sounds/pro/start.mp3',
      close: 'assets/sounds/pro/close.mp3',
      click: 'assets/sounds/pro/click.mp3',
    },
  },
  argentina: {
    logo: 'url("/assets/app-icon.png")'
,
    background: 'assets/theme/argentina/bg.png',
    iconVariant: 'outline',
    sounds: {
      start: 'assets/sounds/ar/start.mp3',
      close: 'assets/sounds/ar/close.mp3',
      click: 'assets/sounds/ar/click.mp3',
    },
  },
  naif: {
    logo: 'url("/assets/app-icon.png")'
,
    background: 'assets/theme/naif/bg.png',
    iconVariant: 'sharp',
    sounds: {
      start: 'assets/sounds/naif/start.mp3',
      close: 'assets/sounds/naif/close.mp3',
      click: 'assets/sounds/naif/click.mp3',
    },
  },
  light: {
    logo: 'url("/assets/app-icon.png")'
,
    background: 'assets/theme/light/bg.png',
    iconVariant: 'outline',
    sounds: {
      start: 'assets/sounds/light/start.mp3',
      close: 'assets/sounds/light/close.mp3',
      click: 'assets/sounds/light/click.mp3',
    },
  },
  dark: {
    logo: 'assets/theme/dark/logo.png',
    background: 'assets/theme/dark/bg.png',
    iconVariant: 'outline',
    sounds: {
      start: 'assets/sounds/dark/start.mp3',
      close: 'assets/sounds/dark/close.mp3',
      click: 'assets/sounds/dark/click.mp3',
    },
  },
  custom: {
    logo: 'url("/assets/app-icon.png")'
,
    background: 'assets/theme/custom/bg.png',
    iconVariant: 'outline',
    sounds: {
      start: 'assets/sounds/custom/start.mp3',
      close: 'assets/sounds/custom/close.mp3',
      click: 'assets/sounds/custom/click.mp3',
    },
  },
};
