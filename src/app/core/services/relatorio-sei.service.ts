import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type CampoComplemento = 'PJES_DIARIA' | 'FISCALIZACAO' | 'POG' | 'DIRESP' | 'OBSERVACOES';

export interface ComplementoRow {
  campo: CampoComplemento;
  conteudo: string;
}

@Injectable({ providedIn: 'root' })
export class RelatorioSeiService {
  private readonly supabase = inject(SupabaseService);

  async listComplementos(data: string): Promise<ComplementoRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .select('campo, conteudo')
      .eq('data', data);
    if (error) throw error;
    return (rows ?? []) as ComplementoRow[];
  }

  async salvarComplemento(data: string, campo: CampoComplemento, conteudo: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .upsert({ data, campo, conteudo }, { onConflict: 'data,campo' });
    if (error) throw error;
  }
}
