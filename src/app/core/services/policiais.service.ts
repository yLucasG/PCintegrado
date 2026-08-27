import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PolicialRow {
  matricula: string;
  graduacao: string;
  nome_guerra: string;
  telefone: string | null;
  companhia_id: string | null;
}

export interface CreatePolicialInput {
  matricula: string;
  graduacao: string;
  nome_guerra: string;
  telefone?: string | null;
  companhia_id?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PoliciaisService {
  private readonly supabase = inject(SupabaseService);

  async listPoliciais(): Promise<PolicialRow[]> {
    const { data, error } = await this.supabase.client
      .from('policiais')
      .select('matricula, graduacao, nome_guerra, telefone, companhia_id')
      .order('nome_guerra');
    if (error) {
      throw error;
    }
    return (data ?? []) as PolicialRow[];
  }

  async createPolicial(input: CreatePolicialInput): Promise<PolicialRow> {
    const { data, error } = await this.supabase.client
      .from('policiais')
      .insert({
        matricula: input.matricula,
        graduacao: input.graduacao,
        nome_guerra: input.nome_guerra,
        telefone: input.telefone ?? null,
        companhia_id: input.companhia_id ?? null,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as PolicialRow;
  }

  async removePolicial(matricula: string): Promise<void> {
    const { error } = await this.supabase.client.from('policiais').delete().eq('matricula', matricula);
    if (error) {
      throw error;
    }
  }
}
