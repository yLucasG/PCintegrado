import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type TipoGuarnicao = 'GT_TATICO' | 'GT_ORDINARIO' | 'MO' | 'CP' | 'GV';

export interface GuarnicaoRow {
  id: string;
  nome: string;
  tipo: TipoGuarnicao;
  companhia_id: string;
  area_atuacao: string | null;
  prefixos: string[] | null;
}

export interface CreateGuarnicaoInput {
  nome: string;
  tipo: TipoGuarnicao;
  companhia_id: string;
  area_atuacao?: string | null;
  prefixos?: string[] | null;
}

@Injectable({ providedIn: 'root' })
export class GuarnicoesService {
  private readonly supabase = inject(SupabaseService);

  async listGuarnicoes(): Promise<GuarnicaoRow[]> {
    const { data, error } = await this.supabase.client
      .from('guarnicoes')
      .select('id, nome, tipo, companhia_id, area_atuacao, prefixos')
      .order('nome');
    if (error) {
      throw error;
    }
    return (data ?? []) as GuarnicaoRow[];
  }

  async createGuarnicao(input: CreateGuarnicaoInput): Promise<GuarnicaoRow> {
    const { data, error } = await this.supabase.client
      .from('guarnicoes')
      .insert({
        nome: input.nome,
        tipo: input.tipo,
        companhia_id: input.companhia_id,
        area_atuacao: input.area_atuacao ?? null,
        prefixos: input.prefixos ?? null,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as GuarnicaoRow;
  }

  async removeGuarnicao(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('guarnicoes').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
