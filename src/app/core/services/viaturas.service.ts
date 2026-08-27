import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ViaturaRow {
  prefixo: string;
  area_atuacao: string | null;
}

export interface CreateViaturaInput {
  prefixo: string;
  area_atuacao?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ViaturasService {
  private readonly supabase = inject(SupabaseService);

  async listViaturas(): Promise<ViaturaRow[]> {
    const { data, error } = await this.supabase.client
      .from('viaturas')
      .select('prefixo, area_atuacao')
      .order('prefixo');
    if (error) {
      throw error;
    }
    return (data ?? []) as ViaturaRow[];
  }

  async createViatura(input: CreateViaturaInput): Promise<ViaturaRow> {
    const { data, error } = await this.supabase.client
      .from('viaturas')
      .insert({ prefixo: input.prefixo, area_atuacao: input.area_atuacao ?? null })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as ViaturaRow;
  }

  async removeViatura(prefixo: string): Promise<void> {
    const { error } = await this.supabase.client.from('viaturas').delete().eq('prefixo', prefixo);
    if (error) {
      throw error;
    }
  }
}
