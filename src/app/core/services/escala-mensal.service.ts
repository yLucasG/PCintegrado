import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type TipoRecorrencia = 'PARES' | 'IMPARES' | 'DIAS_ESPECIFICOS' | 'SEG_A_SEX' | 'TODOS_OS_DIAS';

export interface EscalaMensalRow {
  id: string;
  guarnicao_id: string;
  policial_matricula: string;
  funcao: 'CMT' | 'MOT' | 'PAT';
  horario_inicio: string;
  horario_fim: string;
  tipo_recorrencia: TipoRecorrencia;
  dias_especificos: number[] | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  escala_origem: string | null;
}

export interface CreateEscalaMensalInput {
  guarnicao_id: string;
  policial_matricula: string;
  funcao: 'CMT' | 'MOT' | 'PAT';
  horario_inicio: string;
  horario_fim: string;
  tipo_recorrencia: TipoRecorrencia;
  dias_especificos?: number[] | null;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  escala_origem?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EscalaMensalService {
  private readonly supabase = inject(SupabaseService);

  async listEscalaMensal(): Promise<EscalaMensalRow[]> {
    const { data, error } = await this.supabase.client
      .from('escala_mensal')
      .select(
        'id, guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, dias_especificos, vigencia_inicio, vigencia_fim, escala_origem',
      )
      .order('vigencia_inicio', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as EscalaMensalRow[];
  }

  async createEscalaMensal(input: CreateEscalaMensalInput): Promise<EscalaMensalRow> {
    const { data, error } = await this.supabase.client
      .from('escala_mensal')
      .insert({
        guarnicao_id: input.guarnicao_id,
        policial_matricula: input.policial_matricula,
        funcao: input.funcao,
        horario_inicio: input.horario_inicio,
        horario_fim: input.horario_fim,
        tipo_recorrencia: input.tipo_recorrencia,
        dias_especificos: input.dias_especificos ?? null,
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim ?? null,
        escala_origem: input.escala_origem ?? null,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as EscalaMensalRow;
  }

  async removeEscalaMensal(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('escala_mensal').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
