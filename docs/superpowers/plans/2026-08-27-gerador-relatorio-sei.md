# Gerador de Relatório SEI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the lançamento data model with LTS/DTS (licenças), funções fixas (Guarda/PC 16º BPM/COPOM) and the missing SEI/situação/local fields, then build a `/relatorio-sei` page that assembles all of it into a copyable report matching the structure of `RelatórioFinalLançamento.pdf`, restricted to `PC_LANCAMENTO`/`ADMIN`.

**Architecture:** One migration adds three new tables (`lancamento_licencas`, `lancamento_funcoes_fixas`, `relatorio_sei_complementos`) and four new columns on existing tables. `LancamentoService` grows to cover licenças (a new `LICENCA` status resolved by date-range overlap, not exact-date match) and funções fixas. Painel do PC gains capture UI for the new fields. A new `RelatorioSeiService` + `RelatorioSeiPage` reads all of the day's lançamento data live (no snapshot) and renders it as HTML with a "Copiar texto" button; free-text sections are persisted to `relatorio_sei_complementos` so nothing is lost on reload.

**Tech Stack:** Same as the rest of the app — Angular 21 standalone components, Vitest, Supabase (Postgres + RLS), Tailwind v4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-gerador-relatorio-sei-design.md`

## Global Constraints

- PJES/Diária, Fiscalização, POG and viaturas DIRESP stay free text (`relatorio_sei_complementos`) — not structured this pass.
- No PDF generation — the report is an HTML page with a "Copiar texto" button that serializes to plain text.
- No versioning/history of generated reports — always computed live from the lançamento tables.
- No edit/delete UI for funções fixas this pass (create-only, same simplification used elsewhere in this codebase).
- `/relatorio-sei` behind `roleGuard` with `data.roles = ['PC_LANCAMENTO', 'ADMIN']`.
- Component naming stays suffix-less (`RelatorioSeiPage` in `relatorio-sei-page.ts`); component specs in this codebase are smoke tests (`should create`) — real assertions live in service specs, matching the established convention.
- `TipoGuarnicao` (`GT_TATICO` | `GT_ORDINARIO` | `MO` | `CP` | `GV`) does not map 1:1 onto the PDF's own jargon (`GS'S`, `GTS`, `GG`...) — the report's summary section uses our own type labels rather than guessing at an unverified mapping.

---

### Task 1: Schema — colunas novas e três tabelas novas

**Files:**
- Create: `supabase/migrations/20260827090000_relatorio_sei.sql`

**Interfaces:**
- Produces: `lancamento_atrasos.sei_numero`, `lancamento_baixas.sei_numero`, `lancamento_os.situacao`, `lancamento_os.local`, `public.lancamento_licencas`, `public.lancamento_funcoes_fixas`, `public.relatorio_sei_complementos` — consumed by `LancamentoService` and `RelatorioSeiService` (Tasks 2 and 7).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260827090000_relatorio_sei.sql`:
```sql
alter table public.lancamento_atrasos add column sei_numero text;
alter table public.lancamento_baixas add column sei_numero text;
alter table public.lancamento_os add column situacao text;
alter table public.lancamento_os add column local text;

create table public.lancamento_licencas (
  id uuid primary key default gen_random_uuid(),
  policial_matricula varchar(20) not null references public.policiais (matricula),
  data_inicio date not null,
  data_fim date not null,
  escala_mensal_id uuid references public.escala_mensal (id),
  sei_numero text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  constraint lancamento_licencas_periodo_valido check (data_fim >= data_inicio)
);

create trigger trg_lancamento_licencas_criado_por
before insert on public.lancamento_licencas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_licencas enable row level security;

create policy "authenticated_select_lancamento_licencas" on public.lancamento_licencas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_licencas" on public.lancamento_licencas
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_licencas" on public.lancamento_licencas
  for delete to authenticated using (true);

create type public.grupo_funcao_fixa as enum ('GUARDA', 'PC_BPM', 'COPOM');

create table public.lancamento_funcoes_fixas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  grupo public.grupo_funcao_fixa not null,
  funcao text not null,
  horario_inicio time not null,
  horario_fim time not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  fone_cmt text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_funcoes_fixas_criado_por
before insert on public.lancamento_funcoes_fixas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_funcoes_fixas enable row level security;

create policy "authenticated_select_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for delete to authenticated using (true);

create table public.relatorio_sei_complementos (
  data date not null,
  campo text not null,
  conteudo text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id),
  primary key (data, campo)
);

alter table public.relatorio_sei_complementos enable row level security;

create policy "authenticated_select_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for select to authenticated using (true);
create policy "authenticated_insert_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for insert to authenticated with check (true);
create policy "authenticated_update_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for update to authenticated using (true) with check (true);
```

- [ ] **Step 2: Structural sanity check**

Run: `grep -c "^create table" supabase/migrations/20260827090000_relatorio_sei.sql`
Expected: `3`

Run: `grep -c "^alter table public.lancamento_.* add column" supabase/migrations/20260827090000_relatorio_sei.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827090000_relatorio_sei.sql
git commit -m "feat: add licencas, funcoes fixas and relatorio complementos tables"
```

---

### Task 2: `LancamentoService` — licenças (LTS/DTS), funções fixas e campos novos

**Files:**
- Modify: `src/app/core/services/lancamento.service.ts`
- Modify: `src/app/core/services/lancamento.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (existing), tables from Task 1.
- Produces:
  - `StatusEfetivo` gains `'LICENCA'`.
  - `RegistrarLicencaInput`, `RegistrarFuncaoFixaInput`, `FuncaoFixaRow`, `GrupoFuncaoFixa` — consumed by Painel do PC (Tasks 3–5) and `RelatorioSeiService` (Task 7).
  - `LancamentoService.registrarLicenca(input)`, `.removerLicenca(id)`, `.listFuncoesFixasDoDia(data)`, `.registrarFuncaoFixa(input)`, `.removerFuncaoFixa(id)`.
  - `RegistrarAtrasoInput.sei_numero`, `RegistrarBaixaInput.sei_numero`, `BaixaRow.seiNumero`, `RegistrarOsInput.situacao`/`.local`, `OsRow.situacao`/`.local`.

- [ ] **Step 1: Write the failing tests**

Replace `src/app/core/services/lancamento.service.spec.ts` with the current content (unchanged tests kept intact) plus these additions — apply as a full-file replace:

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
          select: () => {
            const result = Promise.resolve({ data: tables[table] ?? [], error: null });
            return {
              eq: () => result,
              lte: () => ({ gte: () => result }),
            };
          },
        }),
      },
    };
  }

  it('marks a policial as FALTA when a matching lancamento_faltas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ id: 'falta1', policial_matricula: '127934-3', motivo: 'Atestado médico' }],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('FALTA');
    expect(result[0].detalhe).toBe('Atestado médico');
    expect(result[0].detalheId).toBe('falta1');
  });

  it('marks a policial as SUBSTITUIDO when a matching lancamento_permutas row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [
        { policial_substituido_matricula: '127934-3', policial_substituto_matricula: '999999-9' },
      ],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('SUBSTITUIDO');
    expect(result[0].detalhe).toContain('999999-9');
  });

  it('marks a policial as REMANEJADO with a detalheId when a matching lancamento_remanejamentos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [{ id: 'remanejamento1', policial_matricula: '127934-3', destino: 'GT 16332' }],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('REMANEJADO');
    expect(result[0].detalhe).toBe('GT 16332');
    expect(result[0].detalheId).toBe('remanejamento1');
  });

  it('marks a policial as ATRASADO when a matching lancamento_atrasos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [{ policial_matricula: '127934-3', motivo: 'Trânsito' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('ATRASADO');
    expect(result[0].detalhe).toBe('Trânsito');
  });

  it('marks a policial as LICENCA when a lancamento_licencas row overlaps the date, taking precedence over FALTA', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [{ id: 'falta1', policial_matricula: '127934-3', motivo: 'Não deveria aparecer' }],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [
        { id: 'licenca1', policial_matricula: '127934-3', data_inicio: '2026-08-01', data_fim: '2026-08-10' },
      ],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('LICENCA');
    expect(result[0].detalhe).toBe('2026-08-01 a 2026-08-10');
    expect(result[0].detalheId).toBe('licenca1');
  });

  it('defaults to PREVISTO with a null detalheId when there is no matching deviation row', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
      lancamento_licencas: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('PREVISTO');
    expect(result[0].detalhe).toBeNull();
    expect(result[0].detalheId).toBeNull();
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

  it('registers an atraso with an optional sei_numero via insert on lancamento_atrasos', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarAtraso({
      data: '2026-08-04',
      policial_matricula: '127934-3',
      horario_chegada: '07:15',
      sei_numero: '44900000',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ policial_matricula: '127934-3', horario_chegada: '07:15', sei_numero: '44900000' }),
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

  it('registers a licenca via insert on lancamento_licencas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarLicenca({
      policial_matricula: '127934-3',
      data_inicio: '2026-08-04',
      data_fim: '2026-08-06',
      sei_numero: '44965596',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policial_matricula: '127934-3',
        data_inicio: '2026-08-04',
        data_fim: '2026-08-06',
        sei_numero: '44965596',
      }),
    );
  });

  it('removes a falta by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerFalta('falta1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'falta1');
  });

  it('removes an atraso by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerAtraso('atraso1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'atraso1');
  });

  it('removes a remanejamento by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerRemanejamento('remanejamento1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'remanejamento1');
  });

  it('removes a licenca by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerLicenca('licenca1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'licenca1');
  });

  it('lists baixas for a given day, including seiNumero', async () => {
    const rows = [
      { id: 'baixa1', guarnicao_id: 'g1', horario_inicio: '06:00:00', motivo: 'Sem efetivo', sei_numero: null },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listBaixasDoDia('2026-08-04');

    expect(result).toEqual([
      { id: 'baixa1', guarnicaoId: 'g1', horarioInicio: '06:00:00', motivo: 'Sem efetivo', seiNumero: null },
    ]);
  });

  it('registers a baixa with an optional sei_numero via insert on lancamento_baixas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarBaixa({
      data: '2026-08-04',
      guarnicao_id: 'g1',
      horario_inicio: '06:00:00',
      sei_numero: '44900001',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ guarnicao_id: 'g1', horario_inicio: '06:00:00', sei_numero: '44900001' }),
    );
  });

  it('removes a baixa by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerBaixa('baixa1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'baixa1');
  });

  it('lists OS entries for a given day, including situacao and local', async () => {
    const rows = [
      {
        id: 'os1',
        guarnicao_id: 'g1',
        horario_inicio: '06:00:00',
        numero_os: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listOsDoDia('2026-08-04');

    expect(result).toEqual([
      {
        id: 'os1',
        guarnicaoId: 'g1',
        horarioInicio: '06:00:00',
        numeroOs: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      },
    ]);
  });

  it('registers an OS with optional situacao/local via insert on lancamento_os', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarOs({
      data: '2026-08-04',
      guarnicao_id: 'g1',
      horario_inicio: '06:00:00',
      numero_os: 'OS 123/2026',
      situacao: 'Apoio a ocorrência',
      local: 'Boa Vista',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guarnicao_id: 'g1',
        numero_os: 'OS 123/2026',
        situacao: 'Apoio a ocorrência',
        local: 'Boa Vista',
      }),
    );
  });

  it('removes an OS by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerOs('os1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'os1');
  });

  it('lists funcoes fixas for a given day, mapping snake_case fields to camelCase', async () => {
    const rows = [
      {
        id: 'ff1',
        grupo: 'GUARDA',
        funcao: 'Comandante',
        horario_inicio: '06:00:00',
        horario_fim: '06:00:00',
        policial_matricula: '127934-3',
        fone_cmt: '(81) 99999-0000',
      },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listFuncoesFixasDoDia('2026-08-04');

    expect(result).toEqual([
      {
        id: 'ff1',
        grupo: 'GUARDA',
        funcao: 'Comandante',
        horarioInicio: '06:00:00',
        horarioFim: '06:00:00',
        policialMatricula: '127934-3',
        foneCmt: '(81) 99999-0000',
      },
    ]);
  });

  it('registers a funcao fixa via insert on lancamento_funcoes_fixas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.registrarFuncaoFixa({
      data: '2026-08-04',
      grupo: 'PC_BPM',
      funcao: 'Despachante',
      horario_inicio: '06:00:00',
      horario_fim: '12:00:00',
      policial_matricula: '127934-3',
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ grupo: 'PC_BPM', funcao: 'Despachante', policial_matricula: '127934-3' }),
    );
  });

  it('removes a funcao fixa by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    await service.removerFuncaoFixa('ff1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'ff1');
  });
});
```

- [ ] **Step 2: Confirm the new/changed tests fail**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: FAIL — `service.registrarLicenca is not a function` (and similar for the other new members/fields).

- [ ] **Step 3: Implement the service**

Replace `src/app/core/services/lancamento.service.ts` in full:
```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type StatusEfetivo =
  | 'PREVISTO'
  | 'FALTA'
  | 'ATRASADO'
  | 'SUBSTITUIDO'
  | 'FOLGA'
  | 'REMANEJADO'
  | 'LICENCA';

export interface RosterRow {
  escalaMensalId: string;
  guarnicaoId: string;
  policialMatricula: string;
  funcao: 'CMT' | 'MOT' | 'PAT';
  horarioInicio: string;
  horarioFim: string;
  statusEfetivo: StatusEfetivo;
  detalhe: string | null;
  detalheId: string | null;
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
  sei_numero?: string | null;
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

export interface RegistrarLicencaInput {
  policial_matricula: string;
  data_inicio: string;
  data_fim: string;
  escala_mensal_id?: string | null;
  sei_numero?: string | null;
}

export interface BaixaRow {
  id: string;
  guarnicaoId: string;
  horarioInicio: string;
  motivo: string | null;
  seiNumero: string | null;
}

export interface RegistrarBaixaInput {
  data: string;
  guarnicao_id: string;
  horario_inicio: string;
  motivo?: string | null;
  sei_numero?: string | null;
}

export interface OsRow {
  id: string;
  guarnicaoId: string;
  horarioInicio: string;
  numeroOs: string;
  situacao: string | null;
  local: string | null;
}

export interface RegistrarOsInput {
  data: string;
  guarnicao_id: string;
  horario_inicio: string;
  numero_os: string;
  situacao?: string | null;
  local?: string | null;
}

export type GrupoFuncaoFixa = 'GUARDA' | 'PC_BPM' | 'COPOM';

export interface FuncaoFixaRow {
  id: string;
  grupo: GrupoFuncaoFixa;
  funcao: string;
  horarioInicio: string;
  horarioFim: string;
  policialMatricula: string;
  foneCmt: string | null;
}

export interface RegistrarFuncaoFixaInput {
  data: string;
  grupo: GrupoFuncaoFixa;
  funcao: string;
  horario_inicio: string;
  horario_fim: string;
  policial_matricula: string;
  fone_cmt?: string | null;
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
    const [rosterRes, faltasRes, atrasosRes, permutasRes, folgasRes, remanejamentosRes, licencasRes] =
      await Promise.all([
        this.supabase.client.rpc('fn_resolve_escala_dia', { p_data: data }),
        this.supabase.client.from('lancamento_faltas').select('*').eq('data', data),
        this.supabase.client.from('lancamento_atrasos').select('*').eq('data', data),
        this.supabase.client.from('lancamento_permutas').select('*').eq('data', data),
        this.supabase.client.from('lancamento_folgas').select('*').eq('data', data),
        this.supabase.client.from('lancamento_remanejamentos').select('*').eq('data', data),
        this.supabase.client.from('lancamento_licencas').select('*').lte('data_inicio', data).gte('data_fim', data),
      ]);

    if (rosterRes.error) throw rosterRes.error;
    if (faltasRes.error) throw faltasRes.error;
    if (atrasosRes.error) throw atrasosRes.error;
    if (permutasRes.error) throw permutasRes.error;
    if (folgasRes.error) throw folgasRes.error;
    if (remanejamentosRes.error) throw remanejamentosRes.error;
    if (licencasRes.error) throw licencasRes.error;

    const roster = (rosterRes.data ?? []) as RosterRpcRow[];
    const faltas = (faltasRes.data ?? []) as { id: string; policial_matricula: string; motivo: string | null }[];
    const atrasos = (atrasosRes.data ?? []) as { id: string; policial_matricula: string; motivo: string | null }[];
    const permutas = (permutasRes.data ?? []) as {
      policial_substituido_matricula: string;
      policial_substituto_matricula: string;
    }[];
    const folgas = (folgasRes.data ?? []) as { policial_matricula: string; autorizacao: string | null }[];
    const remanejamentos = (remanejamentosRes.data ?? []) as {
      id: string;
      policial_matricula: string;
      destino: string;
    }[];
    const licencas = (licencasRes.data ?? []) as {
      id: string;
      policial_matricula: string;
      data_inicio: string;
      data_fim: string;
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

      const licenca = licencas.find((l) => l.policial_matricula === row.policial_matricula);
      if (licenca) {
        return {
          ...base,
          statusEfetivo: 'LICENCA',
          detalhe: `${licenca.data_inicio} a ${licenca.data_fim}`,
          detalheId: licenca.id,
        };
      }

      const falta = faltas.find((f) => f.policial_matricula === row.policial_matricula);
      if (falta) {
        return { ...base, statusEfetivo: 'FALTA', detalhe: falta.motivo, detalheId: falta.id };
      }

      const atraso = atrasos.find((a) => a.policial_matricula === row.policial_matricula);
      if (atraso) {
        return { ...base, statusEfetivo: 'ATRASADO', detalhe: atraso.motivo, detalheId: atraso.id };
      }

      const permuta = permutas.find((p) => p.policial_substituido_matricula === row.policial_matricula);
      if (permuta) {
        return {
          ...base,
          statusEfetivo: 'SUBSTITUIDO',
          detalhe: `Substituído por ${permuta.policial_substituto_matricula}`,
          detalheId: null,
        };
      }

      const folga = folgas.find((f) => f.policial_matricula === row.policial_matricula);
      if (folga) {
        return { ...base, statusEfetivo: 'FOLGA', detalhe: folga.autorizacao, detalheId: null };
      }

      const remanejamento = remanejamentos.find((r) => r.policial_matricula === row.policial_matricula);
      if (remanejamento) {
        return {
          ...base,
          statusEfetivo: 'REMANEJADO',
          detalhe: remanejamento.destino,
          detalheId: remanejamento.id,
        };
      }

      return { ...base, statusEfetivo: 'PREVISTO', detalhe: null, detalheId: null };
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
      sei_numero: input.sei_numero ?? null,
    });
    if (error) throw error;
  }

  async removerFalta(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_faltas').delete().eq('id', id);
    if (error) throw error;
  }

  async removerAtraso(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_atrasos').delete().eq('id', id);
    if (error) throw error;
  }

  async removerRemanejamento(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_remanejamentos').delete().eq('id', id);
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

  async registrarLicenca(input: RegistrarLicencaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_licencas').insert({
      policial_matricula: input.policial_matricula,
      data_inicio: input.data_inicio,
      data_fim: input.data_fim,
      escala_mensal_id: input.escala_mensal_id ?? null,
      sei_numero: input.sei_numero ?? null,
    });
    if (error) throw error;
  }

  async removerLicenca(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_licencas').delete().eq('id', id);
    if (error) throw error;
  }

  async listBaixasDoDia(data: string): Promise<BaixaRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('lancamento_baixas')
      .select('*')
      .eq('data', data);
    if (error) throw error;
    return (
      (rows ?? []) as {
        id: string;
        guarnicao_id: string;
        horario_inicio: string;
        motivo: string | null;
        sei_numero: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      guarnicaoId: r.guarnicao_id,
      horarioInicio: r.horario_inicio,
      motivo: r.motivo,
      seiNumero: r.sei_numero,
    }));
  }

  async registrarBaixa(input: RegistrarBaixaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_baixas').insert({
      data: input.data,
      guarnicao_id: input.guarnicao_id,
      horario_inicio: input.horario_inicio,
      motivo: input.motivo ?? null,
      sei_numero: input.sei_numero ?? null,
    });
    if (error) throw error;
  }

  async removerBaixa(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_baixas').delete().eq('id', id);
    if (error) throw error;
  }

  async listOsDoDia(data: string): Promise<OsRow[]> {
    const { data: rows, error } = await this.supabase.client.from('lancamento_os').select('*').eq('data', data);
    if (error) throw error;
    return (
      (rows ?? []) as {
        id: string;
        guarnicao_id: string;
        horario_inicio: string;
        numero_os: string;
        situacao: string | null;
        local: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      guarnicaoId: r.guarnicao_id,
      horarioInicio: r.horario_inicio,
      numeroOs: r.numero_os,
      situacao: r.situacao,
      local: r.local,
    }));
  }

  async registrarOs(input: RegistrarOsInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_os').insert({
      data: input.data,
      guarnicao_id: input.guarnicao_id,
      horario_inicio: input.horario_inicio,
      numero_os: input.numero_os,
      situacao: input.situacao ?? null,
      local: input.local ?? null,
    });
    if (error) throw error;
  }

  async removerOs(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_os').delete().eq('id', id);
    if (error) throw error;
  }

  async listFuncoesFixasDoDia(data: string): Promise<FuncaoFixaRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('lancamento_funcoes_fixas')
      .select('*')
      .eq('data', data);
    if (error) throw error;
    return (
      (rows ?? []) as {
        id: string;
        grupo: GrupoFuncaoFixa;
        funcao: string;
        horario_inicio: string;
        horario_fim: string;
        policial_matricula: string;
        fone_cmt: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      grupo: r.grupo,
      funcao: r.funcao,
      horarioInicio: r.horario_inicio,
      horarioFim: r.horario_fim,
      policialMatricula: r.policial_matricula,
      foneCmt: r.fone_cmt,
    }));
  }

  async registrarFuncaoFixa(input: RegistrarFuncaoFixaInput): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_funcoes_fixas').insert({
      data: input.data,
      grupo: input.grupo,
      funcao: input.funcao,
      horario_inicio: input.horario_inicio,
      horario_fim: input.horario_fim,
      policial_matricula: input.policial_matricula,
      fone_cmt: input.fone_cmt ?? null,
    });
    if (error) throw error;
  }

  async removerFuncaoFixa(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('lancamento_funcoes_fixas').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: PASS (all specs, including the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/lancamento.service.ts src/app/core/services/lancamento.service.spec.ts
git commit -m "feat: add licencas (LTS/DTS) and funcoes fixas to LancamentoService"
```

---

### Task 3: Painel do PC — SEI no atraso, modal de baixa (motivo + SEI), situação/local na OS

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `LancamentoService.registrarAtraso` (now accepts `sei_numero`), `.registrarBaixa`/`.removerBaixa` (now accepts `sei_numero`, returns `seiNumero`), `.registrarOs` (now accepts `situacao`/`local`) — from Task 2.

**Note:** `toggleBaixa` today is a single click that always calls `registrarBaixa({ data, guarnicao_id, horario_inicio })` with no motivo/SEI capture — there is no existing "baixa modal" to extend, unlike permuta/folga. This task replaces the "turn off" half of that click with a small modal (mirroring the existing OS modal) so motivo and Nº SEI can be captured; turning a viatura back on stays a direct one-click action, unchanged.

- [ ] **Step 1: Add baixa-modal state and methods**

In `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`, find:
```typescript
  readonly osModalCard = signal<CardGuarnicao | null>(null);
  readonly osTexto = signal('');
  readonly salvandoOs = signal(false);
```
Replace with:
```typescript
  readonly osModalCard = signal<CardGuarnicao | null>(null);
  readonly osTexto = signal('');
  readonly osSituacao = signal('');
  readonly osLocal = signal('');
  readonly salvandoOs = signal(false);

  readonly baixaModalCard = signal<CardGuarnicao | null>(null);
  readonly baixaMotivo = signal('');
  readonly baixaSeiNumero = signal('');
  readonly salvandoBaixa = signal(false);
```

- [ ] **Step 2: Replace `toggleBaixa` with modal open/close/save methods**

Find:
```typescript
  async toggleBaixa(card: CardGuarnicao): Promise<void> {
    try {
      const baixa = this.baixaDoCard(card);
      if (baixa) {
        await this.lancamentoService.removerBaixa(baixa.id);
      } else {
        await this.lancamentoService.registrarBaixa({
          data: this.data(),
          guarnicao_id: card.guarnicaoId,
          horario_inicio: card.horarioInicio,
        });
      }
      await this.reloadBaixas();
    } catch {
      this.errorMessage.set('Não foi possível atualizar o status da viatura.');
    }
  }
```
Replace with:
```typescript
  async toggleBaixa(card: CardGuarnicao): Promise<void> {
    const baixa = this.baixaDoCard(card);
    if (baixa) {
      try {
        await this.lancamentoService.removerBaixa(baixa.id);
        await this.reloadBaixas();
      } catch {
        this.errorMessage.set('Não foi possível reativar a viatura.');
      }
      return;
    }
    this.baixaModalCard.set(card);
    this.baixaMotivo.set('');
    this.baixaSeiNumero.set('');
  }

  fecharBaixa(): void {
    this.baixaModalCard.set(null);
  }

  async onSalvarBaixa(): Promise<void> {
    const card = this.baixaModalCard();
    if (!card) {
      return;
    }
    this.salvandoBaixa.set(true);
    this.errorMessage.set(null);
    try {
      await this.lancamentoService.registrarBaixa({
        data: this.data(),
        guarnicao_id: card.guarnicaoId,
        horario_inicio: card.horarioInicio,
        motivo: this.baixaMotivo() || null,
        sei_numero: this.baixaSeiNumero() || null,
      });
      this.fecharBaixa();
      await this.reloadBaixas();
    } catch {
      this.errorMessage.set('Não foi possível desativar a viatura.');
    } finally {
      this.salvandoBaixa.set(false);
    }
  }
```

- [ ] **Step 3: Add situação/local state to the OS modal**

Find:
```typescript
  abrirOs(card: CardGuarnicao): void {
    this.osModalCard.set(card);
    this.osTexto.set(this.osDoCard(card)?.numeroOs ?? '');
  }
```
Replace with:
```typescript
  abrirOs(card: CardGuarnicao): void {
    this.osModalCard.set(card);
    const existente = this.osDoCard(card);
    this.osTexto.set(existente?.numeroOs ?? '');
    this.osSituacao.set(existente?.situacao ?? '');
    this.osLocal.set(existente?.local ?? '');
  }
```

Find:
```typescript
      const texto = this.osTexto().trim();
      if (texto) {
        await this.lancamentoService.registrarOs({
          data: this.data(),
          guarnicao_id: card.guarnicaoId,
          horario_inicio: card.horarioInicio,
          numero_os: texto,
        });
      }
```
Replace with:
```typescript
      const texto = this.osTexto().trim();
      if (texto) {
        await this.lancamentoService.registrarOs({
          data: this.data(),
          guarnicao_id: card.guarnicaoId,
          horario_inicio: card.horarioInicio,
          numero_os: texto,
          situacao: this.osSituacao() || null,
          local: this.osLocal() || null,
        });
      }
```

- [ ] **Step 4: Add SEI field to the atraso branch of `onRegistrarModal`**

Find:
```typescript
        case 'ATRASADO':
          await this.lancamentoService.registrarAtraso({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            horario_chegada: this.formHorarioChegada() || null,
            motivo: this.formMotivo() || null,
          });
          break;
```
Replace with:
```typescript
        case 'ATRASADO':
          await this.lancamentoService.registrarAtraso({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            horario_chegada: this.formHorarioChegada() || null,
            motivo: this.formMotivo() || null,
            sei_numero: this.formSeiNumero() || null,
          });
          break;
```

- [ ] **Step 5: Add the SEI input to the ATRASADO block in the template**

In `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`, find:
```html
          @if (tipoLancamento() === 'ATRASADO') {
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              type="time"
              [ngModel]="formHorarioChegada()"
              (ngModelChange)="formHorarioChegada.set($event)"
              name="modalHorarioChegada"
            />
            <textarea
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Motivo"
              rows="2"
              [ngModel]="formMotivo()"
              (ngModelChange)="formMotivo.set($event)"
              name="modalMotivoAtraso"
            ></textarea>
          }
```
Replace with:
```html
          @if (tipoLancamento() === 'ATRASADO') {
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              type="time"
              [ngModel]="formHorarioChegada()"
              (ngModelChange)="formHorarioChegada.set($event)"
              name="modalHorarioChegada"
            />
            <textarea
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Motivo"
              rows="2"
              [ngModel]="formMotivo()"
              (ngModelChange)="formMotivo.set($event)"
              name="modalMotivoAtraso"
            ></textarea>
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="SEI Nº"
              [ngModel]="formSeiNumero()"
              (ngModelChange)="formSeiNumero.set($event)"
              name="modalSeiAtraso"
            />
          }
```

- [ ] **Step 6: Add situação/local inputs to the OS modal template**

Find:
```html
        <form class="grid gap-3" (ngSubmit)="onSalvarOs()">
          <input
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Número/nome da OS"
            [ngModel]="osTexto()"
            (ngModelChange)="osTexto.set($event)"
            name="osTexto"
          />
          <p class="text-xs text-slate-400 dark:text-slate-500">Deixe em branco e salve para remover a OS.</p>
```
Replace with:
```html
        <form class="grid gap-3" (ngSubmit)="onSalvarOs()">
          <input
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Número/nome da OS"
            [ngModel]="osTexto()"
            (ngModelChange)="osTexto.set($event)"
            name="osTexto"
          />
          <input
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Situação (descreva a missão)"
            [ngModel]="osSituacao()"
            (ngModelChange)="osSituacao.set($event)"
            name="osSituacao"
          />
          <input
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Local"
            [ngModel]="osLocal()"
            (ngModelChange)="osLocal.set($event)"
            name="osLocal"
          />
          <p class="text-xs text-slate-400 dark:text-slate-500">Deixe em branco e salve para remover a OS.</p>
```

- [ ] **Step 7: Add the baixa modal markup**

In `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`, find the closing of the OS modal block:
```html
  @if (osModalCard(); as card) {
```
and its matching closing `}` a few lines below (right before the final `</div>` that closes the component root). Insert a new block right after that OS modal's closing `}` and before the final `</div>`:
```html
  @if (baixaModalCard(); as card) {
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="fecharBaixa()">
      <div
        class="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-700"
        (click)="$event.stopPropagation()"
      >
        <h2 class="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">Desativar viatura</h2>
        <p class="mb-4 text-xs text-slate-500 dark:text-slate-400">{{ card.nome }}</p>

        <form class="grid gap-3" (ngSubmit)="onSalvarBaixa()">
          <textarea
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Motivo"
            rows="2"
            [ngModel]="baixaMotivo()"
            (ngModelChange)="baixaMotivo.set($event)"
            name="baixaMotivo"
          ></textarea>
          <input
            class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="SEI Nº"
            [ngModel]="baixaSeiNumero()"
            (ngModelChange)="baixaSeiNumero.set($event)"
            name="baixaSeiNumero"
          />

          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              (click)="fecharBaixa()"
            >
              Cancelar
            </button>
            <button
              class="flex-1 rounded bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-red-500"
              type="submit"
              [disabled]="salvandoBaixa()"
            >
              Desativar
            </button>
          </div>
        </form>
      </div>
    </div>
  }
```

- [ ] **Step 8: Confirm the component smoke test still passes**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: PASS.

- [ ] **Step 9: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: capture SEI on atraso/baixa and situacao/local on OS in Painel do PC"
```

---

### Task 4: Painel do PC — registrar e desfazer LTS/DTS (LICENCA)

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `LancamentoService.registrarLicenca`/`.removerLicenca` (Task 2).

- [ ] **Step 1: Add LICENCA to the badge/label maps and the tipo list**

Find:
```typescript
type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';
```
Replace with:
```typescript
type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO' | 'LICENCA';
```

Find:
```typescript
const STATUS_BADGE_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  FALTA: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  ATRASADO: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  FOLGA: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  REMANEJADO: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
};

const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presente',
  FALTA: 'Falta',
  ATRASADO: 'Atrasado',
  SUBSTITUIDO: 'Substituído',
  FOLGA: 'Folga',
  REMANEJADO: 'Remanejado',
};
```
Replace with:
```typescript
const STATUS_BADGE_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  FALTA: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  ATRASADO: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  FOLGA: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  REMANEJADO: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  LICENCA: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
};

const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presente',
  FALTA: 'Falta',
  ATRASADO: 'Atrasado',
  SUBSTITUIDO: 'Substituído',
  FOLGA: 'Folga',
  REMANEJADO: 'Remanejado',
  LICENCA: 'LTS/DTS',
};
```

Find:
```typescript
  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
```
Replace with:
```typescript
  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO', 'LICENCA'];
```

- [ ] **Step 2: Add form state and reset it in `abrirModal`**

Find:
```typescript
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly registrando = signal(false);
```
Replace with:
```typescript
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly formLicencaInicio = signal('');
  readonly formLicencaFim = signal('');
  readonly registrando = signal(false);
```

Find:
```typescript
    this.formSubstitutoMatricula.set('');
    this.formSeiNumero.set('');
    this.formAutorizacao.set('');
    this.formDestino.set('');
    this.formHorarioChegada.set('');
  }
```
Replace with:
```typescript
    this.formSubstitutoMatricula.set('');
    this.formSeiNumero.set('');
    this.formAutorizacao.set('');
    this.formDestino.set('');
    this.formHorarioChegada.set('');
    this.formLicencaInicio.set(this.data());
    this.formLicencaFim.set(this.data());
  }
```

- [ ] **Step 3: Handle the LICENCA branch in `onRegistrarModal`**

Find:
```typescript
        case 'REMANEJAMENTO':
          await this.lancamentoService.registrarRemanejamento({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            destino: this.formDestino(),
          });
          break;
      }
```
Replace with:
```typescript
        case 'REMANEJAMENTO':
          await this.lancamentoService.registrarRemanejamento({
            data,
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            destino: this.formDestino(),
          });
          break;
        case 'LICENCA':
          await this.lancamentoService.registrarLicenca({
            policial_matricula: linha.policialMatricula,
            escala_mensal_id: linha.escalaMensalId,
            data_inicio: this.formLicencaInicio() || data,
            data_fim: this.formLicencaFim() || data,
            sei_numero: this.formSeiNumero() || null,
          });
          break;
      }
```

- [ ] **Step 4: Add a `toggleLicenca` method to undo a LICENCA row**

Find:
```typescript
  async toggleRemanejamento(row: RosterRow): Promise<void> {
    if (!row.detalheId) {
      return;
    }
    try {
      await this.lancamentoService.removerRemanejamento(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível desfazer o remanejamento.');
    }
  }
```
Replace with:
```typescript
  async toggleRemanejamento(row: RosterRow): Promise<void> {
    if (!row.detalheId) {
      return;
    }
    try {
      await this.lancamentoService.removerRemanejamento(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível desfazer o remanejamento.');
    }
  }

  async toggleLicenca(row: RosterRow): Promise<void> {
    if (!row.detalheId) {
      return;
    }
    try {
      await this.lancamentoService.removerLicenca(row.detalheId);
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível desfazer a LTS/DTS.');
    }
  }
```

- [ ] **Step 5: Add the LICENCA fields to the modal template**

In `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`, find:
```html
          @if (tipoLancamento() === 'REMANEJAMENTO') {
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Destino"
              required
              [ngModel]="formDestino()"
              (ngModelChange)="formDestino.set($event)"
              name="modalDestino"
            />
          }
```
Replace with:
```html
          @if (tipoLancamento() === 'REMANEJAMENTO') {
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Destino"
              required
              [ngModel]="formDestino()"
              (ngModelChange)="formDestino.set($event)"
              name="modalDestino"
            />
          }

          @if (tipoLancamento() === 'LICENCA') {
            <label class="text-xs text-slate-500 dark:text-slate-400">
              Início
              <input
                class="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                type="date"
                required
                [ngModel]="formLicencaInicio()"
                (ngModelChange)="formLicencaInicio.set($event)"
                name="modalLicencaInicio"
              />
            </label>
            <label class="text-xs text-slate-500 dark:text-slate-400">
              Término
              <input
                class="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                type="date"
                required
                [ngModel]="formLicencaFim()"
                (ngModelChange)="formLicencaFim.set($event)"
                name="modalLicencaFim"
              />
            </label>
            <input
              class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="SEI Nº"
              [ngModel]="formSeiNumero()"
              (ngModelChange)="formSeiNumero.set($event)"
              name="modalSeiLicenca"
            />
          }
```

- [ ] **Step 6: Add an "undo" action on the card row for LICENCA**

Find:
```html
                    @if (linha.statusEfetivo === 'REMANEJADO') {
                      <div class="mt-1">
                        <button
                          type="button"
                          class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 hover:bg-violet-200 dark:bg-violet-900 dark:text-violet-300 dark:hover:bg-violet-800"
                          title="Desfazer remanejamento"
                          (click)="toggleRemanejamento(linha)"
                        >
                          Desfazer remanejamento
                        </button>
                      </div>
                    }
```
Replace with:
```html
                    @if (linha.statusEfetivo === 'REMANEJADO') {
                      <div class="mt-1">
                        <button
                          type="button"
                          class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 hover:bg-violet-200 dark:bg-violet-900 dark:text-violet-300 dark:hover:bg-violet-800"
                          title="Desfazer remanejamento"
                          (click)="toggleRemanejamento(linha)"
                        >
                          Desfazer remanejamento
                        </button>
                      </div>
                    }
                    @if (linha.statusEfetivo === 'LICENCA') {
                      <div class="mt-1">
                        <button
                          type="button"
                          class="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700 hover:bg-sky-200 dark:bg-sky-900 dark:text-sky-300 dark:hover:bg-sky-800"
                          title="Desfazer LTS/DTS"
                          (click)="toggleLicenca(linha)"
                        >
                          Desfazer LTS/DTS
                        </button>
                      </div>
                    }
```

- [ ] **Step 7: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: register and undo LTS/DTS (LICENCA) in Painel do PC"
```

---

### Task 5: Painel do PC — seção "Funções fixas do dia" (Guarda / PC 16º BPM / COPOM)

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `LancamentoService.listFuncoesFixasDoDia`/`.registrarFuncaoFixa`/`.removerFuncaoFixa`, `GrupoFuncaoFixa`, `FuncaoFixaRow` (Task 2).

- [ ] **Step 1: Add state, loaders and CRUD methods**

Find:
```typescript
import {
  BaixaRow,
  LancamentoService,
  OsRow,
  RosterRow,
  StatusEfetivo,
} from '../../../core/services/lancamento.service';
```
Replace with:
```typescript
import {
  BaixaRow,
  FuncaoFixaRow,
  GrupoFuncaoFixa,
  LancamentoService,
  OsRow,
  RosterRow,
  StatusEfetivo,
} from '../../../core/services/lancamento.service';
```

Find:
```typescript
  readonly formLicencaInicio = signal('');
  readonly formLicencaFim = signal('');
  readonly registrando = signal(false);
```
Replace with:
```typescript
  readonly formLicencaInicio = signal('');
  readonly formLicencaFim = signal('');
  readonly registrando = signal(false);

  readonly funcoesFixas = signal<FuncaoFixaRow[]>([]);
  readonly gruposFuncaoFixa: GrupoFuncaoFixa[] = ['GUARDA', 'PC_BPM', 'COPOM'];
  readonly novaFuncaoFixaGrupo = signal<GrupoFuncaoFixa>('GUARDA');
  readonly novaFuncaoFixaFuncao = signal('');
  readonly novaFuncaoFixaHorarioInicio = signal('06:00');
  readonly novaFuncaoFixaHorarioFim = signal('06:00');
  readonly novaFuncaoFixaMatricula = signal('');
  readonly novaFuncaoFixaFoneCmt = signal('');
  readonly criandoFuncaoFixa = signal(false);
```

Find:
```typescript
  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
    void this.reloadBaixas();
    void this.reloadOs();
  }
```
Replace with:
```typescript
  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
    void this.reloadBaixas();
    void this.reloadOs();
    void this.reloadFuncoesFixas();
  }
```

Find:
```typescript
  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await Promise.all([this.reloadRoster(), this.reloadBaixas(), this.reloadOs()]);
  }
```
Replace with:
```typescript
  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await Promise.all([this.reloadRoster(), this.reloadBaixas(), this.reloadOs(), this.reloadFuncoesFixas()]);
  }

  async reloadFuncoesFixas(): Promise<void> {
    try {
      this.funcoesFixas.set(await this.lancamentoService.listFuncoesFixasDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar as funções fixas do dia.');
    }
  }

  funcoesFixasDoGrupo(grupo: GrupoFuncaoFixa): FuncaoFixaRow[] {
    return this.funcoesFixas().filter((f) => f.grupo === grupo);
  }

  async onCriarFuncaoFixa(): Promise<void> {
    this.criandoFuncaoFixa.set(true);
    this.errorMessage.set(null);
    try {
      await this.lancamentoService.registrarFuncaoFixa({
        data: this.data(),
        grupo: this.novaFuncaoFixaGrupo(),
        funcao: this.novaFuncaoFixaFuncao(),
        horario_inicio: this.novaFuncaoFixaHorarioInicio(),
        horario_fim: this.novaFuncaoFixaHorarioFim(),
        policial_matricula: this.novaFuncaoFixaMatricula(),
        fone_cmt: this.novaFuncaoFixaFoneCmt() || null,
      });
      this.novaFuncaoFixaFuncao.set('');
      this.novaFuncaoFixaMatricula.set('');
      this.novaFuncaoFixaFoneCmt.set('');
      await this.reloadFuncoesFixas();
    } catch {
      this.errorMessage.set('Não foi possível registrar a função fixa.');
    } finally {
      this.criandoFuncaoFixa.set(false);
    }
  }

  async onRemoverFuncaoFixa(id: string): Promise<void> {
    try {
      await this.lancamentoService.removerFuncaoFixa(id);
      await this.reloadFuncoesFixas();
    } catch {
      this.errorMessage.set('Não foi possível remover a função fixa.');
    }
  }
```

- [ ] **Step 2: Add the "Funções fixas do dia" section to the template**

In `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`, find the closing `</section>` of the cards grid (the block starting with `<section class="mt-6">` that renders `@for (card of cards; ...)`), and insert this new section right after it, before the `@if (modalRow(); as linha) {` block:
```html
  <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
    <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">Funções fixas do dia</h2>

    <form class="mb-4 grid gap-2 sm:grid-cols-6" (ngSubmit)="onCriarFuncaoFixa()">
      <select
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        [ngModel]="novaFuncaoFixaGrupo()"
        (ngModelChange)="novaFuncaoFixaGrupo.set($event)"
        name="novaFuncaoFixaGrupo"
      >
        @for (grupo of gruposFuncaoFixa; track grupo) {
          <option [value]="grupo">{{ grupo }}</option>
        }
      </select>
      <input
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        placeholder="Função (ex: Comandante)"
        required
        [ngModel]="novaFuncaoFixaFuncao()"
        (ngModelChange)="novaFuncaoFixaFuncao.set($event)"
        name="novaFuncaoFixaFuncao"
      />
      <input
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        type="time"
        [ngModel]="novaFuncaoFixaHorarioInicio()"
        (ngModelChange)="novaFuncaoFixaHorarioInicio.set($event)"
        name="novaFuncaoFixaHorarioInicio"
      />
      <input
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        type="time"
        [ngModel]="novaFuncaoFixaHorarioFim()"
        (ngModelChange)="novaFuncaoFixaHorarioFim.set($event)"
        name="novaFuncaoFixaHorarioFim"
      />
      <select
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        required
        [ngModel]="novaFuncaoFixaMatricula()"
        (ngModelChange)="novaFuncaoFixaMatricula.set($event)"
        name="novaFuncaoFixaMatricula"
      >
        <option value="" disabled>Policial</option>
        @for (policial of policiais(); track policial.matricula) {
          <option [value]="policial.matricula">{{ policial.nome_guerra }}</option>
        }
      </select>
      <button
        class="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500"
        type="submit"
        [disabled]="criandoFuncaoFixa()"
      >
        + Adicionar
      </button>
    </form>

    <div class="grid gap-4 sm:grid-cols-3">
      @for (grupo of gruposFuncaoFixa; track grupo) {
        <div>
          <p class="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{{ grupo }}</p>
          @if (funcoesFixasDoGrupo(grupo).length === 0) {
            <p class="text-xs text-slate-400 dark:text-slate-500">Nenhuma função lançada.</p>
          } @else {
            <ul class="flex flex-col gap-1">
              @for (f of funcoesFixasDoGrupo(grupo); track f.id) {
                <li class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-800">
                  <span class="text-slate-700 dark:text-slate-200">
                    {{ f.funcao }} — {{ policialNome(f.policialMatricula) }} ({{ f.horarioInicio.slice(0, 5) }}–{{ f.horarioFim.slice(0, 5) }})
                  </span>
                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    title="Remover"
                    (click)="onRemoverFuncaoFixa(f.id)"
                  >
                    ✕
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  </section>
```

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: add funcoes fixas do dia section to Painel do PC"
```

---

### Task 6: Dashboard — suporte ao status LICENCA

**Files:**
- Modify: `src/app/features/dashboard/dashboard-page/dashboard-page.ts`

**Interfaces:**
- Consumes: `StatusEfetivo` (now including `'LICENCA'`) from Task 2.

- [ ] **Step 1: Add LICENCA to the Dashboard's status maps**

Find:
```typescript
const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presentes',
  FALTA: 'Faltas',
  ATRASADO: 'Atrasos',
  SUBSTITUIDO: 'Substituições',
  FOLGA: 'Folgas',
  REMANEJADO: 'Remanejamentos',
};

const STATUS_ORDER: StatusEfetivo[] = ['PREVISTO', 'FALTA', 'ATRASADO', 'SUBSTITUIDO', 'FOLGA', 'REMANEJADO'];

const STATUS_CARD_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FALTA: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ATRASADO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  FOLGA: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  REMANEJADO: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};
```
Replace with:
```typescript
const STATUS_LABELS: Record<StatusEfetivo, string> = {
  PREVISTO: 'Presentes',
  FALTA: 'Faltas',
  ATRASADO: 'Atrasos',
  SUBSTITUIDO: 'Substituições',
  FOLGA: 'Folgas',
  REMANEJADO: 'Remanejamentos',
  LICENCA: 'LTS/DTS',
};

const STATUS_ORDER: StatusEfetivo[] = [
  'PREVISTO',
  'FALTA',
  'ATRASADO',
  'SUBSTITUIDO',
  'FOLGA',
  'REMANEJADO',
  'LICENCA',
];

const STATUS_CARD_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FALTA: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ATRASADO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  FOLGA: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  REMANEJADO: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  LICENCA: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};
```

- [ ] **Step 2: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass (the Dashboard now renders 7 status tiles instead of 6 — no test asserts a fixed count, so nothing to update there).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/dashboard/dashboard-page/dashboard-page.ts
git commit -m "feat: add LICENCA status to the Dashboard summary"
```

---

### Task 7: `RelatorioSeiService`

**Files:**
- Create: `src/app/core/services/relatorio-sei.service.ts`
- Test: `src/app/core/services/relatorio-sei.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client`, `relatorio_sei_complementos` (Task 1).
- Produces: `CampoComplemento`, `ComplementoRow`, `RelatorioSeiService.listComplementos(data)`, `.salvarComplemento(data, campo, conteudo)` — consumed by `RelatorioSeiPage` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/relatorio-sei.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { RelatorioSeiService } from './relatorio-sei.service';
import { SupabaseService } from './supabase.service';

describe('RelatorioSeiService', () => {
  it('lists complementos for a given day', async () => {
    const rows = [{ campo: 'OBSERVACOES', conteudo: 'Nada a registrar' }];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(RelatorioSeiService);
    const result = await service.listComplementos('2026-08-04');

    expect(result).toEqual([{ campo: 'OBSERVACOES', conteudo: 'Nada a registrar' }]);
  });

  it('upserts a complemento keyed by data+campo', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(RelatorioSeiService);
    await service.salvarComplemento('2026-08-04', 'POG', 'Pe Seguro no Marco Zero, 06h-18h');

    expect(upsertSpy).toHaveBeenCalledWith(
      { data: '2026-08-04', campo: 'POG', conteudo: 'Pe Seguro no Marco Zero, 06h-18h' },
      { onConflict: 'data,campo' },
    );
  });
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npm test -- --watch=false --include='**/relatorio-sei.service.spec.ts'`
Expected: FAIL — `Cannot find module './relatorio-sei.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/relatorio-sei.service.ts`:
```typescript
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
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/relatorio-sei.service.spec.ts'`
Expected: PASS (2 specs).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/relatorio-sei.service.ts src/app/core/services/relatorio-sei.service.spec.ts
git commit -m "feat: add RelatorioSeiService for free-text complementos"
```

---

### Task 8: Página `/relatorio-sei`

**Files:**
- Create: `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts`
- Create: `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.html`
- Create: `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.css`
- Create: `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.spec.ts`

**Interfaces:**
- Consumes: `LancamentoService` (roster, baixas, OS, funções fixas — Tasks 2–5), `GuarnicoesService`, `PoliciaisService`, `RelatorioSeiService` (Task 7).
- Produces: `RelatorioSeiPage` — routed at `/relatorio-sei` in Task 9.

- [ ] **Step 1: Generate the component**

Run: `npx ng generate component features/relatorio-sei/relatorio-sei-page --flat=false`

- [ ] **Step 2: Confirm the generated spec passes as-is**

Run: `npm test -- --watch=false --include='**/relatorio-sei-page.spec.ts'`
Expected: PASS.

- [ ] **Step 3: Implement the component**

Replace `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BaixaRow,
  FuncaoFixaRow,
  GrupoFuncaoFixa,
  LancamentoService,
  OsRow,
  RosterRow,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CampoComplemento, RelatorioSeiService } from '../../../core/services/relatorio-sei.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CardRelatorio {
  cardId: string;
  guarnicaoId: string;
  nome: string;
  areaAtuacao: string | null;
  horarioInicio: string;
  rows: RosterRow[];
}

interface Chamada {
  horarioInicio: string;
  cards: CardRelatorio[];
}

const TIPOS_ORDINARIO: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'];

const COMPLEMENTOS: { campo: CampoComplemento; titulo: string }[] = [
  { campo: 'PJES_DIARIA', titulo: 'PJES / Diária' },
  { campo: 'FISCALIZACAO', titulo: 'Fiscalização' },
  { campo: 'POG', titulo: 'POG' },
  { campo: 'DIRESP', titulo: 'Viaturas DIRESP em apoio' },
  { campo: 'OBSERVACOES', titulo: 'Observações' },
];

@Component({
  selector: 'app-relatorio-sei-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorio-sei-page.html',
  styleUrl: './relatorio-sei-page.css',
})
export class RelatorioSeiPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly relatorioSeiService = inject(RelatorioSeiService);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly osRows = signal<OsRow[]>([]);
  readonly funcoesFixas = signal<FuncaoFixaRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly complementos = signal<Record<CampoComplemento, string>>({
    PJES_DIARIA: '',
    FISCALIZACAO: '',
    POG: '',
    DIRESP: '',
    OBSERVACOES: '',
  });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copiado = signal(false);

  readonly gruposFuncaoFixa: GrupoFuncaoFixa[] = ['GUARDA', 'PC_BPM', 'COPOM'];
  readonly camposComplemento = COMPLEMENTOS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      const [roster, baixas, osRows, funcoesFixas, guarnicoes, policiais, complementoRows] = await Promise.all([
        this.lancamentoService.listRosterDoDia(data),
        this.lancamentoService.listBaixasDoDia(data),
        this.lancamentoService.listOsDoDia(data),
        this.lancamentoService.listFuncoesFixasDoDia(data),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.relatorioSeiService.listComplementos(data),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.osRows.set(osRows);
      this.funcoesFixas.set(funcoesFixas);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      const complementos = { PJES_DIARIA: '', FISCALIZACAO: '', POG: '', DIRESP: '', OBSERVACOES: '' };
      for (const row of complementoRows) {
        complementos[row.campo] = row.conteudo;
      }
      this.complementos.set(complementos);
    } catch {
      this.errorMessage.set('Não foi possível carregar os dados do relatório.');
    } finally {
      this.loading.set(false);
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await this.reload();
  }

  guarnicao(id: string): GuarnicaoRow | undefined {
    return this.guarnicoes().find((g) => g.id === id);
  }

  policialNome(matricula: string): string {
    const p = this.policiais().find((x) => x.matricula === matricula);
    return p ? `${p.graduacao} ${p.nome_guerra}` : matricula;
  }

  get cardsOrdinarios(): CardRelatorio[] {
    const idsBaixados = new Set(this.baixas().map((b) => `${b.guarnicaoId}__${b.horarioInicio}`));
    const grupos = new Map<string, CardRelatorio>();
    for (const row of this.roster()) {
      const guarnicao = this.guarnicao(row.guarnicaoId);
      if (!guarnicao || !TIPOS_ORDINARIO.includes(guarnicao.tipo)) {
        continue;
      }
      const cardId = `${row.guarnicaoId}__${row.horarioInicio}`;
      if (idsBaixados.has(cardId)) {
        continue;
      }
      if (!grupos.has(cardId)) {
        grupos.set(cardId, {
          cardId,
          guarnicaoId: row.guarnicaoId,
          nome: guarnicao.nome,
          areaAtuacao: guarnicao.area_atuacao,
          horarioInicio: row.horarioInicio,
          rows: [],
        });
      }
      grupos.get(cardId)!.rows.push(row);
    }
    return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  get chamadas(): Chamada[] {
    const porHorario = new Map<string, CardRelatorio[]>();
    for (const card of this.cardsOrdinarios) {
      if (!porHorario.has(card.horarioInicio)) {
        porHorario.set(card.horarioInicio, []);
      }
      porHorario.get(card.horarioInicio)!.push(card);
    }
    return Array.from(porHorario.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([horarioInicio, cards]) => ({ horarioInicio, cards }));
  }

  chamadaOrdinal(index: number): string {
    return ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'][index] ?? `${index + 1}ª`;
  }

  get resumoPorTipo(): { tipo: TipoGuarnicao; total: number }[] {
    return TIPOS_ORDINARIO.map((tipo) => ({
      tipo,
      total: this.cardsOrdinarios.filter((c) => this.guarnicao(c.guarnicaoId)?.tipo === tipo).length,
    }));
  }

  get faltas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'FALTA');
  }

  get atrasados(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'ATRASADO');
  }

  get substituidos(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'SUBSTITUIDO');
  }

  get folgas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'FOLGA');
  }

  get licencas(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'LICENCA');
  }

  get remanejados(): RosterRow[] {
    return this.roster().filter((r) => r.statusEfetivo === 'REMANEJADO');
  }

  get viaturasBaixadas(): BaixaRow[] {
    return this.baixas();
  }

  get osCumpridas(): OsRow[] {
    return this.osRows().filter((o) => o.numeroOs);
  }

  funcoesDoGrupo(grupo: GrupoFuncaoFixa): FuncaoFixaRow[] {
    return this.funcoesFixas().filter((f) => f.grupo === grupo);
  }

  async onSalvarComplemento(campo: CampoComplemento): Promise<void> {
    try {
      await this.relatorioSeiService.salvarComplemento(this.data(), campo, this.complementos()[campo]);
    } catch {
      this.errorMessage.set('Não foi possível salvar o texto complementar.');
    }
  }

  updateComplemento(campo: CampoComplemento, valor: string): void {
    this.complementos.update((atual) => ({ ...atual, [campo]: valor }));
  }

  private linhaTexto(...partes: (string | null)[]): string {
    return partes.filter((p) => p !== null && p !== '').join(' — ');
  }

  gerarTexto(): string {
    const linhas: string[] = [];
    linhas.push('RELATÓRIO DE LANÇAMENTO');
    linhas.push(`Data: ${this.data()}`);
    linhas.push('');
    linhas.push('ORDINÁRIO — RESUMO');
    for (const { tipo, total } of this.resumoPorTipo) {
      linhas.push(`${tipo}: ${total}`);
    }
    linhas.push('');

    this.chamadas.forEach((chamada, index) => {
      linhas.push(`${this.chamadaOrdinal(index)} CHAMADA — ${chamada.horarioInicio.slice(0, 5)}`);
      for (const card of chamada.cards) {
        linhas.push(`  ${card.nome}${card.areaAtuacao ? ` (${card.areaAtuacao})` : ''}`);
        for (const row of card.rows) {
          linhas.push(
            `    ${row.funcao} — ${row.policialMatricula} — ${this.policialNome(row.policialMatricula)}`,
          );
        }
      }
      linhas.push('');
    });

    linhas.push('FALTAS');
    for (const r of this.faltas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('PERMUTAS/SUBSTITUIÇÃO');
    for (const r of this.substituidos) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('FOLGAS');
    for (const r of this.folgas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('LTS/DTS');
    for (const r of this.licencas) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('REMANEJAMENTO DE EFETIVO');
    for (const r of this.remanejados) {
      linhas.push(`  ${this.policialNome(r.policialMatricula)} — destino: ${r.detalhe ?? ''}`);
    }
    linhas.push('');

    linhas.push('VIATURAS BAIXADAS');
    for (const b of this.viaturasBaixadas) {
      const nome = this.guarnicao(b.guarnicaoId)?.nome ?? b.guarnicaoId;
      linhas.push(`  ${this.linhaTexto(nome, b.motivo, b.seiNumero ? `SEI ${b.seiNumero}` : null)}`);
    }
    linhas.push('');

    linhas.push('"OS" CUMPRIDAS');
    for (const o of this.osCumpridas) {
      const nome = this.guarnicao(o.guarnicaoId)?.nome ?? o.guarnicaoId;
      linhas.push(`  ${this.linhaTexto(o.numeroOs, o.situacao, o.local, nome)}`);
    }
    linhas.push('');

    for (const grupo of this.gruposFuncaoFixa) {
      linhas.push(grupo);
      for (const f of this.funcoesDoGrupo(grupo)) {
        linhas.push(`  ${f.funcao} — ${this.policialNome(f.policialMatricula)} (${f.horarioInicio.slice(0, 5)}–${f.horarioFim.slice(0, 5)})`);
      }
      linhas.push('');
    }

    for (const { campo, titulo } of this.camposComplemento) {
      linhas.push(titulo.toUpperCase());
      linhas.push(this.complementos()[campo] || '(sem informação)');
      linhas.push('');
    }

    return linhas.join('\n');
  }

  async copiarTexto(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.gerarTexto());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.errorMessage.set('Não foi possível copiar o texto — copie manualmente.');
    }
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.html`:
```html
<div>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">Relatório SEI</h1>
    <div class="flex items-center gap-3">
      <label class="text-sm text-slate-600 dark:text-slate-300">
        Data
        <input
          class="ml-2 rounded border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          type="date"
          [ngModel]="data()"
          (ngModelChange)="onDataChange($event)"
          name="data"
        />
      </label>
      <button
        type="button"
        class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:bg-blue-500"
        (click)="copiarTexto()"
      >
        {{ copiado() ? 'Copiado!' : 'Copiar texto' }}
      </button>
    </div>
  </div>

  @if (errorMessage()) {
    <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
  }

  @if (loading()) {
    <p class="mt-6 text-slate-500 dark:text-slate-400">Carregando...</p>
  } @else {
    <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
      <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">Ordinário — Resumo</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        @for (item of resumoPorTipo; track item.tipo) {
          <div class="rounded bg-slate-50 p-3 text-center dark:bg-slate-800">
            <p class="text-xl font-bold text-slate-800 dark:text-slate-100">{{ item.total }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ item.tipo }}</p>
          </div>
        }
      </div>
    </section>

    @for (chamada of chamadas; track chamada.horarioInicio; let i = $index) {
      <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">
          {{ chamadaOrdinal(i) }} Chamada — {{ chamada.horarioInicio.slice(0, 5) }}
        </h2>
        <div class="flex flex-col gap-3">
          @for (card of chamada.cards; track card.cardId) {
            <div class="rounded border border-slate-200 dark:border-slate-800">
              <p class="bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {{ card.nome }} @if (card.areaAtuacao) { — {{ card.areaAtuacao }} }
              </p>
              <table class="w-full text-left text-sm">
                <tbody>
                  @for (row of card.rows; track row.policialMatricula) {
                    <tr class="border-t border-slate-100 dark:border-slate-800">
                      <td class="px-3 py-1 text-slate-500 dark:text-slate-400">{{ row.funcao }}</td>
                      <td class="px-3 py-1 text-slate-700 dark:text-slate-200">{{ row.policialMatricula }}</td>
                      <td class="px-3 py-1 text-slate-700 dark:text-slate-200">{{ policialNome(row.policialMatricula) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>
    }

    <section class="mt-6 grid gap-4 sm:grid-cols-2">
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Faltas</h2>
        @for (r of faltas; track r.policialMatricula) {
          <p class="text-sm text-slate-700 dark:text-slate-200">{{ policialNome(r.policialMatricula) }} — {{ r.detalhe }}</p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
        }
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Permutas/Substituição</h2>
        @for (r of substituidos; track r.policialMatricula) {
          <p class="text-sm text-slate-700 dark:text-slate-200">{{ policialNome(r.policialMatricula) }} — {{ r.detalhe }}</p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
        }
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Folgas</h2>
        @for (r of folgas; track r.policialMatricula) {
          <p class="text-sm text-slate-700 dark:text-slate-200">{{ policialNome(r.policialMatricula) }} — {{ r.detalhe }}</p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
        }
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">LTS/DTS</h2>
        @for (r of licencas; track r.policialMatricula) {
          <p class="text-sm text-slate-700 dark:text-slate-200">{{ policialNome(r.policialMatricula) }} — {{ r.detalhe }}</p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
        }
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Remanejamento de Efetivo</h2>
        @for (r of remanejados; track r.policialMatricula) {
          <p class="text-sm text-slate-700 dark:text-slate-200">{{ policialNome(r.policialMatricula) }} — destino: {{ r.detalhe }}</p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhum.</p>
        }
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
        <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Viaturas Baixadas</h2>
        @for (b of viaturasBaixadas; track b.id) {
          <p class="text-sm text-slate-700 dark:text-slate-200">
            {{ guarnicao(b.guarnicaoId)?.nome }} — {{ b.motivo }} @if (b.seiNumero) { (SEI {{ b.seiNumero }}) }
          </p>
        } @empty {
          <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
        }
      </div>
    </section>

    <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
      <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">"OS" Cumpridas</h2>
      @for (o of osCumpridas; track o.id) {
        <p class="text-sm text-slate-700 dark:text-slate-200">
          {{ o.numeroOs }} — {{ guarnicao(o.guarnicaoId)?.nome }} @if (o.situacao) { — {{ o.situacao }} } @if (o.local) { — {{ o.local }} }
        </p>
      } @empty {
        <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
      }
    </section>

    <section class="mt-6 grid gap-4 sm:grid-cols-3">
      @for (grupo of gruposFuncaoFixa; track grupo) {
        <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
          <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">{{ grupo }}</h2>
          @for (f of funcoesDoGrupo(grupo); track f.id) {
            <p class="text-sm text-slate-700 dark:text-slate-200">
              {{ f.funcao }} — {{ policialNome(f.policialMatricula) }} ({{ f.horarioInicio.slice(0, 5) }}–{{ f.horarioFim.slice(0, 5) }})
            </p>
          } @empty {
            <p class="text-sm text-slate-400 dark:text-slate-500">Nenhuma.</p>
          }
        </div>
      }
    </section>

    <section class="mt-6 grid gap-4">
      @for (item of camposComplemento; track item.campo) {
        <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
          <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">{{ item.titulo }}</h2>
          <textarea
            class="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            rows="3"
            [ngModel]="complementos()[item.campo]"
            (ngModelChange)="updateComplemento(item.campo, $event)"
            (blur)="onSalvarComplemento(item.campo)"
            name="complemento-{{ item.campo }}"
          ></textarea>
        </div>
      }
    </section>
  }
</div>
```

- [ ] **Step 5: Confirm the component smoke test still passes**

Run: `npm test -- --watch=false --include='**/relatorio-sei-page.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/relatorio-sei
git commit -m "feat: add relatorio SEI page"
```

---

### Task 9: Roteamento, navegação e RBAC

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.ts`
- Modify: `src/app/layout/top-bar/top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.ts`
- Modify: `src/app/layout/bottom-nav/bottom-nav.html`

**Interfaces:**
- Consumes: `RelatorioSeiPage` (Task 8), `roleGuard` (existing), `AuthService.currentPerfil` (existing).

- [ ] **Step 1: Add the route**

In `src/app/app.routes.ts`, find:
```typescript
      {
        path: 'escala-mensal',
        loadComponent: () =>
          import('./features/escala-mensal/escala-mensal-page/escala-mensal-page').then(
            (m) => m.EscalaMensalPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'] },
      },
    ],
  },
```
Replace with:
```typescript
      {
        path: 'escala-mensal',
        loadComponent: () =>
          import('./features/escala-mensal/escala-mensal-page/escala-mensal-page').then(
            (m) => m.EscalaMensalPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'] },
      },
      {
        path: 'relatorio-sei',
        loadComponent: () =>
          import('./features/relatorio-sei/relatorio-sei-page/relatorio-sei-page').then(
            (m) => m.RelatorioSeiPage,
          ),
        canActivate: [roleGuard],
        data: { roles: ['PC_LANCAMENTO', 'ADMIN'] },
      },
    ],
  },
```

- [ ] **Step 2: Add `podeGerarRelatorioSei()` to `TopBar`**

Replace `src/app/layout/top-bar/top-bar.ts` in full:
```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

const PERFIS_COM_ACESSO_ESCALAS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'];
const PERFIS_COM_ACESSO_RELATORIO_SEI = ['ADMIN', 'PC_LANCAMENTO'];

@Component({
  selector: 'app-top-bar',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  readonly authService = inject(AuthService);

  podeGerenciarEscalas(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALAS.includes(role);
  }

  podeGerarRelatorioSei(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_RELATORIO_SEI.includes(role);
  }

  signOut(): void {
    void this.authService.signOut();
  }
}
```

- [ ] **Step 3: Add the link to the top bar template**

In `src/app/layout/top-bar/top-bar.html`, find:
```html
    @if (authService.currentPerfil?.role === 'ADMIN') {
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/admin" routerLinkActive="text-blue-600">
        Admin
      </a>
    }
```
Replace with:
```html
    @if (podeGerarRelatorioSei()) {
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/relatorio-sei" routerLinkActive="text-blue-600">
        Relatório SEI
      </a>
    }
    @if (authService.currentPerfil?.role === 'ADMIN') {
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/admin" routerLinkActive="text-blue-600">
        Admin
      </a>
    }
```

- [ ] **Step 4: Add `podeGerarRelatorioSei()` to `BottomNav`**

Replace `src/app/layout/bottom-nav/bottom-nav.ts` in full:
```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

const PERFIS_COM_ACESSO_ESCALAS = ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'];
const PERFIS_COM_ACESSO_RELATORIO_SEI = ['ADMIN', 'PC_LANCAMENTO'];

@Component({
  selector: 'app-bottom-nav',
  imports: [CommonModule, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  readonly authService = inject(AuthService);

  podeGerenciarEscalas(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_ESCALAS.includes(role);
  }

  podeGerarRelatorioSei(): boolean {
    const role = this.authService.currentPerfil?.role;
    return !!role && PERFIS_COM_ACESSO_RELATORIO_SEI.includes(role);
  }
}
```

- [ ] **Step 5: Add the link to the bottom nav template**

In `src/app/layout/bottom-nav/bottom-nav.html`, find:
```html
  @if (authService.currentPerfil?.role === 'ADMIN') {
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/admin" routerLinkActive="text-blue-600">
      Admin
    </a>
  }
```
Replace with:
```html
  @if (podeGerarRelatorioSei()) {
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/relatorio-sei" routerLinkActive="text-blue-600">
      Relatório SEI
    </a>
  }
  @if (authService.currentPerfil?.role === 'ADMIN') {
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/admin" routerLinkActive="text-blue-600">
      Admin
    </a>
  }
```

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds, `relatorio-sei-page` shows up as a lazy chunk.

- [ ] **Step 7: Commit**

```bash
git add src/app/app.routes.ts src/app/layout/top-bar src/app/layout/bottom-nav
git commit -m "feat: wire up routing, navigation and RBAC for relatorio SEI"
```

---

### Task 10: Deploy e verificação ponta a ponta

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
Expected: `20260827090000_relatorio_sei.sql` shows up as applied.

- [ ] **Step 5: Verify end-to-end against real 3ª CPM data**

Using the REST API (same pattern as previous phases): log in as the seeded ADMIN, then:
1. POST a `lancamento_licencas` row for a real `policial_matricula` with `data_inicio`/`data_fim` spanning a known PARES day (e.g. `2026-08-04`) but starting a day earlier (e.g. `2026-08-03` to `2026-08-05`) — confirm via `rpc/fn_resolve_escala_dia` + the roster-merge logic that the policial resolves to `LICENCA` on `2026-08-04` (inside the range) and would NOT on `2026-08-02` (outside it).
2. POST a `lancamento_funcoes_fixas` row (e.g. grupo `GUARDA`, função `Comandante`) for that date and confirm it's returned by a `select` filtered on `data`.
3. PATCH/POST a `lancamento_atrasos` row with `sei_numero` set and confirm it round-trips.
4. POST a `relatorio_sei_complementos` row via upsert, then upsert again with different `conteudo` for the same `data`+`campo` and confirm it updated in place rather than duplicating.
5. Clean up every test row (`DELETE`) so the seeded data stays clean for the user.

- [ ] **Step 6: Report completion to the user**, noting that PJES/Diária, Fiscalização, POG and DIRESP remain free text, and that importing 1ª CPM/2ª CPM/PCTAT data is the next item on the roadmap.

## Self-Review Notes

- **Spec coverage:** schema (Task 1), `LancamentoService` extensions for licenças/funções fixas/SEI/situação/local (Task 2), Painel do PC capture UI for the new fields (Tasks 3–5), Dashboard status support (Task 6), `RelatorioSeiService` for complementos (Task 7), the report page itself (Task 8), routing/nav/RBAC (Task 9), deploy/verification (Task 10) — every section of the spec maps to a task.
- **Type consistency:** `StatusEfetivo`, `RegistrarLicencaInput`, `FuncaoFixaRow`, `GrupoFuncaoFixa`, `RegistrarFuncaoFixaInput` are all defined once in `lancamento.service.ts` (Task 2) and imported everywhere else (Tasks 3–8) — no redefinition. `RelatorioSeiPage` reuses `RosterRow`/`BaixaRow`/`OsRow` from `LancamentoService` rather than redefining local shapes.
- **Known deviation from the spec's literal wording:** the spec said "Nos modais já existentes... de baixa" — Task 3 documents that no such modal existed (baixa was a one-click toggle with no capture UI) and creates one, matching the OS-modal pattern already in the codebase, rather than leaving this ambiguous.
- **Ambiguity resolved:** LICENCA precedence in `listRosterDoDia` is checked first (before FALTA) — documented in Task 2's implementation, since the spec said "mesma precedência de FALTA" without picking a tie-breaker order.
- **Ambiguity resolved:** funções fixas live as a new section inside the existing Painel do PC page (Task 5) rather than a separate route — the spec left this open ("a definir na fase de planejamento"); reusing the page's existing date context avoids a second date picker and a new nav entry for a minor feature.
- **Build-order dependency:** Tasks 3, 4, 5, 6, 7 all depend on Task 2's service changes; Task 8 depends on Task 7 (and indirectly on Tasks 2–5's service surface); Task 9 depends on Task 8's component existing. Tasks 3, 4, 5 touch the same two files but are kept as separate commits/reviews since each is an independently reviewable increment (small field additions vs. a whole new status vs. a whole new section).
