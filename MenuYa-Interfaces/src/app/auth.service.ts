// src/app/auth.service.ts
import { Injectable } from '@angular/core';
import { supabase } from './supabase.client';
import type { Session, User } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { environment } from '../environments/environment';

type AppError = Error & { code?: string; status?: number };

@Injectable({ providedIn: 'root' })
export class AuthService {

  // ================== ANÓNIMO (NUEVO) ==================
  private ANON_KEY = 'menuya_anon_v1';

  /** Guardar/actualizar datos del usuario anónimo (lo llamás al confirmar el ingreso anónimo). */
  async setAnonInfo(data: { name: string; avatar?: string | null }) {
    const payload = { isAnon: true, name: data.name, avatar: data.avatar ?? null };
    await Preferences.set({ key: this.ANON_KEY, value: JSON.stringify(payload) });
  }

  /** Obtener info anónima desde Storage. Incluye migración desde localStorage si existiera. */
  async getAnonInfo(): Promise<{ isAnon: boolean; name: string; avatar?: string | null }> {
    // 1) Intentar leer de Preferences (fuente oficial)
    const v = await Preferences.get({ key: this.ANON_KEY });
    if (v.value) {
      try {
        const parsed = JSON.parse(v.value);
        return {
          isAnon: !!parsed?.isAnon,
          name: parsed?.name ?? '',
          avatar: parsed?.avatar ?? null
        };
      } catch {
        await Preferences.remove({ key: this.ANON_KEY });
      }
    }

    // 2) ¿Y? MIGRACIÓN DESDE localStorage (por sesiones viejas)
    try {
      const legacy = localStorage.getItem('menuya_anon_info');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        const payload = {
          isAnon: !!parsed?.isAnon,
          name: parsed?.name ?? '',
          avatar: parsed?.avatar ?? null
        };
        await Preferences.set({ key: this.ANON_KEY, value: JSON.stringify(payload) });
        // opcional: limpiar legacy
        // localStorage.removeItem('menuya_anon_info');
        return payload;
      }
    } catch {}

    // 3) Si no había nada
    return { isAnon: false, name: '', avatar: null };
  }

  /** Limpiar estado anónimo (se usa en logout). */
  async signOutAnon(): Promise<void> {
    await Preferences.remove({ key: this.ANON_KEY });
  }
  // ======================================================

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw this.mapError(error);
    return data.session ?? null;
  }

  onAuthStateChange(cb: (signedIn: boolean) => void) {
    return supabase.auth.onAuthStateChange((_ev, session) => cb(!!session));
  }

  async signIn(email: string, password: string): Promise<User | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw this.mapError(error);
    return data.user ?? null;
  }

  async signUp(email: string, password: string): Promise<User | null> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw this.mapError(error, 'signup');
    return data.user ?? null;
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw this.mapError(error);
  }

  /** OAuth con proveedor (Google recomendado). Maneja web y nativo (Capacitor). */
  async signInWithProvider(provider: 'google'): Promise<void> {
    const redirectTo = Capacitor.isNativePlatform()
      ? 'io.ionic.starter://auth/callback'
      : (typeof window !== 'undefined' ? window.location.origin : undefined);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: false,
      }
    });
    if (error) throw this.mapError(error, 'signin');
  }

  /** Sign-in nativo con Google usando Capgo, sin redirects. Requiere environment.googleWebClientId */
  async signInWithGoogleNative(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('El ingreso nativo solo está disponible en la app móvil.');
    }
    const webClientId = (environment as any).googleWebClientId as string | undefined;
    if (!webClientId) {
      throw new Error('Falta configurar googleWebClientId en environments.');
    }
    // Inicializa y realiza el login con modo online para obtener idToken
    try {
      await (SocialLogin as any).initialize({
        google: { webClientId, mode: 'online' },
      });
    } catch {}

    const loginRes: any = await (SocialLogin as any).login({
      provider: 'google',
      options: { webClientId, mode: 'online' },
    });
    const idToken: string | null = loginRes?.result?.idToken ?? null;
    if (!idToken) throw new Error('No se obtuvo idToken de Google.');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw this.mapError(error, 'signin');
  }

  async getUserEmail(): Promise<string | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.email ?? null;
  }

  private mapError(err: { message?: string; status?: number; code?: string }, ctx: 'signup' | 'signin' | 'other' = 'other'): AppError {
    const status = err?.status;
    const raw = (err?.code || err?.message || '').toLowerCase();
    if (ctx === 'signup' && (status === 422 || raw.includes('already registered') || raw.includes('user already exists'))) {
      const e: AppError = new Error('Ese correo ya está registrado.'); e.code = 'email_exists'; e.status = status; return e;
    }
    if (raw.includes('invalid login') || raw.includes('invalid_credentials')) {
      const e: AppError = new Error('Correo o clave incorrectos.'); e.code = 'invalid_credentials'; e.status = status; return e;
    }
    if (raw.includes('email not confirmed') || raw.includes('email_not_confirmed')) {
      const e: AppError = new Error('Tenés que confirmar tu correo antes de iniciar sesión.'); e.code = 'email_not_confirmed'; e.status = status; return e;
    }
    if (raw.includes('rate limit') || raw.includes('too many')) {
      const e: AppError = new Error('Demasiados intentos. Probá en unos minutos.'); e.code = 'rate_limited'; e.status = status; return e;
    }
    if (raw.includes('fetch') || raw.includes('network') || raw.includes('failed to fetch')) {
      const e: AppError = new Error('Problema de conexión. Verificá tu internet e intentá de nuevo.'); e.code = 'network_error'; e.status = status; return e;
    }
    const e: AppError = new Error(err.message || 'Error de autenticación'); e.status = status; return e;
  }

  async getUserRole(): Promise<string | null> {
    const email = await this.getUserEmail();
    if (!email) return null;

    const { data, error } = await supabase
      .from('menuya_empleados')
      .select('rol')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error obteniendo rol:', error);
      return null;
    }
    return data?.rol ?? null;
  }

  async getClienteRole(): Promise<string | null> {
    const email = await this.getUserEmail();
    if (!email) return null;
    const { data, error } = await supabase
      .from('menuya_clientes')
      .select('rol')
      .eq('email', email)
      .single();
    if (error) {
      console.error('Error obteniendo rol cliente:', error);
      return null;
    }
    return data?.rol ?? null;
  }

  async savePushToken(token: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cleanToken = (token || '').trim();
    if (!cleanToken) return;

    const normalizeRole = (value: string | null | undefined) =>
      (value || '')
        .toLowerCase()
        .replace(/due[\u00f1\uFFFD]o/g, 'dueno')
        .trim();

    const rows: { user_id: string; role: string; token: string }[] = [];

    const { data: empleado } = await supabase
      .from('menuya_empleados')
      .select('rol')
      .eq('email', user.email)
      .maybeSingle();

    if (empleado?.rol) {
      const roleKey = normalizeRole(empleado.rol);
      if (roleKey) rows.push({ user_id: user.id, role: roleKey, token: cleanToken });
    } else {
      const { data: cliente } = await supabase
        .from('menuya_clientes')
        .select('rol, id')
        .eq('email', user.email)
        .maybeSingle();

      if (cliente) {
        const baseRole = normalizeRole(cliente.rol || 'cliente') || 'cliente';
        rows.push({ user_id: user.id, role: baseRole, token: cleanToken });
        if (cliente.id) {
          rows.push({ user_id: user.id, role: `cliente_${cliente.id}`, token: cleanToken });
        }
      }
    }

    if (rows.length) {
      const dedup = new Map<string, { user_id: string; role: string; token: string }>();
      for (const row of rows) {
        dedup.set(`${row.user_id}_${row.role}`, row);
      }

      // Limpiar tokens duplicados antes de registrar el actual
      await supabase.from('user_tokens').delete().eq('token', cleanToken);
      for (const row of dedup.values()) {
        await supabase.from('user_tokens').delete().eq('user_id', row.user_id).eq('role', row.role);
      }

      await supabase.from('user_tokens').upsert(Array.from(dedup.values()));
    }
  }

  // Caso específico: nuevo cliente → notificar a dueño
  async notifyNewClient(newClientName: string) {
    try {
      const res = await fetch(
        'https://vjthgijqloomeatknoxz.functions.supabase.co/notify_new_client',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newClientName }),
        }
      );

      if (!res.ok) throw new Error('Error al enviar notificación');
      console.log('Notificación enviada a dueño');
    } catch (err) {
      console.error(err);
    }
  }

  async notifyTargets(input: { roles?: string[]; userIds?: string[]; title: string; body: string; data?: any }) {
    try {
      const normalizeRole = (value: string | null | undefined) =>
        (value || '')
          .toLowerCase()
          .replace(/due[\u00f1\uFFFD]o/g, 'dueno')
          .trim();

      const roles = (input.roles ?? [])
        .map((r) => normalizeRole(r))
        .filter((r) => !!r);
      const userIds = (input.userIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => !!id);

      if (!roles.length && !userIds.length) {
        console.warn('[AuthService] notifyTargets sin destinatarios');
        return;
      }

      const payload: any = {
        title: input.title,
        body: input.body,
      };
      if (roles.length) payload.roles = roles;
      if (userIds.length) payload.userIds = userIds;
      if (typeof input.data !== 'undefined') payload.data = input.data;

      const res = await fetch(
        'https://vjthgijqloomeatknoxz.functions.supabase.co/notify_new_client',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error('Error al enviar notificaci??n');
    } catch (err) {
      console.error(err);
    }
  }

  // Env??o gen??rico a roles (preparado para otros eventos)
  async notifyRoles(roles: string[], title: string, body: string, data?: any) {
    await this.notifyTargets({ roles, title, body, data });
  }
}
