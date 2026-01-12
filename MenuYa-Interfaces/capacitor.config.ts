import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'MenuYa',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      showSpinner: false,
      launchFadeOutDuration: 200,
      // Importante: en Android 12+ este color NO afecta el splash de arranque del SO.
      backgroundColor: '#0f172a'
    }
  }
};

export default config;
