import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class WaitlistGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    try {
      // Empleados: sin restricción
      const employeeRole = await this.auth.getUserRole();
      if (employeeRole) return true;

      // Resolver cliente actual (registrado o anónimo)
      const email = await this.auth.getUserEmail();
      let enEspera: boolean | null = null;

      if (email) {
        const { data, error } = await supabase
          .from('menuya_clientes')
          .select('en_espera')
          .eq('email', email)
          .single();
        if (!error) enEspera = (data as any)?.en_espera ?? null;
      } else {
        // Usuario anónimo: buscar el último registro sin email
        const { data, error } = await supabase
          .from('menuya_clientes')
          .select('en_espera')
          .is('email', null)
          .neq('estado', 'rechazado')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error) enEspera = (data as any)?.en_espera ?? null;
      }

      // Si está en lista de espera, solo puede ver encuestas
      if (enEspera === true) {
        return this.router.createUrlTree(['/encuestas']);
      }

      return true;
    } catch {
      // En caso de duda, permitir navegación (UI ya restringe acciones)
      return true;
    }
  }
}

