# Escala PJES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seção PJES sobe o PDF da escala de serviço extra (lido no navegador, revisado, salvo), e essa escala aparece automaticamente como cards "PJES · Serviço Extra" no Painel Principal, no Painel do PC (com Faltou/Atrasado) e na seção "PJES / DIÁRIA" do Relatório Original.

**Architecture:** Duas tabelas novas e independentes (`escala_pjes`, `pjes_presenca`) — sem FK para `policiais`/`guarnicoes`. Um `PjesService` expõe CRUD + um `PjesRosterRow` já no formato de card. Um parser puro (`pjes-pdf.parser.ts`) transforma itens de texto do `pdfjs-dist` em linhas; um wrapper fino (`PjesPdfService`) isola o `pdfjs-dist`. As 3 telas buscam o PJES à parte e renderizam um bloco próprio — `listRosterDoDia` e o roster ordinário não são tocados.

**Tech Stack:** Angular 21 standalone (signals, `@if`/`@for`, `inject()`), Vitest, Supabase (Postgres + RLS), `pdfjs-dist` (novo), Supabase CLI `./tools/supabase.exe`.

**Spec:** `docs/superpowers/specs/2026-08-30-escala-pjes-design.md`

## Global Constraints

- Responder ao usuário sempre em português.
- Angular: componentes standalone, `signal()`/`inject()`, control flow `@if`/`@for` (nunca `*ngIf`/`*ngFor`).
- Testes: spec de componente é smoke (`should create`); asserções reais só em spec de serviço / função pura exportada.
- RLS: toda tabela nova tem `enable row level security` + policies `to authenticated` (`using (true)` / `with check (true)`).
- Trigger de autoria: `before insert ... execute function public.fn_set_criado_por_lancamento()`.
- Migração: nome `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, timestamp sequencial após `20260830100000`. Use `20260830110000`.
- Deploy de migração sem Docker: validar por parse estático (leitura) + `./tools/supabase.exe db push --yes` (memória `supabase-no-docker.md`). NÃO rodar `./tools/supabase.exe` dentro dos subagentes — o controlador roda o deploy.
- Test runner: `npm test -- --watch=false <path>` erra o parse do caminho neste repo. Use `npx ng test --watch=false --include=<spec path>` (focado) e `npx ng test --watch=false` (suíte toda).
- `npx tsc --noEmit -p tsconfig.app.json` limpo antes de cada commit.
- Avisos de "CSS class not found" (Tailwind) no editor são ruído pré-existente em todo o repo — ignore.
- `escala_mensal`, `fn_resolve_escala_dia`, `listRosterDoDia`, o roster ordinário e a aba "Relatório SEI" **não são alterados**.
- RBAC é client-side: `roleGuard` lê `route.data.roles`; `@if` no template; early-return `if (!this.podeEditar()) return;` nos métodos de mutação.

---

## File Structure

**F1 — dados + serviço**
- `supabase/migrations/20260830110000_escala_pjes.sql` (novo) — enums `funcao_pjes`/`origem_pjes`/`status_pjes` + tabelas `escala_pjes`, `pjes_presenca`.
- `src/app/core/services/pjes.service.ts` (novo) — tipos + CRUD + `listPjesRosterDoDia`.
- `src/app/core/services/pjes.service.spec.ts` (novo).

**F2 — parser**
- `src/app/core/services/pjes-pdf.parser.ts` (novo) — função pura `extrairEscalaPjes(itens)`.
- `src/app/core/services/pjes-pdf.parser.spec.ts` (novo).
- `src/app/core/services/pjes-pdf.service.ts` (novo) — wrapper de `pdfjs-dist` (`extrairItens(file)`).
- `package.json` (modificar) — dep `pdfjs-dist`.

**F3 — aba Escala PJES**
- `src/app/features/escala-pjes/escala-pjes-page/escala-pjes-page.ts` / `.html` / `.css` / `.spec.ts` (novos).
- `src/app/app.routes.ts` (modificar) — rota `escala-pjes`.
- `src/app/layout/top-bar/top-bar.ts` + `.html`, `src/app/layout/bottom-nav/bottom-nav.ts` + `.html` (modificar) — link + helper.

**F4 — painéis**
- `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts` + `.html` (modificar) — bloco PJES + Faltou/Atrasado.
- `src/app/features/dashboard/dashboard-page/dashboard-page.ts` + `.html` (modificar) — bloco PJES + contagem.

**F5 — relatório**
- `src/app/core/services/relatorio-alteracoes.service.ts` (modificar) — `RelatorioAlteracoesInput.pjes` + seção "PJES / DIÁRIA" automática.
- `src/app/core/services/relatorio-alteracoes.service.spec.ts` (modificar) — 2 casos.
- `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.ts` (modificar) — carregar e passar `pjes`.

---

## Task 1: Migração `escala_pjes` + `pjes_presenca`

**Files:**
- Create: `supabase/migrations/20260830110000_escala_pjes.sql`

**Interfaces:**
- Produces: tabela `public.escala_pjes` (`id uuid`, `data date`, `gt_rotulo text`, `funcao public.funcao_pjes`, `graduacao text null`, `matricula text null`, `nome_guerra text`, `telefone text null`, `horario_inicio time`, `horario_fim time`, `origem public.origem_pjes`, `observacao text null`, `criado_em`, `criado_por`); tabela `public.pjes_presenca` (`escala_pjes_id uuid pk → escala_pjes on delete cascade`, `status public.status_pjes default 'PREVISTO'`, `horario_chegada time null`, `motivo text null`, `criado_em`, `atualizado_em`, `criado_por`). Enums `funcao_pjes('CMT','MOT','PAT','OUTRO')`, `origem_pjes('PDF','MANUAL')`, `status_pjes('PREVISTO','FALTA','ATRASADO')`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260830110000_escala_pjes.sql` com exatamente:

```sql
create type public.funcao_pjes as enum ('CMT', 'MOT', 'PAT', 'OUTRO');
create type public.origem_pjes as enum ('PDF', 'MANUAL');
create type public.status_pjes as enum ('PREVISTO', 'FALTA', 'ATRASADO');

create table public.escala_pjes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  gt_rotulo text not null,
  funcao public.funcao_pjes not null,
  graduacao text,
  matricula text,
  nome_guerra text not null,
  telefone text,
  horario_inicio time not null,
  horario_fim time not null,
  origem public.origem_pjes not null,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);
create index escala_pjes_data_idx on public.escala_pjes (data);

create trigger trg_escala_pjes_criado_por
before insert on public.escala_pjes
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.escala_pjes enable row level security;
create policy "authenticated_select_escala_pjes" on public.escala_pjes
  for select to authenticated using (true);
create policy "authenticated_insert_escala_pjes" on public.escala_pjes
  for insert to authenticated with check (true);
create policy "authenticated_delete_escala_pjes" on public.escala_pjes
  for delete to authenticated using (true);

create table public.pjes_presenca (
  escala_pjes_id uuid primary key references public.escala_pjes (id) on delete cascade,
  status public.status_pjes not null default 'PREVISTO',
  horario_chegada time,
  motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

alter table public.pjes_presenca enable row level security;
create policy "authenticated_select_pjes_presenca" on public.pjes_presenca
  for select to authenticated using (true);
create policy "authenticated_insert_pjes_presenca" on public.pjes_presenca
  for insert to authenticated with check (true);
create policy "authenticated_update_pjes_presenca" on public.pjes_presenca
  for update to authenticated using (true) with check (true);
create policy "authenticated_delete_pjes_presenca" on public.pjes_presenca
  for delete to authenticated using (true);
```

- [ ] **Step 2: Validar por leitura**

Confira à mão: `create type` de todos os enums antes das tabelas; `escala_pjes` antes de `pjes_presenca`; nenhum `;` dentro de comentário; `fn_set_criado_por_lancamento` existe (definido em `supabase/migrations/20260827030000_lancamento_diario.sql`). NÃO rodar `./tools/supabase.exe`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260830110000_escala_pjes.sql
git commit -m "feat: escala_pjes + pjes_presenca tables"
```

---

## Task 2: `PjesService` — CRUD e roster PJES

**Files:**
- Create: `src/app/core/services/pjes.service.ts`
- Test: `src/app/core/services/pjes.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (padrão de `lancamento.service.ts`).
- Produces:
  ```ts
  export type FuncaoPjes = 'CMT' | 'MOT' | 'PAT' | 'OUTRO';
  export type OrigemPjes = 'PDF' | 'MANUAL';
  export type StatusPjes = 'PREVISTO' | 'FALTA' | 'ATRASADO';

  export interface EscalaPjesRow {
    id: string; data: string; gtRotulo: string; funcao: FuncaoPjes;
    graduacao: string | null; matricula: string | null; nomeGuerra: string;
    telefone: string | null; horarioInicio: string; horarioFim: string;
    origem: OrigemPjes; observacao: string | null;
  }
  export interface NovaLinhaPjes {
    data: string; gt_rotulo: string; funcao: FuncaoPjes;
    graduacao?: string | null; matricula?: string | null; nome_guerra: string;
    telefone?: string | null; horario_inicio: string; horario_fim: string;
    origem: OrigemPjes; observacao?: string | null;
  }
  export interface PjesRosterRow {
    escalaPjesId: string; gtRotulo: string; funcao: FuncaoPjes;
    graduacao: string | null; matricula: string | null; nomeGuerra: string;
    telefone: string | null; horarioInicio: string; horarioFim: string;
    status: StatusPjes; horarioChegada: string | null; motivo: string | null;
  }
  ```
  Métodos de `PjesService`: `listEscalaPjesDoDia(data): Promise<EscalaPjesRow[]>`, `listPjesRosterDoDia(data): Promise<PjesRosterRow[]>`, `inserirLinhas(linhas: NovaLinhaPjes[]): Promise<void>`, `substituirDiaImportado(data: string, linhas: NovaLinhaPjes[]): Promise<void>`, `removerLinha(id: string): Promise<void>`, `registrarPresencaPjes(escalaPjesId: string, status: StatusPjes, opts?: { horario_chegada?: string | null; motivo?: string | null }): Promise<void>`, `limparPresencaPjes(escalaPjesId: string): Promise<void>`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `pjes.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PjesService } from './pjes.service';
import { SupabaseService } from './supabase.service';

describe('PjesService', () => {
  it('lists escala pjes for a day, mapping snake_case to camelCase', async () => {
    const rows = [
      {
        id: 'e1', data: '2026-08-19', gt_rotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT',
        graduacao: 'TC', matricula: '102505-8', nome_guerra: 'GRISI', telefone: '81986631816',
        horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null,
      },
    ];
    const eqSpy = vi.fn().mockResolvedValue({ data: rows, error: null });
    const supabaseStub = {
      client: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: eqSpy }) }) }) }) },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    const result = await service.listEscalaPjesDoDia('2026-08-19');
    expect(result[0]).toEqual({
      id: 'e1', data: '2026-08-19', gtRotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT',
      graduacao: 'TC', matricula: '102505-8', nomeGuerra: 'GRISI', telefone: '81986631816',
      horarioInicio: '16:00:00', horarioFim: '00:00:00', origem: 'PDF', observacao: null,
    });
  });

  it('inserts a batch of linhas', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.inserirLinhas([
      { data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', horario_inicio: '16:00', horario_fim: '00:00', origem: 'MANUAL' },
    ]);
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({ data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', origem: 'MANUAL', graduacao: null, matricula: null, telefone: null, observacao: null }),
    ]);
  });

  it('substituirDiaImportado deletes PDF rows for the day then inserts', async () => {
    const eqOrigem = vi.fn().mockResolvedValue({ error: null });
    const eqData = vi.fn().mockReturnValue({ eq: eqOrigem });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqData });
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy, insert: insertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.substituirDiaImportado('2026-08-19', [
      { data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', nome_guerra: 'GRISI', horario_inicio: '16:00', horario_fim: '00:00', origem: 'PDF' },
    ]);
    expect(eqData).toHaveBeenCalledWith('data', '2026-08-19');
    expect(eqOrigem).toHaveBeenCalledWith('origem', 'PDF');
    expect(insertSpy).toHaveBeenCalled();
  });

  it('registrarPresencaPjes upserts on escala_pjes_id', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseStub = { client: { from: () => ({ upsert: upsertSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.registrarPresencaPjes('e1', 'FALTA');
    expect(upsertSpy).toHaveBeenCalledWith(
      { escala_pjes_id: 'e1', status: 'FALTA', horario_chegada: null, motivo: null, atualizado_em: expect.any(String) },
      { onConflict: 'escala_pjes_id' },
    );
  });

  it('listPjesRosterDoDia joins presenca status onto escala rows', async () => {
    const escalaRows = [
      { id: 'e1', data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'CMT', graduacao: 'TC', matricula: '1', nome_guerra: 'GRISI', telefone: null, horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null },
      { id: 'e2', data: '2026-08-19', gt_rotulo: 'GT 16100', funcao: 'MOT', graduacao: 'SD', matricula: '2', nome_guerra: 'DIAS', telefone: null, horario_inicio: '16:00:00', horario_fim: '00:00:00', origem: 'PDF', observacao: null },
    ];
    const presRows = [{ escala_pjes_id: 'e1', status: 'FALTA', horario_chegada: null, motivo: 'x' }];
    let call = 0;
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => {
            call++;
            if (call === 1) return { eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: escalaRows, error: null }) }) }) };
            return { in: () => Promise.resolve({ data: presRows, error: null }) };
          },
        }),
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    const result = await service.listPjesRosterDoDia('2026-08-19');
    expect(result.find((r) => r.escalaPjesId === 'e1')?.status).toBe('FALTA');
    expect(result.find((r) => r.escalaPjesId === 'e2')?.status).toBe('PREVISTO');
  });

  it('removerLinha deletes by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: supabaseStub }] });
    const service = TestBed.inject(PjesService);
    await service.removerLinha('e1');
    expect(eqSpy).toHaveBeenCalledWith('id', 'e1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx ng test --watch=false --include=src/app/core/services/pjes.service.spec.ts`
Expected: FAIL — módulo/métodos não existem.

- [ ] **Step 3: Implementar**

Criar `pjes.service.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx ng test --watch=false --include=src/app/core/services/pjes.service.spec.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: `tsc` + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.

```bash
git add src/app/core/services/pjes.service.ts src/app/core/services/pjes.service.spec.ts
git commit -m "feat: PjesService (escala + presenca CRUD, pjes roster)"
```

---

## Task 3: Parser puro do PDF PJES

**Files:**
- Create: `src/app/core/services/pjes-pdf.parser.ts`
- Test: `src/app/core/services/pjes-pdf.parser.spec.ts`

**Interfaces:**
- Consumes: `FuncaoPjes` de `./pjes.service`.
- Produces:
  ```ts
  export interface ItemTextoPdf { str: string; x: number; y: number; page: number; }
  export interface LinhaPjesExtraida {
    data: string; gtRotulo: string; funcao: FuncaoPjes;
    graduacao: string | null; matricula: string | null; nomeGuerra: string;
    telefone: string | null; horarioInicio: string; horarioFim: string;
  }
  export function extrairEscalaPjes(itens: ItemTextoPdf[]): LinhaPjesExtraida[];
  ```

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `pjes-pdf.parser.spec.ts`. Cada teste monta `ItemTextoPdf[]` representando linhas visuais (mesmo `y` = mesma linha; `x` crescente = ordem na linha; `page` = 1). Helper local:

```ts
import { extrairEscalaPjes, ItemTextoPdf } from './pjes-pdf.parser';

function linha(page: number, y: number, ...textos: string[]): ItemTextoPdf[] {
  return textos.map((str, i) => ({ str, x: 10 + i * 60, y, page }));
}

describe('extrairEscalaPjes', () => {
  it('extrai data, GT e uma linha CMT com horário no formato "16h às 0h"', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 760, 'SERVIÇO: ESCALA – OPERAÇÃO PERNAMBUCO SEGURO'),
      ...linha(1, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
    ];
    const r = extrairEscalaPjes(itens);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      data: '2026-08-19',
      gtRotulo: 'GT 16100 - SUPERVISÃO',
      funcao: 'CMT',
      graduacao: 'TC',
      matricula: '102505-8',
      nomeGuerra: 'GRISI',
      telefone: '81986631816',
      horarioInicio: '16:00',
      horarioFim: '00:00',
    });
  });

  it('aplica horário mesclado do bloco às linhas seguintes sem horário e aceita "23:59 às 05:59"', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 720, 'GT16141', '1º CPM'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO:'),
      ...linha(1, 680, 'CMT', 'CB', '113595-3', 'MARTA', '16º BPM', '81996587352', '23:59 às 05:59'),
      ...linha(1, 660, 'MOT', 'SD', '130253-1', 'DIOGO', '16º BPM'),
    ];
    const r = extrairEscalaPjes(itens);
    expect(r).toHaveLength(2);
    expect(r[0].nomeGuerra).toBe('MARTA');
    expect(r[1]).toMatchObject({ funcao: 'MOT', nomeGuerra: 'DIOGO', matricula: '130253-1', telefone: null, horarioInicio: '23:59', horarioFim: '05:59' });
  });

  it('linha com número de 5 dígitos no lugar da função vira OUTRO', () => {
    const itens = [
      ...linha(1, 800, '20/agosto/2026 - QUINTA-FEIRA'),
      ...linha(1, 720, 'MO', 'OPERAÇÃO OCTOPUS'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO:'),
      ...linha(1, 680, '16431', '3º SGT', '109091-7', 'FAUSTO AUGUSTO', '16º BPM', '81999736189', '14h às 20h'),
    ];
    const r = extrairEscalaPjes(itens);
    expect(r[0]).toMatchObject({ funcao: 'OUTRO', graduacao: '3º SGT', matricula: '109091-7', nomeGuerra: 'FAUSTO AUGUSTO', horarioInicio: '14:00', horarioFim: '20:00' });
    expect(r[0].gtRotulo).toBe('MO - OPERAÇÃO OCTOPUS');
  });

  it('aceita "05h à 14h" e matrícula ausente (vem null)', () => {
    const itens = [
      ...linha(1, 800, '22/agosto/2026 - SÁBADO'),
      ...linha(1, 720, 'GT 16300', 'FISCALIZAÇÃO POG'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', '2º TEN', '130037-7', 'VALÉRIA DE DEUS', '16º BPM', '05h à 14h'),
    ];
    const r = extrairEscalaPjes(itens);
    expect(r[0]).toMatchObject({ graduacao: '2º TEN', nomeGuerra: 'VALÉRIA DE DEUS', telefone: null, horarioInicio: '05:00', horarioFim: '14:00' });
  });

  it('duas páginas → linhas de ambos os dias', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
      ...linha(2, 800, '20/agosto/2026 - QUINTA-FEIRA'),
      ...linha(2, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(2, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(2, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
    ];
    const r = extrairEscalaPjes(itens);
    expect(r.map((l) => l.data)).toEqual(['2026-08-19', '2026-08-20']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx ng test --watch=false --include=src/app/core/services/pjes-pdf.parser.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `pjes-pdf.parser.ts`:

```ts
import { FuncaoPjes } from './pjes.service';

export interface ItemTextoPdf {
  str: string;
  x: number;
  y: number;
  page: number;
}

export interface LinhaPjesExtraida {
  data: string;
  gtRotulo: string;
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nomeGuerra: string;
  telefone: string | null;
  horarioInicio: string;
  horarioFim: string;
}

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12',
};

const FUNCOES: FuncaoPjes[] = ['CMT', 'MOT', 'PAT'];

/** "16h às 0h" | "23:59 às 05:59" | "05h à 14h" | "14h às 00h" -> ["HH:MM","HH:MM"] ou null */
function parseHorario(texto: string): [string, string] | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*h?\s*(?:às|as|à|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?/i.exec(texto);
  if (!m) return null;
  const hh = (h: string, mm?: string) => `${h.padStart(2, '0')}:${(mm ?? '00').padStart(2, '0')}`;
  return [hh(m[1], m[2]), hh(m[3], m[4])];
}

function normalizarData(texto: string): string | null {
  const m = /(\d{1,2})\s*\/\s*([a-zç]+)\s*\/\s*(\d{4})/i.exec(texto);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
}

/** Agrupa itens de uma página em linhas visuais (mesmo y ~3pt), ordenadas topo->baixo. */
function agruparLinhas(itens: ItemTextoPdf[]): ItemTextoPdf[][] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: ItemTextoPdf[][] = [];
  for (const item of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - item.y) <= 3) {
      ultima.push(item);
    } else {
      linhas.push([item]);
    }
  }
  for (const l of linhas) l.sort((a, b) => a.x - b.x);
  return linhas;
}

const RE_GT = /^GT ?\d{4,5}$/i;
const RE_MATRICULA = /^\d{5,6}-?\d?$/;
const RE_TELEFONE = /^\d{10,11}$/;
const RE_NUM5 = /^\d{5}$/;

export function extrairEscalaPjes(itens: ItemTextoPdf[]): LinhaPjesExtraida[] {
  const paginas = new Map<number, ItemTextoPdf[]>();
  for (const it of itens) {
    if (!paginas.has(it.page)) paginas.set(it.page, []);
    paginas.get(it.page)!.push(it);
  }

  const resultado: LinhaPjesExtraida[] = [];

  for (const page of [...paginas.keys()].sort((a, b) => a - b)) {
    const linhas = agruparLinhas(paginas.get(page)!);
    let data: string | null = null;
    let gtRotulo: string | null = null;
    let horarioBloco: [string, string] | null = null;

    for (const linha of linhas) {
      const textos = linha.map((i) => i.str.trim()).filter(Boolean);
      if (textos.length === 0) continue;
      const joined = textos.join(' ');

      if (!data) {
        const d = normalizarData(joined);
        if (d) { data = d; continue; }
      }

      // Cabeçalho de seção: "GT 16100" | "GT16141" | "MO"
      const primeiro = textos[0].toUpperCase();
      if (RE_GT.test(primeiro) || primeiro === 'MO') {
        const rotulo = textos.slice(1).join(' ').toUpperCase() || primeiro;
        gtRotulo = `${primeiro} - ${rotulo}`.replace(/ - $/, '');
        if (!rotulo || rotulo === primeiro) gtRotulo = primeiro;
        else gtRotulo = `${primeiro} - ${rotulo}`;
        horarioBloco = null;
        continue;
      }

      // Cabeçalho de colunas
      if (/^GRAD\.?$/i.test(textos[0]) && joined.toUpperCase().includes('NOME DE GUERRA')) {
        continue;
      }

      // Linha de dados: primeiro token é função (CMT/MOT/PAT) ou número de 5 dígitos
      const tok0 = textos[0].toUpperCase();
      const ehFuncao = (FUNCOES as string[]).includes(tok0);
      const ehNum5 = RE_NUM5.test(textos[0]);
      if (!data || !gtRotulo || (!ehFuncao && !ehNum5)) continue;

      const funcao: FuncaoPjes = ehFuncao ? (tok0 as FuncaoPjes) : 'OUTRO';
      const resto = textos.slice(1);

      // horário: último token que casa parseHorario
      let horario: [string, string] | null = null;
      let idxHorario = -1;
      for (let i = resto.length - 1; i >= 0; i--) {
        const h = parseHorario(resto[i]);
        if (h) { horario = h; idxHorario = i; break; }
      }
      const campos = idxHorario >= 0 ? resto.slice(0, idxHorario) : resto;
      if (horario) horarioBloco = horario;

      // telefone: token que casa RE_TELEFONE
      const idxTel = campos.findIndex((c) => RE_TELEFONE.test(c));
      const telefone = idxTel >= 0 ? campos[idxTel] : null;
      const semTel = idxTel >= 0 ? campos.slice(0, idxTel) : campos;

      // OME "16º BPM" — remover ocorrências
      const semOme = semTel.filter((c) => !/^16º?$/i.test(c) && !/^BPM$/i.test(c));

      // matrícula
      const idxMat = semOme.findIndex((c) => RE_MATRICULA.test(c));
      const matricula = idxMat >= 0 ? semOme[idxMat] : null;

      // graduação = tudo antes da matrícula; nome = tudo depois
      const graduacao = idxMat > 0 ? semOme.slice(0, idxMat).join(' ') : null;
      const nomeGuerra = (idxMat >= 0 ? semOme.slice(idxMat + 1) : semOme).join(' ').trim();

      const hFinal = horario ?? horarioBloco;
      if (!nomeGuerra || !hFinal) {
        // ainda assim registra, com horário vazio -> a tela de revisão exige preencher
        resultado.push({
          data,
          gtRotulo,
          funcao,
          graduacao,
          matricula,
          nomeGuerra: nomeGuerra || (matricula ?? ''),
          telefone,
          horarioInicio: hFinal ? hFinal[0] : '',
          horarioFim: hFinal ? hFinal[1] : '',
        });
        continue;
      }

      resultado.push({
        data,
        gtRotulo,
        funcao,
        graduacao,
        matricula,
        nomeGuerra,
        telefone,
        horarioInicio: hFinal[0],
        horarioFim: hFinal[1],
      });
    }
  }

  return resultado;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx ng test --watch=false --include=src/app/core/services/pjes-pdf.parser.spec.ts`
Expected: PASS (5 testes). Se algum caso falhar por detalhe de tokenização, ajustar o parser (não os testes) até passar — os testes descrevem o comportamento correto sobre o modelo real.

- [ ] **Step 5: `tsc` + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.

```bash
git add src/app/core/services/pjes-pdf.parser.ts src/app/core/services/pjes-pdf.parser.spec.ts
git commit -m "feat: pure PJES PDF text parser"
```

---

## Task 4: `PjesPdfService` — wrapper de `pdfjs-dist`

**Files:**
- Create: `src/app/core/services/pjes-pdf.service.ts`
- Modify: `package.json` (dep `pdfjs-dist`)

**Interfaces:**
- Consumes: `ItemTextoPdf` de `./pjes-pdf.parser`.
- Produces: `class PjesPdfService` com `async extrairItens(file: File): Promise<ItemTextoPdf[]>`.

- [ ] **Step 1: Instalar a dependência**

Run: `npm install pdfjs-dist@4.10.38`
(4.10.38 é uma versão estável 4.x; se `npm install` falhar por engine, instalar a última 4.x que instale e anotar a versão no report.)

- [ ] **Step 2: Implementar o wrapper**

Criar `pjes-pdf.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { ItemTextoPdf } from './pjes-pdf.parser';

@Injectable({ providedIn: 'root' })
export class PjesPdfService {
  async extrairItens(file: File): Promise<ItemTextoPdf[]> {
    const pdfjs = await import('pdfjs-dist');
    // Worker: usa o worker empacotado como módulo.
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url').catch(() => null);
    if (worker && (worker as { default?: string }).default) {
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
    }
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const itens: ItemTextoPdf[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page);
      const content = await p.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const t = item as { str: string; transform: number[] };
        itens.push({ str: t.str, x: t.transform[4], y: t.transform[5], page });
      }
    }
    return itens;
  }
}
```

Nota sobre o worker: se `pdfjs-dist/build/pdf.worker.min.mjs?url` não resolver no build do Angular, trocar por:
```ts
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
```
e, se ainda assim quebrar, copiar `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` para `public/pdf.worker.min.mjs` (ou `src/assets/`) e usar `pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs'`. Escolher a primeira que fizer `npx ng build` passar; registrar qual foi usada no report.

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npx ng build --configuration development` → build completa sem erro (confirma que o `pdfjs-dist` e o worker resolvem no bundler).
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/pjes-pdf.service.ts package.json package-lock.json
git commit -m "feat: PjesPdfService wrapper around pdfjs-dist"
```

---

## Task 5: Aba "Escala PJES" — componente, rota, navegação

**Files:**
- Create: `src/app/features/escala-pjes/escala-pjes-page/escala-pjes-page.ts` / `.html` / `.css` / `.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.ts` + `.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.ts` + `.html`

**Interfaces:**
- Consumes: `PjesService` (Task 2 — `listEscalaPjesDoDia`, `inserirLinhas`, `substituirDiaImportado`, `removerLinha`), `PjesPdfService.extrairItens` (Task 4), `extrairEscalaPjes` + `LinhaPjesExtraida` (Task 3), `NovaLinhaPjes`/`FuncaoPjes`/`EscalaPjesRow` (Task 2).
- Produces: rota `escala-pjes` (roles `['PJES','ADMIN']`), componente `EscalaPjesPage`, helper `podeVerEscalaPjes()` em top-bar e bottom-nav.

- [ ] **Step 1: Componente `EscalaPjesPage`**

Criar `escala-pjes-page.ts`:

```ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EscalaPjesRow,
  FuncaoPjes,
  NovaLinhaPjes,
  PjesService,
} from '../../../core/services/pjes.service';
import { PjesPdfService } from '../../../core/services/pjes-pdf.service';
import { extrairEscalaPjes, LinhaPjesExtraida } from '../../../core/services/pjes-pdf.parser';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const RE_HORA = /^\d{2}:\d{2}$/;

interface LinhaRevisao extends LinhaPjesExtraida {
  erros: string[];
}

function validar(l: LinhaPjesExtraida): string[] {
  const e: string[] = [];
  if (!l.data) e.push('data');
  if (!l.gtRotulo) e.push('GT');
  if (!l.nomeGuerra) e.push('nome');
  if (!RE_HORA.test(l.horarioInicio)) e.push('início');
  if (!RE_HORA.test(l.horarioFim)) e.push('fim');
  return e;
}

interface LinhaManual {
  funcao: FuncaoPjes;
  graduacao: string;
  matricula: string;
  nomeGuerra: string;
  telefone: string;
}

@Component({
  selector: 'app-escala-pjes-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './escala-pjes-page.html',
  styleUrl: './escala-pjes-page.css',
})
export class EscalaPjesPage {
  private readonly pjesService = inject(PjesService);
  private readonly pdfService = inject(PjesPdfService);

  readonly funcoes: FuncaoPjes[] = ['CMT', 'MOT', 'PAT', 'OUTRO'];

  readonly errorMessage = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  // Importação
  readonly lendo = signal(false);
  readonly linhasRevisao = signal<LinhaRevisao[]>([]);
  readonly salvandoImport = signal(false);

  // Manual
  readonly manualData = signal(hojeIso());
  readonly manualGt = signal('');
  readonly manualInicio = signal('06:00');
  readonly manualFim = signal('18:00');
  readonly manualLinhas = signal<LinhaManual[]>([
    { funcao: 'CMT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    { funcao: 'MOT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    { funcao: 'PAT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
  ]);
  readonly salvandoManual = signal(false);

  // Salvas
  readonly data = signal(hojeIso());
  readonly salvas = signal<EscalaPjesRow[]>([]);
  readonly loadingSalvas = signal(true);

  constructor() {
    void this.reloadSalvas();
  }

  async onArquivo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.lendo.set(true);
    this.errorMessage.set(null);
    try {
      const itens = await this.pdfService.extrairItens(file);
      const linhas = extrairEscalaPjes(itens);
      this.linhasRevisao.set(linhas.map((l) => ({ ...l, erros: validar(l) })));
      if (linhas.length === 0) {
        this.errorMessage.set('Não foi possível extrair linhas desse PDF. Confira o arquivo ou lance manualmente.');
      }
    } catch {
      this.errorMessage.set('Falha ao ler o PDF.');
    } finally {
      this.lendo.set(false);
      input.value = '';
    }
  }

  atualizarRevisao(i: number, campo: keyof LinhaPjesExtraida, valor: string): void {
    this.linhasRevisao.update((linhas) => {
      const copia = [...linhas];
      const l = { ...copia[i], [campo]: valor } as LinhaRevisao;
      l.erros = validar(l);
      copia[i] = l;
      return copia;
    });
  }

  removerRevisao(i: number): void {
    this.linhasRevisao.update((linhas) => linhas.filter((_, idx) => idx !== i));
  }

  get revisaoValida(): boolean {
    const linhas = this.linhasRevisao();
    return linhas.length > 0 && linhas.every((l) => l.erros.length === 0);
  }

  async salvarImportacao(): Promise<void> {
    if (!this.revisaoValida) return;
    this.salvandoImport.set(true);
    this.errorMessage.set(null);
    this.info.set(null);
    try {
      const porData = new Map<string, NovaLinhaPjes[]>();
      for (const l of this.linhasRevisao()) {
        const arr = porData.get(l.data) ?? [];
        arr.push({
          data: l.data,
          gt_rotulo: l.gtRotulo,
          funcao: l.funcao,
          graduacao: l.graduacao,
          matricula: l.matricula,
          nome_guerra: l.nomeGuerra,
          telefone: l.telefone,
          horario_inicio: l.horarioInicio,
          horario_fim: l.horarioFim,
          origem: 'PDF',
        });
        porData.set(l.data, arr);
      }
      for (const [data, linhas] of porData) {
        await this.pjesService.substituirDiaImportado(data, linhas);
      }
      this.linhasRevisao.set([]);
      this.info.set('Escala importada e salva.');
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível salvar a escala importada.');
    } finally {
      this.salvandoImport.set(false);
    }
  }

  adicionarLinhaManual(): void {
    this.manualLinhas.update((linhas) => [
      ...linhas,
      { funcao: 'OUTRO', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    ]);
  }

  removerLinhaManual(i: number): void {
    this.manualLinhas.update((linhas) => linhas.filter((_, idx) => idx !== i));
  }

  atualizarLinhaManual(i: number, campo: keyof LinhaManual, valor: string): void {
    this.manualLinhas.update((linhas) => {
      const copia = [...linhas];
      copia[i] = { ...copia[i], [campo]: valor } as LinhaManual;
      return copia;
    });
  }

  async salvarManual(): Promise<void> {
    const gt = this.manualGt().trim();
    if (!gt || !RE_HORA.test(this.manualInicio()) || !RE_HORA.test(this.manualFim())) {
      this.errorMessage.set('Preencha GT/setor e horários (HH:MM) do bloco.');
      return;
    }
    const linhas = this.manualLinhas().filter((l) => l.nomeGuerra.trim());
    if (linhas.length === 0) {
      this.errorMessage.set('Adicione ao menos uma pessoa.');
      return;
    }
    this.salvandoManual.set(true);
    this.errorMessage.set(null);
    this.info.set(null);
    try {
      await this.pjesService.inserirLinhas(
        linhas.map((l) => ({
          data: this.manualData(),
          gt_rotulo: gt,
          funcao: l.funcao,
          graduacao: l.graduacao.trim() || null,
          matricula: l.matricula.trim() || null,
          nome_guerra: l.nomeGuerra.trim(),
          telefone: l.telefone.trim() || null,
          horario_inicio: this.manualInicio(),
          horario_fim: this.manualFim(),
          origem: 'MANUAL',
        })),
      );
      this.manualGt.set('');
      this.manualLinhas.set([
        { funcao: 'CMT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
        { funcao: 'MOT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
        { funcao: 'PAT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
      ]);
      this.info.set('Bloco adicionado à escala.');
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível adicionar o bloco.');
    } finally {
      this.salvandoManual.set(false);
    }
  }

  async onDataChange(nova: string): Promise<void> {
    this.data.set(nova);
    await this.reloadSalvas();
  }

  async reloadSalvas(): Promise<void> {
    this.loadingSalvas.set(true);
    try {
      this.salvas.set(await this.pjesService.listEscalaPjesDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar a escala salva.');
    } finally {
      this.loadingSalvas.set(false);
    }
  }

  async remover(id: string): Promise<void> {
    try {
      await this.pjesService.removerLinha(id);
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível remover a linha.');
    }
  }
}
```

- [ ] **Step 2: Template + CSS**

Criar `escala-pjes-page.css` vazio (`/* sem estilos extras */`).

Criar `escala-pjes-page.html` — três `<section>` (Importar / Manual / Salvas). Use classes Tailwind no mesmo estilo das outras páginas (`rounded-lg bg-white p-4 shadow dark:bg-slate-900 ...`). Estrutura mínima obrigatória:

```html
<div>
  <h1 class="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">Escala PJES</h1>

  @if (errorMessage()) {
    <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
  }
  @if (info()) {
    <p class="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{{ info() }}</p>
  }

  <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
    <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">Importar PDF</h2>
    <input type="file" accept="application/pdf" (change)="onArquivo($event)" [disabled]="lendo()" />
    @if (lendo()) { <p class="mt-2 text-sm text-slate-500">Lendo PDF...</p> }

    @if (linhasRevisao().length > 0) {
      <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Confira e corrija. As linhas importadas de cada dia substituem as anteriores importadas por PDF; lançamentos manuais não são afetados.
      </p>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="text-slate-500 dark:text-slate-400">
              <th class="py-1 pr-2">Data</th><th class="py-1 pr-2">GT</th><th class="py-1 pr-2">Função</th>
              <th class="py-1 pr-2">Grad</th><th class="py-1 pr-2">Matrícula</th><th class="py-1 pr-2">Nome</th>
              <th class="py-1 pr-2">Telefone</th><th class="py-1 pr-2">Início</th><th class="py-1 pr-2">Fim</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of linhasRevisao(); track $index) {
              <tr class="border-t border-slate-100 dark:border-slate-800" [class.bg-red-50]="l.erros.length > 0">
                <td><input class="w-24 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.data" (ngModelChange)="atualizarRevisao($index, 'data', $event)" name="d{{$index}}" /></td>
                <td><input class="w-40 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.gtRotulo" (ngModelChange)="atualizarRevisao($index, 'gtRotulo', $event)" name="g{{$index}}" /></td>
                <td>
                  <select class="rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.funcao" (ngModelChange)="atualizarRevisao($index, 'funcao', $event)" name="f{{$index}}">
                    @for (fn of funcoes; track fn) { <option [value]="fn">{{ fn }}</option> }
                  </select>
                </td>
                <td><input class="w-16 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.graduacao" (ngModelChange)="atualizarRevisao($index, 'graduacao', $event)" name="gr{{$index}}" /></td>
                <td><input class="w-24 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.matricula" (ngModelChange)="atualizarRevisao($index, 'matricula', $event)" name="m{{$index}}" /></td>
                <td><input class="w-40 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.nomeGuerra" (ngModelChange)="atualizarRevisao($index, 'nomeGuerra', $event)" name="n{{$index}}" /></td>
                <td><input class="w-28 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.telefone" (ngModelChange)="atualizarRevisao($index, 'telefone', $event)" name="t{{$index}}" /></td>
                <td><input class="w-16 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.horarioInicio" (ngModelChange)="atualizarRevisao($index, 'horarioInicio', $event)" name="hi{{$index}}" /></td>
                <td><input class="w-16 rounded border px-1 py-0.5 dark:bg-slate-800" [ngModel]="l.horarioFim" (ngModelChange)="atualizarRevisao($index, 'horarioFim', $event)" name="hf{{$index}}" /></td>
                <td><button type="button" class="text-red-500" (click)="removerRevisao($index)">✕</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button
        type="button"
        class="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500"
        [disabled]="!revisaoValida || salvandoImport()"
        (click)="salvarImportacao()"
      >
        {{ salvandoImport() ? 'Salvando...' : 'Confirmar e salvar escala' }}
      </button>
    }
  </section>

  <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
    <h2 class="mb-3 text-lg font-medium text-slate-700 dark:text-slate-200">Adicionar manual (bloco por GT)</h2>
    <div class="grid gap-2 sm:grid-cols-4">
      <label class="text-sm">Data
        <input type="date" class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-800" [ngModel]="manualData()" (ngModelChange)="manualData.set($event)" name="md" />
      </label>
      <label class="text-sm sm:col-span-2">GT / Setor
        <input class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-800" placeholder="GT 16300 - Fiscalização POG" [ngModel]="manualGt()" (ngModelChange)="manualGt.set($event)" name="mg" />
      </label>
      <div class="flex gap-2 text-sm">
        <label>Início<input class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-800" [ngModel]="manualInicio()" (ngModelChange)="manualInicio.set($event)" name="mi" /></label>
        <label>Fim<input class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-800" [ngModel]="manualFim()" (ngModelChange)="manualFim.set($event)" name="mf" /></label>
      </div>
    </div>
    <div class="mt-3 grid gap-2">
      @for (l of manualLinhas(); track $index) {
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <select class="rounded border px-2 py-1 dark:bg-slate-800" [ngModel]="l.funcao" (ngModelChange)="atualizarLinhaManual($index, 'funcao', $event)" name="mlf{{$index}}">
            @for (fn of funcoes; track fn) { <option [value]="fn">{{ fn }}</option> }
          </select>
          <input class="rounded border px-2 py-1 dark:bg-slate-800" placeholder="Grad" [ngModel]="l.graduacao" (ngModelChange)="atualizarLinhaManual($index, 'graduacao', $event)" name="mlg{{$index}}" />
          <input class="rounded border px-2 py-1 dark:bg-slate-800" placeholder="Matrícula" [ngModel]="l.matricula" (ngModelChange)="atualizarLinhaManual($index, 'matricula', $event)" name="mlm{{$index}}" />
          <input class="rounded border px-2 py-1 sm:col-span-2 dark:bg-slate-800" placeholder="Nome de guerra" [ngModel]="l.nomeGuerra" (ngModelChange)="atualizarLinhaManual($index, 'nomeGuerra', $event)" name="mln{{$index}}" />
          <div class="flex gap-1">
            <input class="w-full rounded border px-2 py-1 dark:bg-slate-800" placeholder="Telefone" [ngModel]="l.telefone" (ngModelChange)="atualizarLinhaManual($index, 'telefone', $event)" name="mlt{{$index}}" />
            <button type="button" class="text-red-500" (click)="removerLinhaManual($index)">✕</button>
          </div>
        </div>
      }
    </div>
    <div class="mt-3 flex gap-2">
      <button type="button" class="rounded border px-3 py-1 text-sm dark:border-slate-600" (click)="adicionarLinhaManual()">+ linha</button>
      <button type="button" class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500" [disabled]="salvandoManual()" (click)="salvarManual()">
        {{ salvandoManual() ? 'Salvando...' : 'Adicionar à escala' }}
      </button>
    </div>
  </section>

  <section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-medium text-slate-700 dark:text-slate-200">Escala salva</h2>
      <label class="text-sm">Data
        <input type="date" class="ml-2 rounded border px-2 py-1 dark:bg-slate-800" [ngModel]="data()" (ngModelChange)="onDataChange($event)" name="ds" />
      </label>
    </div>
    @if (loadingSalvas()) {
      <p class="text-slate-500 dark:text-slate-400">Carregando...</p>
    } @else if (salvas().length === 0) {
      <p class="text-sm text-slate-500 dark:text-slate-400">Nada lançado para essa data.</p>
    } @else {
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th class="py-2">GT</th><th class="py-2">Função</th><th class="py-2">Grad</th><th class="py-2">Matrícula</th>
            <th class="py-2">Nome</th><th class="py-2">Horário</th><th class="py-2">Origem</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (l of salvas(); track l.id) {
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2">{{ l.gtRotulo }}</td><td class="py-2">{{ l.funcao }}</td><td class="py-2">{{ l.graduacao }}</td>
              <td class="py-2">{{ l.matricula }}</td><td class="py-2">{{ l.nomeGuerra }}</td>
              <td class="py-2">{{ l.horarioInicio.slice(0,5) }}–{{ l.horarioFim.slice(0,5) }}</td>
              <td class="py-2">{{ l.origem }}</td>
              <td class="py-2"><button type="button" class="text-red-500" (click)="remover(l.id)">Remover</button></td>
            </tr>
          }
        </tbody>
      </table>
    }
  </section>
</div>
```

- [ ] **Step 3: Smoke spec**

Criar `escala-pjes-page.spec.ts` (mesmo padrão de `relatorio-original-page.spec.ts` — sem stub de Supabase):

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EscalaPjesPage } from './escala-pjes-page';

describe('EscalaPjesPage', () => {
  let component: EscalaPjesPage;
  let fixture: ComponentFixture<EscalaPjesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EscalaPjesPage] }).compileComponents();
    fixture = TestBed.createComponent(EscalaPjesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

- [ ] **Step 4: Rota**

Em `src/app/app.routes.ts`, dentro de `children`, após o bloco `relatorio-original`:

```ts
{
  path: 'escala-pjes',
  loadComponent: () =>
    import('./features/escala-pjes/escala-pjes-page/escala-pjes-page').then((m) => m.EscalaPjesPage),
  canActivate: [roleGuard],
  data: { roles: ['PJES', 'ADMIN'] },
},
```

- [ ] **Step 5: Navegação**

Em `top-bar.ts` e `bottom-nav.ts`, adicionar:
```ts
const PERFIS_COM_ACESSO_ESCALA_PJES = ['PJES', 'ADMIN'];
```
e o método:
```ts
podeVerEscalaPjes(): boolean {
  const role = this.authService.currentPerfil?.role;
  return !!role && PERFIS_COM_ACESSO_ESCALA_PJES.includes(role);
}
```

Em `top-bar.html`, após o link "Painel do PC" (`routerLink="/lancamento"`), adicionar:
```html
@if (podeVerEscalaPjes()) {
  <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/escala-pjes" routerLinkActive="text-blue-600">
    Escala PJES
  </a>
}
```
Em `bottom-nav.html`, após o link "Painel PC":
```html
@if (podeVerEscalaPjes()) {
  <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/escala-pjes" routerLinkActive="text-blue-600">
    Escala PJES
  </a>
}
```

- [ ] **Step 6: Build + smoke + suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npx ng test --watch=false --include=src/app/features/escala-pjes/escala-pjes-page/escala-pjes-page.spec.ts` → PASS.
Run: `npx ng test --watch=false` → PASS (tudo).

- [ ] **Step 7: Commit**

```bash
git add src/app/features/escala-pjes src/app/app.routes.ts src/app/layout/top-bar src/app/layout/bottom-nav
git commit -m "feat: Escala PJES page (PDF import + manual entry) with route and nav"
```

---

## Task 6: Bloco PJES no Painel do PC (com Faltou/Atrasado)

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`

**Interfaces:**
- Consumes: `PjesService.listPjesRosterDoDia`, `PjesService.registrarPresencaPjes`, `PjesService.limparPresencaPjes`, `PjesRosterRow`, `StatusPjes` (Task 2); `turnoAtivoEm` (já importado de `lancamento.service`).
- Produces (no componente): `pjesRoster` signal, `pjesCards` getter, `togglePjesFalta(row)`, `togglePjesAtraso(row)`, `reloadPjes()`.

- [ ] **Step 1: Componente**

Em `painel-pc-page.ts`:
- importar `PjesService, PjesRosterRow, StatusPjes` de `../../../core/services/pjes.service`; `inject(PjesService)` como `pjesService`.
- signal `readonly pjesRoster = signal<PjesRosterRow[]>([]);`
- no `constructor()`, adicionar `void this.reloadPjes();`
- método:
```ts
async reloadPjes(): Promise<void> {
  try {
    this.pjesRoster.set(await this.pjesService.listPjesRosterDoDia(this.data()));
  } catch {
    this.errorMessage.set('Não foi possível carregar a escala PJES.');
  }
}
```
- onde já existe o handler de troca de data (procure por `this.data.set` / `onDataChange` no componente) chamar `void this.reloadPjes()` junto dos outros reloads.
- getter de cards PJES filtrados (espelha a lógica de filtro de `rosterFiltrado`):
```ts
interface CardPjes {
  chave: string;
  gtRotulo: string;
  horario: string;
  rows: PjesRosterRow[];
}

get pjesRosterFiltrado(): PjesRosterRow[] {
  let rows = this.pjesRoster();
  const momento = this.filtroMomento();
  const horario = this.filtroHorario();
  if (momento) {
    rows = rows.filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
  } else if (horario) {
    rows = rows.filter((r) => r.horarioInicio.slice(0, 5) === horario);
  }
  const busca = this.buscaPolicial().trim().toLowerCase();
  if (busca) {
    rows = rows.filter(
      (r) => (r.matricula ?? '').toLowerCase().includes(busca) || r.nomeGuerra.toLowerCase().includes(busca),
    );
  }
  return rows;
}

get pjesCards(): CardPjes[] {
  const grupos = new Map<string, CardPjes>();
  for (const row of this.pjesRosterFiltrado) {
    const chave = `${row.gtRotulo}__${row.horarioInicio}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        gtRotulo: row.gtRotulo,
        horario: `${row.horarioInicio.slice(0, 5)}–${row.horarioFim.slice(0, 5)}`,
        rows: [],
      });
    }
    grupos.get(chave)!.rows.push(row);
  }
  return Array.from(grupos.values()).sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo));
}

async togglePjesFalta(row: PjesRosterRow): Promise<void> {
  if (!this.podeEditar()) return;
  try {
    if (row.status === 'FALTA') {
      await this.pjesService.limparPresencaPjes(row.escalaPjesId);
    } else {
      await this.pjesService.registrarPresencaPjes(row.escalaPjesId, 'FALTA');
    }
    await this.reloadPjes();
  } catch {
    this.errorMessage.set('Não foi possível atualizar a falta.');
  }
}

async togglePjesAtraso(row: PjesRosterRow): Promise<void> {
  if (!this.podeEditar()) return;
  try {
    if (row.status === 'ATRASADO') {
      await this.pjesService.limparPresencaPjes(row.escalaPjesId);
    } else {
      await this.pjesService.registrarPresencaPjes(row.escalaPjesId, 'ATRASADO');
    }
    await this.reloadPjes();
  } catch {
    this.errorMessage.set('Não foi possível atualizar o atraso.');
  }
}
```

- [ ] **Step 2: Template**

Em `painel-pc-page.html`, ao final do `</section>` que fecha a grade de cards ordinária (a `<section class="mt-6">` que contém `@for (card of cards; ...)`, termina antes da `<section>` de "funções fixas" por volta da linha 303), adicionar uma nova `<section>`:

```html
@if (pjesCards.length > 0) {
  <section class="mt-8">
    <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-semibold uppercase text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300">
      PJES · Serviço Extra
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      @for (card of pjesCards; track card.chave) {
        <div class="flex flex-col rounded-lg border border-l-4 border-l-fuchsia-500 border-white/60 bg-white/70 p-4 shadow backdrop-blur-md dark:border-slate-700/50 dark:border-l-fuchsia-400 dark:bg-slate-900/50">
          <h3 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">{{ card.gtRotulo }}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ card.horario }}</p>
          <div class="mt-2 flex flex-col gap-2">
            @for (linha of card.rows; track linha.escalaPjesId) {
              <div class="rounded border border-slate-200/70 bg-white/50 px-2 py-2 text-sm dark:border-slate-700/60 dark:bg-slate-800/40">
                <div class="flex items-center justify-between gap-2">
                  <span>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ linha.funcao }}</span>
                    <span class="ml-1 text-slate-700 dark:text-slate-200">
                      <span class="font-medium text-slate-500 dark:text-slate-400">{{ linha.graduacao }}</span>
                      {{ linha.nomeGuerra }}
                      @if (linha.matricula) { <span class="text-xs text-slate-400">({{ linha.matricula }})</span> }
                    </span>
                  </span>
                  @if (linha.status !== 'PREVISTO') {
                    <span class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      [ngClass]="linha.status === 'FALTA'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'">
                      {{ linha.status === 'FALTA' ? 'Faltou' : 'Atrasado' }}
                    </span>
                  }
                </div>
                @if (podeEditar()) {
                  <div class="mt-1 flex gap-2">
                    <button type="button" class="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 dark:border-red-700 dark:text-red-400" (click)="togglePjesFalta(linha)">
                      {{ linha.status === 'FALTA' ? 'Desfazer falta' : 'Faltou' }}
                    </button>
                    <button type="button" class="rounded border border-orange-300 px-2 py-0.5 text-xs text-orange-600 dark:border-orange-700 dark:text-orange-400" (click)="togglePjesAtraso(linha)">
                      {{ linha.status === 'ATRASADO' ? 'Desfazer atraso' : 'Atrasado' }}
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  </section>
}
```

- [ ] **Step 3: Build + smoke + suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npx ng test --watch=false --include=src/app/features/painel-pc/painel-pc-page/painel-pc-page.spec.ts` → PASS.
Run: `npx ng test --watch=false` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.html
git commit -m "feat: painel do PC shows PJES extra-service block with faltou/atrasado"
```

---

## Task 7: Bloco PJES no Painel Principal + contagem

**Files:**
- Modify: `src/app/features/dashboard/dashboard-page/dashboard-page.ts`
- Modify: `src/app/features/dashboard/dashboard-page/dashboard-page.html`

**Interfaces:**
- Consumes: `PjesService.listPjesRosterDoDia`, `PjesRosterRow` (Task 2); `turnoAtivoEm` (já importado).
- Produces (no componente): `pjesRoster` signal, `pjesRosterFiltrado`/`pjesCards` getters, `pjesFaltas` getter; `totalAtivas`/`totalLancados` passam a somar PJES.

- [ ] **Step 1: Componente**

Em `dashboard-page.ts`:
- importar e `inject(PjesService)`; signal `readonly pjesRoster = signal<PjesRosterRow[]>([]);`
- no `reload()` (procure o `Promise.all` com `listRosterDoDia`), adicionar `this.pjesService.listPjesRosterDoDia(this.hoje)` ao array e `this.pjesRoster.set(...)` ao resultado.
- getters:
```ts
interface CardPjesDash { chave: string; gtRotulo: string; horario: string; rows: PjesRosterRow[]; }

get pjesRosterFiltrado(): PjesRosterRow[] {
  const momento = this.filtroMomento();
  if (momento) {
    return this.pjesRoster().filter((r) => turnoAtivoEm(r.horarioInicio, r.horarioFim, momento));
  }
  const horario = this.filtroHorario();
  return horario ? this.pjesRoster().filter((r) => r.horarioInicio.slice(0, 5) === horario) : this.pjesRoster();
}

get pjesCards(): CardPjesDash[] {
  const grupos = new Map<string, CardPjesDash>();
  for (const r of this.pjesRosterFiltrado) {
    const chave = `${r.gtRotulo}__${r.horarioInicio}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, gtRotulo: r.gtRotulo, horario: `${r.horarioInicio.slice(0,5)}–${r.horarioFim.slice(0,5)}`, rows: [] });
    }
    grupos.get(chave)!.rows.push(r);
  }
  return Array.from(grupos.values()).sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo));
}

get pjesFaltas(): number {
  return this.pjesRosterFiltrado.filter((r) => r.status === 'FALTA').length;
}
```
- `totalLancados`: somar `+ this.pjesRosterFiltrado.length`.
- `totalAtivas`: somar `+ this.pjesCards.length`.
- Documentar com comentário que PJES não tem `guarnicaoId`, então não entra em `viaturasPorBairro` nem em `viaturasDesativadas`.

- [ ] **Step 2: Template**

Em `dashboard-page.html`, achar onde os cards de status são renderizados (procure `statusOrder` / `totalAtivas`). Adicionar, após o bloco de resumo/grade principal, uma `<section>`:

```html
@if (pjesCards.length > 0) {
  <section class="mt-8">
    <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-semibold uppercase text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300">
      PJES · Serviço Extra
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      @for (card of pjesCards; track card.chave) {
        <div class="rounded-lg border border-l-4 border-l-fuchsia-500 bg-white p-4 shadow dark:border-l-fuchsia-400 dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
          <h3 class="font-display text-base font-bold text-slate-800 dark:text-slate-100">{{ card.gtRotulo }}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ card.horario }} · {{ card.rows.length }} pessoa(s)</p>
          <ul class="mt-2 space-y-1 text-sm">
            @for (linha of card.rows; track linha.escalaPjesId) {
              <li class="flex items-center justify-between">
                <span>{{ linha.funcao }} · {{ linha.graduacao }} {{ linha.nomeGuerra }}</span>
                @if (linha.status !== 'PREVISTO') {
                  <span class="text-xs font-semibold" [ngClass]="linha.status === 'FALTA' ? 'text-red-600' : 'text-orange-600'">
                    {{ linha.status === 'FALTA' ? 'Faltou' : 'Atrasado' }}
                  </span>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  </section>
}
```

- [ ] **Step 3: Build + smoke + suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npx ng test --watch=false --include=src/app/features/dashboard/dashboard-page/dashboard-page.spec.ts` → PASS.
Run: `npx ng test --watch=false` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/dashboard/dashboard-page/dashboard-page.ts src/app/features/dashboard/dashboard-page/dashboard-page.html
git commit -m "feat: dashboard shows PJES extra-service block and counts it in totals"
```

---

## Task 8: Seção "PJES / DIÁRIA" automática no Relatório Original

**Files:**
- Modify: `src/app/core/services/relatorio-alteracoes.service.ts`
- Test: `src/app/core/services/relatorio-alteracoes.service.spec.ts`
- Modify: `src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.ts`

**Interfaces:**
- Consumes: `PjesRosterRow` de `../../../core/services/pjes.service` (no relatório) / `./pjes.service` (no serviço); `PjesService.listPjesRosterDoDia` (na página).
- Produces: `RelatorioAlteracoesInput` ganha `pjes: PjesRosterRow[]`.

- [ ] **Step 1: Testes (falhando)**

Em `relatorio-alteracoes.service.spec.ts`, no `baseInput()` helper adicionar `pjes: []` ao objeto retornado (e ao tipo do `Partial`). Adicionar:

```ts
it('preenche PJES / DIÁRIA com a escala PJES quando há linhas', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput({
    pjes: [
      { escalaPjesId: 'e1', gtRotulo: 'GT 16100 - SUPERVISÃO', funcao: 'CMT', graduacao: 'TC', matricula: '102505-8', nomeGuerra: 'GRISI', telefone: null, horarioInicio: '16:00:00', horarioFim: '00:00:00', status: 'PREVISTO', horarioChegada: null, motivo: null },
      { escalaPjesId: 'e2', gtRotulo: 'GT 16141 - 1º CPM', funcao: 'MOT', graduacao: 'SD', matricula: '130253-1', nomeGuerra: 'DIOGO', telefone: null, horarioInicio: '23:59:00', horarioFim: '05:59:00', status: 'FALTA', horarioChegada: null, motivo: null },
    ],
  }));
  const secao = html.slice(html.indexOf('PJES / DIÁRIA'));
  expect(secao).toContain('GT 16100 - SUPERVISÃO');
  expect(secao).toContain('102505-8');
  expect(secao).toContain('GRISI');
  expect(secao).toContain('PRESENTE');
  expect(secao).toContain('FALTOU');
});

it('mantém o quadro pré-montado PJES / DIÁRIA quando não há linhas PJES', () => {
  const html = montarRelatorioAlteracoesHtml(baseInput({ pjes: [] }));
  const secao = html.slice(html.indexOf('PJES / DIÁRIA'));
  expect(secao).toContain("GS'S EXTRA");
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx ng test --watch=false --include=src/app/core/services/relatorio-alteracoes.service.spec.ts`
Expected: FAIL — `pjes` não existe no tipo / seção não renderiza a tabela.

- [ ] **Step 3: Implementar**

Em `relatorio-alteracoes.service.ts`:
- import: `import { PjesRosterRow } from './pjes.service';`
- `RelatorioAlteracoesInput` ganha `pjes: PjesRosterRow[];`
- substituir o bloco da seção 10:
```ts
  // 10. PJES / DIÁRIA -------------------------------------------------
  out.push(`<p style="${S_TITULO}">PJES / DIÁRIA</p>`);
  if (input.pjes.length > 0) {
    const situacao = (s: PjesRosterRow['status']): string =>
      s === 'FALTA' ? 'FALTOU' : s === 'ATRASADO' ? 'ATRASADO' : 'PRESENTE';
    const linhasPjes = [...input.pjes]
      .sort((a, b) => a.gtRotulo.localeCompare(b.gtRotulo) || a.funcao.localeCompare(b.funcao))
      .map((p) => [
        esc(p.gtRotulo),
        esc(p.funcao),
        esc(p.graduacao),
        esc(p.matricula),
        esc(p.nomeGuerra),
        `${esc(p.horarioInicio.slice(0, 5))}–${esc(p.horarioFim.slice(0, 5))}`,
        situacao(p.status),
      ]);
    out.push(
      tabela(['GT', 'FUNÇÃO', 'GRAD', 'MATRÍCULA', 'NOME', 'HORÁRIO', 'SITUAÇÃO'], linhasPjes),
    );
  } else {
    out.push(tabelaDuasColunas(PJES_TOTAL_ALT, PJES_SERVICO_ALT));
  }
```
(`esc` já aceita `string | null`.)

- [ ] **Step 4: Página do relatório**

Em `relatorio-original-page.ts`:
- importar `PjesService, PjesRosterRow`; `inject(PjesService)`.
- signal `readonly pjes = signal<PjesRosterRow[]>([]);`
- no `reload()` `Promise.all`, adicionar `this.pjesService.listPjesRosterDoDia(data)` e `this.pjes.set(...)`.
- em `montarInput()`, adicionar `pjes: this.pjes(),`.

- [ ] **Step 5: Rodar e confirmar que passam**

Run: `npx ng test --watch=false --include=src/app/core/services/relatorio-alteracoes.service.spec.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
Run: `npx ng test --watch=false` → PASS (tudo).

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/relatorio-alteracoes.service.ts src/app/core/services/relatorio-alteracoes.service.spec.ts src/app/features/relatorio-original/relatorio-original-page/relatorio-original-page.ts
git commit -m "feat: Relatório Original auto-fills PJES / DIÁRIA from the PJES schedule"
```

---

## Self-Review (resultado)

**1. Cobertura da spec:**
- Seção 1 (dados) → Task 1. ✔
- Seção 2 (`PjesService`) → Task 2 (todos os métodos, `PjesRosterRow`). ✔
- Seção 3 (parser puro) → Task 3; `PjesPdfService` wrapper → Task 4. ✔
- Seção 4 (aba Escala PJES: importar/manual/salvas, `pdfjs-dist`) → Task 5. ✔
- Seção 5 (PJES nas 3 telas) → Task 6 (Painel do PC + Faltou/Atrasado) e Task 7 (Painel Principal + contagem). ✔
- Seção 6 (Relatório PJES/DIÁRIA) → Task 8. ✔
- Seção 7 (RBAC/nav) → Task 5 Steps 4-5. ✔
- Seção 8 (testes/build) → cada task roda `tsc` + suíte; specs de serviço com asserção real, de componente smoke. ✔
- Fora de escopo respeitado: nenhuma task toca `listRosterDoDia`/`escala_mensal`/Relatório SEI; cards PJES só têm FALTA/ATRASADO. ✔

**2. Placeholders:** o worker do `pdfjs-dist` (Task 4 Step 2) tem 3 alternativas concretas e o critério ("a que fizer `ng build` passar") — não é "TODO", é uma decisão de ambiente com passos. Sem outros.

**3. Consistência de tipos:**
- `PjesRosterRow` — mesma forma na Task 2 (definição), Task 6/7 (consumo nas telas), Task 8 (relatório). `status: 'PREVISTO'|'FALTA'|'ATRASADO'` = `StatusPjes`.
- `NovaLinhaPjes` (snake_case) — Task 2 define, Task 5 monta.
- `LinhaPjesExtraida` (camelCase, sem `status`) — Task 3 define, Task 5 consome via `LinhaRevisao extends LinhaPjesExtraida`.
- `extrairEscalaPjes(itens: ItemTextoPdf[])` — Task 3; `PjesPdfService.extrairItens(file): Promise<ItemTextoPdf[]>` Task 4; encaixe na Task 5 Step 1 (`extrairEscalaPjes(await this.pdfService.extrairItens(file))`).
- `registrarPresencaPjes(id, status, opts?)` / `limparPresencaPjes(id)` — Task 2 define, Task 6 usa.
- `RelatorioAlteracoesInput.pjes` — Task 8 adiciona; `baseInput()` do spec passa a incluir `pjes: []` (Task 8 Step 1).
- `funcao_pjes` enum (`CMT/MOT/PAT/OUTRO`) = `FuncaoPjes`; migração Task 1 e tipo Task 2 batem.
- Nav helper `podeVerEscalaPjes()` + const `PERFIS_COM_ACESSO_ESCALA_PJES` — Task 5, mesmo nome em top-bar e bottom-nav.
