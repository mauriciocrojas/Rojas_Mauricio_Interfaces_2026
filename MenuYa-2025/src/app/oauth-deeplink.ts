import { App } from '@capacitor/app';
import { supabase } from './supabase.client';

// Manejo global del deep link de OAuth para apps móviles (Capacitor)
App.addListener('appUrlOpen', async ({ url }) => {
  try {
    if (url && url.startsWith('io.ionic.starter://auth/callback')) {
      await supabase.auth.exchangeCodeForSession(url);
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
  }
});

