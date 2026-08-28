import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type RoleUsuario =
  | 'ADMIN'
  | 'CIA_1'
  | 'CIA_2'
  | 'CIA_3'
  | 'PCTAT'
  | 'PJES'
  | 'PC_LANCAMENTO';

export interface PerfilUsuario {
  id: string;
  role: RoleUsuario;
}

/** Companhia à qual o perfil está restrito, ou null quando vê tudo. */
export function companhiaDoRole(role: RoleUsuario): string | null {
  switch (role) {
    case 'CIA_1':
      return '1ª CPM';
    case 'CIA_2':
      return '2ª CPM';
    case 'CIA_3':
      return '3ª CPM';
    case 'PCTAT':
      return 'PCTAT';
    case 'PJES':
      return 'PJES';
    default:
      return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  private readonly perfilSubject = new BehaviorSubject<PerfilUsuario | null>(null);
  private readonly initializedSubject = new BehaviorSubject<boolean>(false);

  readonly session$ = this.sessionSubject.asObservable();
  readonly perfil$ = this.perfilSubject.asObservable();
  readonly initialized$ = this.initializedSubject.asObservable();

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.sessionSubject.next(data.session);
      if (data.session) {
        this.loadPerfil(data.session.user.id).finally(() => this.initializedSubject.next(true));
      } else {
        this.initializedSubject.next(true);
      }
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSubject.next(session);
      if (session) {
        this.loadPerfil(session.user.id);
      } else {
        this.perfilSubject.next(null);
      }
    });
  }

  get currentSession(): Session | null {
    return this.sessionSubject.value;
  }

  get currentPerfil(): PerfilUsuario | null {
    return this.perfilSubject.value;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  private async loadPerfil(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('perfis_usuarios')
      .select('id, role')
      .eq('id', userId)
      .single();
    this.perfilSubject.next((data as PerfilUsuario | null) ?? null);
  }
}
