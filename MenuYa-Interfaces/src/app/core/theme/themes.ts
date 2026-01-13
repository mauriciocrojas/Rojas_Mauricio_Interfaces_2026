import { ThemeConfig, ThemeId } from './theme.model';

export type BaseThemeId = Exclude<ThemeId, 'custom'>;


export const DEFAULT_THEME_ID: BaseThemeId = 'profesional';

export const THEMES: Record<BaseThemeId, ThemeConfig> = {
  profesional: {
    id: 'profesional',
    label: 'Profesional',
    tokens: {
      primary: '#687FE5',
      secondary: '#2DD4BF',
      background: '#0B1220',
      surface: '#121A2B',
      text: '#E8EEF9',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSizeBasePx: 16,
      btnRadiusPx: 10,
    },
    layout: {
      actionBarJustify: 'flex-end',
      primaryButtonFullWidth: false,
    },
  },

  argentina: {
    id: 'argentina',
    label: 'Argentina',
    tokens: {
      primary: '#75AADB',     // celeste
      secondary: '#F6C445',   // “sol”
      background: '#07131F',
      surface: '#0E2236',
      text: '#EAF4FF',
      fontFamily: 'system-ui, Segoe UI, Roboto, Arial',
      fontSizeBasePx: 16,
      btnRadiusPx: 14,
    },
    layout: {
      actionBarJustify: 'space-between',
      primaryButtonFullWidth: false,
    },
  },

  naif: {
    id: 'naif',
    label: 'Naif',
    tokens: {
      primary: '#FF4D8D',
      secondary: '#7CFFCB',
      background: '#1A1026',
      surface: '#22163A',
      text: '#FFF3FA',
      fontFamily: '"Comic Sans MS", "Trebuchet MS", system-ui', // sí, Naif con orgullo 😄
      fontSizeBasePx: 17,
      btnRadiusPx: 24,
    },
    layout: {
      actionBarJustify: 'center',
      primaryButtonFullWidth: true,
    },
  },

  light: {
    id: 'light',
    label: 'Claro',
    tokens: {
      primary: '#2563EB',
      secondary: '#10B981',
    background: 'rgba(167, 100, 100, 1)',   // gris-azulado suave (no blanco puro)
      surface: 'rgba(194, 207, 217, 1)',
      text: '#313c56ff',
      fontFamily: 'system-ui, Segoe UI, Roboto, Arial',
      fontSizeBasePx: 16,
      btnRadiusPx: 12,
    },
    layout: {
      actionBarJustify: 'flex-end',
      primaryButtonFullWidth: false,
    },
  },

  dark: {
    id: 'dark',
    label: 'Oscuro',
    tokens: {
      primary: '#A78BFA',
      secondary: '#22D3EE',
      background: '#070A12',
      surface: '#0C1020',
      text: '#E5E7EB',
      fontFamily: 'system-ui, Segoe UI, Roboto, Arial',
      fontSizeBasePx: 16,
      btnRadiusPx: 12,
    },
    layout: {
      actionBarJustify: 'flex-end',
      primaryButtonFullWidth: false,
    },
  },
};
