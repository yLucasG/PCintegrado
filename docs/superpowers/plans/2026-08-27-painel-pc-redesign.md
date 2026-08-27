# Painel do PC Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark theme system, redesign the Painel do PC as a "mission control" card board (one card per guarnição, drag-and-drop remanejamento, inline falta/atrasado actions, filter by shift horário instead of a guarnição dropdown), and add the missing ATRASADO deviation type.

**Architecture:** A `ThemeService` toggles a `.dark` class on `<html>` (Tailwind v4 `@custom-variant dark`), persisted to `localStorage`. A new `lancamento_atrasos` table mirrors the existing four deviation tables. `LancamentoService` gains `ATRASADO` as a fifth status and a `registrarAtraso` method. `PainelPcPage` groups the flat roster into per-guarnição card view-models and uses `@angular/cdk` drag-and-drop to let a user drag an officer row from one card to another, which calls `registrarRemanejamento` with the target card's name as `destino`.

**Tech Stack:** Same as before (Angular 21, Vitest, Supabase, Tailwind v4) plus `@angular/cdk` (new dependency, official Angular team package, used only for `DragDropModule`). Google Fonts (Chakra Petch, Inter) loaded via `<link>` in `index.html`.

**Spec:** `docs/superpowers/specs/2026-08-27-painel-pc-redesign-design.md`

## Global Constraints

- Only the Shell (top bar / bottom nav) and Painel do PC get the new dark-capable styling this pass. Policiais/Viaturas/Guarnições/Escala Mensal/Login/Admin keep their current light-only appearance — explicitly out of scope, noted in the spec.
- Status semantic colors (Tailwind palette, each with a `dark:` pair): PREVISTO=emerald, FALTA=red, ATRASADO=orange, SUBSTITUIDO=amber, FOLGA=blue, REMANEJADO=violet.
- Theme preference is `'light' | 'dark' | 'system'`, persisted under the `pcintegrado-theme` localStorage key, defaulting to `'system'`.
- No new dependency beyond `@angular/cdk` (drag-and-drop) — no icon library, no custom CSS variable token layer (using Tailwind's built-in palette with `dark:` variants directly, per the spec's rationale).
- Drag-and-drop reload strategy: on drop, call the service then `reloadRoster()` — no optimistic local array mutation. A brief visual snap-back until the reload completes is an accepted tradeoff for this pass.
- Component-level interaction tests for drag-and-drop are out of scope (hard to test meaningfully without a heavy CDK test harness) — verified manually via build + the existing "should create" spec, consistent with how other presentational components in this project are tested.

---

### Task 1: Schema — `lancamento_atrasos`

**Files:**
- Create: `supabase/migrations/20260827040000_lancamento_atrasos.sql`

**Interfaces:**
- Produces: `public.lancamento_atrasos`, reusing `public.fn_set_criado_por_lancamento()` from the previous migration — consumed by `LancamentoService` (Task 2).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260827040000_lancamento_atrasos.sql`:
```sql
create table public.lancamento_atrasos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_chegada time,
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_atrasos_criado_por
before insert on public.lancamento_atrasos
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_atrasos enable row level security;

create policy "authenticated_select_lancamento_atrasos" on public.lancamento_atrasos
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_atrasos" on public.lancamento_atrasos
  for insert to authenticated with check (true);
```

- [ ] **Step 2: Structural sanity check**

Run: `grep -c "^create table" supabase/migrations/20260827040000_lancamento_atrasos.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827040000_lancamento_atrasos.sql
git commit -m "feat: add lancamento_atrasos table"
```

---

### Task 2: `LancamentoService` — suporte a ATRASADO

**Files:**
- Modify: `src/app/core/services/lancamento.service.ts`
- Modify: `src/app/core/services/lancamento.service.spec.ts`

**Interfaces:**
- Produces: `StatusEfetivo` gains `'ATRASADO'`; `RegistrarAtrasoInput`; `LancamentoService.registrarAtraso(input)` — consumed by `PainelPcPage` (Task 4).

- [ ] **Step 1: Add the failing tests**

In `src/app/core/services/lancamento.service.spec.ts`, add these two `it` blocks inside the existing `describe('LancamentoService', ...)`, right after the "marks a policial as SUBSTITUIDO..." test:
```typescript
  it('marks a policial as ATRASADO when a matching lancamento_atrasos row exists', async () => {
    const supabaseStub = buildSupabaseStub({
      lancamento_faltas: [],
      lancamento_atrasos: [{ policial_matricula: '127934-3', motivo: 'Trânsito' }],
      lancamento_permutas: [],
      lancamento_folgas: [],
      lancamento_remanejamentos: [],
    });

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(LancamentoService);
    const result = await service.listRosterDoDia('2026-08-04');

    expect(result[0].statusEfetivo).toBe('ATRASADO');
    expect(result[0].detalhe).toBe('Trânsito');
  });
```
And, after the "registers a falta via insert..." test:
```typescript
  it('registers an atraso via insert on lancamento_atrasos', async () => {
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
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ policial_matricula: '127934-3', horario_chegada: '07:15' }),
    );
  });
```

- [ ] **Step 2: Confirm the new tests fail**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: FAIL — `service.registrarAtraso is not a function`, and the ATRASADO test resolves to `PREVISTO` instead of `ATRASADO`.

- [ ] **Step 3: Implement**

In `src/app/core/services/lancamento.service.ts`:

Change the `StatusEfetivo` type:
```typescript
export type StatusEfetivo = 'PREVISTO' | 'FALTA' | 'ATRASADO' | 'SUBSTITUIDO' | 'FOLGA' | 'REMANEJADO';
```

Add a new input interface, right after `RegistrarFaltaInput`:
```typescript
export interface RegistrarAtrasoInput {
  data: string;
  policial_matricula: string;
  escala_mensal_id?: string | null;
  horario_chegada?: string | null;
  motivo?: string | null;
}
```

In `listRosterDoDia`, add a sixth parallel query (right after the `lancamento_faltas` one) and thread it through:
```typescript
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
```

And in the `roster.map(...)` block, insert the ATRASADO check right after the FALTA check:
```typescript
      const falta = faltas.find((f) => f.policial_matricula === row.policial_matricula);
      if (falta) {
        return { ...base, statusEfetivo: 'FALTA', detalhe: falta.motivo };
      }

      const atraso = atrasos.find((a) => a.policial_matricula === row.policial_matricula);
      if (atraso) {
        return { ...base, statusEfetivo: 'ATRASADO', detalhe: atraso.motivo };
      }

      const permuta = permutas.find((p) => p.policial_substituido_matricula === row.policial_matricula);
```
(leave the rest of the `if` chain — SUBSTITUIDO, FOLGA, REMANEJADO, default PREVISTO — unchanged).

Add the `registrarAtraso` method, right after `registrarFalta`:
```typescript
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
```

- [ ] **Step 4: Confirm all tests pass**

Run: `npm test -- --watch=false --include='**/lancamento.service.spec.ts'`
Expected: PASS (9 specs — the original 7 plus the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/lancamento.service.ts src/app/core/services/lancamento.service.spec.ts
git commit -m "feat: add ATRASADO status to LancamentoService"
```

---

### Task 3: Sistema de tema claro/escuro

**Files:**
- Modify: `src/styles.css`
- Modify: `src/index.html`
- Create: `src/app/core/services/theme.service.ts`
- Test: `src/app/core/services/theme.service.spec.ts`
- Create: `src/app/layout/theme-toggle/theme-toggle.ts`
- Create: `src/app/layout/theme-toggle/theme-toggle.html`
- Modify: `src/app/layout/top-bar/top-bar.ts`, `top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.ts`, `bottom-nav.html`

**Interfaces:**
- Produces: `type ThemePreference = 'light' | 'dark' | 'system'`, `ThemeService.preference: Signal<ThemePreference>`, `ThemeService.setPreference(p)` — consumed by `ThemeToggle` (this task) and, indirectly, by every `dark:`-styled template going forward (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/services/theme.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('applies the dark class when preference is dark', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class when preference is light', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    service.setPreference('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the preference to localStorage', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    expect(localStorage.getItem('pcintegrado-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npm test -- --watch=false --include='**/theme.service.spec.ts'`
Expected: FAIL — `Cannot find module './theme.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/theme.service.ts`:
```typescript
import { Injectable, effect, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pcintegrado-theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g. private mode) — fall back to system
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readStoredPreference());

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', () => {
          if (this.preference() === 'system') {
            this.applyTheme();
          }
        });
      } catch {
        // matchMedia not fully supported here — system preference just won't auto-update
      }
    }

    effect(() => {
      this.preference();
      this.applyTheme();
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
  }

  private applyTheme(): void {
    const preference = this.preference();
    const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npm test -- --watch=false --include='**/theme.service.spec.ts'`
Expected: PASS (3 specs).

- [ ] **Step 5: Wire Tailwind's `dark:` variant to the `.dark` class**

Read the current `src/styles.css`, then replace it with:
```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-display: "Chakra Petch", sans-serif;
  --font-sans: "Inter", sans-serif;
}

html,
body {
  height: 100%;
  margin: 0;
}

body {
  font-family: var(--font-sans);
}
```

- [ ] **Step 6: Load the two Google Fonts**

Read `src/index.html`, then add these lines inside `<head>`, right before the closing `</head>` tag:
```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 7: Build to confirm the CSS/font changes don't break anything**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Generate and implement the theme toggle component**

Run: `npx ng generate component layout/theme-toggle --flat=false`

Replace `src/app/layout/theme-toggle/theme-toggle.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { ThemeService, ThemePreference } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.css',
})
export class ThemeToggle {
  readonly themeService = inject(ThemeService);

  select(preference: ThemePreference): void {
    this.themeService.setPreference(preference);
  }
}
```

Replace `src/app/layout/theme-toggle/theme-toggle.html`:
```html
<div class="flex items-center gap-1 rounded-full border border-slate-300 p-1 dark:border-slate-700">
  <button
    type="button"
    class="rounded-full p-1.5"
    [ngClass]="{ 'bg-slate-200 dark:bg-slate-700': themeService.preference() === 'light' }"
    (click)="select('light')"
    aria-label="Tema claro"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  </button>
  <button
    type="button"
    class="rounded-full p-1.5"
    [ngClass]="{ 'bg-slate-200 dark:bg-slate-700': themeService.preference() === 'system' }"
    (click)="select('system')"
    aria-label="Tema do sistema"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  </button>
  <button
    type="button"
    class="rounded-full p-1.5"
    [ngClass]="{ 'bg-slate-200 dark:bg-slate-700': themeService.preference() === 'dark' }"
    (click)="select('dark')"
    aria-label="Tema escuro"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  </button>
</div>
```

**Note:** `[ngClass]` requires `NgClass`. Since the component template only uses `[ngClass]` and no other `CommonModule` features, import `NgClass` directly from `@angular/common` in `theme-toggle.ts`'s `@Component` decorator (`imports: [NgClass]`) rather than the whole `CommonModule` — add that import to the `theme-toggle.ts` shown above.

- [ ] **Step 9: Confirm the generated component spec still passes**

Run: `npm test -- --watch=false --include='**/theme-toggle.spec.ts'`
Expected: PASS.

- [ ] **Step 10: Wire the toggle into TopBar and BottomNav**

In `src/app/layout/top-bar/top-bar.ts`, add `ThemeToggle` to the `imports` array (alongside `CommonModule`, `RouterLink`, `RouterLinkActive`) and import it from `'../theme-toggle/theme-toggle'`.

In `src/app/layout/top-bar/top-bar.html`, add `<app-theme-toggle />` right before the closing `</nav>` tag (after the "Sair" button).

In `src/app/layout/bottom-nav/bottom-nav.ts`, add `ThemeToggle` to the `imports` array similarly.

In `src/app/layout/bottom-nav/bottom-nav.html`, add `<app-theme-toggle />` right before the closing `</nav>` tag.

- [ ] **Step 11: Run the full test suite and build**

Run: `npm test -- --watch=false`
Expected: all specs pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/styles.css src/index.html src/app/core/services/theme.service.ts src/app/core/services/theme.service.spec.ts src/app/layout/theme-toggle src/app/layout/top-bar src/app/layout/bottom-nav
git commit -m "feat: add light/dark theme system with toggle"
```

---

### Task 4: Painel do PC — quadro de cards com drag-and-drop

**Files:**
- Modify: `package.json` / `package-lock.json` (via `npm install @angular/cdk`)
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.css`

**Interfaces:**
- Consumes: `LancamentoService.registrarAtraso` (Task 2), `ThemeService`-driven `dark:` classes (Task 3).
- Produces: the redesigned `PainelPcPage` — no external interface changes (still routed at `/lancamento`).

- [ ] **Step 1: Install Angular CDK**

Run: `npm install @angular/cdk`

- [ ] **Step 2: Replace the component logic**

Replace `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { LancamentoService, RosterRow, StatusEfetivo } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';

type TipoLancamento = 'FALTA' | 'ATRASADO' | 'PERMUTA' | 'FOLGA' | 'REMANEJAMENTO';

interface CardGuarnicao {
  guarnicaoId: string;
  nome: string;
  areaAtuacao: string | null;
  horario: string;
  rows: RosterRow[];
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE_CLASSES: Record<StatusEfetivo, string> = {
  PREVISTO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  FALTA: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  ATRASADO: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SUBSTITUIDO: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  FOLGA: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  REMANEJADO: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
};

@Component({
  selector: 'app-painel-pc-page',
  imports: [CommonModule, FormsModule, CdkDropList, CdkDrag],
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

  readonly filtroHorario = signal('');
  readonly buscaPolicial = signal('');

  readonly tiposLancamento: TipoLancamento[] = ['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO'];
  readonly tipoLancamento = signal<TipoLancamento>('FALTA');
  readonly formPolicialMatricula = signal('');
  readonly formSubstitutoMatricula = signal('');
  readonly formMotivo = signal('');
  readonly formSeiNumero = signal('');
  readonly formAutorizacao = signal('');
  readonly formDestino = signal('');
  readonly formHorarioChegada = signal('');
  readonly registrando = signal(false);

  constructor() {
    void this.carregarListasBase();
    void this.reloadRoster();
  }

  get horariosDisponiveis(): string[] {
    const horarios = new Set(this.roster().map((r) => r.horarioInicio));
    return Array.from(horarios).sort();
  }

  get rosterFiltrado(): RosterRow[] {
    let rows = this.roster();
    const horario = this.filtroHorario();
    if (horario) {
      rows = rows.filter((r) => r.horarioInicio === horario);
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

  get cards(): CardGuarnicao[] {
    const grupos = new Map<string, CardGuarnicao>();
    for (const row of this.rosterFiltrado) {
      const existente = grupos.get(row.guarnicaoId);
      if (existente) {
        existente.rows.push(row);
      } else {
        grupos.set(row.guarnicaoId, {
          guarnicaoId: row.guarnicaoId,
          nome: this.guarnicaoNome(row.guarnicaoId),
          areaAtuacao: this.guarnicaoAreaAtuacao(row.guarnicaoId),
          horario: `${row.horarioInicio}–${row.horarioFim}`,
          rows: [row],
        });
      }
    }
    return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  get dropListIds(): string[] {
    return this.cards.map((c) => c.guarnicaoId);
  }

  statusBadgeClasses(status: StatusEfetivo): string {
    return STATUS_BADGE_CLASSES[status];
  }

  corBordaCard(card: CardGuarnicao): string {
    const temProblema = card.rows.some((r) => r.statusEfetivo !== 'PREVISTO');
    return temProblema
      ? 'border-l-red-500 dark:border-l-red-400'
      : 'border-l-emerald-500 dark:border-l-emerald-400';
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

  guarnicaoAreaAtuacao(id: string): string | null {
    return this.guarnicoes().find((g) => g.id === id)?.area_atuacao ?? null;
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
    this.formHorarioChegada.set('');
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
        case 'ATRASADO':
          await this.lancamentoService.registrarAtraso({
            data,
            policial_matricula: this.formPolicialMatricula(),
            horario_chegada: this.formHorarioChegada() || null,
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

  async marcarFaltaRapido(row: RosterRow): Promise<void> {
    try {
      await this.lancamentoService.registrarFalta({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível marcar falta.');
    }
  }

  async marcarAtrasoRapido(row: RosterRow): Promise<void> {
    try {
      await this.lancamentoService.registrarAtraso({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível marcar atraso.');
    }
  }

  async onDrop(event: CdkDragDrop<RosterRow[], RosterRow[], RosterRow>): Promise<void> {
    if (event.previousContainer === event.container) {
      return;
    }
    const row = event.item.data;
    const destinoGuarnicaoId = event.container.id;
    const destinoNome = this.guarnicaoNome(destinoGuarnicaoId);
    try {
      await this.lancamentoService.registrarRemanejamento({
        data: this.data(),
        policial_matricula: row.policialMatricula,
        escala_mensal_id: row.escalaMensalId,
        destino: destinoNome,
      });
      await this.reloadRoster();
    } catch {
      this.errorMessage.set('Não foi possível remanejar.');
    }
  }
}
```

- [ ] **Step 3: Replace the template**

Replace `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`:
```html
<div>
  <h1 class="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">Painel do PC</h1>

  @if (errorMessage()) {
    <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
  }

  <section
    class="mt-6 flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800"
  >
    <label class="text-sm text-slate-600 dark:text-slate-300">
      Data
      <input
        class="ml-2 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        type="date"
        [ngModel]="data()"
        (ngModelChange)="onDataChange($event)"
        name="data"
      />
    </label>

    <div class="flex flex-wrap items-center gap-1 rounded-full border border-slate-300 p-1 dark:border-slate-700">
      <button
        type="button"
        class="rounded-full px-3 py-1 text-sm"
        [ngClass]="{ 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900': filtroHorario() === '' }"
        (click)="filtroHorario.set('')"
      >
        Todos
      </button>
      @for (horario of horariosDisponiveis; track horario) {
        <button
          type="button"
          class="rounded-full px-3 py-1 text-sm"
          [ngClass]="{
            'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900': filtroHorario() === horario,
          }"
          (click)="filtroHorario.set(horario)"
        >
          {{ horario.slice(0, 5) }}
        </button>
      }
    </div>

    <input
      class="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      placeholder="Buscar policial (nome ou matrícula)"
      [ngModel]="buscaPolicial()"
      (ngModelChange)="buscaPolicial.set($event)"
      name="buscaPolicial"
    />
  </section>

  <section
    class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800"
  >
    <h2 class="mb-3 font-display text-lg font-medium text-slate-700 dark:text-slate-200">Registrar alteração</h2>
    <form class="grid gap-3 sm:grid-cols-4" (ngSubmit)="onRegistrar()">
      <select
        class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        [ngModel]="tipoLancamento()"
        (ngModelChange)="tipoLancamento.set($event)"
        name="tipoLancamento"
      >
        @for (tipo of tiposLancamento; track tipo) {
          <option [value]="tipo">{{ tipo }}</option>
        }
      </select>
      <select
        class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="SEI Nº"
          [ngModel]="formSeiNumero()"
          (ngModelChange)="formSeiNumero.set($event)"
          name="formSei"
        />
      }

      @if (tipoLancamento() === 'FALTA') {
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 sm:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Motivo"
          [ngModel]="formMotivo()"
          (ngModelChange)="formMotivo.set($event)"
          name="formMotivo"
        />
      }

      @if (tipoLancamento() === 'ATRASADO') {
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          type="time"
          [ngModel]="formHorarioChegada()"
          (ngModelChange)="formHorarioChegada.set($event)"
          name="formHorarioChegada"
        />
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Motivo"
          [ngModel]="formMotivo()"
          (ngModelChange)="formMotivo.set($event)"
          name="formMotivoAtraso"
        />
      }

      @if (tipoLancamento() === 'FOLGA') {
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="SEI Nº"
          [ngModel]="formSeiNumero()"
          (ngModelChange)="formSeiNumero.set($event)"
          name="formSeiFolga"
        />
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Autorização"
          [ngModel]="formAutorizacao()"
          (ngModelChange)="formAutorizacao.set($event)"
          name="formAutorizacao"
        />
      }

      @if (tipoLancamento() === 'REMANEJAMENTO') {
        <input
          class="rounded border border-slate-300 bg-white px-3 py-2 sm:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Destino"
          required
          [ngModel]="formDestino()"
          (ngModelChange)="formDestino.set($event)"
          name="formDestino"
        />
      }

      <button
        class="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50 sm:col-span-4 dark:bg-blue-500"
        type="submit"
        [disabled]="registrando()"
      >
        Registrar
      </button>
    </form>
  </section>

  <section class="mt-6">
    @if (loading()) {
      <p class="text-slate-500 dark:text-slate-400">Carregando...</p>
    } @else {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (card of cards; track card.guarnicaoId) {
          <div
            class="flex flex-col rounded-lg border-l-4 bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800"
            [ngClass]="corBordaCard(card)"
          >
            <div class="mb-3">
              <h3 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">{{ card.nome }}</h3>
              @if (card.areaAtuacao) {
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ card.areaAtuacao }}</p>
              }
            </div>

            <div
              cdkDropList
              [id]="card.guarnicaoId"
              [cdkDropListData]="card.rows"
              [cdkDropListConnectedTo]="dropListIds"
              (cdkDropListDropped)="onDrop($event)"
              class="flex min-h-12 flex-1 flex-col gap-2"
            >
              @for (linha of card.rows; track linha.policialMatricula) {
                <div
                  cdkDrag
                  [cdkDragData]="linha"
                  class="flex cursor-move items-center justify-between gap-2 rounded border border-slate-200 px-2 py-2 text-sm dark:border-slate-700"
                >
                  <div class="flex items-center gap-2">
                    @if (linha.funcao === 'CMT') {
                      <span
                        class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                      >
                        CMT
                      </span>
                    } @else {
                      <span
                        class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {{ linha.funcao }}
                      </span>
                    }
                    <span class="text-slate-700 dark:text-slate-200">{{
                      policialNome(linha.policialMatricula)
                    }}</span>
                  </div>

                  <div class="flex items-center gap-1">
                    <span
                      class="rounded px-2 py-0.5 text-xs font-medium"
                      [ngClass]="statusBadgeClasses(linha.statusEfetivo)"
                    >
                      {{ linha.statusEfetivo }}
                    </span>

                    @if (linha.statusEfetivo === 'PREVISTO') {
                      <button
                        type="button"
                        class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                        title="Marcar falta"
                        (click)="marcarFaltaRapido(linha)"
                      >
                        Falta
                      </button>
                      <button
                        type="button"
                        class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/30"
                        title="Marcar atrasado"
                        (click)="marcarAtrasoRapido(linha)"
                      >
                        Atraso
                      </button>
                    }
                  </div>
                </div>
              }
            </div>

            <p
              class="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
            >
              {{ card.horario }}
            </p>
          </div>
        }
      </div>
    }
  </section>
</div>
```

- [ ] **Step 4: Add drag-preview styling**

Replace `src/app/features/painel-pc/painel-pc-page/painel-pc-page.css`:
```css
.cdk-drag-preview {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
  border-radius: 0.25rem;
}

.cdk-drag-placeholder {
  opacity: 0.4;
}

.cdk-drop-list-dragging .cdk-drag {
  transition: transform 200ms ease;
}
```

- [ ] **Step 5: Confirm the existing component spec still passes**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/features/painel-pc
git commit -m "feat: redesign Painel do PC as a drag-and-drop card board"
```

---

### Task 5: Verificação final

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --watch=false`
Expected: all specs pass (Etapa 1 + Sub-projeto 1 + Sub-projeto 2 + this task's new specs).

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds, `painel-pc-page` and `theme-toggle` chunks present.

- [ ] **Step 3: Commit and push**

```bash
git push
```

---

### Task 6: Deploy e verificação ponta a ponta

**Files:** none.

- [ ] **Step 1: Deploy the migration**

```bash
export SUPABASE_ACCESS_TOKEN="<token — reuse the existing one if still valid>"
./tools/supabase.exe db push
```
Expected: `20260827040000_lancamento_atrasos.sql` shows up as applied.

- [ ] **Step 2: Verify ATRASADO end-to-end against real 3ª CPM data**

Same pattern as the previous verification passes: log in as the seeded ADMIN, resolve the roster for a known day, insert a test row into `lancamento_atrasos` for one of the real `policial_matricula` values, confirm it's queryable, then delete it to keep the seed data clean.

- [ ] **Step 3: Report completion to the user**, noting the SEI report generator and the reskin of the other CRUD screens remain for follow-ups, and that they should try the theme toggle and drag-and-drop themselves in the browser since this plan's automated checks can't visually verify the design.

## Self-Review Notes

- **Spec coverage:** theming system (Task 3), card board + drag-and-drop + horário filter (Task 4), ATRASADO status (Tasks 1-2) — every section of the spec maps to a task.
- **Type consistency:** `StatusEfetivo` extended in one place (`lancamento.service.ts`), consumed by `PainelPcPage`'s `STATUS_BADGE_CLASSES` record — TypeScript will error at compile time if a case is missed, which is a deliberate safety net for future status additions.
- **Manual verification required:** this plan explicitly cannot verify visual design quality or drag-and-drop UX through automated tests — Task 6 Step 3 tells the executor to flag this to the user rather than claim the design is confirmed correct.
- **Build-order dependency:** Task 4 depends on Task 2 (`registrarAtraso`) and Task 3 (`dark:` variant support, `ThemeService` not directly but the CSS wiring) both being in place first — reflected in the task order.
