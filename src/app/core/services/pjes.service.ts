import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type FuncaoPjes = 'CMT' | 'MOT' | 'PAT' | 'OUTRO';
export type OrigemPjes = 'PDF' | 'MANUAL';
export type StatusPjes = 'PREVISTO' | 'FALTA' | 'ATRASADO';

export interface EscalaPjesRow {
  id: string;
  data: string;
  gtRotulo: string;
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nomeGuerra: string;
  telefone: string | null;
  horarioInicio: string;
  horarioFim: string;
  origem: OrigemPjes;
  observacao: string | null;
}

export interface NovaLinhaPjes {
  data: string;
  gt_rotulo: string;
  funcao: FuncaoPjes;
  graduacao?: string | null;
  matricula?: string | null;
  nome_guerra: string;
  telefone?: string | null;
  horario_inicio: string;
  horario_fim: string;
  origem: OrigemPjes;
  observacao?: string | null;
}

export interface PjesRosterRow {
  escalaPjesId: string;
  gtRotulo: string;
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nomeGuerra: string;
  telefone: string | null;
  horarioInicio: string;
  horarioFim: string;
  status: StatusPjes;
  horarioChegada: string | null;
  motivo: string | null;
}

interface EscalaPjesDb {
  id: string;
  data: string;
  gt_rotulo: string;
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nome_guerra: string;
  telefone: string | null;
  horario_inicio: string;
  horario_fim: string;
  origem: OrigemPjes;
  observacao: string | null;
}

function paraLinha(r: EscalaPjesDb): EscalaPjesRow {
  return {
    id: r.id,
    data: r.data,
    gtRotulo: r.gt_rotulo,
    funcao: r.funcao,
    graduacao: r.graduacao,
    matricula: r.matricula,
    nomeGuerra: r.nome_guerra,
    telefone: r.telefone,
    horarioInicio: r.horario_inicio,
    horarioFim: r.horario_fim,
    origem: r.origem,
    observacao: r.observacao,
  };
}

function paraInsert(l: NovaLinhaPjes) {
  return {
    data: l.data,
    gt_rotulo: l.gt_rotulo,
    funcao: l.funcao,
    graduacao: l.graduacao ?? null,
    matricula: l.matricula ?? null,
    nome_guerra: l.nome_guerra,
    telefone: l.telefone ?? null,
    horario_inicio: l.horario_inicio,
    horario_fim: l.horario_fim,
    origem: l.origem,
    observacao: l.observacao ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class PjesService {
  private readonly supabase = inject(SupabaseService);

  async listEscalaPjesDoDia(data: string): Promise<EscalaPjesRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('escala_pjes')
      .select('*')
      .eq('data', data)
      .order('gt_rotulo')
      .order('funcao');
    if (error) throw error;
    return ((rows ?? []) as EscalaPjesDb[]).map(paraLinha);
  }

  async listPjesRosterDoDia(data: string): Promise<PjesRosterRow[]> {
    const escala = await this.listEscalaPjesDoDia(data);
    if (escala.length === 0) return [];
    const { data: presRows, error } = await this.supabase.client
      .from('pjes_presenca')
      .select('*')
      .in('escala_pjes_id', escala.map((e) => e.id));
    if (error) throw error;
    const presenca = new Map(
      ((presRows ?? []) as { escala_pjes_id: string; status: StatusPjes; horario_chegada: string | null; motivo: string | null }[]).map(
        (p) => [p.escala_pjes_id, p],
      ),
    );
    return escala.map((e) => {
      const p = presenca.get(e.id);
      return {
        escalaPjesId: e.id,
        gtRotulo: e.gtRotulo,
        funcao: e.funcao,
        graduacao: e.graduacao,
        matricula: e.matricula,
        nomeGuerra: e.nomeGuerra,
        telefone: e.telefone,
        horarioInicio: e.horarioInicio,
        horarioFim: e.horarioFim,
        status: p?.status ?? 'PREVISTO',
        horarioChegada: p?.horario_chegada ?? null,
        motivo: p?.motivo ?? null,
      };
    });
  }

  async inserirLinhas(linhas: NovaLinhaPjes[]): Promise<void> {
    if (linhas.length === 0) return;
    const { error } = await this.supabase.client.from('escala_pjes').insert(linhas.map(paraInsert));
    if (error) throw error;
  }

  async substituirDiaImportado(data: string, linhas: NovaLinhaPjes[]): Promise<void> {
    const { error: delErr } = await this.supabase.client
      .from('escala_pjes')
      .delete()
      .eq('data', data)
      .eq('origem', 'PDF');
    if (delErr) throw delErr;
    await this.inserirLinhas(linhas);
  }

  async removerLinha(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('escala_pjes').delete().eq('id', id);
    if (error) throw error;
  }

  async registrarPresencaPjes(
    escalaPjesId: string,
    status: StatusPjes,
    opts?: { horario_chegada?: string | null; motivo?: string | null },
  ): Promise<void> {
    const { error } = await this.supabase.client.from('pjes_presenca').upsert(
      {
        escala_pjes_id: escalaPjesId,
        status,
        horario_chegada: opts?.horario_chegada ?? null,
        motivo: opts?.motivo ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'escala_pjes_id' },
    );
    if (error) throw error;
  }

  async limparPresencaPjes(escalaPjesId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('pjes_presenca')
      .delete()
      .eq('escala_pjes_id', escalaPjesId);
    if (error) throw error;
  }
}
