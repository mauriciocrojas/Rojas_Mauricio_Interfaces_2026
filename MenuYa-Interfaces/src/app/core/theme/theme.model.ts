export type ThemeId =
  | 'profesional'
  | 'argentina'
  | 'naif'
  | 'light'
  | 'dark'
  | 'custom';

export interface ThemeConfig {
  id: ThemeId;
  label: string;

  // Tokens globales
  tokens: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    fontFamily: string;
    fontSizeBasePx: number;
    btnRadiusPx: number;
  };

  // Layout por tema (para “posición de botones”)
  layout: {
    actionBarJustify: 'flex-start' | 'center' | 'flex-end' | 'space-between';
    primaryButtonFullWidth: boolean;
  };
}
