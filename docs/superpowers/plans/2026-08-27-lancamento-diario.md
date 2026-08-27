# Lançamento Diário / Painel do PC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operational "Painel do PC" screen: for a chosen date, resolve the expected roster from `fn_resolve_escala_dia` (Sub-projeto 1), overlay real deviations (falta, substituição, folga, remanejamento) recorded in four new tables, and let the user register new deviations from the same screen.

**Architecture:** Four new Postgres tables (one per deviation type, mirroring the SEI report sections) + a `LancamentoService` that calls the existing `fn_resolve_escala_dia` RPC and merges it client-side with the four tables' rows for the same date into a single `RosterRow[]` with a computed `statusEfetivo`. One page (`PainelPcPage`) with a date picker, guarnição/policial filters, a single "Registrar alteração" form (type-switched between the four deviation kinds), and a status table.

**Tech Stack:** Same as Sub-projeto 1 (Angular 21, Vitest, Supabase). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-lancamento-diario-design.md`

## Global Constraints

- Deviation types covered: FALTA, PERMUTA/SUBSTITUIÇÃO, FOLGA, REMANEJAMENTO. LTS/DTS, viaturas baixadas, and the SEI report generator are explicitly out of scope this pass.
- No edit/delete on registered deviations this pass — create-only, same simplification used for Sub-projeto 1's CRUD screens.
- New route `/lancamento` sits behind the existing `authGuard`, no `roleGuard` (same broad-access pattern already used for `/policiais`, `/viaturas`, `/guarnicoes`, `/escala-mensal`).
- RLS: `authenticated` reads and inserts on all four new tables, no per-companhia scoping — same pattern as every other table so far.
- Component naming stays suffix-less (`PainelPcPage` in `painel-pc-page.ts`), test runner is Vitest — established since Etapa 1.
- The existing `escalas` table (Etapa 1) is intentionally left unused by this feature — the spec's rationale: `fn_resolve_escala_dia` already provides the expected roster, so a redundant "launch" table isn't needed for this design.

---

### Task 1: Schema — quatro tabelas de lançamento diário

**Files:**
- Create: `supabase/migrations/20260827030000_lancamento_diario.sql`

**Interfaces:**
- Produces: `public.lancamento_faltas`, `public.lancamento_permutas`, `public.lancamento_folgas`, `public.lancamento_remanejamentos` — consumidas pela `LancamentoService` (Task 2).

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/20260827030000_lancamento_diario.sql`:
```sql
create table public.lancamento_faltas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_permutas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_substituto_matricula varchar(20) not null references public.policiais (matricula),
  policial_substituido_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  sei_numero text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_folgas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  sei_numero text,
  autorizacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_remanejamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  destino text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create or replace function public.fn_set_criado_por_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por = auth.uid();
  return new;
end;
$$;

create trigger trg_lancamento_faltas_criado_por
before insert on public.lancamento_faltas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_permutas_criado_por
before insert on public.lancamento_permutas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_folgas_criado_por
before insert on public.lancamento_folgas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_remanejamentos_criado_por
before insert on public.lancamento_remanejamentos
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_faltas enable row level security;
alter table public.lancamento_permutas enable row level security;
alter table public.lancamento_folgas enable row level security;
alter table public.lancamento_remanejamentos enable row level security;

create policy "authenticated_select_lancamento_faltas" on public.lancamento_faltas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_faltas" on public.lancamento_faltas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_permutas" on public.lancamento_permutas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_permutas" on public.lancamento_permutas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_folgas" on public.lancamento_folgas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_folgas" on public.lancamento_folgas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_remanejamentos" on public.lancamento_remanejamentos
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_remanejamentos" on public.lancamento_remanejamentos
  for insert to authenticated with check (true);
```

- [ ] **Step 2: Structural sanity check**

Run: `grep -c "^create table" supabase/migrations/20260827030000_lancamento_diario.sql`
Expected: `4`

Run: `grep -c "^create policy" supabase/migrations/20260827030000_lancamento_diario.sql`
Expected: `8`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827030000_lancamento_diario.sql
git commit -m "feat: add lancamento diario tables (faltas, permutas, folgas, remanejamentos)"
```

---

### Task 2: `LancamentoService`

**Files:**
- Create: `src/app/core/services/lancamento.service.ts`
- Test: `src/app/core/services/lancamento.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (Etapa 1), `fn_resolve_escala_dia` RPC (Sub-projeto 1).
- Produces:
  - `type StatusEfetivo = 'PREVISTO' | 'FALTA' | 'SUBSTITUIDO' | 'FOLGA' | 'REMANEJADO'`
  - `interface RosterRow { escalaMensalId: string; guarnicaoId: string; policialMatricula: string; funcao: 'CMT' | 'MOT' | 'PAT'; horarioInicio: string; horarioFim: string; statusEfetivo: StatusEfetivo; detalhe: string | null }`
  - `LancamentoService.listRosterDoDia(data: string): Promise<RosterRow[]>`
  - `.registrarFalta(input)`, `.registrarPermuta(input)`, `.registrarFolga(input)`, `.registrarRemanejamento(input)` — consumidos pela Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/lancamento.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { LancamentoService } from './lancamento.service';
import { SupabaseService } from './supabase.service';

describe('LancamentoService', () => {
  const rosterRpcRow = {
    id: 'em1',
    guarnicao_id: 'g1',
    policial_matricula: '127934-3',
    funcao: 'CMT',
    horario_inicio: '06:00:00',
    horario_fim: '18:00:00',
  };

  function buildSupabaseStub(tables: Record<string, unknown[]>) {
    return {
      client: {
        rpc: vi.fn().mockResolvedValue({ data: [rosterRpcRow], error: null }),
        from: (table: string) => ({
          select: () => ({
            eq: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
          }),
        }),
      },
    };
  }

  it('marks a policial as FALTA when a matching lancamento_faltas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ policial_matricula: '127934-3', motivo: 'Atestado médico' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('FALTA');
    expect(result[0].detalhe).toBe('Atestado médico');
  });

  it('marks a policial as SUBSTITUIDO when a matching lancamento_permutas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_permutas: [
        { policial_substituido_matricula: '127934-3', policial_substituto_matricula: '999999-9' },
      ],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('SUBSTITUIDO');
    expect(result[0].detalhe).toContain('999999-9');
  });

  it('defaults to PREVISTO when there is no matching deviation row', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('PREVISTO');
    expect(result[0].detalhe).toBeNull();
  });

  it('registers a falta via insert on lancamento_faltas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFalta({ data: '2026-08-04', policial_matricula: '127934-3', motivo: 'Doente' });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: '2026-08-04', policial_matricula: '127934-3', motivo: 'Doente' }),
    );
  });

  it('registers a permuta via insert on lancamento_permutas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarPermuta({
      data: '2026-08-04',
      policial_substituto_matricula: '999999-9',
      policial_substituido_matricula: '127934-3',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policial_substituto_matricula: '999999-9',
        policial_substituido_matricula: '127934-3',
      }),
    );
  });

  it('registers a folga via insert on lancamento_folgas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFolga({ data: '2026-08-04', policial_matricula: '127934-3' });

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ policial_matricula: '127934-3' }));
  });

  it('registers a remanejamento via insert on lancamento_remanejamentos', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarRemanejamento({
      data: '2026-08-04',
      policial_matricula: '127934-3',
      destino: 'OP. Paz',
    });

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ destino: 'OP. Paz' }));
  });
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: FAIL — `Cannot find module './lancamento.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/lancamento.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type StatusEfetivo = 'PREVISTO' | 'FALTA' | 'SUBSTITUIDO' | 'FOLGA' | 'REMANEJADO';

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
    const [rosterRes, faltasRes, permutasRes, folgasRes, remanejamentosRes] = await Promise.all([
      this.supabase.client.rpc('fn_resolve_escala_dia', { p_data: data }),
      this.supabase.client.from('lancamento_faltas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_permutas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_folgas').select('*').eq('data', data),
      this.supabase.client.from('lancamento_remanejamentos').select('*').eq('data', data),
    ]);

    if (rosterRes.error) throw rosterRes.error;
    if (faltasRes.error) throw faltasRes.error;
    if (permutasRes.error) throw permutasRes.error;
    if (folgasRes.error) throw folgasRes.error;
    if (remanejamentosRes.error) throw remanejamentosRes.error;

    const roster = (rosterRes.data ?? []) as RosterRpcRow[];
    const faltas = (faltasRes.data ?? []) as { policial_matricula: string; motivo: string | null }[];
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
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: PASS (7 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/lancamento.service.ts src/app/core/services/lancamento.service.spec.ts
git commit -m "feat: add LancamentoService merging roster with daily deviations"
```

---

### Task 3: Painel do PC — tela

**Files:**
- Create: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Create: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `LancamentoService` (Task 2), `GuarnicoesService.listGuarnicoes`, `PoliciaisService.listPoliciais` (Sub-projeto 1).
- Produces: `PainelPcPage` (standalone) — routed at `/lancamento` in Task 4.

- [ ] **Step 1: Generate the component**

Run: `npx ng generate component features/painel-pc/painel-pc-page --flat=false`

- [ ] **Step 2: Confirm the generated spec passes as-is**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: PASS.

- [ ] **Step 3: Implement the component**

Replace `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LancamentoService, RosterRow } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

type TipoLancamento = 'FALTA' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-painel-pc-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './painel-pc-page.html',
  styleUrl: './painel-pc-page.css',
})
export class PainelPcPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly filtroGuarnicaoId = signal('');
  readonly buscaPolicial = signal('');

  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
  readonly formPolicialMatricula = signal('');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formAutorizacao = signal('');
  readonly formDestino = signal('');
  readonly registrando = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
  }

  get rosterFiltrado(): RosterRow[] {
    let rows = this.roster();
    const guarnicaoId = this.filtroGuarnicaoId();
    if (guarnicaoId) {
      rows = rows.filter((r) => r.guarnicaoId === guarnicaoId);
    }
    const busca = this.buscaPolicial().trim().toLowerCase();
    if (busca) {
      rows = rows.filter(
        (r) =>
          r.policialMatricula.toLowerCase().includes(busca) ||
          this.policialNome(r.policialMatricula).toLowerCase().includes(busca),
      );
    }
    return rows;
  }

  async carregarListasBase(): Promise<void> {
    try {
      const [guarnicoes, policiais] = await Promise.all([
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
      ]);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
    } catch {
      this.errorMessage.set('Não foi possível carregar guarnições/policiais.');
    }
  }

  async reloadRoster(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.roster.set(await this.lancamentoService.listRosterDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar o lançamento do dia.');
    } finally {
      this.loading.set(false);
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await this.reloadRoster();
  }

  guarnicaoNome(id: string): string {
    return this.guarnicoes().find((g) => g.id === id)?.nome ?? '—';
  }

  policialNome(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.nome_guerra ?? matricula;
  }

  private limparFormulario(): void {
    this.formPolicialMatricula.set('');
    this.formSubstitutoMatricula.set('');
    this.formMotivo.set('');
    this.formSeiNumero.set('');
    this.formAutorizacao.set('');
    this.formDestino.set('');
  }

  async onRegistrar(): Promise<void> {
    this.registrando.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      switch (this.tipoLancamento()) {
        case 'FALTA':
          await this.lancamentoService.registrarFalta({
            data,
            policial_matricula: this.formPolicialMatricula(),
            motivo: this.formMotivo() || null,
          });
          break;
        case 'PERMUTA':
          await this.lancamentoService.registrarPermuta({
            data,
            policial_substituido_matricula: this.formPolicialMatricula(),
            policial_substituto_matricula: this.formSubstitutoMatricula(),
            sei_numero: this.formSeiNumero() || null,
          });
          break;
        case 'FOLGA':
          await this.lancamentoService.registrarFolga({
            data,
            policial_matricula: this.formPolicialMatricula(),
            sei_numero: this.formSeiNumero() || null,
            autorizacao: this.formAutorizacao() || null,
          });
          break;
        case 'REMANEJAMENTO':
          await this.lancamentoService.registrarRemanejamento({
            data,
            policial_matricula: this.formPolicialMatricula(),
            destino: this.formDestino(),
          });
          break;
      }
      this.limparFormulario();
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível registrar a alteração.');
    } finally {
      this.registrando.set(false);
    }
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Painel do PC</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow">
  <label class="text-sm text-slate-600">
    Data
    <input
      class="ml-2 rounded border border-slate-300 px-3 py-2"
      type="date"
      [ngModel]="data()"
      (ngModelChange)="onDataChange($event)"
      name="data"
    />
  </label>
  <select
    class="rounded border border-slate-300 px-3 py-2 text-sm"
    [ngModel]="filtroGuarnicaoId()"
    (ngModelChange)="filtroGuarnicaoId.set($event)"
    name="filtroGuarnicao"
  >
    <option value="">Todas as guarnições</option>
    @for (guarnicao of guarnicoes(); track guarnicao.id) {
      <option [value]="guarnicao.id">{{ guarnicao.nome }}</option>
    }
  </select>
  <input
    class="rounded border border-slate-300 px-3 py-2 text-sm"
    placeholder="Buscar policial (nome ou matrícula)"
    [ngModel]="buscaPolicial()"
    (ngModelChange)="buscaPolicial.set($event)"
    name="buscaPolicial"
  />
</section>

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Registrar alteração</h2>
  <form class="grid gap-3 sm:grid-cols-4" (ngSubmit)="onRegistrar()">
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="tipoLancamento()"
      (ngModelChange)="tipoLancamento.set($event)"
      name="tipoLancamento"
    >
      @for (tipo of tiposLancamento; track tipo) {
        <option [value]="tipo">{{ tipo }}</option>
      }
    </select>
    <select
      class="rounded border border-slate-300 px-3 py-2"
      required
      [ngModel]="formPolicialMatricula()"
      (ngModelChange)="formPolicialMatricula.set($event)"
      name="formPolicial"
    >
      <option value="" disabled>
        {{ tipoLancamento() === 'PERMUTA' ? 'Policial substituído' : 'Policial' }}
      </option>
      @for (policial of policiais(); track policial.matricula) {
        <option [value]="policial.matricula">{{ policial.nome_guerra }}</option>
      }
    </select>

    @if (tipoLancamento() === 'PERMUTA') {
      <select
        class="rounded border border-slate-300 px-3 py-2"
        required
        [ngModel]="formSubstitutoMatricula()"
        (ngModelChange)="formSubstitutoMatricula.set($event)"
        name="formSubstituto"
      >
        <option value="" disabled>Policial substituto</option>
        @for (policial of policiais(); track policial.matricula) {
          <option [value]="policial.matricula">{{ policial.nome_guerra }}</option>
        }
      </select>
      <input
        class="rounded border border-slate-300 px-3 py-2"
        placeholder="SEI Nº"
        [ngModel]="formSeiNumero()"
        (ngModelChange)="formSeiNumero.set($event)"
        name="formSei"
      />
    }

    @if (tipoLancamento() === 'FALTA') {
      <input
        class="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
        placeholder="Motivo"
        [ngModel]="formMotivo()"
        (ngModelChange)="formMotivo.set($event)"
        name="formMotivo"
      />
    }

    @if (tipoLancamento() === 'FOLGA') {
      <input
        class="rounded border border-slate-300 px-3 py-2"
        placeholder="SEI Nº"
        [ngModel]="formSeiNumero()"
        (ngModelChange)="formSeiNumero.set($event)"
        name="formSeiFolga"
      />
      <input
        class="rounded border border-slate-300 px-3 py-2"
        placeholder="Autorização"
        [ngModel]="formAutorizacao()"
        (ngModelChange)="formAutorizacao.set($event)"
        name="formAutorizacao"
      />
    }

    @if (tipoLancamento() === 'REMANEJAMENTO') {
      <input
        class="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
        placeholder="Destino"
        required
        [ngModel]="formDestino()"
        (ngModelChange)="formDestino.set($event)"
        name="formDestino"
      />
    }

    <button
      class="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50 sm:col-span-4"
      type="submit"
      [disabled]="registrando()"
    >
      Registrar
    </button>
  </form>
</section>

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  @if (loading()) {
    <p class="text-slate-500">Carregando...</p>
  } @else {
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">Guarnição</th>
          <th class="py-2">Policial</th>
          <th class="py-2">Função</th>
          <th class="py-2">Horário</th>
          <th class="py-2">Status</th>
          <th class="py-2">Detalhe</th>
        </tr>
      </thead>
      <tbody>
        @for (linha of rosterFiltrado; track linha.escalaMensalId) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ guarnicaoNome(linha.guarnicaoId) }}</td>
            <td class="py-2 text-slate-700">{{ policialNome(linha.policialMatricula) }}</td>
            <td class="py-2 text-slate-700">{{ linha.funcao }}</td>
            <td class="py-2 text-slate-700">{{ linha.horarioInicio }}–{{ linha.horarioFim }}</td>
            <td class="py-2">
              <span
                class="rounded px-2 py-1 text-xs font-medium"
                [class.bg-green-100]="linha.statusEfetivo === 'PREVISTO'"
                [class.text-green-700]="linha.statusEfetivo === 'PREVISTO'"
                [class.bg-red-100]="linha.statusEfetivo === 'FALTA'"
                [class.text-red-700]="linha.statusEfetivo === 'FALTA'"
                [class.bg-amber-100]="linha.statusEfetivo === 'SUBSTITUIDO'"
                [class.text-amber-700]="linha.statusEfetivo === 'SUBSTITUIDO'"
                [class.bg-blue-100]="linha.statusEfetivo === 'FOLGA'"
                [class.text-blue-700]="linha.statusEfetivo === 'FOLGA'"
                [class.bg-purple-100]="linha.statusEfetivo === 'REMANEJADO'"
                [class.text-purple-700]="linha.statusEfetivo === 'REMANEJADO'"
              >
                {{ linha.statusEfetivo }}
              </span>
            </td>
            <td class="py-2 text-slate-700">{{ linha.detalhe ?? '—' }}</td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 5: Confirm the component test still passes**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/painel-pc
git commit -m "feat: add Painel do PC page"
```

---

### Task 4: Roteamento e navegação

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.html`

**Interfaces:**
- Consumes: `PainelPcPage` (Task 3).

- [ ] **Step 1: Add the route**

In `src/app/app.routes.ts`, add this entry to the `children` array of the `''` route, alongside `policiais`/`viaturas`/`guarnicoes`/`escala-mensal`:
```typescript
      {
        path: 'lancamento',
        loadComponent: () =>
          import('./features/painel-pc/painel-pc-page/painel-pc-page').then((m) => m.PainelPcPage),
      },
```

- [ ] **Step 2: Add the link to the top bar**

In `src/app/layout/top-bar/top-bar.html`, insert right after the "Painel" link (before "Policiais"):
```html
    <a class="text-slate-600 hover:text-blue-600" routerLink="/lancamento" routerLinkActive="text-blue-600">
      Painel do PC
    </a>
```

- [ ] **Step 3: Add the link to the bottom nav**

In `src/app/layout/bottom-nav/bottom-nav.html`, insert right after the "Painel" link (before "Policiais"):
```html
  <a class="shrink-0 text-sm text-slate-600" routerLink="/lancamento" routerLinkActive="text-blue-600">
    Painel PC
  </a>
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test -- --watch=false`
Expected: all specs pass.

- [ ] **Step 5: Run a full production build**

Run: `npm run build`
Expected: succeeds, `painel-pc-page` shows up as a lazy chunk.

- [ ] **Step 6: Commit**

```bash
git add src/app/app.routes.ts src/app/layout/top-bar/top-bar.html src/app/layout/bottom-nav/bottom-nav.html
git commit -m "feat: wire up routing and navigation for Painel do PC"
```

---

### Task 5: Deploy e verificação ponta a ponta

**Files:** none.

- [ ] **Step 1: Run the full local test suite one more time**

Run: `npm test -- --watch=false`
Expected: all specs pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

- [ ] **Step 4: Deploy the migration (reuse the existing access token if still valid; otherwise ask the user for a new one)**

```bash
export SUPABASE_ACCESS_TOKEN="<token>"
./tools/supabase.exe db push
```
Expected: `20260827030000_lancamento_diario.sql` shows up as applied.

- [ ] **Step 5: Verify end-to-end against real 3ª CPM data**

Using the REST API (same pattern as Sub-projeto 1's verification): log in as the seeded ADMIN, call `rpc/fn_resolve_escala_dia` for a known PARES day (e.g. `2026-08-04`) to get a real `policial_matricula` + its `id` (escala_mensal row), then:
1. POST a row into `lancamento_faltas` for that `policial_matricula` and that date.
2. Re-run the equivalent of `LancamentoService.listRosterDoDia` logic (or just call the RPC + select the faltas table directly) and confirm that policial's row would now resolve to `FALTA`.
3. Clean up the test row (`DELETE` it) so the seeded data stays clean for the user.

- [ ] **Step 6: Report completion to the user**, noting that the SEI report generator and LTS/DTS tracking remain for a follow-up.

## Self-Review Notes

- **Spec coverage:** four deviation tables (Task 1), roster+deviation merge logic (Task 2), the Painel do PC UI with filters and a registration form (Task 3), routing/nav (Task 4), deploy/verification (Task 5) — every section of the spec maps to a task.
- **Type consistency:** `RosterRow`/`StatusEfetivo` defined once in `lancamento.service.ts` (Task 2), imported by `PainelPcPage` (Task 3) — no redefinition. Reuses `GuarnicaoRow`/`PolicialRow` from Sub-projeto 1's services rather than redefining them.
- **Build-order dependency:** none new — Task 3 depends on Task 2's service existing, Task 4 depends on Task 3's page existing, same linear pattern as Sub-projeto 1.
- **Ambiguity check:** the merge logic's precedence when a policial has rows in more than one deviation table on the same day (e.g. both a falta and a folga recorded by mistake) — `listRosterDoDia` checks FALTA, then SUBSTITUIDO, then FOLGA, then REMANEJADO in that fixed order, first match wins. Not spec'd explicitly; documented here as the implementation's tie-breaking rule rather than left ambiguous.
