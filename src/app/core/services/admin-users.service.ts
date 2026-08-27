import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { RoleUsuario } from './auth.service';

export interface PerfilUsuarioRow {
  id: string;
  role: RoleUsuario;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: RoleUsuario;
}

export interface CreateUserResult {
  id: string;
  email: string;
  role: RoleUsuario;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly supabase = inject(SupabaseService);

  async listPerfis(): Promise<PerfilUsuarioRow[]> {
    const { data, error } = await this.supabase.client.from('perfis_usuarios').select('id, role');
    if (error) {
      throw error;
    }
    return (data ?? []) as PerfilUsuarioRow[];
  }

  async createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const { data, error } = await this.supabase.client.functions.invoke('create-user', {
      body: input,
    });
    if (error) {
      throw error;
    }
    return data as CreateUserResult;
  }
}
