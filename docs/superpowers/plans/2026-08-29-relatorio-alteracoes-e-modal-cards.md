# Relatório de Alterações do Serviço + alterações pelos cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar alterações do efetivo (permuta, curso, dispensa, LTS, ausência…) pelos cards do Painel do PC e gerar automaticamente, numa aba nova "Relatório Original", o RELATÓRIO DE ALTERAÇÕES DO SERVIÇO daquele dia.

**Architecture:** Uma tabela nova `lancamento_alteracoes` guarda todas as alterações do dia. `LancamentoService` ganha CRUD dessas alterações e passa a fundi-las no roster (`listRosterDoDia`), inclusive injetando uma linha sintética para o substituto de uma PERMUTA. O Painel do PC ganha novos tipos no modal dos cards. Uma função pura nova `montarRelatorioAlteracoesHtml` serializa o dia em HTML de tabelas com estilo inline (colável no CKEditor do SEI), consumida por `RelatorioOriginalPage` numa rota nova. As tabelas de lançamento atuais e a aba "Relatório SEI" ficam intocadas.

**Tech Stack:** Angular 21 standalone (signals, `@if`/`@for`, `inject()`), Vitest, Supabase (Postgres + RLS permissivo), Supabase CLI `./tools/supabase.exe`.

**Spec:** `docs/superpowers/specs/2026-08-29-relatorio-alteracoes-e-modal-cards-design.md` (inclui o Apêndice A com as listas fixas extraídas do PDF).

## Global Constraints

- Responder ao usuário sempre em português.
- Angular: componentes standalone, `signal()`/`inject()`, control flow `@if`/`@for` (nunca `*ngIf`/`*ngFor`).
- Testes: spec de componente é smoke (`should create`); asserções reais só em spec de serviço / função pura exportada.
- RLS: toda tabela nova tem `enable row level security` + policies `to authenticated using (true)` / `with check (true)`.
- Trigger de autoria: `before insert ... execute function public.fn_set_criado_por_lancamento()`.
- Migrações: nome `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, timestamp sequencial após `20260827110000`.
- Deploy de migração sem Docker: validar por parse estático + `./tools/supabase.exe db push --yes` (memória `supabase-no-docker.md`). O token `SUPABASE_ACCESS_TOKEN` é colado pelo usuário na sessão.
- HTML do relatório: só `<table>`/`<tr>`/`<td>`/`<p>` com **estilos inline** (o CKEditor do SEI descarta classes). Todo valor dinâmico passa por `esc()`.
- RBAC é só client-side: `roleGuard` lê `route.data.roles`; `@if` no template; early-return nos métodos de mutação.
- Rótulos, textos fixos e listas: copiar **verbatim** do Apêndice A da spec.

---

## File Structure

**Fase 1 — dados + Painel:**
- `supabase/migrations/20260829120000_lancamento_alteracoes.sql` (novo) — enum `tipo_alteracao` + tabela `lancamento_alteracoes`.
- `src/app/core/services/lancamento.service.ts` (modificar) — tipos `TipoAlteracao`/`AlteracaoRow`/`RegistrarAlteracaoInput`; métodos `listAlteracoesDoDia`/`registrarAlteracao`/`removerAlteracao`; novos valores de `StatusEfetivo`; campo `substituindoMatricula` em `RosterRow`; merge de alterações e linha sintética do substituto em `listRosterDoDia`.
- `src/app/core/services/lancamento.service.spec.ts` (modificar) — novos testes.
- `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts` (modificar) — novo `TipoLancamento`; `formObservacao`/`formProcessoSei`; `tiposLancamento`; `abrirModal`/`onRegistrarModal`; `STATUS_BADGE_CLASSES`/`STATUS_LABELS`; `removerAlteracao` wiring.
- `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html` (modificar) — blocos do modal por tipo; rótulo "Substituindo" na linha sintética; botão remover alteração.

**Fase 2 — relatório:**
- `src/app/core/services/relatorio-alteracoes.service.ts` (novo) — `RelatorioAlteracoesService` (list/salvar complementos com chaves `ALT_*`) + `montarRelatorioAlteracoesHtml` + constantes `OS_PERMANENTES`, `SUBSTITUICAO_PATRIMONIOS`.
- `src/app/core/services/relatorio-alteracoes.service.spec.ts` (novo) — testes da função pura.
- `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.ts` / `.html` / `.css` / `.spec.ts` (novos).
- `src/app/app.routes.ts` (modificar) — rota `relatorio-original`.
- `src/app/layout/top-bar/top-bar.ts` + `.html` (modificar) — link.
- `src/app/layout/bottom-nav/bottom-nav.ts` + `.html` (modificar) — link.

---

## Task 1: Migração `lancamento_alteracoes`

**Files:**
- Create: `supabase/migrations/20260829120000_lancamento_alteracoes.sql`

**Interfaces:**
- Produces: tabela `public.lancamento_alteracoes` com colunas `id uuid`, `data date`, `tipo public.tipo_alteracao`, `policial_matricula varchar(20)`, `policial_substituto_matricula varchar(20) null`, `guarnicao_id uuid null`, `escala_mensal_id uuid null`, `horario_inicio time null`, `horario_fim time null`, `processo_sei text null`, `observacao text null`, `criado_em timestamptz`, `criado_por uuid null`. Enum `public.tipo_alteracao` com `PERMUTA, CURSO, DISPENSA, EXPEDIENTE, FOLGA, FALTA_LTS, AUSENCIA_SERVICO`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260829120000_lancamento_alteracoes.sql`:

```sql
create type public.tipo_alteracao as enum (
  'PERMUTA',
  'CURSO',
  'DISPENSA',
  'EXPEDIENTE',
  'FOLGA',
  'FALTA_LTS',
  'AUSENCIA_SERVICO'
);

create table public.lancamento_alteracoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo public.tipo_alteracao not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  policial_substituto_matricula varchar(20) references public.policiais (matricula),
  guarnicao_id uuid references public.guarnicoes (id),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  processo_sei text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  constraint lancamento_alteracoes_permuta_tem_substituto
    check (tipo <> 'PERMUTA' or policial_substituto_matricula is not null)
);

create trigger trg_lancamento_alteracoes_criado_por
before insert on public.lancamento_alteracoes
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_alteracoes enable row level security;

create policy "authenticated_select_lancamento_alteracoes" on public.lancamento_alteracoes
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_alteracoes" on public.lancamento_alteracoes
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_alteracoes" on public.lancamento_alteracoes
  for delete to authenticated using (true);
```

- [ ] **Step 2: Validar por parse estático**

Run: `./tools/supabase.exe migration list --linked` (deve listar a nova migração como local, ainda não aplicada). Se o usuário ainda não colou o token nesta sessão, pedir e aguardar.

Conferir à mão: nenhum `;` dentro de comentário `--`, todas as aspas fechadas, `create type` antes do `create table`.

- [ ] **Step 3: Deploy**

Run: `./tools/supabase.exe db push --yes`
Expected: aplica `20260829120000_lancamento_alteracoes` sem erro.

- [ ] **Step 4: Confirmar**

Run: `./tools/supabase.exe migration list --linked`
Expected: `20260829120000` aparece nas duas colunas (local + remote).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829120000_lancamento_alteracoes.sql
git commit -m "feat: lancamento_alteracoes table + tipo_alteracao enum"
```

---

## Task 2: `LancamentoService` — CRUD de alterações

**Files:**
- Modify: `src/app/core/services/lancamento.service.ts`
- Test: `src/app/core/services/lancamento.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (padrão dos outros métodos do arquivo).
- Produces:
  - `export type TipoAlteracao = 'PERMUTA' | 'CURSO' | 'DISPENSA' | 'EXPEDIENTE' | 'FOLGA' | 'FALTA_LTS' | 'AUSENCIA_SERVICO';`
  - `export interface AlteracaoRow { id: string; data: string; tipo: TipoAlteracao; policialMatricula: string; policialSubstitutoMatricula: string | null; guarnicaoId: string | null; escalaMensalId: string | null; horarioInicio: string | null; horarioFim: string | null; processoSei: string | null; observacao: string | null; }`
  - `export interface RegistrarAlteracaoInput { data: string; tipo: TipoAlteracao; policial_matricula: string; policial_substituto_matricula?: string | null; guarnicao_id?: string | null; escala_mensal_id?: string | null; horario_inicio?: string | null; horario_fim?: string | null; processo_sei?: string | null; observacao?: string | null; }`
  - `listAlteracoesDoDia(data: string): Promise<AlteracaoRow[]>`
  - `registrarAlteracao(input: RegistrarAlteracaoInput): Promise<void>`
  - `removerAlteracao(id: string): Promise<void>`

- [ ] **Step 1: Escrever os testes (falhando)**

Em `lancamento.service.spec.ts`, dentro de `describe('LancamentoService', ...)`, adicionar:

```ts
it('registers an alteracao via insert on lancamento_alteracoes', async () => {
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  await service.registrarAlteracao({
    data: '2026-08-04',
    tipo: 'CURSO',
    policial_matricula: '127934-3',
    guarnicao_id: 'g1',
    processo_sei: '44900123',
    observacao: 'CFSD',
  });

  expect(insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      data: '2026-08-04',
      tipo: 'CURSO',
      policial_matricula: '127934-3',
      guarnicao_id: 'g1',
      processo_sei: '44900123',
      observacao: 'CFSD',
      policial_substituto_matricula: null,
    }),
  );
});

it('lists alteracoes for a given day, mapping snake_case to camelCase', async () => {
  const rows = [
    {
      id: 'alt1',
      data: '2026-08-04',
      tipo: 'DISPENSA',
      policial_matricula: '127934-3',
      policial_substituto_matricula: null,
      guarnicao_id: 'g1',
      escala_mensal_id: 'em1',
      horario_inicio: '06:00:00',
      horario_fim: '18:00:00',
      processo_sei: '44900999',
      observacao: 'AUTORIZADO PELA CIA',
    },
  ];
  const supabaseStub = {
    client: {
      from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }),
    },
  };

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  const result = await service.listAlteracoesDoDia('2026-08-04');

  expect(result).toEqual([
    {
      id: 'alt1',
      data: '2026-08-04',
      tipo: 'DISPENSA',
      policialMatricula: '127934-3',
      policialSubstitutoMatricula: null,
      guarnicaoId: 'g1',
      escalaMensalId: 'em1',
      horarioInicio: '06:00:00',
      horarioFim: '18:00:00',
      processoSei: '44900999',
      observacao: 'AUTORIZADO PELA CIA',
    },
  ]);
});

it('removes an alteracao by id', async () => {
  const eqSpy = vi.fn().mockResolvedValue({ error: null });
  const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
  const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  await service.removerAlteracao('alt1');

  expect(eqSpy).toHaveBeenCalledWith('id', 'alt1');
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- --watch=false src/app/core/services/lancamento.service.spec.ts`
Expected: FAIL — `service.registrarAlteracao is not a function` (etc.).

- [ ] **Step 3: Implementar**

Em `lancamento.service.ts`, adicionar os tipos perto de `RegistrarLicencaInput` (antes da classe):

```ts
export type TipoAlteracao =
  | 'PERMUTA' | 'CURSO' | 'DISPENSA' | 'EXPEDIENTE'
  | 'FOLGA' | 'FALTA_LTS' | 'AUSENCIA_SERVICO';

export interface AlteracaoRow {
  id: string;
  data: string;
  tipo: TipoAlteracao;
  policialMatricula: string;
  policialSubstitutoMatricula: string | null;
  guarnicaoId: string | null;
  escalaMensalId: string | null;
  horarioInicio: string | null;
  horarioFim: string | null;
  processoSei: string | null;
  observacao: string | null;
}

export interface RegistrarAlteracaoInput {
  data: string;
  tipo: TipoAlteracao;
  policial_matricula: string;
  policial_substituto_matricula?: string | null;
  guarnicao_id?: string | null;
  escala_mensal_id?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  processo_sei?: string | null;
  observacao?: string | null;
}
```

Dentro da classe `LancamentoService`, adicionar (perto dos outros `registrar*`):

```ts
async listAlteracoesDoDia(data: string): Promise<AlteracaoRow[]> {
  const { data: rows, error } = await this.supabase.client
    .from('lancamento_alteracoes')
    .select('*')
    .eq('data', data);
  if (error) throw error;
  return (
    (rows ?? []) as {
      id: string;
      data: string;
      tipo: TipoAlteracao;
      policial_matricula: string;
      policial_substituto_matricula: string | null;
      guarnicao_id: string | null;
      escala_mensal_id: string | null;
      horario_inicio: string | null;
      horario_fim: string | null;
      processo_sei: string | null;
      observacao: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    policialMatricula: r.policial_matricula,
    policialSubstitutoMatricula: r.policial_substituto_matricula,
    guarnicaoId: r.guarnicao_id,
    escalaMensalId: r.escala_mensal_id,
    horarioInicio: r.horario_inicio,
    horarioFim: r.horario_fim,
    processoSei: r.processo_sei,
    observacao: r.observacao,
  }));
}

async registrarAlteracao(input: RegistrarAlteracaoInput): Promise<void> {
  const { error } = await this.supabase.client.from('lancamento_alteracoes').insert({
    data: input.data,
    tipo: input.tipo,
    policial_matricula: input.policial_matricula,
    policial_substituto_matricula: input.policial_substituto_matricula ?? null,
    guarnicao_id: input.guarnicao_id ?? null,
    escala_mensal_id: input.escala_mensal_id ?? null,
    horario_inicio: input.horario_inicio ?? null,
    horario_fim: input.horario_fim ?? null,
    processo_sei: input.processo_sei ?? null,
    observacao: input.observacao ?? null,
  });
  if (error) throw error;
}

async removerAlteracao(id: string): Promise<void> {
  const { error } = await this.supabase.client.from('lancamento_alteracoes').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- --watch=false src/app/core/services/lancamento.service.spec.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/lancamento.service.ts src/app/core/services/lancamento.service.spec.ts
git commit -m "feat: LancamentoService CRUD for lancamento_alteracoes"
```

---

## Task 3: Fundir alterações no roster + linha sintética do substituto

**Files:**
- Modify: `src/app/core/services/lancamento.service.ts`
- Test: `src/app/core/services/lancamento.service.spec.ts`

**Interfaces:**
- Consumes: `listAlteracoesDoDia` (Task 2), `AlteracaoRow`, `TipoAlteracao`.
- Produces:
  - `StatusEfetivo` passa a ser: `'PREVISTO' | 'FALTA' | 'ATRASADO' | 'SUBSTITUIDO' | 'FOLGA' | 'REMANEJADO' | 'LICENCA' | 'CURSO' | 'DISPENSA' | 'EXPEDIENTE' | 'AUSENCIA'`.
  - `RosterRow` ganha `substituindoMatricula: string | null` (sempre presente; `null` quando a linha não é um substituto injetado).
  - `listRosterDoDia` continua `Promise<RosterRow[]>`, agora incluindo as linhas sintéticas dos substitutos e resolvendo os status de `lancamento_alteracoes`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `lancamento.service.spec.ts`: primeiro, no helper `buildSupabaseStub`, o `rpc` e o `from` já cobrem qualquer tabela via `tables[table] ?? []`. Adicionar `lancamento_alteracoes: []` nas chamadas existentes de `buildSupabaseStub` **não é obrigatório** (o `?? []` cobre), mas os testes novos precisam passar a chave. Adicionar:

```ts
it('maps a CURSO alteracao to statusEfetivo CURSO with the observacao as detalhe', async () => {
  const supabaseStub = buildSupabaseStub({
    lancamento_faltas: [],
    lancamento_atrasos: [],
    lancamento_permutas: [],
    lancamento_folgas: [],
    lancamento_remanejamentos: [],
    lancamento_licencas: [],
    lancamento_alteracoes: [
      {
        id: 'alt1',
        tipo: 'CURSO',
        policial_matricula: '127934-3',
        policial_substituto_matricula: null,
        guarnicao_id: 'g1',
        horario_inicio: '06:00:00',
        horario_fim: '18:00:00',
        observacao: 'CFSD',
      },
    ],
  });

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  const result = await service.listRosterDoDia('2026-08-04');

  expect(result[0].statusEfetivo).toBe('CURSO');
  expect(result[0].detalhe).toBe('CFSD');
  expect(result[0].detalheId).toBe('alt1');
});

it('maps AUSENCIA_SERVICO to statusEfetivo AUSENCIA', async () => {
  const supabaseStub = buildSupabaseStub({
    lancamento_faltas: [],
    lancamento_atrasos: [],
    lancamento_permutas: [],
    lancamento_folgas: [],
    lancamento_remanejamentos: [],
    lancamento_licencas: [],
    lancamento_alteracoes: [
      { id: 'a1', tipo: 'AUSENCIA_SERVICO', policial_matricula: '127934-3', policial_substituto_matricula: null, guarnicao_id: 'g1', horario_inicio: '06:00:00', horario_fim: '18:00:00', observacao: null },
    ],
  });

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  const result = await service.listRosterDoDia('2026-08-04');

  expect(result[0].statusEfetivo).toBe('AUSENCIA');
});

it('on a PERMUTA alteracao, marks the substituido SUBSTITUIDO and injects a substitute row', async () => {
  const supabaseStub = buildSupabaseStub({
    lancamento_faltas: [],
    lancamento_atrasos: [],
    lancamento_permutas: [],
    lancamento_folgas: [],
    lancamento_remanejamentos: [],
    lancamento_licencas: [],
    lancamento_alteracoes: [
      {
        id: 'p1',
        tipo: 'PERMUTA',
        policial_matricula: '127934-3',
        policial_substituto_matricula: '555555-5',
        guarnicao_id: 'g1',
        horario_inicio: '06:00:00',
        horario_fim: '18:00:00',
        observacao: null,
      },
    ],
  });

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseStub }],
  });

  const service = TestBed.inject(LancamentoService);
  const result = await service.listRosterDoDia('2026-08-04');

  const substituido = result.find((r) => r.policialMatricula === '127934-3');
  const substituto = result.find((r) => r.policialMatricula === '555555-5');
  expect(substituido?.statusEfetivo).toBe('SUBSTITUIDO');
  expect(substituido?.detalhe).toContain('555555-5');
  expect(substituto).toBeDefined();
  expect(substituto?.guarnicaoId).toBe('g1');
  expect(substituto?.statusEfetivo).toBe('PREVISTO');
  expect(substituto?.substituindoMatricula).toBe('127934-3');
});
```

Nota: o `buildSupabaseStub` já tem `rosterRpcRow` com `guarnicao_id: 'g1'`, `policial_matricula: '127934-3'`, `funcao: 'CMT'`. Ajustar o helper `buildSupabaseStub` para incluir `lancamento_alteracoes` no `Record` de tipos (opcional — só clareza).

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- --watch=false src/app/core/services/lancamento.service.spec.ts`
Expected: FAIL — status vem `PREVISTO`, sem linha de substituto, `substituindoMatricula` inexistente.

- [ ] **Step 3: Implementar**

Em `lancamento.service.ts`:

1. Trocar o tipo `StatusEfetivo`:

```ts
export type StatusEfetivo =
  | 'PREVISTO'
  | 'FALTA'
  | 'ATRASADO'
  | 'SUBSTITUIDO'
  | 'FOLGA'
  | 'REMANEJADO'
  | 'LICENCA'
  | 'CURSO'
  | 'DISPENSA'
  | 'EXPEDIENTE'
  | 'AUSENCIA';
```

2. Em `RosterRow`, adicionar o campo:

```ts
  detalheId: string | null;
  substituindoMatricula: string | null;
```

3. Em `listRosterDoDia`, adicionar `this.listAlteracoesDoDia(data)` ao `Promise.all` (como último item) e desestruturar `alteracoesRes` — na prática, chamar o método já mapeado:

```ts
async listRosterDoDia(data: string): Promise<RosterRow[]> {
  const [rosterRes, faltasRes, atrasosRes, permutasRes, folgasRes, remanejamentosRes, licencasRes] =
    await Promise.all([ /* ...igual... */ ]);
  // ...checks de erro iguais...

  const alteracoes = await this.listAlteracoesDoDia(data);
  // ...
```

(Manter simples: uma chamada `await` sequencial extra depois do `Promise.all` existente; não precisa micro-otimizar.)

4. No `base` de cada linha, incluir `substituindoMatricula: null`:

```ts
const base = {
  escalaMensalId: row.id,
  guarnicaoId: row.guarnicao_id,
  policialMatricula: row.policial_matricula,
  funcao: row.funcao,
  horarioInicio: row.horario_inicio,
  horarioFim: row.horario_fim,
  substituindoMatricula: null as string | null,
};
```

5. Logo após o bloco `licenca` (antes do bloco `falta`), inserir a resolução das alterações:

```ts
const alteracao = alteracoes.find((a) => a.policialMatricula === row.policial_matricula);
if (alteracao) {
  const mapa: Record<TipoAlteracao, StatusEfetivo> = {
    PERMUTA: 'SUBSTITUIDO',
    CURSO: 'CURSO',
    DISPENSA: 'DISPENSA',
    EXPEDIENTE: 'EXPEDIENTE',
    FOLGA: 'FOLGA',
    FALTA_LTS: 'LICENCA',
    AUSENCIA_SERVICO: 'AUSENCIA',
  };
  if (alteracao.tipo === 'PERMUTA') {
    return {
      ...base,
      statusEfetivo: 'SUBSTITUIDO',
      detalhe: `Substituído por ${alteracao.policialSubstitutoMatricula}`,
      detalheId: alteracao.id,
    };
  }
  return {
    ...base,
    statusEfetivo: mapa[alteracao.tipo],
    detalhe: alteracao.observacao,
    detalheId: alteracao.id,
  };
}
```

6. Trocar o `return roster.map(...)` por um bloco que primeiro monta as linhas e depois anexa as sintéticas:

```ts
const linhas = roster.map((row): RosterRow => { /* ...tudo acima... */ });

const sinteticas: RosterRow[] = [];
for (const alteracao of alteracoes) {
  if (alteracao.tipo !== 'PERMUTA' || !alteracao.policialSubstitutoMatricula) continue;
  const original = roster.find((r) => r.policial_matricula === alteracao.policialMatricula);
  if (!original) continue;
  sinteticas.push({
    escalaMensalId: original.id,
    guarnicaoId: original.guarnicao_id,
    policialMatricula: alteracao.policialSubstitutoMatricula,
    funcao: original.funcao,
    horarioInicio: original.horario_inicio,
    horarioFim: original.horario_fim,
    statusEfetivo: 'PREVISTO',
    detalhe: `Substituindo ${alteracao.policialMatricula}`,
    detalheId: null,
    substituindoMatricula: alteracao.policialMatricula,
  });
}

return [...linhas, ...sinteticas];
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- --watch=false src/app/core/services/lancamento.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte toda (checar consumidores de `StatusEfetivo`)**

Run: `npm test -- --watch=false`
Expected: PASS. Se `relatorio-sei.service.spec.ts` ou os componentes quebrarem por causa do `RosterRow.substituindoMatricula` obrigatório, ajustar os objetos de teste desses arquivos adicionando `substituindoMatricula: null` (é mock data; não muda comportamento). Registrar quais arquivos foram tocados.

- [ ] **Step 6: `tsc` / build check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros. `STATUS_BADGE_CLASSES`/`STATUS_LABELS` em `painel-pc-page.ts` são `Record<StatusEfetivo, ...>` e vão acusar chaves faltando — isso é corrigido na Task 5; se o build falhar aqui, seguir para a Task 5 antes de commitar, ou adicionar as chaves agora. **Decisão:** adicionar as chaves agora (Step 7) para manter o repo compilando a cada commit.

- [ ] **Step 7: Manter o repo compilando — stubs mínimos nos Records**

Em `painel-pc-page.ts`, adicionar as 4 chaves novas em `STATUS_BADGE_CLASSES` e `STATUS_LABELS` (valores definitivos na Task 5, aqui só para compilar):

```ts
// STATUS_BADGE_CLASSES
CURSO: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
DISPENSA: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
EXPEDIENTE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
AUSENCIA: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
```
```ts
// STATUS_LABELS
CURSO: 'Curso',
DISPENSA: 'Dispensa',
EXPEDIENTE: 'Expediente',
AUSENCIA: 'Ausência',
```

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/services/lancamento.service.ts src/app/core/services/lancamento.service.spec.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts
git commit -m "feat: merge lancamento_alteracoes into roster with synthetic substitute row"
```

(Inclua no `git add` qualquer spec de mock ajustada no Step 5.)

---

## Task 4: Painel do PC — modal dos cards

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `LancamentoService.registrarAlteracao` (Task 2), `RosterRow` com `escalaMensalId`/`guarnicaoId`/`horarioInicio`/`horarioFim`.
- Produces (no componente): `type TipoLancamento = 'ATRASADO' | 'REMANEJAMENTO' | 'PERMUTA' | 'CURSO' | 'DISPENSA' | 'EXPEDIENTE' | 'FOLGA' | 'FALTA_LTS' | 'AUSENCIA_SERVICO';`, signals `formObservacao`/`formProcessoSei`, `tiposLancamento: TipoLancamento[]`.

- [ ] **Step 1: Ajustar o tipo e os signals no componente**

Em `painel-pc-page.ts`:

```ts
type TipoLancamento =
  | 'ATRASADO'
  | 'REMANEJAMENTO'
  | 'PERMUTA'
  | 'CURSO'
  | 'DISPENSA'
  | 'EXPEDIENTE'
  | 'FOLGA'
  | 'FALTA_LTS'
  | 'AUSENCIA_SERVICO';
```

Trocar a lista:

```ts
readonly tiposLancamento: TipoLancamento[] = [
  'PERMUTA', 'CURSO', 'DISPENSA', 'EXPEDIENTE', 'FOLGA', 'FALTA_LTS', 'AUSENCIA_SERVICO', 'ATRASADO', 'REMANEJAMENTO',
];
readonly tipoLancamento = signal<TipoLancamento>('PERMUTA');
```

Adicionar signals de formulário perto dos existentes:

```ts
readonly formObservacao = signal('');
readonly formProcessoSei = signal('');
```

Adicionar um rótulo legível para o `<select>` do modal:

```ts
readonly rotulosTipoLancamento: Record<TipoLancamento, string> = {
  PERMUTA: 'Permuta',
  CURSO: 'Curso',
  DISPENSA: 'Dispensa',
  EXPEDIENTE: 'Expediente',
  FOLGA: 'Folga',
  FALTA_LTS: 'Falta (LTS/DTS)',
  AUSENCIA_SERVICO: 'Ausência do serviço',
  ATRASADO: 'Atrasado',
  REMANEJAMENTO: 'Remanejamento',
};
```

Remover as constantes/blocos que só serviam a `FALTA`/`LICENCA` do modal **não é necessário** — `registrarFalta`/`registrarLicenca` continuam sendo usados por `toggleFalta` e por nada mais no modal. Só o `switch` do modal muda.

- [ ] **Step 2: `abrirModal` — default e limpeza dos campos novos**

```ts
abrirModal(row: RosterRow): void {
  if (!this.podeEditar()) return;
  this.modalRow.set(row);
  this.tipoLancamento.set(row.statusEfetivo === 'ATRASADO' ? 'ATRASADO' : 'PERMUTA');
  this.formMotivo.set(row.statusEfetivo === 'ATRASADO' ? (row.detalhe ?? '') : '');
  this.formSubstitutoMatricula.set('');
  this.formSeiNumero.set('');
  this.formProcessoSei.set('');
  this.formObservacao.set('');
  this.formAutorizacao.set('');
  this.formDestino.set('');
  this.formHorarioChegada.set('');
  this.formLicencaInicio.set(this.data());
  this.formLicencaFim.set(this.data());
}
```

- [ ] **Step 3: `onRegistrarModal` — novo switch**

```ts
async onRegistrarModal(): Promise<void> {
  if (!this.podeEditar()) return;
  const linha = this.modalRow();
  if (!linha) return;
  this.registrando.set(true);
  this.errorMessage.set(null);
  try {
    const data = this.data();
    const tipo = this.tipoLancamento();
    if (tipo === 'ATRASADO') {
      await this.lancamentoService.registrarAtraso({
        data,
        policial_matricula: linha.policialMatricula,
        escala_mensal_id: linha.escalaMensalId,
        horario_chegada: this.formHorarioChegada() || null,
        motivo: this.formMotivo() || null,
        sei_numero: this.formSeiNumero() || null,
      });
    } else if (tipo === 'REMANEJAMENTO') {
      await this.lancamentoService.registrarRemanejamento({
        data,
        policial_matricula: linha.policialMatricula,
        escala_mensal_id: linha.escalaMensalId,
        destino: this.formDestino(),
      });
    } else {
      await this.lancamentoService.registrarAlteracao({
        data,
        tipo,
        policial_matricula: linha.policialMatricula,
        policial_substituto_matricula: tipo === 'PERMUTA' ? this.formSubstitutoMatricula() : null,
        guarnicao_id: linha.guarnicaoId,
        escala_mensal_id: linha.escalaMensalId,
        horario_inicio: linha.horarioInicio,
        horario_fim: linha.horarioFim,
        processo_sei: this.formProcessoSei() || null,
        observacao: this.formObservacao() || null,
      });
    }
    this.fecharModal();
    await this.reloadRoster();
  } catch {
    this.errorMessage.set('Não foi possível registrar a alteração.');
  } finally {
    this.registrando.set(false);
  }
}
```

- [ ] **Step 4: Template — `<select>` com rótulos e blocos por tipo**

Em `painel-pc-page.html`, no `<select name="modalTipo">`, trocar o `@for`:

```html
@for (tipo of tiposLancamento; track tipo) {
  <option [value]="tipo">{{ rotulosTipoLancamento[tipo] }}</option>
}
```

Trocar o bloco `@if (tipoLancamento() === 'FALTA')` (motivo) e adicionar o bloco compartilhado dos tipos de alteração. Substituir os blocos `'FALTA'` e `'LICENCA'` por:

```html
@if (tipoLancamento() === 'PERMUTA') {
  <select
    class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    required
    [ngModel]="formSubstitutoMatricula()"
    (ngModelChange)="formSubstitutoMatricula.set($event)"
    name="modalSubstituto"
  >
    <option value="" disabled>Policial substituto</option>
    @for (policial of policiais(); track policial.matricula) {
      <option [value]="policial.matricula">{{ policial.nome_guerra }}</option>
    }
  </select>
}

@if (tipoLancamento() !== 'ATRASADO' && tipoLancamento() !== 'REMANEJAMENTO') {
  <input
    class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    placeholder="Processo SEI (opcional)"
    [ngModel]="formProcessoSei()"
    (ngModelChange)="formProcessoSei.set($event)"
    name="modalProcessoSei"
  />
}

@if (
  tipoLancamento() === 'CURSO' ||
  tipoLancamento() === 'DISPENSA' ||
  tipoLancamento() === 'EXPEDIENTE' ||
  tipoLancamento() === 'FOLGA' ||
  tipoLancamento() === 'FALTA_LTS' ||
  tipoLancamento() === 'AUSENCIA_SERVICO'
) {
  <textarea
    class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    placeholder="Observação (ex.: AUTORIZADO PELA CIA)"
    rows="2"
    [ngModel]="formObservacao()"
    (ngModelChange)="formObservacao.set($event)"
    name="modalObservacao"
  ></textarea>
}
```

Remover os antigos blocos `@if (tipoLancamento() === 'FALTA')`, `@if (tipoLancamento() === 'LICENCA')` e o `<input placeholder="SEI Nº">` que ficava dentro do bloco `'PERMUTA'` (agora o SEI da permuta é o campo "Processo SEI" compartilhado). Manter intactos os blocos `'ATRASADO'`, `'FOLGA'`→ (atenção: o bloco `'FOLGA'` atual tem `SEI Nº` + `Autorização`; **substituir** pelo textarea de observação acima — a folga passa a ser uma alteração) e `'REMANEJAMENTO'`.

Resultado final dos blocos do modal: `PERMUTA` (select substituto + processo SEI + observação), `CURSO/DISPENSA/EXPEDIENTE/FOLGA/FALTA_LTS/AUSENCIA_SERVICO` (processo SEI + observação), `ATRASADO` (horário chegada + motivo + SEI — inalterado), `REMANEJAMENTO` (destino — inalterado).

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

Run: `npm test -- --watch=false src/app/features/painel-pc/painel-pc-page/painel-pc-page.spec.ts`
Expected: PASS (smoke).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: painel do PC modal registers alteracoes (permuta/curso/dispensa/lts/ausencia)"
```

---

## Task 5: Painel do PC — cards mostram alterações e substituto

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `RosterRow.substituindoMatricula`, `RosterRow.statusEfetivo` (novos valores), `LancamentoService.removerAlteracao` (Task 2).
- Produces: `removerAlteracaoDoCard(row: RosterRow): Promise<void>` no componente.

- [ ] **Step 1: Finalizar os Records de badge/label**

Confirmar em `painel-pc-page.ts` que `STATUS_BADGE_CLASSES` e `STATUS_LABELS` têm as 4 chaves novas (adicionadas na Task 3 Step 7). Ajustar os textos de `STATUS_LABELS` se quiser algo diferente de `Curso`/`Dispensa`/`Expediente`/`Ausência` — manter esses.

- [ ] **Step 2: Método de remoção**

Em `painel-pc-page.ts`:

```ts
async removerAlteracaoDoCard(row: RosterRow): Promise<void> {
  if (!this.podeEditar() || !row.detalheId) return;
  const tiposAlteracao: StatusEfetivo[] = ['SUBSTITUIDO', 'CURSO', 'DISPENSA', 'EXPEDIENTE', 'FOLGA', 'AUSENCIA', 'LICENCA'];
  if (!tiposAlteracao.includes(row.statusEfetivo)) return;
  try {
    await this.lancamentoService.removerAlteracao(row.detalheId);
    await this.reloadRoster();
  } catch {
    this.errorMessage.set('Não foi possível remover a alteração.');
  }
}
```

Nota: `FOLGA`/`LICENCA` também podem vir das tabelas antigas (sem `detalheId` no caso de `FOLGA`; `LICENCA` tem `detalheId` de `lancamento_licencas`). Como o guard exige `row.detalheId` e o Painel novo só cria `FOLGA`/`LICENCA`(FALTA_LTS) via `lancamento_alteracoes`, na prática o `detalheId` presente aqui é de uma alteração. Aceitável para esta fase.

- [ ] **Step 3: Template — linha do substituto e botão remover**

Em `painel-pc-page.html`, na renderização das `rows` de cada card, onde hoje aparece o badge de status e o `detalhe`, adicionar:

```html
@if (row.substituindoMatricula) {
  <span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
    Substituindo {{ policialNome(row.substituindoMatricula) }}
  </span>
}
```

E, junto ao badge de status quando `podeEditar()` e o status for uma alteração removível, um "×":

```html
@if (podeEditar() && row.detalheId && (
  row.statusEfetivo === 'SUBSTITUIDO' || row.statusEfetivo === 'CURSO' ||
  row.statusEfetivo === 'DISPENSA' || row.statusEfetivo === 'EXPEDIENTE' ||
  row.statusEfetivo === 'FOLGA' || row.statusEfetivo === 'AUSENCIA' ||
  row.statusEfetivo === 'LICENCA'
)) {
  <button
    type="button"
    class="ml-1 text-xs text-slate-400 hover:text-red-600"
    (click)="removerAlteracaoDoCard(row)"
    aria-label="Remover alteração"
  >
    ✕
  </button>
}
```

(Posicionar dentro do mesmo container onde o `STATUS_LABELS[row.statusEfetivo]` já é exibido — procurar `statusEfetivo` no `.html` para achar o ponto.)

- [ ] **Step 4: Build + smoke**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npm test -- --watch=false src/app/features/painel-pc/painel-pc-page/painel-pc-page.spec.ts` → PASS.

- [ ] **Step 5: Rodar a suíte toda**

Run: `npm test -- --watch=false`
Expected: PASS (83 testes anteriores + 6 novos das Tasks 2–3).

- [ ] **Step 6: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: cards show alteracao badges, substitute row and remove control"
```

---

## Task 6: `RelatorioAlteracoesService` + relatório (cabeçalho + ALTERAÇÕES DO EFETIVO)

**Files:**
- Create: `src/app/core/services/relatorio-alteracoes.service.ts`
- Test: `src/app/core/services/relatorio-alteracoes.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService`, `GuarnicaoRow` (`./guarnicoes.service`), `PolicialRow` (`./policiais.service`), `AlteracaoRow`/`RosterRow`/`BaixaRow` (`./lancamento.service`).
- Produces:
  - `export type CampoComplementoAlt = 'ALT_GRAD_MONITORAMENTO' | 'ALT_ESCALA_1CIA' | 'ALT_ESCALA_2CIA' | 'ALT_ESCALA_3CIA' | 'ALT_ESCALA_PJES' | 'ALT_OBSERVACOES';`
  - `export interface RelatorioAlteracoesInput { data: string; guarnicoes: GuarnicaoRow[]; policiais: PolicialRow[]; roster: RosterRow[]; alteracoes: AlteracaoRow[]; baixas: BaixaRow[]; complementos: Record<CampoComplementoAlt, string>; }`
  - `export class RelatorioAlteracoesService` com `listComplementos(data): Promise<{ campo: CampoComplementoAlt; conteudo: string }[]>` e `salvarComplemento(data, campo: CampoComplementoAlt, conteudo): Promise<void>` (mesma tabela `relatorio_sei_complementos`, `onConflict: 'data,campo'`).
  - `export function montarRelatorioAlteracoesHtml(input: RelatorioAlteracoesInput): string`
  - `export const OS_PERMANENTES: { numero: string; modalidade: string }[]`
  - `export const SUBSTITUICAO_PATRIMONIOS: { gt: string; patrimonio: string; horario: string }[]`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/app/core/services/relatorio-alteracoes.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import {
  RelatorioAlteracoesService,
  montarRelatorioAlteracoesHtml,
  RelatorioAlteracoesInput,
  OS_PERMANENTES,
} from './relatorio-alteracoes.service';
import { SupabaseService } from './supabase.service';

function baseInput(over: Partial<RelatorioAlteracoesInput> = {}): RelatorioAlteracoesInput {
  return {
    data: '2026-08-12',
    guarnicoes: [
      { id: 'g1', nome: 'GT 16111 - São José', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'São José', prefixos: ['16111'] },
      { id: 'g2', nome: 'GT 16112 - Santo Antônio', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Santo Antônio', prefixos: ['16112'] },
      { id: 'g3', nome: 'MO 16334 - Área 3', tipo: 'MO', companhia_id: 'c1', area_atuacao: null, prefixos: ['16334'] },
    ],
    policiais: [
      { matricula: '111-1', graduacao: 'SD', nome_guerra: 'ALFA', telefone: null, companhia_id: 'c1' },
      { matricula: '222-2', graduacao: 'CB', nome_guerra: 'BRAVO & <X>', telefone: null, companhia_id: 'c1' },
    ],
    roster: [
      { escalaMensalId: 'e1', guarnicaoId: 'g1', policialMatricula: '111-1', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'FALTA', detalhe: null, detalheId: 'f1', substituindoMatricula: null },
      { escalaMensalId: 'e2', guarnicaoId: 'g2', policialMatricula: '222-2', funcao: 'CMT', horarioInicio: '06:00:00', horarioFim: '18:00:00', statusEfetivo: 'SUBSTITUIDO', detalhe: 'Substituído por 111-1', detalheId: 'p1', substituindoMatricula: null },
    ],
    alteracoes: [
      { id: 'a1', data: '2026-08-12', tipo: 'CURSO', policialMatricula: '222-2', policialSubstitutoMatricula: null, guarnicaoId: 'g2', escalaMensalId: 'e2', horarioInicio: '06:00:00', horarioFim: '18:00:00', processoSei: '44900123', observacao: 'CFSD' },
    ],
    baixas: [],
    complementos: { ALT_GRAD_MONITORAMENTO: 'SGT SILVA', ALT_ESCALA_1CIA: '', ALT_ESCALA_2CIA: '', ALT_ESCALA_3CIA: '', ALT_ESCALA_PJES: '', ALT_OBSERVACOES: '' },
    ...over,
  };
}

describe('RelatorioAlteracoesService', () => {
  it('salva complemento com onConflict data,campo', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(RelatorioAlteracoesService);
    await service.salvarComplemento('2026-08-12', 'ALT_GRAD_MONITORAMENTO', 'SGT SILVA');
    expect(upsertSpy).toHaveBeenCalledWith(
      { data: '2026-08-12', campo: 'ALT_GRAD_MONITORAMENTO', conteudo: 'SGT SILVA' },
      { onConflict: 'data,campo' },
    );
  });
});

describe('montarRelatorioAlteracoesHtml', () => {
  it('renderiza título, data e o graduado de monitoramento', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).toContain('RELATÓRIO DE ALTERAÇÕES DO SERVIÇO');
    expect(html).toContain('2026-08-12');
    expect(html).toContain('SGT SILVA');
  });

  it('lista a alteração CURSO na tabela ALTERAÇÕES DO EFETIVO com matrícula, SETOR e processo SEI', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    const secao = html.slice(html.indexOf('ALTERAÇÕES DO EFETIVO'));
    expect(secao).toContain('CURSO');
    expect(secao).toContain('222-2');
    expect(secao).toContain('BRAVO &amp; &lt;X&gt;'); // coluna NOME
    expect(secao).toContain('>CB<'); // coluna GRAD.
    expect(secao).toContain('GT 16112'); // coluna SETOR (nome antes de " - ")
    expect(secao).toContain('44900123');
    expect(secao).toContain('CFSD');
  });

  it('escapa HTML nos nomes', () => {
    const html = montarRelatorioAlteracoesHtml(baseInput());
    expect(html).not.toContain('BRAVO & <X>');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- --watch=false src/app/core/services/relatorio-alteracoes.service.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o serviço e o cabeçalho + ALTERAÇÕES DO EFETIVO**

Criar `src/app/core/services/relatorio-alteracoes.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GuarnicaoRow } from './guarnicoes.service';
import { PolicialRow } from './policiais.service';
import { AlteracaoRow, BaixaRow, RosterRow, TipoAlteracao } from './lancamento.service';

export type CampoComplementoAlt =
  | 'ALT_GRAD_MONITORAMENTO'
  | 'ALT_ESCALA_1CIA'
  | 'ALT_ESCALA_2CIA'
  | 'ALT_ESCALA_3CIA'
  | 'ALT_ESCALA_PJES'
  | 'ALT_OBSERVACOES';

export interface ComplementoAltRow {
  campo: CampoComplementoAlt;
  conteudo: string;
}

export interface RelatorioAlteracoesInput {
  data: string;
  guarnicoes: GuarnicaoRow[];
  policiais: PolicialRow[];
  roster: RosterRow[];
  alteracoes: AlteracaoRow[];
  baixas: BaixaRow[];
  complementos: Record<CampoComplementoAlt, string>;
}

@Injectable({ providedIn: 'root' })
export class RelatorioAlteracoesService {
  private readonly supabase = inject(SupabaseService);

  async listComplementos(data: string): Promise<ComplementoAltRow[]> {
    const { data: rows, error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .select('campo, conteudo')
      .eq('data', data);
    if (error) throw error;
    return (rows ?? []) as ComplementoAltRow[];
  }

  async salvarComplemento(data: string, campo: CampoComplementoAlt, conteudo: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('relatorio_sei_complementos')
      .upsert({ data, campo, conteudo }, { onConflict: 'data,campo' });
    if (error) throw error;
  }
}

// --- HTML -----------------------------------------------------------------

const S_TABELA = 'border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:6pt 0;';
const S_CEL = 'border:1px solid #000;padding:3pt 5pt;vertical-align:top;';
const S_CEL_C = S_CEL + 'text-align:center;';
const S_TH = S_CEL + 'background-color:#e6e6e6;font-weight:bold;text-align:center;';
const S_TITULO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;text-transform:uppercase;text-align:center;margin:12pt 0 4pt;';
const S_PARAGRAFO = 'font-family:Calibri,Arial,sans-serif;font-size:12pt;text-align:justify;margin:4pt 0;';

const ROTULO_ALTERACAO: Record<TipoAlteracao, string> = {
  PERMUTA: 'PERMUTA',
  CURSO: 'CURSO',
  DISPENSA: 'DISPENSA',
  EXPEDIENTE: 'EXPEDIENTE',
  FOLGA: 'FOLGA',
  FALTA_LTS: 'LTS/DTS',
  AUSENCIA_SERVICO: 'AUSÊNCIA DO SERVIÇO',
};

function esc(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "GT 16111 - São José" -> "GT 16111". */
function setorLabel(g: GuarnicaoRow | undefined): string {
  if (!g) return '';
  return g.nome.split(/\s[–-]\s/)[0].trim();
}

function tabela(cabecalhos: string[], linhas: string[][]): string {
  const thead = `<tr>${cabecalhos.map((h) => `<th style="${S_TH}">${esc(h)}</th>`).join('')}</tr>`;
  const tbody = linhas
    .map((l) => `<tr>${l.map((c) => `<td style="${S_CEL}">${c}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="${S_TABELA}"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

export function montarRelatorioAlteracoesHtml(input: RelatorioAlteracoesInput): string {
  const guarnicaoPorId = new Map(input.guarnicoes.map((g) => [g.id, g]));
  const policialPorMatricula = new Map(input.policiais.map((p) => [p.matricula, p]));
  const grad = (m: string): string => policialPorMatricula.get(m)?.graduacao ?? '';
  const nomeGuerra = (m: string): string => policialPorMatricula.get(m)?.nome_guerra ?? m;

  const out: string[] = [];

  // 1-2. Cabeçalho -------------------------------------------------------
  out.push(`<p style="${S_TITULO}">SECRETARIA DE DEFESA SOCIAL</p>`);
  out.push(`<p style="${S_TITULO}">POLÍCIA MILITAR DE PERNAMBUCO</p>`);
  out.push(`<p style="${S_TITULO}">16º BATALHÃO DE POLÍCIA MILITAR — BATALHÃO FREI CANECA</p>`);
  out.push(`<p style="${S_TITULO}">RELATÓRIO DE ALTERAÇÕES DO SERVIÇO</p>`);
  out.push(
    `<p style="${S_PARAGRAFO}"><b>Data:</b> ${esc(input.data)} &nbsp;&nbsp; ` +
      `<b>Graduado de monitoramento:</b> ${esc(input.complementos.ALT_GRAD_MONITORAMENTO)}</p>`,
  );

  // 3. Parágrafo de abertura ------------------------------------------
  out.push(
    `<p style="${S_PARAGRAFO}">Segue o relatório das alterações do serviço ordinário referente ao dia ` +
      `${esc(input.data)}, para conhecimento e providências.</p>`,
  );

  // 4. ESCALAS ------------------------------------------------------
  out.push(`<p style="${S_TITULO}">ESCALAS</p>`);
  out.push(
    tabela(
      ['ESCALA', 'PROCESSO SEI'],
      [
        ['1ª CIA', esc(input.complementos.ALT_ESCALA_1CIA)],
        ['2ª CIA', esc(input.complementos.ALT_ESCALA_2CIA)],
        ['3ª CIA', esc(input.complementos.ALT_ESCALA_3CIA)],
        ['PJES', esc(input.complementos.ALT_ESCALA_PJES)],
      ],
    ),
  );

  // 5. ALTERAÇÕES DO EFETIVO ---------------------------------------
  out.push(`<p style="${S_TITULO}">ALTERAÇÕES DO EFETIVO</p>`);
  const linhasEfetivo = input.alteracoes.length
    ? input.alteracoes.map((a) => [
        esc(ROTULO_ALTERACAO[a.tipo]),
        esc(grad(a.policialMatricula)),
        esc(a.policialMatricula),
        esc(nomeGuerra(a.policialMatricula)),
        '16ºBPM',
        esc(setorLabel(guarnicaoPorId.get(a.guarnicaoId ?? ''))),
        esc(a.processoSei),
        esc(
          a.tipo === 'PERMUTA'
            ? `Substituído por ${a.policialSubstitutoMatricula}${a.observacao ? ' — ' + a.observacao : ''}`
            : a.observacao,
        ),
      ])
    : [['-', '-', '-', '-', '-', '-', '-', '-']];
  out.push(
    tabela(
      ['ALTERAÇÃO', 'GRAD.', 'MATRÍCULA', 'NOME', 'OME', 'SETOR', 'PROCESSO SEI', 'OBSERVAÇÃO'],
      linhasEfetivo,
    ),
  );

  return out.join('\n');
}
```

A coluna NOME usa só `nome_guerra` (a `GRAD.` já vem em coluna própria).

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- --watch=false src/app/core/services/relatorio-alteracoes.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/relatorio-alteracoes.service.ts src/app/core/services/relatorio-alteracoes.service.spec.ts
git commit -m "feat: RelatorioAlteracoesService + report header and ALTERAÇÕES DO EFETIVO table"
```

---

## Task 7: Relatório — ORDINÁRIO, SERVIÇO EM GERAL, listas fixas e quadros pré-montados

**Files:**
- Modify: `src/app/core/services/relatorio-alteracoes.service.ts`
- Test: `src/app/core/services/relatorio-alteracoes.service.spec.ts`

**Interfaces:**
- Consumes: tudo da Task 6.
- Produces: `OS_PERMANENTES` e `SUBSTITUICAO_PATRIMONIOS` exportados; `montarRelatorioAlteracoesHtml` passa a emitir as seções 6–12.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar a `relatorio-alteracoes.service.spec.ts`:

```ts
it('conta guarnições no TOTAL DE LANÇAMENTOS (GT\'S = 2, MO\'S = 1)', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput());
  const secao = html.slice(html.indexOf('TOTAL DE LANÇAMENTOS'));
  expect(secao).toMatch(/GT'S<\/td>\s*<td[^>]*>2<\/td>/);
  expect(secao).toMatch(/MO'S<\/td>\s*<td[^>]*>1<\/td>/);
});

it('conta SERVIÇO EM GERAL a partir do roster (FALTAS = 1, PERMUTAS = 1)', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput());
  const secao = html.slice(html.indexOf('SERVIÇO EM GERAL'));
  expect(secao).toMatch(/FALTAS<\/td>\s*<td[^>]*>1<\/td>/);
  expect(secao).toMatch(/PERMUTAS<\/td>\s*<td[^>]*>1<\/td>/);
});

it('inclui a lista fixa OS_PERMANENTES (1358/2025 e 948)', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput());
  const secao = html.slice(html.indexOf('"O.S" CUMPRIDAS'));
  expect(secao).toContain('1358/2025');
  expect(secao).toContain('OPERAÇÃO TRANSPORTE SEGURO');
  expect(OS_PERMANENTES).toHaveLength(20);
});

it('inclui o quadro fixo SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput());
  const secao = html.slice(html.indexOf('SUBSTITUIÇÃO DE PATRIMÔNIOS'));
  expect(secao).toContain('GT 16300');
  expect(secao).toContain('710268');
});

it('inclui os quadros pré-montados PJES / DIÁRIA e POG A PÉ', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput());
  expect(html).toContain('PJES / DIÁRIA');
  expect(html).toContain('POG A PÉ');
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- --watch=false src/app/core/services/relatorio-alteracoes.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar as constantes e as seções**

No topo de `relatorio-alteracoes.service.ts` (perto dos estilos), adicionar as constantes **copiando verbatim o Apêndice A.2 e A.3 da spec**:

```ts
export const SUBSTITUICAO_PATRIMONIOS: { gt: string; patrimonio: string; horario: string }[] = [
  { gt: 'GT 16300', patrimonio: '710268', horario: '05h às 14h / 14h às 23h' },
  { gt: 'GT 16000', patrimonio: '710265', horario: '06h às 18h / 18h às 06h' },
  { gt: 'GT 16111', patrimonio: '710279', horario: '06h às 18h' },
  { gt: 'GT 16111', patrimonio: '710268', horario: '18h às 06h' },
  { gt: 'GT 16113', patrimonio: '710274', horario: '19h às 07h' },
  { gt: 'GG 16450', patrimonio: '710265', horario: '06h às 06h' },
  { gt: 'GG 16550', patrimonio: '710269', horario: '06h às 06h' },
  { gt: 'CR 16750', patrimonio: '710271', horario: '06h às 06h' },
  { gt: 'GT 16224', patrimonio: '710270', horario: '08h às 20h' },
  { gt: 'GT 16250', patrimonio: '710272', horario: '13h à 01h' },
  { gt: 'GT 16350', patrimonio: '710280', horario: '13h à 01h' },
  { gt: 'GV 16112', patrimonio: 'SNR 7E44', horario: '14h às 02h' },
  { gt: 'MP 16150', patrimonio: '71210', horario: '06h às 14h' },
  { gt: 'MO 16334', patrimonio: '710255', horario: '06h às 14h' },
  { gt: 'MO 16335', patrimonio: '710258', horario: '06h às 14h' },
  { gt: 'MO 16336', patrimonio: '710260', horario: '06h às 14h' },
  { gt: 'MO 16131', patrimonio: '710246', horario: '14h às 22h' },
  { gt: 'MO 16132', patrimonio: '710248', horario: '14h às 22h' },
  { gt: 'MO 16133', patrimonio: '710249', horario: '14h às 22h' },
  { gt: 'MO 16221', patrimonio: '710246', horario: '15h às 23h' },
  { gt: 'MO 16222', patrimonio: '710248', horario: '15h às 23h' },
  { gt: 'MO 16223', patrimonio: '710250', horario: '15h às 23h' },
  { gt: 'MO 16331', patrimonio: '710249', horario: '15h às 23h' },
  { gt: 'MO 16332', patrimonio: '710250', horario: '15h às 23h' },
  { gt: 'MO 16333', patrimonio: '710260', horario: '15h às 23h' },
  { gt: 'GT 16231', patrimonio: '710XXX', horario: '06h às 18h' },
  { gt: 'GT 16331', patrimonio: '710278', horario: '06h às 18h' },
  { gt: 'GT 16332', patrimonio: '710286', horario: '06h às 18h' },
  { gt: 'GT 16232', patrimonio: '710XXX', horario: '07h às 19h' },
  { gt: 'GT 16332', patrimonio: '710273', horario: '17h às 05h' },
  { gt: 'GT 16231', patrimonio: '710XXX', horario: '18h às 06h' },
  { gt: 'GT 16232', patrimonio: '710XXX', horario: '19h às 07h' },
  { gt: 'GT 16233', patrimonio: '710284', horario: '20h às 08h' },
  { gt: 'GT 16333', patrimonio: '710276', horario: '20h às 08h' },
  { gt: 'GT 16510', patrimonio: '710XXX', horario: '16h às 00h' },
];

export const OS_PERMANENTES: { numero: string; modalidade: string }[] = [
  { numero: 'OS Nº 1358/2025 – INT. POLICIAMENTO NOS TI DE JOANA BEZERRA, RECIFE E CAIS DE SANTA RITA – 31 DE OUTUBRO ATÉ ULTERIOR DELIBERAÇÃO', modalidade: 'GG 16450 / GG 16550' },
  { numero: 'OS Nº 1601/2025 - PBAC NO LOCAL EM FRENTE AO CTT – CENTRO DE TREINAMENTO TÁTICO PMPE – 18 DE DEZEMBRO A ULTERIOR DELIBERAÇÃO', modalidade: '01 PB/GT DISPONÍVEL' },
  { numero: 'OS Nº 28 - INT. POLICIAMENTO NOS BAIRROS DA BOA VISTA, ILHA DO LEITE, SÃO JOSÉ E SANTO ANTÔNIO – 13 DE JANEIRO ATÉ ULTERIOR DELIBERAÇÃO', modalidade: 'GT 16416' },
  { numero: 'OS Nº 160/2026 - Operação Impacto Integrado – Frei Caneca', modalidade: 'GT 16000 + 02 GTs OPS' },
  { numero: 'OS Nº 300 - INT.POL. EDF 13 DE MAIO/BOA VISTA - 24H', modalidade: '01 GT/PB EM RONDAS' },
  { numero: 'OS Nº 302 - INT.POL. NA PRAÇA SERGIO LORETO - 24H', modalidade: '01 GT/PB EM RONDAS' },
  { numero: 'OS 307 – OPERAÇÃO OCTOPUS - A PARTIR DE MARÇO DE 2026 ATÉ ULTERIOR DELIBERAÇÃO - 13H ÀS 21H', modalidade: 'GT 16000 + 01 GT DISPONÍVEL' },
  { numero: 'OS Nº 311 - INT.POL. NO CONSULADO GERAL DOS ESTADOS UNIDOS DA AMÉRICA - 03 DE MARÇO ATÉ ULTERIOR DELIBERAÇÃO - 24H', modalidade: 'GT 16000 + 01 GT DISPONÍVEL' },
  { numero: 'OS Nº 383/2026 – POLICIAMENTO PRAÇA ODÍLIA FREIRE', modalidade: 'PB ou 01 GT disponível' },
  { numero: 'OS Nº 441 – PROMOTORIAS (PAULO CAVALCANTI)', modalidade: 'RONDAS + PB (15min/hora)' },
  { numero: 'OS Nº 846 - INTENSIFICAÇÃO DO POLICIAMENTO PRAÇA DOM VITAL - 08 a 31JUL26', modalidade: 'CICLOPATRULHA - PEs do 01 ao 20 min de cada hora / 01 MO DISPONÍVEL - PEs do 20 ao 40 min de cada hora' },
  { numero: 'OS Nº 853 - INT. DO POLICIAMENTO NA RUA INCONFIDÊNCIA (JOANA BEZERRA) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'PB JOANA BEZERRA / rondas no setor de origem com paradas de 10 minutos a cada duas horas na rua citada' },
  { numero: 'OS Nº 854 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA DROGASIL (ILHA DO LEITE) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'PB ILHA DO LEITE / rondas no setor de origem e abordagens a indivíduos em atitudes suspeitas na proximidade do local' },
  { numero: 'OS Nº 855 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA CASA DA CULTURA - DE 07 DE JULHO A 07 DE AGOSTO DE 2026', modalidade: 'GT DISPONÍVEL OU PB SÃO JOSÉ / POG 25 RUA FLORIANO PEIXOTO (DA CASA DA CULTURA ATÉ TI DO RECIFE)' },
  { numero: 'OS Nº 887 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 13JUL2026 ATÉ ULTERIOR', modalidade: '01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável' },
  { numero: 'OS Nº 905 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 20JUL2026 ATÉ ULTERIOR DELIBERAÇÃO', modalidade: '01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável' },
  { numero: 'OS Nº 946 - PALÁCIO JOAQUIM NABUCO - 28JUL26 a 31AGO26', modalidade: 'GT 16000 / GT DISPONÍVEL / MO 16331 / CICLO PATRULHA (BOA VISTA)' },
  { numero: 'OS Nº 948 - OPERAÇÃO TRANSPORTE SEGURO (OTS) - AGOSTO 2026', modalidade: 'GT 16250 / GT 16350' },
  { numero: 'OS Nº 1046 - OPERAÇÃO OCTHOPUS', modalidade: 'MO 16131' },
  { numero: 'OS Nº 1077 - OPERAÇÃO FORÇA TOTAL', modalidade: 'GT 16550' },
];
```

Adicionar as funções auxiliares de contagem e as seções. Antes do `return out.join('\n')`:

```ts
  // 6. ALTERAÇÕES OPERAÇÃO PATRULHA / REMANEJAMENTOS (pré-montado) ----
  for (const titulo of ['POG A PÉ', 'CICLOPATRULHA', 'PBS']) {
    out.push(`<p style="${S_TITULO}">${titulo}</p>`);
    out.push(
      tabela(
        ['SETOR', 'HORÁRIO', 'EFETIVO', 'OBS'],
        [['', '', '', '']],
      ),
    );
  }

  // 7. SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS (pré-montado fixo) -----
  out.push(`<p style="${S_TITULO}">SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS</p>`);
  out.push(
    tabela(
      ['GT', 'PATRI. INICIAL', 'HORÁRIO', 'PATRI. SUBSTITUTO', 'HORÁRIO', 'MOTIVO'],
      SUBSTITUICAO_PATRIMONIOS.map((p) => [esc(p.gt), esc(p.patrimonio), esc(p.horario), '', '', '']),
    ),
  );

  // 8. ORDINÁRIO — TOTAL DE LANÇAMENTOS (auto) ----------------------
  const contaTipo = (t: string): number =>
    new Set(
      input.roster
        .filter((r) => guarnicaoPorId.get(r.guarnicaoId)?.tipo === t)
        .map((r) => `${r.guarnicaoId}__${r.horarioInicio}`),
    ).size;
  const porStatus = (s: RosterRow['statusEfetivo']): number =>
    input.roster.filter((r) => r.statusEfetivo === s).length;

  const totalLanc: [string, number | string][] = [
    ["GS'S", contaTipo('GT_ORDINARIO')],
    ["GT'S", contaTipo('GT_TATICO')],
    ["PB'S", 0],
    ['GV', contaTipo('GV')],
    ["MO'S", contaTipo('MO')],
    ['CP', contaTipo('CP')],
    ['CR', contaTipo('CR')],
    ['GG', contaTipo('GG')],
    ['MP', 0],
    ['POG A PE NO TERRENO - 03 TURNOS', ''],
  ];
  const servicoGeral: [string, number | string][] = [
    ['FALTAS', porStatus('FALTA')],
    ['LTS / DTS', porStatus('LICENCA')],
    ['PERMUTAS', porStatus('SUBSTITUIDO')],
    ['AUSÊNCIA DO SERVIÇO', porStatus('AUSENCIA')],
    ['FOLGAS (TÁTICO/MO/GT/PB/CICLO)', porStatus('FOLGA')],
    ['LICENÇA PATERNIDADE', ''],
    ['REMANEJAMENTO GT/MO/PB - ORDINÁRIA', porStatus('REMANEJADO')],
    ["VT'S/MO'S/DESATIVADAS", input.baixas.length],
    ['VIATURA/MO FORA DA ÁREA EM MISSÃO', ''],
    ['QUANTIDADE DE "OS" CUMPRIDA', 0],
  ];
  out.push(`<p style="${S_TITULO}">ORDINÁRIO</p>`);
  const n = Math.max(totalLanc.length, servicoGeral.length);
  const corpo: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = totalLanc[i];
    const b = servicoGeral[i];
    corpo.push(
      `<tr>` +
        `<td style="${S_CEL_C}">${a ? esc(a[0]) : ''}</td>` +
        `<td style="${S_CEL_C}">${a ? esc(String(a[1])) : ''}</td>` +
        `<td style="${S_CEL_C}">${b ? esc(b[0]) : ''}</td>` +
        `<td style="${S_CEL_C}">${b ? esc(String(b[1])) : ''}</td>` +
        `</tr>`,
    );
  }
  out.push(
    `<table style="${S_TABELA}"><thead><tr>` +
      `<th style="${S_TH}" colspan="2">TOTAL DE LANÇAMENTOS</th>` +
      `<th style="${S_TH}" colspan="2">SERVIÇO EM GERAL</th>` +
      `</tr></thead><tbody>${corpo.join('')}</tbody></table>`,
  );

  // 10. PJES / DIÁRIA (pré-montado vazio) --------------------------
  out.push(`<p style="${S_TITULO}">PJES / DIÁRIA</p>`);
  out.push(
    tabela(
      ['TOTAL DE LANÇAMENTOS', '', 'SERVIÇO EM GERAL', ''],
      [['', '', '', '']],
    ),
  );

  // 11. "O.S" CUMPRIDAS (lista fixa) ------------------------------
  out.push(`<p style="${S_TITULO}">"O.S" CUMPRIDAS</p>`);
  out.push(
    tabela(
      ['QNT', 'Nº DA O.S', 'MODALIDADE DE POLICIAMENTO'],
      OS_PERMANENTES.map((o, i) => [String(i + 1), esc(o.numero), esc(o.modalidade)]),
    ),
  );

  // 9./12. OBSERVAÇÕES + assinatura -----------------------------
  out.push(`<p style="${S_TITULO}">OBSERVAÇÕES</p>`);
  out.push(`<p style="${S_PARAGRAFO}">${esc(input.complementos.ALT_OBSERVACOES) || '-'}</p>`);
  out.push(`<p style="${S_PARAGRAFO}text-align:center;font-weight:bold;">${esc(input.complementos.ALT_GRAD_MONITORAMENTO)}<br>GRADUADO DE MONITORAMENTO</p>`);
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test -- --watch=false src/app/core/services/relatorio-alteracoes.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/relatorio-alteracoes.service.ts src/app/core/services/relatorio-alteracoes.service.spec.ts
git commit -m "feat: report ORDINÁRIO totals, SERVIÇO EM GERAL, fixed O.S. and patrimônio tables"
```

---

## Task 8: Aba "Relatório Original" — componente, rota e navegação

**Files:**
- Create: `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.ts`
- Create: `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.html`
- Create: `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.css`
- Create: `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.ts` + `src/app/layout/top-bar/top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.ts` + `src/app/layout/bottom-nav/bottom-nav.html`

**Interfaces:**
- Consumes: `RelatorioAlteracoesService`, `montarRelatorioAlteracoesHtml`, `CampoComplementoAlt` (Task 6/7); `LancamentoService.listRosterDoDia`/`listBaixasDoDia`/`listAlteracoesDoDia`; `GuarnicoesService.listGuarnicoes`; `PoliciaisService.listPoliciais`.
- Produces: rota `relatorio-original` (roles `['PC_LANCAMENTO','ADMIN']`), componente `RelatorioOriginalPage`.

- [ ] **Step 1: Componente**

Criar `relatorio-original-page.ts` (espelha `relatorio-sei-page.ts`):

```ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AlteracaoRow, BaixaRow, LancamentoService, RosterRow } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import {
  CampoComplementoAlt,
  RelatorioAlteracoesInput,
  RelatorioAlteracoesService,
  montarRelatorioAlteracoesHtml,
} from '../../../core/services/relatorio-alteracoes.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPOS: { campo: CampoComplementoAlt; titulo: string }[] = [
  { campo: 'ALT_GRAD_MONITORAMENTO', titulo: 'Graduado de monitoramento' },
  { campo: 'ALT_ESCALA_1CIA', titulo: 'SEI da escala — 1ª Cia' },
  { campo: 'ALT_ESCALA_2CIA', titulo: 'SEI da escala — 2ª Cia' },
  { campo: 'ALT_ESCALA_3CIA', titulo: 'SEI da escala — 3ª Cia' },
  { campo: 'ALT_ESCALA_PJES', titulo: 'SEI da escala — PJES' },
  { campo: 'ALT_OBSERVACOES', titulo: 'Observações' },
];

@Component({
  selector: 'app-relatorio-original-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorio-original-page.html',
  styleUrl: './relatorio-original-page.css',
})
export class RelatorioOriginalPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly relatorioService = inject(RelatorioAlteracoesService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly alteracoes = signal<AlteracaoRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly complementos = signal<Record<CampoComplementoAlt, string>>({
    ALT_GRAD_MONITORAMENTO: '',
    ALT_ESCALA_1CIA: '',
    ALT_ESCALA_2CIA: '',
    ALT_ESCALA_3CIA: '',
    ALT_ESCALA_PJES: '',
    ALT_OBSERVACOES: '',
  });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copiado = signal(false);
  readonly campos = CAMPOS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      const [roster, baixas, alteracoes, guarnicoes, policiais, complementoRows] = await Promise.all([
        this.lancamentoService.listRosterDoDia(data),
        this.lancamentoService.listBaixasDoDia(data),
        this.lancamentoService.listAlteracoesDoDia(data),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.relatorioService.listComplementos(data),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.alteracoes.set(alteracoes);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      const c = {
        ALT_GRAD_MONITORAMENTO: '', ALT_ESCALA_1CIA: '', ALT_ESCALA_2CIA: '',
        ALT_ESCALA_3CIA: '', ALT_ESCALA_PJES: '', ALT_OBSERVACOES: '',
      };
      for (const row of complementoRows) {
        if (row.campo in c) (c as Record<string, string>)[row.campo] = row.conteudo;
      }
      this.complementos.set(c);
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

  updateComplemento(campo: CampoComplementoAlt, valor: string): void {
    this.complementos.update((atual) => ({ ...atual, [campo]: valor }));
  }

  async onSalvarComplemento(campo: CampoComplementoAlt): Promise<void> {
    try {
      await this.relatorioService.salvarComplemento(this.data(), campo, this.complementos()[campo]);
    } catch {
      this.errorMessage.set('Não foi possível salvar o campo.');
    }
  }

  private montarInput(): RelatorioAlteracoesInput {
    return {
      data: this.data(),
      guarnicoes: this.guarnicoes(),
      policiais: this.policiais(),
      roster: this.roster(),
      alteracoes: this.alteracoes(),
      baixas: this.baixas(),
      complementos: this.complementos(),
    };
  }

  get relatorioHtml(): string {
    return montarRelatorioAlteracoesHtml(this.montarInput());
  }

  get relatorioPreview(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.relatorioHtml);
  }

  gerarTexto(): string {
    return this.relatorioHtml
      .replace(/<\/(p|tr|table|thead|tbody|h[1-6])>/gi, '\n')
      .replace(/<td[^>]*>/gi, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async copiarRelatorio(): Promise<void> {
    const html = this.relatorioHtml;
    const texto = this.gerarTexto();
    try {
      const Ctor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (Ctor && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new Ctor({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([texto], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(texto);
      }
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.errorMessage.set('Não foi possível copiar — selecione a pré-visualização e copie manualmente.');
    }
  }
}
```

- [ ] **Step 2: Template e CSS**

Criar `relatorio-original-page.css` copiando o conteúdo de `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.css` (mesma folha de estilo da pré-visualização).

Criar `relatorio-original-page.html`:

```html
<div>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">Relatório Original</h1>
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
        (click)="copiarRelatorio()"
      >
        {{ copiado() ? 'Copiado!' : 'Copiar para o SEI' }}
      </button>
    </div>
  </div>

  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
    "Copiar para o SEI" coloca o relatório na área de transferência como tabelas. Cole direto no editor do SEI (Ctrl+V).
  </p>

  @if (errorMessage()) {
    <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
  }

  @if (loading()) {
    <p class="mt-6 text-slate-500 dark:text-slate-400">Carregando...</p>
  } @else {
    <section class="mt-6 grid gap-4">
      <h2 class="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Campos editáveis</h2>
      @for (item of campos; track item.campo) {
        <div class="rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
          <label class="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{{ item.titulo }}</label>
          <textarea
            class="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            rows="2"
            [ngModel]="complementos()[item.campo]"
            (ngModelChange)="updateComplemento(item.campo, $event)"
            (blur)="onSalvarComplemento(item.campo)"
            name="complemento-{{ item.campo }}"
          ></textarea>
        </div>
      }
    </section>

    <section class="mt-6">
      <h2 class="mb-3 text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Pré-visualização</h2>
      <div class="relatorio-preview overflow-x-auto rounded-lg bg-white p-6 shadow dark:bg-white">
        <div [innerHTML]="relatorioPreview"></div>
      </div>
    </section>
  }
</div>
```

- [ ] **Step 3: Smoke test**

Criar `relatorio-original-page.spec.ts` (mesmo padrão de `relatorio-sei-page.spec.ts` — sem stub de Supabase; `SupabaseService` só chama `createClient` no construtor, sem rede):

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RelatorioOriginalPage } from './relatorio-original-page';

describe('RelatorioOriginalPage', () => {
  let component: RelatorioOriginalPage;
  let fixture: ComponentFixture<RelatorioOriginalPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelatorioOriginalPage],
    }).compileComponents();

    fixture = TestBed.createComponent(RelatorioOriginalPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

- [ ] **Step 4: Rota**

Em `src/app/app.routes.ts`, adicionar dentro de `children`, logo após o bloco `relatorio-sei`:

```ts
{
  path: 'relatorio-original',
  loadComponent: () =>
    import('./features/relatorio-original/relatorio-original-page/relatorio-original-page').then(
      (m) => m.RelatorioOriginalPage,
    ),
  canActivate: [roleGuard],
  data: { roles: ['PC_LANCAMENTO', 'ADMIN'] },
},
```

- [ ] **Step 5: Navegação — top-bar**

Em `top-bar.html`, antes do bloco `@if (podeGerarRelatorioSei())` do link "Relatório SEI", adicionar:

```html
@if (podeGerarRelatorioSei()) {
  <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/relatorio-original" routerLinkActive="text-blue-600">
    Relatório Original
  </a>
}
```

(O helper `podeGerarRelatorioSei()` já cobre `['ADMIN','PC_LANCAMENTO']` — mesmo público. Não criar helper novo.)

- [ ] **Step 6: Navegação — bottom-nav**

Em `bottom-nav.html`, antes do bloco do link "Relatório SEI":

```html
@if (podeGerarRelatorioSei()) {
  <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/relatorio-original" routerLinkActive="text-blue-600">
    Rel. Original
  </a>
}
```

- [ ] **Step 7: Build + suíte completa**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npm test -- --watch=false` → PASS (todos).

- [ ] **Step 8: Commit**

```bash
git add src/app/features/relatorio-original src/app/app.routes.ts src/app/layout/top-bar src/app/layout/bottom-nav
git commit -m "feat: Relatório Original tab (route, page, nav links)"
```

---

## Self-Review (resultado)

**1. Cobertura da spec:**
- Seção 1 (dados) → Task 1. Campos `ALT_*` em `relatorio_sei_complementos` → sem migração (chaves novas), usados na Task 6. ✔
- Seção 2 (`LancamentoService` API + merge no roster + substituto sintético + novos `StatusEfetivo`) → Tasks 2 e 3. ✔
- Seção 3 (modal do Painel: tipos, campos por tipo, `onRegistrarModal`, badges/labels, linha do substituto, botão remover) → Tasks 4 e 5. ✔
- Seção 4 (aba nova: rota, componente, serviço, `montarRelatorioAlteracoesHtml`, 12 blocos, ORDINÁRIO auto, SERVIÇO EM GERAL auto do roster, `OS_PERMANENTES`, `SUBSTITUICAO_PATRIMONIOS`, PJES/POG pré-montados, campos editáveis) → Tasks 6, 7, 8. ✔
- Seção 5 (RBAC/nav) → Task 8 (rota + top-bar + bottom-nav sob `podeGerarRelatorioSei()`). ✔
- Apêndice A.1/A.2/A.3 (rótulos ORDINÁRIO, patrimônios, O.S.) → Task 7 (verbatim). ✔
- Seção 5 da spec (testes) → cada task tem os testes correspondentes; `painel-pc-page.spec.ts` e `relatorio-original-page.spec.ts` ficam smoke. ✔
- Fora de escopo (P3, auto POG/ciclo/PBS/patrimônios, PJES vazio, aba Relatório SEI intocada) → respeitado; POG/CICLO/PBS e PJES saem como tabelas vazias na Task 7; nenhuma task toca `relatorio-sei.service.ts` (exceto o `RosterRow.substituindoMatricula` obrigatório, que só exige ajuste de mock nos specs — Task 3 Step 5). ✔

**2. Placeholders:** as listas fixas estão completas no plano (Task 7). Nenhum "TBD"/"handle edge cases". O único texto do relatório inventado (parágrafo de abertura, nomes por extenso do cabeçalho SDS/PMPE) está explícito e é editável no SEic; marcado como aproximação da spec.

**3. Consistência de tipos:**
- `TipoAlteracao` (7 valores) — igual em `lancamento.service.ts` (Task 2), no `switch`/lista do Painel (Task 4, com `ATRASADO`/`REMANEJAMENTO` a mais no `TipoLancamento` do componente) e em `ROTULO_ALTERACAO` (Task 6).
- `StatusEfetivo` — 11 valores; `Record<StatusEfetivo, ...>` em `painel-pc-page.ts` recebe as 4 chaves novas na Task 3 Step 7 (repo compila a cada commit).
- `RosterRow.substituindoMatricula: string | null` — definido na Task 3; consumido no Painel (Task 5) e no relatório (Task 6 baseInput dos testes).
- `montarRelatorioAlteracoesHtml` / `RelatorioAlteracoesInput` / `CampoComplementoAlt` / `OS_PERMANENTES` / `SUBSTITUICAO_PATRIMONIOS` — assinaturas idênticas entre Tasks 6, 7 e 8.
- `registrarAlteracao` payload — snake_case, `?? null` em todos os opcionais; teste da Task 2 casa com o insert.
