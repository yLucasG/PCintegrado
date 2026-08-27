> **Status (2026-08-27): All 9 tasks executed and verified.** 31/31 tests passing, production build green, both migrations deployed to the live Supabase project, `fn_resolve_escala_dia` verified against real 3ª CPM data (PARES/IMPARES filtering and a `vigencia_inicio` edge case both confirmed correct via live RPC calls). 1ª CPM, 2ª CPM, and PCTAT data import remains for a follow-up pass.

# Dados Mestres + Escala Mensal Recorrente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model guarnições e escala mensal recorrente no banco, construir telas CRUD para policiais/viaturas/guarnições/escala mensal, e importar os dados reais da 3ª CPM (Agosto/2026) como primeira validação ponta a ponta.

**Architecture:** Duas tabelas novas (`guarnicoes`, `escala_mensal`) + uma função SQL (`fn_resolve_escala_dia`) em cima do schema da Etapa 1. Quatro pares service+page Angular seguindo o padrão já estabelecido (`AdminUsersService`/`AdminUsersPage`): service fino sobre `SupabaseService.client`, componente standalone com signals, lista + criação + remoção (sem edição nesta etapa — simplificação deliberada, ver Global Constraints). Seed de dados real da 3ª CPM como migration separada.

**Tech Stack:** O mesmo da Etapa 1 (Angular 21, Vitest, Supabase). Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-08-27-escala-mensal-design.md`

## Global Constraints

- Escopo de guarnições: apenas GT (tático e ordinário), MO, CP, GV — reaproveitam o enum `funcao_escala` (CMT/MOT/PAT) já existente. Não expandir esse enum nesta etapa.
- Escopo de dados a importar nesta etapa: **apenas 3ª CPM** (Agosto/2026). 1ª CPM, 2ª CPM e PCTAT ficam para uma etapa seguinte — decisão explícita do usuário para reduzir risco de uma transcrição gigante de uma vez.
- CRUD desta etapa é List + Create + Delete — sem tela de edição separada (simplificação de escopo vs. a redação original do spec, que mencionava "criar/editar"; editar pode ser adicionado depois se for precisar).
- Todas as rotas novas ficam atrás do `authGuard` já existente no `Shell` — sem `roleGuard` (qualquer usuário autenticado gerencia dados mestres nesta etapa).
- RLS: mesmo padrão já usado — `authenticated` lê e escreve tudo, sem granularidade por companhia.
- Sem Docker, sem `supabase db push` local — a migration é escrita e comitada aqui; o push real para o projeto Supabase acontece como conversa separada com o usuário (precisa de token), igual foi feito na Etapa 1.
- Nomenclatura de componentes sem sufixo "Component" (`PoliciaisPage` em `policiais-page.ts`), runner de teste é Vitest — mesmo padrão descoberto na Etapa 1.

---

### Task 1: Schema — `guarnicoes`, `escala_mensal`, função de resolução

**Files:**
- Create: `supabase/migrations/20260827010000_guarnicoes_escala_mensal.sql`

**Interfaces:**
- Produces: tabelas `public.guarnicoes`, `public.escala_mensal`; enums `public.tipo_guarnicao`, `public.tipo_recorrencia`; função `public.fn_resolve_escala_dia(p_data date)` — consumidas pelos services das Tasks 3-5 e pelo Sub-projeto 2 (Lançamento Diário) no futuro.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/20260827010000_guarnicoes_escala_mensal.sql`:
```sql
-- Guarnições (postos de serviço fixos): GT tático/ordinário, MO, CP, GV
create type public.tipo_guarnicao as enum (
  'GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'
);

create table public.guarnicoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.tipo_guarnicao not null,
  companhia_id uuid not null references public.companhias (id),
  area_atuacao text,
  prefixos text[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Escala mensal recorrente
create type public.tipo_recorrencia as enum (
  'PARES', 'IMPARES', 'DIAS_ESPECIFICOS', 'SEG_A_SEX', 'TODOS_OS_DIAS'
);

create table public.escala_mensal (
  id uuid primary key default gen_random_uuid(),
  guarnicao_id uuid not null references public.guarnicoes (id),
  policial_matricula varchar(20) not null references public.policiais (matricula),
  funcao public.funcao_escala not null,
  horario_inicio time not null,
  horario_fim time not null,
  tipo_recorrencia public.tipo_recorrencia not null,
  dias_especificos int[],
  vigencia_inicio date not null,
  vigencia_fim date,
  escala_origem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

create trigger trg_escala_mensal_set_criado_por
before insert on public.escala_mensal
for each row execute function public.fn_set_criado_por();

-- Resolve quem deveria estar escalado numa data específica
create or replace function public.fn_resolve_escala_dia(p_data date)
returns setof public.escala_mensal
language sql
stable
as $$
  select *
  from public.escala_mensal em
  where em.vigencia_inicio <= p_data
    and (em.vigencia_fim is null or em.vigencia_fim >= p_data)
    and (
      (em.tipo_recorrencia = 'PARES' and extract(day from p_data)::int % 2 = 0)
      or (em.tipo_recorrencia = 'IMPARES' and extract(day from p_data)::int % 2 = 1)
      or (em.tipo_recorrencia = 'DIAS_ESPECIFICOS' and extract(day from p_data)::int = any(em.dias_especificos))
      or (em.tipo_recorrencia = 'SEG_A_SEX' and extract(isodow from p_data) between 1 and 5)
      or (em.tipo_recorrencia = 'TODOS_OS_DIAS')
    );
$$;

-- RLS
alter table public.guarnicoes enable row level security;
alter table public.escala_mensal enable row level security;

create policy "authenticated_select_guarnicoes" on public.guarnicoes
  for select to authenticated using (true);
create policy "authenticated_insert_guarnicoes" on public.guarnicoes
  for insert to authenticated with check (true);
create policy "authenticated_delete_guarnicoes" on public.guarnicoes
  for delete to authenticated using (true);

create policy "authenticated_select_escala_mensal" on public.escala_mensal
  for select to authenticated using (true);
create policy "authenticated_insert_escala_mensal" on public.escala_mensal
  for insert to authenticated with check (true);
create policy "authenticated_delete_escala_mensal" on public.escala_mensal
  for delete to authenticated using (true);
```

- [ ] **Step 2: Sanity-check the SQL structurally (no local Postgres — same constraint as Etapa 1)**

Run: `grep -c "^create table" supabase/migrations/20260827010000_guarnicoes_escala_mensal.sql`
Expected: `2`

Run: `grep -c "^create policy" supabase/migrations/20260827010000_guarnicoes_escala_mensal.sql`
Expected: `6`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827010000_guarnicoes_escala_mensal.sql
git commit -m "feat: add guarnicoes and escala_mensal schema"
```

---

### Task 2: `CompanhiasService`

**Files:**
- Create: `src/app/core/services/companhias.service.ts`
- Test: `src/app/core/services/companhias.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (Etapa 1).
- Produces: `interface CompanhiaRow { id: string; nome: string }`, `CompanhiasService.listCompanhias(): Promise<CompanhiaRow[]>` — consumido pelas Tasks 3 e 5 (dropdowns de companhia).

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/companhias.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { CompanhiasService } from './companhias.service';
import { SupabaseService } from './supabase.service';

describe('CompanhiasService', () => {
  it('lists companhias ordered by name', async () => {
    const rows = [{ id: '1', nome: '1ª CPM' }];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(CompanhiasService);
    const result = await service.listCompanhias();
    expect(result).toEqual(rows as any);
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/companhias.service.spec.ts'`
Expected: FAIL — `Cannot find module './companhias.service'`.

- [ ] **Step 3: Implement**

Create `src/app/core/services/companhias.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CompanhiaRow {
  id: string;
  nome: string;
}

@Injectable({ providedIn: 'root' })
export class CompanhiasService {
  private readonly supabase = inject(SupabaseService);

  async listCompanhias(): Promise<CompanhiaRow[]> {
    const { data, error } = await this.supabase.client
      .from('companhias')
      .select('id, nome')
      .order('nome');
    if (error) {
      throw error;
    }
    return (data ?? []) as CompanhiaRow[];
  }
}
```

- [ ] **Step 4: Confirm it passes**

Run: `npm test -- --watch=false --include='**/companhias.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/companhias.service.ts src/app/core/services/companhias.service.spec.ts
git commit -m "feat: add CompanhiasService"
```

---

### Task 3: Policiais — service e tela CRUD

**Files:**
- Create: `src/app/core/services/policiais.service.ts`
- Test: `src/app/core/services/policiais.service.spec.ts`
- Create: `src/app/features/policiais/policiais-page/policiais-page.ts`
- Create: `src/app/features/policiais/policiais-page/policiais-page.html`

**Interfaces:**
- Consumes: `SupabaseService.client`, `CompanhiasService.listCompanhias` (Task 2).
- Produces: `interface PolicialRow { matricula: string; graduacao: string; nome_guerra: string; telefone: string | null; companhia_id: string | null }`, `PoliciaisService.listPoliciais()`, `.createPolicial(input)`, `.removePolicial(matricula)` — consumido pela Task 5 (dropdown de policial na escala mensal) e pela Task 7 (seed).

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/policiais.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { PoliciaisService } from './policiais.service';
import { SupabaseService } from './supabase.service';

describe('PoliciaisService', () => {
  it('lists policiais ordered by nome_guerra', async () => {
    const rows = [{ matricula: '127934-3', graduacao: 'SD', nome_guerra: 'CARLOS MATIAS', telefone: null, companhia_id: null }];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(PoliciaisService);
    const result = await service.listPoliciais();
    expect(result).toEqual(rows as any);
  });

  it('creates a policial via insert', async () => {
    const created = { matricula: '999999-9', graduacao: 'SD', nome_guerra: 'TESTE', telefone: null, companhia_id: null };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(PoliciaisService);
    const result = await service.createPolicial({
      matricula: '999999-9',
      graduacao: 'SD',
      nome_guerra: 'TESTE',
    });

    expect(insertSpy).toHaveBeenCalledWith({
      matricula: '999999-9',
      graduacao: 'SD',
      nome_guerra: 'TESTE',
      telefone: null,
      companhia_id: null,
    });
    expect(result.matricula).toBe('999999-9');
  });

  it('removes a policial by matricula', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseStub = { client: { from: () => ({ delete: deleteSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(PoliciaisService);
    await service.removePolicial('999999-9');

    expect(eqSpy).toHaveBeenCalledWith('matricula', '999999-9');
  });
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npm test -- --watch=false --include='**/policiais.service.spec.ts'`
Expected: FAIL — `Cannot find module './policiais.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/policiais.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PolicialRow {
  matricula: string;
  graduacao: string;
  nome_guerra: string;
  telefone: string | null;
  companhia_id: string | null;
}

export interface CreatePolicialInput {
  matricula: string;
  graduacao: string;
  nome_guerra: string;
  telefone?: string | null;
  companhia_id?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PoliciaisService {
  private readonly supabase = inject(SupabaseService);

  async listPoliciais(): Promise<PolicialRow[]> {
    const { data, error } = await this.supabase.client
      .from('policiais')
      .select('matricula, graduacao, nome_guerra, telefone, companhia_id')
      .order('nome_guerra');
    if (error) {
      throw error;
    }
    return (data ?? []) as PolicialRow[];
  }

  async createPolicial(input: CreatePolicialInput): Promise<PolicialRow> {
    const { data, error } = await this.supabase.client
      .from('policiais')
      .insert({
        matricula: input.matricula,
        graduacao: input.graduacao,
        nome_guerra: input.nome_guerra,
        telefone: input.telefone ?? null,
        companhia_id: input.companhia_id ?? null,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as PolicialRow;
  }

  async removePolicial(matricula: string): Promise<void> {
    const { error } = await this.supabase.client.from('policiais').delete().eq('matricula', matricula);
    if (error) {
      throw error;
    }
  }
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/policiais.service.spec.ts'`
Expected: PASS (3 specs).

- [ ] **Step 5: Generate and implement the page**

Run: `npx ng generate component features/policiais/policiais-page --flat=false`

Replace `src/app/features/policiais/policiais-page/policiais-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';

@Component({
  selector: 'app-policiais-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './policiais-page.html',
  styleUrl: './policiais-page.css',
})
export class PoliciaisPage {
  private readonly policiaisService = inject(PoliciaisService);
  private readonly companhiasService = inject(CompanhiasService);

  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly novaMatricula = signal('');
  readonly novaGraduacao = signal('');
  readonly novoNomeGuerra = signal('');
  readonly novoTelefone = signal('');
  readonly novaCompanhiaId = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [policiais, companhias] = await Promise.all([
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
      ]);
      this.policiais.set(policiais);
      this.companhias.set(companhias);
    } catch {
      this.errorMessage.set('Não foi possível carregar os policiais.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string | null): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.policiaisService.createPolicial({
        matricula: this.novaMatricula(),
        graduacao: this.novaGraduacao(),
        nome_guerra: this.novoNomeGuerra(),
        telefone: this.novoTelefone() || null,
        companhia_id: this.novaCompanhiaId() || null,
      });
      this.novaMatricula.set('');
      this.novaGraduacao.set('');
      this.novoNomeGuerra.set('');
      this.novoTelefone.set('');
      this.novaCompanhiaId.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar o policial.');
    }
  }

  async onRemove(matricula: string): Promise<void> {
    try {
      await this.policiaisService.removePolicial(matricula);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover o policial.');
    }
  }
}
```

Replace `src/app/features/policiais/policiais-page/policiais-page.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Policiais</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Novo policial</h2>
  <form class="grid gap-3 sm:grid-cols-5" (ngSubmit)="onCreate()">
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Matrícula"
      required
      [ngModel]="novaMatricula()"
      (ngModelChange)="novaMatricula.set($event)"
      name="matricula"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Graduação"
      required
      [ngModel]="novaGraduacao()"
      (ngModelChange)="novaGraduacao.set($event)"
      name="graduacao"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Nome de guerra"
      required
      [ngModel]="novoNomeGuerra()"
      (ngModelChange)="novoNomeGuerra.set($event)"
      name="nomeGuerra"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Telefone"
      [ngModel]="novoTelefone()"
      (ngModelChange)="novoTelefone.set($event)"
      name="telefone"
    />
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="novaCompanhiaId()"
      (ngModelChange)="novaCompanhiaId.set($event)"
      name="companhia"
    >
      <option value="">Sem companhia</option>
      @for (companhia of companhias(); track companhia.id) {
        <option [value]="companhia.id">{{ companhia.nome }}</option>
      }
    </select>
    <button
      class="rounded bg-blue-600 px-4 py-2 font-medium text-white sm:col-span-5"
      type="submit"
    >
      Adicionar
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
          <th class="py-2">Matrícula</th>
          <th class="py-2">Grad.</th>
          <th class="py-2">Nome de guerra</th>
          <th class="py-2">Telefone</th>
          <th class="py-2">Companhia</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (policial of policiais(); track policial.matricula) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ policial.matricula }}</td>
            <td class="py-2 text-slate-700">{{ policial.graduacao }}</td>
            <td class="py-2 text-slate-700">{{ policial.nome_guerra }}</td>
            <td class="py-2 text-slate-700">{{ policial.telefone ?? '—' }}</td>
            <td class="py-2 text-slate-700">{{ companhiaNome(policial.companhia_id) }}</td>
            <td class="py-2 text-right">
              <button class="text-sm text-red-600" (click)="onRemove(policial.matricula)">Remover</button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 6: Confirm the generated component spec still passes**

Run: `npm test -- --watch=false --include='**/policiais-page.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/policiais.service.ts src/app/core/services/policiais.service.spec.ts src/app/features/policiais
git commit -m "feat: add policiais CRUD"
```

---

### Task 4: Viaturas — service e tela CRUD

**Files:**
- Create: `src/app/core/services/viaturas.service.ts`
- Test: `src/app/core/services/viaturas.service.spec.ts`
- Create: `src/app/features/viaturas/viaturas-page/viaturas-page.ts`
- Create: `src/app/features/viaturas/viaturas-page/viaturas-page.html`

**Interfaces:**
- Consumes: `SupabaseService.client`.
- Produces: `interface ViaturaRow { prefixo: string; area_atuacao: string | null }`, `ViaturasService.listViaturas()`, `.createViatura(input)`, `.removeViatura(prefixo)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/viaturas.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { ViaturasService } from './viaturas.service';
import { SupabaseService } from './supabase.service';

describe('ViaturasService', () => {
  it('lists viaturas ordered by prefixo', async () => {
    const rows = [{ prefixo: '16331', area_atuacao: 'Santo Amaro' }];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(ViaturasService);
    const result = await service.listViaturas();
    expect(result).toEqual(rows as any);
  });

  it('creates a viatura via insert', async () => {
    const created = { prefixo: '99999', area_atuacao: 'Teste' };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(ViaturasService);
    const result = await service.createViatura({ prefixo: '99999', area_atuacao: 'Teste' });

    expect(result.prefixo).toBe('99999');
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/viaturas.service.spec.ts'`
Expected: FAIL — `Cannot find module './viaturas.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/viaturas.service.ts`:
```typescript
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
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/viaturas.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Generate and implement the page**

Run: `npx ng generate component features/viaturas/viaturas-page --flat=false`

Replace `src/app/features/viaturas/viaturas-page/viaturas-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViaturasService, ViaturaRow } from '../../../core/services/viaturas.service';

@Component({
  selector: 'app-viaturas-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './viaturas-page.html',
  styleUrl: './viaturas-page.css',
})
export class ViaturasPage {
  private readonly viaturasService = inject(ViaturasService);

  readonly viaturas = signal<ViaturaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly novoPrefixo = signal('');
  readonly novaArea = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.viaturas.set(await this.viaturasService.listViaturas());
    } catch {
      this.errorMessage.set('Não foi possível carregar as viaturas.');
    } finally {
      this.loading.set(false);
    }
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.viaturasService.createViatura({
        prefixo: this.novoPrefixo(),
        area_atuacao: this.novaArea() || null,
      });
      this.novoPrefixo.set('');
      this.novaArea.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a viatura.');
    }
  }

  async onRemove(prefixo: string): Promise<void> {
    try {
      await this.viaturasService.removeViatura(prefixo);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a viatura.');
    }
  }
}
```

Replace `src/app/features/viaturas/viaturas-page/viaturas-page.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Viaturas</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Nova viatura</h2>
  <form class="grid gap-3 sm:grid-cols-3" (ngSubmit)="onCreate()">
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Prefixo"
      required
      [ngModel]="novoPrefixo()"
      (ngModelChange)="novoPrefixo.set($event)"
      name="prefixo"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Área de atuação"
      [ngModel]="novaArea()"
      (ngModelChange)="novaArea.set($event)"
      name="area"
    />
    <button class="rounded bg-blue-600 px-4 py-2 font-medium text-white" type="submit">
      Adicionar
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
          <th class="py-2">Prefixo</th>
          <th class="py-2">Área de atuação</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (viatura of viaturas(); track viatura.prefixo) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ viatura.prefixo }}</td>
            <td class="py-2 text-slate-700">{{ viatura.area_atuacao ?? '—' }}</td>
            <td class="py-2 text-right">
              <button class="text-sm text-red-600" (click)="onRemove(viatura.prefixo)">Remover</button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 6: Confirm the generated component spec still passes**

Run: `npm test -- --watch=false --include='**/viaturas-page.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/viaturas.service.ts src/app/core/services/viaturas.service.spec.ts src/app/features/viaturas
git commit -m "feat: add viaturas CRUD"
```

---

### Task 5: Guarnições — service e tela CRUD

**Files:**
- Create: `src/app/core/services/guarnicoes.service.ts`
- Test: `src/app/core/services/guarnicoes.service.spec.ts`
- Create: `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts`
- Create: `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.html`

**Interfaces:**
- Consumes: `SupabaseService.client`, `CompanhiasService.listCompanhias` (Task 2).
- Produces: `type TipoGuarnicao = 'GT_TATICO' | 'GT_ORDINARIO' | 'MO' | 'CP' | 'GV'`, `interface GuarnicaoRow { id: string; nome: string; tipo: TipoGuarnicao; companhia_id: string; area_atuacao: string | null; prefixos: string[] | null }`, `GuarnicoesService.listGuarnicoes()`, `.createGuarnicao(input)`, `.removeGuarnicao(id)` — consumido pela Task 6 (dropdown de guarnição na escala mensal).

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/guarnicoes.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { GuarnicoesService } from './guarnicoes.service';
import { SupabaseService } from './supabase.service';

describe('GuarnicoesService', () => {
  it('lists guarnicoes ordered by nome', async () => {
    const rows = [
      { id: 'g1', nome: 'GT 16332 - Boa Vista', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: 'Boa Vista', prefixos: ['16332'] },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(GuarnicoesService);
    const result = await service.listGuarnicoes();
    expect(result).toEqual(rows as any);
  });

  it('creates a guarnicao via insert', async () => {
    const created = { id: 'g2', nome: 'GT teste', tipo: 'GT_TATICO', companhia_id: 'c1', area_atuacao: null, prefixos: ['1'] };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(GuarnicoesService);
    const result = await service.createGuarnicao({
      nome: 'GT teste',
      tipo: 'GT_TATICO',
      companhia_id: 'c1',
      prefixos: ['1'],
    });

    expect(result.id).toBe('g2');
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/guarnicoes.service.spec.ts'`
Expected: FAIL — `Cannot find module './guarnicoes.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/guarnicoes.service.ts`:
```typescript
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
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/guarnicoes.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Generate and implement the page**

Run: `npx ng generate component features/guarnicoes/guarnicoes-page --flat=false`

Replace `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GuarnicoesService, GuarnicaoRow, TipoGuarnicao } from '../../../core/services/guarnicoes.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';

@Component({
  selector: 'app-guarnicoes-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './guarnicoes-page.html',
  styleUrl: './guarnicoes-page.css',
})
export class GuarnicoesPage {
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly companhiasService = inject(CompanhiasService);

  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly tipos: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'];

  readonly novoNome = signal('');
  readonly novoTipo = signal<TipoGuarnicao>('GT_TATICO');
  readonly novaCompanhiaId = signal('');
  readonly novaArea = signal('');
  readonly novosPrefixos = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [guarnicoes, companhias] = await Promise.all([
        this.guarnicoesService.listGuarnicoes(),
        this.companhiasService.listCompanhias(),
      ]);
      this.guarnicoes.set(guarnicoes);
      this.companhias.set(companhias);
    } catch {
      this.errorMessage.set('Não foi possível carregar as guarnições.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const prefixos = this.novosPrefixos()
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      await this.guarnicoesService.createGuarnicao({
        nome: this.novoNome(),
        tipo: this.novoTipo(),
        companhia_id: this.novaCompanhiaId(),
        area_atuacao: this.novaArea() || null,
        prefixos: prefixos.length > 0 ? prefixos : null,
      });
      this.novoNome.set('');
      this.novaArea.set('');
      this.novosPrefixos.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a guarnição.');
    }
  }

  async onRemove(id: string): Promise<void> {
    try {
      await this.guarnicoesService.removeGuarnicao(id);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a guarnição.');
    }
  }
}
```

Replace `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Guarnições</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Nova guarnição</h2>
  <form class="grid gap-3 sm:grid-cols-3" (ngSubmit)="onCreate()">
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Nome"
      required
      [ngModel]="novoNome()"
      (ngModelChange)="novoNome.set($event)"
      name="nome"
    />
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="novoTipo()"
      (ngModelChange)="novoTipo.set($event)"
      name="tipo"
    >
      @for (tipo of tipos; track tipo) {
        <option [value]="tipo">{{ tipo }}</option>
      }
    </select>
    <select
      class="rounded border border-slate-300 px-3 py-2"
      required
      [ngModel]="novaCompanhiaId()"
      (ngModelChange)="novaCompanhiaId.set($event)"
      name="companhia"
    >
      <option value="" disabled>Companhia</option>
      @for (companhia of companhias(); track companhia.id) {
        <option [value]="companhia.id">{{ companhia.nome }}</option>
      }
    </select>
    <input
      class="rounded border border-slate-300 px-3 py-2"
      placeholder="Área de atuação"
      [ngModel]="novaArea()"
      (ngModelChange)="novaArea.set($event)"
      name="area"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
      placeholder="Prefixos (separados por vírgula)"
      [ngModel]="novosPrefixos()"
      (ngModelChange)="novosPrefixos.set($event)"
      name="prefixos"
    />
    <button class="rounded bg-blue-600 px-4 py-2 font-medium text-white sm:col-span-3" type="submit">
      Adicionar
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
          <th class="py-2">Nome</th>
          <th class="py-2">Tipo</th>
          <th class="py-2">Companhia</th>
          <th class="py-2">Prefixos</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (guarnicao of guarnicoes(); track guarnicao.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ guarnicao.nome }}</td>
            <td class="py-2 text-slate-700">{{ guarnicao.tipo }}</td>
            <td class="py-2 text-slate-700">{{ companhiaNome(guarnicao.companhia_id) }}</td>
            <td class="py-2 text-slate-700">{{ (guarnicao.prefixos ?? []).join(', ') || '—' }}</td>
            <td class="py-2 text-right">
              <button class="text-sm text-red-600" (click)="onRemove(guarnicao.id)">Remover</button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 6: Confirm the generated component spec still passes**

Run: `npm test -- --watch=false --include='**/guarnicoes-page.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/guarnicoes.service.ts src/app/core/services/guarnicoes.service.spec.ts src/app/features/guarnicoes
git commit -m "feat: add guarnicoes CRUD"
```

---

### Task 6: Escala Mensal — service e tela CRUD

**Files:**
- Create: `src/app/core/services/escala-mensal.service.ts`
- Test: `src/app/core/services/escala-mensal.service.spec.ts`
- Create: `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.ts`
- Create: `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.html`

**Interfaces:**
- Consumes: `SupabaseService.client`, `GuarnicoesService.listGuarnicoes` (Task 5), `PoliciaisService.listPoliciais` (Task 3).
- Produces: `type TipoRecorrencia`, `interface EscalaMensalRow`, `EscalaMensalService.listEscalaMensal()`, `.createEscalaMensal(input)`, `.removeEscalaMensal(id)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/escala-mensal.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { EscalaMensalService } from './escala-mensal.service';
import { SupabaseService } from './supabase.service';

describe('EscalaMensalService', () => {
  it('lists escala mensal rows', async () => {
    const rows = [
      {
        id: 'e1',
        guarnicao_id: 'g1',
        policial_matricula: '127934-3',
        funcao: 'CMT',
        horario_inicio: '06:00:00',
        horario_fim: '18:00:00',
        tipo_recorrencia: 'PARES',
        dias_especificos: null,
        vigencia_inicio: '2026-08-01',
        vigencia_fim: null,
        escala_origem: 'Escala 3ª CPM Agosto 2026',
      },
    ];
    const supabaseStub = {
      client: {
        from: () => ({
          select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(EscalaMensalService);
    const result = await service.listEscalaMensal();
    expect(result).toEqual(rows as any);
  });

  it('creates an escala mensal row via insert', async () => {
    const created = {
      id: 'e2',
      guarnicao_id: 'g1',
      policial_matricula: '127934-3',
      funcao: 'CMT',
      horario_inicio: '06:00:00',
      horario_fim: '18:00:00',
      tipo_recorrencia: 'PARES',
      dias_especificos: null,
      vigencia_inicio: '2026-08-01',
      vigencia_fim: null,
      escala_origem: null,
    };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
    });
    const supabaseStub = { client: { from: () => ({ insert: insertSpy }) } };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(EscalaMensalService);
    const result = await service.createEscalaMensal({
      guarnicao_id: 'g1',
      policial_matricula: '127934-3',
      funcao: 'CMT',
      horario_inicio: '06:00:00',
      horario_fim: '18:00:00',
      tipo_recorrencia: 'PARES',
      vigencia_inicio: '2026-08-01',
    });

    expect(result.id).toBe('e2');
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/escala-mensal.service.spec.ts'`
Expected: FAIL — `Cannot find module './escala-mensal.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/escala-mensal.service.ts`:
```typescript
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
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/escala-mensal.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Generate and implement the page**

Run: `npx ng generate component features/escala-mensal/escala-mensal-page --flat=false`

Replace `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EscalaMensalService,
  EscalaMensalRow,
  TipoRecorrencia,
} from '../../../core/services/escala-mensal.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

@Component({
  selector: 'app-escala-mensal-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './escala-mensal-page.html',
  styleUrl: './escala-mensal-page.css',
})
export class EscalaMensalPage {
  private readonly escalaMensalService = inject(EscalaMensalService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);

  readonly escalas = signal<EscalaMensalRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly funcoes: ('CMT' | 'MOT' | 'PAT')[] = ['CMT', 'MOT', 'PAT'];
  readonly tiposRecorrencia: TipoRecorrencia[] = [
    'PARES',
    'IMPARES',
    'DIAS_ESPECIFICOS',
    'SEG_A_SEX',
    'TODOS_OS_DIAS',
  ];

  readonly filtroGuarnicaoId = signal('');

  readonly novaGuarnicaoId = signal('');
  readonly novaMatricula = signal('');
  readonly novaFuncao = signal<'CMT' | 'MOT' | 'PAT'>('CMT');
  readonly novoHorarioInicio = signal('06:00');
  readonly novoHorarioFim = signal('18:00');
  readonly novoTipoRecorrencia = signal<TipoRecorrencia>('PARES');
  readonly novaVigenciaInicio = signal('');

  constructor() {
    void this.reload();
  }

  get escalasFiltradas(): EscalaMensalRow[] {
    const filtro = this.filtroGuarnicaoId();
    return filtro ? this.escalas().filter((e) => e.guarnicao_id === filtro) : this.escalas();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [escalas, guarnicoes, policiais] = await Promise.all([
        this.escalaMensalService.listEscalaMensal(),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
      ]);
      this.escalas.set(escalas);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
    } catch {
      this.errorMessage.set('Não foi possível carregar a escala mensal.');
    } finally {
      this.loading.set(false);
    }
  }

  guarnicaoNome(id: string): string {
    return this.guarnicoes().find((g) => g.id === id)?.nome ?? '—';
  }

  policialNome(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.nome_guerra ?? matricula;
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.escalaMensalService.createEscalaMensal({
        guarnicao_id: this.novaGuarnicaoId(),
        policial_matricula: this.novaMatricula(),
        funcao: this.novaFuncao(),
        horario_inicio: this.novoHorarioInicio(),
        horario_fim: this.novoHorarioFim(),
        tipo_recorrencia: this.novoTipoRecorrencia(),
        vigencia_inicio: this.novaVigenciaInicio(),
      });
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a escala.');
    }
  }

  async onRemove(id: string): Promise<void> {
    try {
      await this.escalaMensalService.removeEscalaMensal(id);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a escala.');
    }
  }
}
```

Replace `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Escala Mensal</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Nova escala</h2>
  <form class="grid gap-3 sm:grid-cols-4" (ngSubmit)="onCreate()">
    <select
      class="rounded border border-slate-300 px-3 py-2"
      required
      [ngModel]="novaGuarnicaoId()"
      (ngModelChange)="novaGuarnicaoId.set($event)"
      name="guarnicao"
    >
      <option value="" disabled>Guarnição</option>
      @for (guarnicao of guarnicoes(); track guarnicao.id) {
        <option [value]="guarnicao.id">{{ guarnicao.nome }}</option>
      }
    </select>
    <select
      class="rounded border border-slate-300 px-3 py-2"
      required
      [ngModel]="novaMatricula()"
      (ngModelChange)="novaMatricula.set($event)"
      name="policial"
    >
      <option value="" disabled>Policial</option>
      @for (policial of policiais(); track policial.matricula) {
        <option [value]="policial.matricula">{{ policial.nome_guerra }}</option>
      }
    </select>
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="novaFuncao()"
      (ngModelChange)="novaFuncao.set($event)"
      name="funcao"
    >
      @for (funcao of funcoes; track funcao) {
        <option [value]="funcao">{{ funcao }}</option>
      }
    </select>
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="novoTipoRecorrencia()"
      (ngModelChange)="novoTipoRecorrencia.set($event)"
      name="recorrencia"
    >
      @for (tipo of tiposRecorrencia; track tipo) {
        <option [value]="tipo">{{ tipo }}</option>
      }
    </select>
    <input
      class="rounded border border-slate-300 px-3 py-2"
      type="time"
      [ngModel]="novoHorarioInicio()"
      (ngModelChange)="novoHorarioInicio.set($event)"
      name="horarioInicio"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      type="time"
      [ngModel]="novoHorarioFim()"
      (ngModelChange)="novoHorarioFim.set($event)"
      name="horarioFim"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      type="date"
      required
      [ngModel]="novaVigenciaInicio()"
      (ngModelChange)="novaVigenciaInicio.set($event)"
      name="vigenciaInicio"
    />
    <button class="rounded bg-blue-600 px-4 py-2 font-medium text-white" type="submit">
      Adicionar
    </button>
  </form>
</section>

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <div class="mb-3 flex items-center gap-3">
    <h2 class="text-lg font-medium text-slate-700">Escalas cadastradas</h2>
    <select
      class="rounded border border-slate-300 px-3 py-1 text-sm"
      [ngModel]="filtroGuarnicaoId()"
      (ngModelChange)="filtroGuarnicaoId.set($event)"
      name="filtroGuarnicao"
    >
      <option value="">Todas as guarnições</option>
      @for (guarnicao of guarnicoes(); track guarnicao.id) {
        <option [value]="guarnicao.id">{{ guarnicao.nome }}</option>
      }
    </select>
  </div>
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
          <th class="py-2">Recorrência</th>
          <th class="py-2">Vigência</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (escala of escalasFiltradas; track escala.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ guarnicaoNome(escala.guarnicao_id) }}</td>
            <td class="py-2 text-slate-700">{{ policialNome(escala.policial_matricula) }}</td>
            <td class="py-2 text-slate-700">{{ escala.funcao }}</td>
            <td class="py-2 text-slate-700">{{ escala.horario_inicio }}–{{ escala.horario_fim }}</td>
            <td class="py-2 text-slate-700">{{ escala.tipo_recorrencia }}</td>
            <td class="py-2 text-slate-700">{{ escala.vigencia_inicio }}</td>
            <td class="py-2 text-right">
              <button class="text-sm text-red-600" (click)="onRemove(escala.id)">Remover</button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 6: Confirm the generated component spec still passes**

Run: `npm test -- --watch=false --include='**/escala-mensal-page.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/escala-mensal.service.ts src/app/core/services/escala-mensal.service.spec.ts src/app/features/escala-mensal
git commit -m "feat: add escala mensal CRUD"
```

---

### Task 7: Roteamento e navegação

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.html`

**Interfaces:**
- Consumes: `PoliciaisPage`, `ViaturasPage`, `GuarnicoesPage`, `EscalaMensalPage` (Tasks 3-6).

- [ ] **Step 1: Add the four routes as children of Shell**

In `src/app/app.routes.ts`, add these entries to the `children` array of the `''` route (alongside the existing `''` dashboard and `'admin'` routes), before the closing `]`:
```typescript
      {
        path: 'policiais',
        loadComponent: () =>
          import('./features/policiais/policiais-page/policiais-page').then((m) => m.PoliciaisPage),
      },
      {
        path: 'viaturas',
        loadComponent: () =>
          import('./features/viaturas/viaturas-page/viaturas-page').then((m) => m.ViaturasPage),
      },
      {
        path: 'guarnicoes',
        loadComponent: () =>
          import('./features/guarnicoes/guarnicoes-page/guarnicoes-page').then((m) => m.GuarnicoesPage),
      },
      {
        path: 'escala-mensal',
        loadComponent: () =>
          import('./features/escala-mensal/escala-mensal-page/escala-mensal-page').then(
            (m) => m.EscalaMensalPage,
          ),
      },
```

- [ ] **Step 2: Add links to the top bar**

In `src/app/layout/top-bar/top-bar.html`, insert these links right after the existing "Painel" link and before the `@if (authService.currentPerfil()...)` Admin block:
```html
    <a class="text-slate-600 hover:text-blue-600" routerLink="/policiais" routerLinkActive="text-blue-600">
      Policiais
    </a>
    <a class="text-slate-600 hover:text-blue-600" routerLink="/viaturas" routerLinkActive="text-blue-600">
      Viaturas
    </a>
    <a class="text-slate-600 hover:text-blue-600" routerLink="/guarnicoes" routerLinkActive="text-blue-600">
      Guarnições
    </a>
    <a class="text-slate-600 hover:text-blue-600" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
      Escala Mensal
    </a>
```

- [ ] **Step 3: Add links to the bottom nav**

In `src/app/layout/bottom-nav/bottom-nav.html`, insert these links right after the existing "Painel" link and before the Admin `@if` block (mobile nav stays terse — shorter labels):
```html
  <a class="text-sm text-slate-600" routerLink="/policiais" routerLinkActive="text-blue-600">
    Policiais
  </a>
  <a class="text-sm text-slate-600" routerLink="/viaturas" routerLinkActive="text-blue-600">
    Viaturas
  </a>
  <a class="text-sm text-slate-600" routerLink="/guarnicoes" routerLinkActive="text-blue-600">
    Guarnições
  </a>
  <a class="text-sm text-slate-600" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
    Escala
  </a>
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test -- --watch=false`
Expected: all specs pass.

- [ ] **Step 5: Run a full production build**

Run: `npm run build`
Expected: build succeeds, confirming all four new lazy routes resolve (look for `policiais-page`, `viaturas-page`, `guarnicoes-page`, `escala-mensal-page` lazy chunks in the output).

- [ ] **Step 6: Commit**

```bash
git add src/app/app.routes.ts src/app/layout/top-bar/top-bar.html src/app/layout/bottom-nav/bottom-nav.html
git commit -m "feat: wire up routing and navigation for master data screens"
```

---

### Task 8: Seed de dados reais — 3ª CPM (Agosto/2026)

**Files:**
- Create: `supabase/migrations/20260827020000_seed_3cpm_agosto_2026.sql`

**Interfaces:**
- Consumes: schema from Task 1, `companhias` seed from the Etapa 1 migration (`'3ª CPM'` row).
- Produces: dados reais em `policiais`, `viaturas`, `guarnicoes`, `escala_mensal` para a 3ª CPM.

Fonte: `SEI - ESCALA DE SERVIÇO - 3ª CPM - AGOSTO.pdf`, guarnições GT 16332 (Boa Vista), GT 16331 (Santo Amaro), GT 16333 (Santo Amaro), Ciclopatrulha CP16331/CP16332/CP16333 (Boa Vista). `vigencia_inicio` default `2026-08-01` (o documento não traz uma data "a contar de" explícita como os outros três); overrides individuais onde o documento anota "AC <data>".

- [ ] **Step 1: Escrever a migration de seed**

Create `supabase/migrations/20260827020000_seed_3cpm_agosto_2026.sql`:
```sql
-- Viaturas (3ª CPM, Agosto/2026)
insert into public.viaturas (prefixo, area_atuacao) values
  ('16332', 'Boa Vista'),
  ('16331', 'Santo Amaro'),
  ('16333', 'Santo Amaro'),
  ('CP16331', 'Boa Vista'),
  ('CP16332', 'Boa Vista'),
  ('CP16333', 'Boa Vista');

-- Policiais (3ª CPM, Agosto/2026)
insert into public.policiais (matricula, graduacao, nome_guerra, telefone, companhia_id) values
  ('127934-3', 'SD', 'CARLOS MATIAS', '87981025092', (select id from public.companhias where nome = '3ª CPM')),
  ('127317-5', 'SD', 'M. COSTA', '81973400284', (select id from public.companhias where nome = '3ª CPM')),
  ('129414-8', 'SD', 'ERICK', '81997233320', (select id from public.companhias where nome = '3ª CPM')),
  ('128833-4', 'SD', 'ADAILTON JR', '79998846386', (select id from public.companhias where nome = '3ª CPM')),
  ('128282-4', 'SD', 'OLIVEIRA SILVA', '81984250883', (select id from public.companhias where nome = '3ª CPM')),
  ('127993-9', 'SD', 'DAIANE', '81996579823', (select id from public.companhias where nome = '3ª CPM')),
  ('129565-9', 'SD', 'WELLISON', '991303842', (select id from public.companhias where nome = '3ª CPM')),
  ('127347-7', 'SD', 'FELIX LIMA', '81982608811', (select id from public.companhias where nome = '3ª CPM')),
  ('129500-4', 'SD', 'FELIPE PEREIRA', '81982608811', (select id from public.companhias where nome = '3ª CPM')),
  ('128072-4', 'SD', 'V. MOURA', '81997634541', (select id from public.companhias where nome = '3ª CPM')),
  ('129274-9', 'SD', 'FRANÇA', '81993332471', (select id from public.companhias where nome = '3ª CPM')),
  ('129033-9', 'SD', 'MARCOS ANDRE', '81984267700', (select id from public.companhias where nome = '3ª CPM')),
  ('128996-9', 'SD', 'TOMAZ SANTOS', '81986301974', (select id from public.companhias where nome = '3ª CPM')),
  ('127637-9', 'SD', 'DOUGLAS BATISTA', '87998240194', (select id from public.companhias where nome = '3ª CPM')),
  ('128599-8', 'SD', 'B. JUNIOR', '87991991401', (select id from public.companhias where nome = '3ª CPM')),
  ('129017-7', 'SD', 'JUAN MENDONÇA', '81996167949', (select id from public.companhias where nome = '3ª CPM')),
  ('129347-8', 'SD', 'MEDEIROS COSTA', '81973278464', (select id from public.companhias where nome = '3ª CPM')),
  ('128134-8', 'SD', 'LUIS SILVA', '87991093514', (select id from public.companhias where nome = '3ª CPM')),
  ('129556-0', 'SD', 'J. GOMES', '81995670223', (select id from public.companhias where nome = '3ª CPM')),
  ('129522-5', 'SD', 'WANGLEBSON', null, (select id from public.companhias where nome = '3ª CPM')),
  ('128870-9', 'SD', 'B. SILVA', '81983459882', (select id from public.companhias where nome = '3ª CPM')),
  ('128508-4', 'SD', 'THALYS SARAIVA', '87996491001', (select id from public.companhias where nome = '3ª CPM')),
  ('129084-3', 'SD', 'OTÁVIO SILVA', '81991666552', (select id from public.companhias where nome = '3ª CPM')),
  ('128518-1', 'SD', 'TULIO BARROS', '81995355283', (select id from public.companhias where nome = '3ª CPM')),
  ('129324-9', 'SD', 'MAURÍCIO SOBRINHO', '81995089636', (select id from public.companhias where nome = '3ª CPM')),
  ('128808-3', 'SD', 'ANDYS', '87988284345', (select id from public.companhias where nome = '3ª CPM')),
  ('128059-7', 'SD', 'TIAGO LEITE', '87988777158', (select id from public.companhias where nome = '3ª CPM')),
  ('129327-3', 'SD', 'BRENO MARTINS', '81984695330', (select id from public.companhias where nome = '3ª CPM')),
  ('128667-6', 'SD', 'MOABE', '81993275815', (select id from public.companhias where nome = '3ª CPM')),
  ('129147-5', 'SD', 'DANIELY SOUZA', '81995461412', (select id from public.companhias where nome = '3ª CPM')),
  ('128969-1', 'SD', 'AUGUSTO SANTOS', '87999464698', (select id from public.companhias where nome = '3ª CPM')),
  ('129539-0', 'SD', 'PAIXÃO', '81997125266', (select id from public.companhias where nome = '3ª CPM')),
  ('128471-1', 'SD', 'SOUZA JUNIOR', '8197913596', (select id from public.companhias where nome = '3ª CPM')),
  ('127600-0', 'SD', 'AMADOR', '82999793135', (select id from public.companhias where nome = '3ª CPM')),
  ('128320-0', 'SD', 'CARDOSO', '81986521329', (select id from public.companhias where nome = '3ª CPM')),
  ('128611-0', 'SD', 'JACKSON FERREIRA', '87991990207', (select id from public.companhias where nome = '3ª CPM'));

-- Guarnições (3ª CPM, Agosto/2026)
insert into public.guarnicoes (id, nome, tipo, companhia_id, area_atuacao, prefixos) values
  ('a0000000-0000-4000-8000-000000000001', 'GT 16332 - Boa Vista', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Boa Vista', ARRAY['16332']),
  ('a0000000-0000-4000-8000-000000000002', 'GT 16331 - Santo Amaro', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Santo Amaro', ARRAY['16331']),
  ('a0000000-0000-4000-8000-000000000003', 'GT 16333 - Santo Amaro', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Santo Amaro', ARRAY['16333']),
  ('a0000000-0000-4000-8000-000000000004', 'Ciclopatrulha 16331/16332/16333 - Boa Vista', 'CP', (select id from public.companhias where nome = '3ª CPM'), 'Boa Vista', ARRAY['CP16331', 'CP16332', 'CP16333']);

-- Escala Mensal (3ª CPM, Agosto/2026) — GT 16332
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000001', '127934-3', 'CMT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127317-5', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129414-8', 'PAT', '06:00', '18:00', 'PARES', '2026-08-20', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128833-4', 'CMT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128282-4', 'MOT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127993-9', 'CMT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129565-9', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127347-7', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129500-4', 'CMT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128072-4', 'MOT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — GT 16331
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000002', '129274-9', 'CMT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129033-9', 'MOT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128996-9', 'PAT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '127637-9', 'CMT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128599-8', 'MOT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129017-7', 'CMT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129347-8', 'MOT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128134-8', 'PAT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129556-0', 'CMT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129522-5', 'MOT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — GT 16333
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000003', '128870-9', 'CMT', '20:00', '08:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '128508-4', 'MOT', '20:00', '08:00', 'PARES', '2026-08-08', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '129084-3', 'CMT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '128518-1', 'MOT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — Ciclopatrulha 16331/16332/16333
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000004', '129324-9', 'CMT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128808-3', 'MOT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128059-7', 'PAT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129327-3', 'CMT', '15:00', '23:00', 'IMPARES', '2026-08-15', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128667-6', 'MOT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129147-5', 'PAT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128969-1', 'PAT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129539-0', 'CMT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128471-1', 'MOT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '127600-0', 'CMT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128320-0', 'MOT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128611-0', 'PAT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');
```

- [ ] **Step 2: Sanity-check row counts**

Run: `grep -c "^  ('" supabase/migrations/20260827020000_seed_3cpm_agosto_2026.sql`
Expected: a positive count matching 6 viaturas + 36 policiais + 4 guarnições + 36 escala_mensal = 82 value-tuples (the grep counts every `  ('` prefixed line, which is every row across all four inserts).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827020000_seed_3cpm_agosto_2026.sql
git commit -m "feat: seed 3ª CPM master data and monthly schedule (August 2026)"
```

---

### Task 9: Deploy e verificação ponta a ponta

**Files:** none (operational task, no new files).

**Interfaces:** consumes the deployed `fn_resolve_escala_dia` function (Task 1) to verify the whole pipeline end-to-end.

- [ ] **Step 1: Run the full local test suite one more time**

Run: `npm test -- --watch=false`
Expected: all specs pass (existing Etapa 1 specs + new ones from Tasks 2-6).

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Ask the user for a fresh Supabase access token (same flow as Etapa 1) and, once received, deploy**

```bash
export SUPABASE_ACCESS_TOKEN="<token>"
./tools/supabase.exe db push
```
Expected: both new migrations (`20260827010000_guarnicoes_escala_mensal.sql`, `20260827020000_seed_3cpm_agosto_2026.sql`) show up as applied.

- [ ] **Step 4: Verify `fn_resolve_escala_dia` against real data**

Query the deployed function for a known PARES day (e.g. 2026-08-04) via the REST API or `supabase.exe` and confirm it returns the GT 16332/16331/16333 PARES-shift rows and none of the IMPARES rows.

- [ ] **Step 5: Report completion to the user**, noting that 1ª CPM, 2ª CPM, and PCTAT data import remains for a follow-up pass.

## Self-Review Notes

- **Spec coverage:** `guarnicoes`/`escala_mensal` schema (Task 1), `fn_resolve_escala_dia` (Task 1), 4 CRUD screens (Tasks 3-6), routing/nav (Task 7), 3ª CPM data import (Task 8), deploy/verification (Task 9) — every section of the spec maps to a task.
- **Scope deviations flagged inline:** CRUD is List+Create+Delete (no Edit) — documented in Global Constraints. Data import limited to 3ª CPM this pass — documented in Global Constraints and Task 8's intro.
- **Type consistency:** `TipoGuarnicao` defined once in `guarnicoes.service.ts` (Task 5), imported by `EscalaMensalPage` — no redefinition. `TipoRecorrencia` defined once in `escala-mensal.service.ts` (Task 6). `PolicialRow`/`GuarnicaoRow`/`CompanhiaRow` each defined once in their owning service and imported elsewhere.
- **Data fidelity gap flagged:** `graduacao` for policial `128973-0 ADELINO` (2ª CPM, GT16112) was illegible in the source excerpt — moot for this plan since 2ª CPM is out of scope for Task 8, but worth remembering when that company's seed is written later.
- **Build-order dependency:** Task 7 wires routes referencing all four pages from Tasks 3-6 — must run after all four, same pattern as Etapa 1's dashboard/admin ordering.
