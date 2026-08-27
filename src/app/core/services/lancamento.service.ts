import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type StatusEfetivo = 'PREVISTO' | 'FALTA' | 'ATRASADO' | 'SUBSTITUIDO' | 'FOLGA' | 'REMANEJADO';

export interface RosterRow {
  escalaMensalId: string;
  guarnicaoId: string;
  policialMatricula: string;
  funcao: 'CMT' | 'MOT' | 'PAT';
  horarioInicio: string;
  horarioFim: string;
  statusEfetivo: StatusEfetivo;
  detalhe: string | null;
}

export interface RegistrarFaltaInput {
  data: string;
  policial_matricula: string;
  escala_mensal_id?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  motivo?: string | null;
}

export interface RegistrarAtrasoInput {
  data: string;
  policial_matricula: string;
  escala_mensal_id?: string | null;
  horario_chegada?: string | null;
  motivo?: string | null;
}

export interface RegistrarPermutaInput {
  data: string;
  policial_substituto_matricula: string;
  policial_substituido_matricula: string;
  escala_mensal_id?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  sei_numero?: string | null;
}

export interface RegistrarFolgaInput {
  data: string;
  policial_matricula: string;
  escala_mensal_id?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  sei_numero?: string | null;
  autorizacao?: string | null;
}

export interface RegistrarRemanejamentoInput {
  data: string;
  policial_matricula: string;
  escala_mensal_id?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  destino: string;
}

interface RosterRpcRow {
  id: string;
  guarnicao_id: string;
  policial_matricula: string;
  funcao: 'CMT' | 'MOT' | 'PAT';
  horario_inicio: string;
  horario_fim: string;
}

@Injectable({ providedIn: 'root' })
export class LancamentoService {
  private readonly supabase = inject(SupabaseService);

  async listRosterDoDia(data: string): Promise<RosterRow[]> {
    const [rosterRes, faltasRes, atrasosRes, permutasRes, folgasRes, remanejamentosRes] = await Promise.all([
      this.supabase.client.rpc('fn_resolve_escala_dia', { p_data: data }),
      this.supabase.client.from('lancamento_faltas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_atrasos').select('*').eq('data', data),
      this.supabase.client.from('lancamento_permutas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_folgas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_remanejamentos').select('*').eq('data', data),
    ]);

    if (rosterRes.error) throw rosterRes.error;
    if (faltasRes.error) throw faltasRes.error;
    if (atrasosRes.error) throw atrasosRes.error;
    if (permutasRes.error) throw permutasRes.error;
    if (folgasRes.error) throw folgasRes.error;
    if (remanejamentosRes.error) throw remanejamentosRes.error;

    const roster = (rosterRes.data ?? []) as RosterRpcRow[];
    const faltas = (faltasRes.data ?? []) as { policial_matricula: string; motivo: string | null }[];
    const atrasos = (atrasosRes.data ?? []) as { policial_matricula: string; motivo: string | null }[];
    const permutas = (permutasRes.data ?? []) as {
      policial_substituido_matricula: string;
      policial_substituto_matricula: string;
    }[];
    const folgas = (folgasRes.data ?? []) as { policial_matricula: string; autorizacao: string | null }[];
    const remanejamentos = (remanejamentosRes.data ?? []) as {
      policial_matricula: string;
      destino: string;
    }[];

    return roster.map((row): RosterRow => {
      const base = {
        escalaMensalId: row.id,
        guarnicaoId: row.guarnicao_id,
        policialMatricula: row.policial_matricula,
        funcao: row.funcao,
        horarioInicio: row.horario_inicio,
        horarioFim: row.horario_fim,
      };

      const falta = faltas.find((f) => f.policial_matricula === row.policial_matricula);
      if (falta) {
        return { ...base, statusEfetivo: 'FALTA', detalhe: falta.motivo };
      }

      const atraso = atrasos.find((a) => a.policial_matricula === row.policial_matricula);
      if (atraso) {
        return { ...base, statusEfetivo: 'ATRASADO', detalhe: atraso.motivo };
      }

      const permuta = permutas.find((p) => p.policial_substituido_matricula === row.policial_matricula);
      if (permuta) {
        return {
          ...base,
          statusEfetivo: 'SUBSTITUIDO',
          detalhe: `Substituído por ${permuta.policial_substituto_matricula}`,
        };
      }

      const folga = folgas.find((f) => f.policial_matricula === row.policial_matricula);
      if (folga) {
        return { ...base, statusEfetivo: 'FOLGA', detalhe: folga.autorizacao };
      }

      const remanejamento = remanejamentos.find((r) => r.policial_matricula === row.policial_matricula);
      if (remanejamento) {
        return { ...base, statusEfetivo: 'REMANEJADO', detalhe: remanejamento.destino };
      }

      return { ...base, statusEfetivo: 'PREVISTO', detalhe: null };
    });
  }

  async registrarFalta(input: RegistrarFaltaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_faltas').insert({
      data: input.data,
      policial_matricula: input.policial_matricula,
      escala_mensal_id: input.escala_mensal_id ?? null,
      horario_inicio: input.horario_inicio ?? null,
      horario_fim: input.horario_fim ?? null,
      motivo: input.motivo ?? null,
    });
    if (error) throw error;
  }

  async registrarAtraso(input: RegistrarAtrasoInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_atrasos').insert({
      data: input.data,
      policial_matricula: input.policial_matricula,
      escala_mensal_id: input.escala_mensal_id ?? null,
      horario_chegada: input.horario_chegada ?? null,
      motivo: input.motivo ?? null,
    });
    if (error) throw error;
  }

  async registrarPermuta(input: RegistrarPermutaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_permutas').insert({
      data: input.data,
      policial_substituto_matricula: input.policial_substituto_matricula,
      policial_substituido_matricula: input.policial_substituido_matricula,
      escala_mensal_id: input.escala_mensal_id ?? null,
      horario_inicio: input.horario_inicio ?? null,
      horario_fim: input.horario_fim ?? null,
      sei_numero: input.sei_numero ?? null,
    });
    if (error) throw error;
  }

  async registrarFolga(input: RegistrarFolgaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_folgas').insert({
      data: input.data,
      policial_matricula: input.policial_matricula,
      escala_mensal_id: input.escala_mensal_id ?? null,
      horario_inicio: input.horario_inicio ?? null,
      horario_fim: input.horario_fim ?? null,
      sei_numero: input.sei_numero ?? null,
      autorizacao: input.autorizacao ?? null,
    });
    if (error) throw error;
  }

  async registrarRemanejamento(input: RegistrarRemanejamentoInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_remanejamentos').insert({
      data: input.data,
      policial_matricula: input.policial_matricula,
      escala_mensal_id: input.escala_mensal_id ?? null,
      horario_inicio: input.horario_inicio ?? null,
      horario_fim: input.horario_fim ?? null,
      destino: input.destino,
    });
    if (error) throw error;
  }
}
