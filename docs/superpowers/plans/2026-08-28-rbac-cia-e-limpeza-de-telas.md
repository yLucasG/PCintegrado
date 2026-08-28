# RBAC por CIA e limpeza de telas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restringir a Escala Mensal à companhia do perfil, deixar o Painel do PC só-leitura para todos exceto `PC_LANCAMENTO`, transformar a página Policiais num diretório só-leitura com busca/filtro/colunas de guarnição, e extinguir as telas Viaturas e Guarnições.

**Architecture:** RBAC continua 100% client-side (guards de rota + `@if` no template + guardas nos métodos de mutação); RLS do Postgres permanece permissivo. A companhia do perfil é derivada do `role` por uma função pura `companhiaDoRole`. Nenhuma migração de schema.

**Tech Stack:** Angular 21 standalone components, Vitest, Supabase (só leitura de dados existentes). Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-08-28-rbac-cia-e-limpeza-de-telas-design.md`

## Global Constraints

- Sem migração de banco. RLS fica como está (`using (true)` para `authenticated`).
- `perfis_usuarios` **não** ganha coluna — companhia vem do `role`.
- Mapa fixo: `CIA_1→'1ª CPM'`, `CIA_2→'2ª CPM'`, `CIA_3→'3ª CPM'`, `PCTAT→'PCTAT'`, `PJES→'PJES'`, `ADMIN→null`, `PC_LANCAMENTO→null` (null = sem restrição de companhia).
- Painel do PC: **só `PC_LANCAMENTO` edita**. Todos os outros perfis, inclusive `ADMIN`, são só-leitura ali.
- Nomes de companhia usados no código são exatamente os do banco: `1ª CPM`, `2ª CPM`, `3ª CPM`, `PCTAT`, `PJES` (com "ª").
- Rotas de acesso inalteradas: `/escala-mensal` = `['ADMIN','CIA_1','CIA_2','CIA_3','PCTAT']`; `/policiais` = `['ADMIN','CIA_1','CIA_2','CIA_3','PCTAT','PJES']`; `/lancamento` sem `roleGuard`.
- Convenção de testes do repo: specs de componente são smoke tests (`should create`); asserções de verdade ficam em specs de serviço / funções puras.

---

### Task 1: Helper `companhiaDoRole`

**Files:**
- Modify: `src/app/core/services/auth.service.ts`
- Modify: `src/app/core/services/auth.service.spec.ts`

**Interfaces:**
- Produces: `export function companhiaDoRole(role: RoleUsuario): string | null` — consumido pelas Tasks 4 e 5.

- [x] **Step 1: Escrever o teste**

Adicionar ao fim de `src/app/core/services/auth.service.spec.ts` (antes já importa de `./auth.service`):

```typescript
import { companhiaDoRole } from './auth.service';

describe('companhiaDoRole', () => {
  it('mapeia cada role de CIA para a companhia correspondente', () => {
    expect(companhiaDoRole('CIA_1')).toBe('1ª CPM');
    expect(companhiaDoRole('CIA_2')).toBe('2ª CPM');
    expect(companhiaDoRole('CIA_3')).toBe('3ª CPM');
    expect(companhiaDoRole('PCTAT')).toBe('PCTAT');
    expect(companhiaDoRole('PJES')).toBe('PJES');
  });

  it('retorna null para perfis sem restrição de companhia', () => {
    expect(companhiaDoRole('ADMIN')).toBeNull();
    expect(companhiaDoRole('PC_LANCAMENTO')).toBeNull();
  });
});
```

(Ajustar o `import` do topo do arquivo para incluir `companhiaDoRole` junto de `AuthService`, em vez de adicionar uma segunda linha de import.)

- [x] **Step 2: Rodar e ver falhar**

Run: `npm test -- --watch=false --include='**/auth.service.spec.ts'`
Expected: FAIL — `companhiaDoRole is not exported`.

- [x] **Step 3: Implementar**

Em `src/app/core/services/auth.service.ts`, logo após a definição de `RoleUsuario` (linha ~13):

```typescript
/** Companhia à qual o perfil está restrito, ou null quando vê tudo. */
export function companhiaDoRole(role: RoleUsuario): string | null {
  switch (role) {
    case 'CIA_1':
      return '1ª CPM';
    case 'CIA_2':
      return '2ª CPM';
    case 'CIA_3':
      return '3ª CPM';
    case 'PCTAT':
      return 'PCTAT';
    case 'PJES':
      return 'PJES';
    default:
      return null;
  }
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npm test -- --watch=false --include='**/auth.service.spec.ts'`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/auth.service.spec.ts
git commit -m "feat: add companhiaDoRole helper"
```

---

### Task 2: Extinguir as telas Viaturas e Guarnições

**Files:**
- Delete: `src/app/features/viaturas/` (todo o diretório)
- Delete: `src/app/features/guarnicoes/` (todo o diretório)
- Delete: `src/app/core/services/viaturas.service.ts`, `src/app/core/services/viaturas.service.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/top-bar/top-bar.html`
- Modify: `src/app/layout/bottom-nav/bottom-nav.html`

**Interfaces:**
- Nada produzido. `GuarnicoesService` permanece (usado por Painel do PC, Policiais, Relatório SEI).

- [x] **Step 1: Apagar os arquivos**

```bash
git rm -r src/app/features/viaturas src/app/features/guarnicoes
git rm src/app/core/services/viaturas.service.ts src/app/core/services/viaturas.service.spec.ts
```

- [x] **Step 2: Remover as rotas**

Em `src/app/app.routes.ts`, apagar os dois blocos de objeto de rota:
```typescript
      {
        path: 'viaturas',
        loadComponent: () =>
          import('./features/viaturas/viaturas-page/viaturas-page').then((m) => m.ViaturasPage),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'] },
      },
```
e
```typescript
      {
        path: 'guarnicoes',
        loadComponent: () =>
          import('./features/guarnicoes/guarnicoes-page/guarnicoes-page').then((m) => m.GuarnicoesPage),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT'] },
      },
```
(As rotas `/viaturas` e `/guarnicoes` passam a cair no `{ path: '**', redirectTo: '' }`.)

- [x] **Step 3: Remover os links do menu superior**

Em `src/app/layout/top-bar/top-bar.html`, substituir:
```html
    @if (podeGerenciarEscalas()) {
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/viaturas" routerLinkActive="text-blue-600">
        Viaturas
      </a>
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/guarnicoes" routerLinkActive="text-blue-600">
        Guarnições
      </a>
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
        Escala Mensal
      </a>
    }
```
por:
```html
    @if (podeGerenciarEscalas()) {
      <a class="text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
        Escala Mensal
      </a>
    }
```

- [x] **Step 4: Remover os links do menu inferior**

Em `src/app/layout/bottom-nav/bottom-nav.html`, substituir:
```html
  @if (podeGerenciarEscalas()) {
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/viaturas" routerLinkActive="text-blue-600">
      Viaturas
    </a>
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/guarnicoes" routerLinkActive="text-blue-600">
      Guarnições
    </a>
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
      Escala
    </a>
  }
```
por:
```html
  @if (podeGerenciarEscalas()) {
    <a class="shrink-0 text-sm text-slate-600 dark:text-slate-300" routerLink="/escala-mensal" routerLinkActive="text-blue-600">
      Escala
    </a>
  }
```

- [x] **Step 5: Rodar suíte e build**

Run: `npm test -- --watch=false`
Expected: PASS (2 specs a menos: `viaturas-page`, `guarnicoes-page`, `viaturas.service`). Se algum arquivo ainda importar `ViaturasService` ou os componentes apagados, corrigir o import.

Run: `npm run build`
Expected: sucesso.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove Viaturas and Guarnicoes screens"
```

---

### Task 3: Painel do PC só-leitura (exceto PC_LANCAMENTO)

**Files:**
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.spec.ts`

**Interfaces:**
- Consumes: `AuthService.currentPerfil` (já disponível via `inject`).
- Produces: `PainelPcPage.podeEditar(): boolean`.

- [x] **Step 1: Escrever o teste**

Substituir `src/app/features/painel-pc/painel-pc-page/painel-pc-page.spec.ts` por:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PainelPcPage } from './painel-pc-page';
import { AuthService } from '../../../core/services/auth.service';

describe('PainelPcPage', () => {
  let fixture: ComponentFixture<PainelPcPage>;

  function build(role: string | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PainelPcPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentPerfil: role ? { id: 'u', role } : null } },
      ],
    });
    fixture = TestBed.createComponent(PainelPcPage);
    return fixture.componentInstance;
  }

  it('should create', () => {
    expect(build('PC_LANCAMENTO')).toBeTruthy();
  });

  it('podeEditar() só é true para PC_LANCAMENTO', () => {
    expect(build('PC_LANCAMENTO').podeEditar()).toBe(true);
    expect(build('ADMIN').podeEditar()).toBe(false);
    expect(build('CIA_3').podeEditar()).toBe(false);
    expect(build(null).podeEditar()).toBe(false);
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: FAIL — `podeEditar is not a function` (e/ou o provider stub de `AuthService` derruba a criação atual).

- [x] **Step 3: Adicionar o getter e as guardas de método**

Em `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`:

3a. Importar e injetar `AuthService`:
```typescript
import { AuthService } from '../../../core/services/auth.service';
```
e no corpo da classe, junto dos outros `inject`:
```typescript
  private readonly authService = inject(AuthService);
```

3b. Adicionar o getter logo após os `inject`:
```typescript
  podeEditar(): boolean {
    return this.authService.currentPerfil?.role === 'PC_LANCAMENTO';
  }
```

3c. Guardar TODA função de mutação com um early-return. No começo de cada um destes métodos, adicionar `if (!this.podeEditar()) return;` (para os `async`, `return;` basta):
`abrirNovaViatura`, `abrirModal`, `abrirOs`, `toggleBaixa`, `toggleFalta`, `toggleAtraso`, `toggleRemanejamento`, `toggleLicenca`, `onDrop`, `onCriarFuncaoFixa`, `onRemoverFuncaoFixa`, `onRegistrarModal` (ou equivalente que salva o lançamento do modal), `onSalvarOs`, `onSalvarBaixa`, `onSalvarNovaViatura` (ou o nome real do submit da nova viatura).

Verificar os nomes exatos com:
Run: `grep -nE "^  (async )?(abrir|toggle|onDrop|onCriar|onRemover|onSalvar|onRegistrar|fechar)" src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
Guardar todos os que **mudam estado** (os `fechar*` e `abrir*` de modais podem ser guardados também sem prejuízo; os `fechar*` podem ficar de fora).

- [x] **Step 4: Esconder os controles de edição no template**

Em `src/app/features/painel-pc/painel-pc-page/painel-pc-page.html`:

4a. Botão "+ Nova viatura" — envolver:
```html
    @if (podeEditar()) {
      <button
        type="button"
        class="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white dark:bg-blue-500"
        (click)="abrirNovaViatura()"
      >
        + Nova viatura
      </button>
    }
```

4b. Faixa de aviso — logo após o fechamento da `<section>` de filtros (antes de `<section class="mt-6">`):
```html
  @if (!podeEditar()) {
    <p class="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Somente leitura — apenas o PC de Lançamento edita este painel.
    </p>
  }
```

4c. Drag-and-drop — no `<div cdkDropList ...>` trocar:
```html
              [cdkDropListDisabled]="isBaixada(card)"
```
por
```html
              [cdkDropListDisabled]="isBaixada(card) || !podeEditar()"
```
e no `<div cdkDrag ...>` adicionar o atributo:
```html
                    [cdkDragDisabled]="!podeEditar()"
```
e trocar a classe `cursor-move` por `[ngClass]="podeEditar() ? 'cursor-move' : ''"` no mesmo elemento (a classe base `cursor-move` está numa string `class="..."`; remover `cursor-move` de lá e adicionar o `[ngClass]`).

4d. OS pill (`(click)="abrirOs(card)"`) — envolver o `<button>` inteiro em `@if (podeEditar()) { ... } @else { <span ...>{{ osDoCard(card)?.numeroOs || 'OS' }}</span> }`, com o `<span>` usando as mesmas classes de badge sem o `(click)`.

4e. Botão do cabeçalho do card (`(click)="toggleBaixa(card)"`) — deixar como está; `toggleBaixa` já tem a guarda do Step 3c (clique vira no-op). Sem mudança de template aqui.

4f. Botão do nome do policial (`(click)="abrirModal(linha)"`) — deixar como está; `abrirModal` guardado.

4g. Botões de ação por linha (Falta / Atraso / Desfazer remanejamento / Desfazer LTS/DTS) — envolver os blocos `@if (linha.statusEfetivo === ...) { <div ...> <button ...> } ` num `@if (podeEditar())` externo. Ou seja, cada um dos três blocos:
```html
                    @if (podeEditar() && (linha.statusEfetivo === 'PREVISTO' || linha.statusEfetivo === 'FALTA' || linha.statusEfetivo === 'ATRASADO')) {
                      ... (botões Falta/Atraso)
                    }
                    @if (podeEditar() && linha.statusEfetivo === 'REMANEJADO') { ... }
                    @if (podeEditar() && linha.statusEfetivo === 'LICENCA') { ... }
```

4h. Seção "Funções fixas do dia": envolver o `<form class="mb-4 grid ...">` inteiro em `@if (podeEditar()) { ... }`; e o botão `✕` (`(click)="onRemoverFuncaoFixa(f.id)"`) em `@if (podeEditar()) { ... }`.

- [x] **Step 5: Rodar e ver passar**

Run: `npm test -- --watch=false --include='**/painel-pc-page.spec.ts'`
Expected: PASS.

- [x] **Step 6: Suíte e build**

Run: `npm test -- --watch=false`
Expected: PASS.
Run: `npm run build`
Expected: sucesso.

- [x] **Step 7: Commit**

```bash
git add src/app/features/painel-pc/painel-pc-page/
git commit -m "feat: Painel do PC read-only except for PC_LANCAMENTO"
```

---

### Task 4: Escala Mensal restrita à companhia do perfil

**Files:**
- Modify: `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.ts`
- Modify: `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.html`

**Interfaces:**
- Consumes: `companhiaDoRole` (Task 1), `AuthService.currentPerfil`, `CompanhiasService.listCompanhias`.

- [x] **Step 1: Ajustar o componente**

Em `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.ts`:

1a. Imports:
```typescript
import { AuthService, companhiaDoRole } from '../../../core/services/auth.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
```
Injetar:
```typescript
  private readonly authService = inject(AuthService);
  private readonly companhiasService = inject(CompanhiasService);
```

1b. Novo signal e carregamento:
```typescript
  readonly companhias = signal<CompanhiaRow[]>([]);
```
No `reload()`, incluir `this.companhiasService.listCompanhias()` no `Promise.all` e `this.companhias.set(...)`.

1c. Companhia do perfil + mapa guarnição→companhiaId:
```typescript
  get companhiaDoPerfil(): string | null {
    const role = this.authService.currentPerfil?.role;
    return role ? companhiaDoRole(role) : null;
  }

  private get companhiaIdDoPerfil(): string | null {
    const nome = this.companhiaDoPerfil;
    return nome ? (this.companhias().find((c) => c.nome === nome)?.id ?? null) : null;
  }

  /** Guarnições visíveis: todas (ADMIN) ou só as da companhia do perfil. */
  get guarnicoesVisiveis(): GuarnicaoRow[] {
    const cid = this.companhiaIdDoPerfil;
    return cid ? this.guarnicoes().filter((g) => g.companhia_id === cid) : this.guarnicoes();
  }
```

1d. `escalasFiltradas` — restringir também por companhia:
```typescript
  get escalasFiltradas(): EscalaMensalRow[] {
    const idsVisiveis = new Set(this.guarnicoesVisiveis.map((g) => g.id));
    const filtro = this.filtroGuarnicaoId();
    return this.escalas().filter(
      (e) => idsVisiveis.has(e.guarnicao_id) && (!filtro || e.guarnicao_id === filtro),
    );
  }
```

- [x] **Step 2: Ajustar o template**

Em `src/app/features/escala-mensal/escala-mensal-page/escala-mensal-page.html`, nos dois `@for` que iteram guarnições (o `<select name="guarnicao">` da Nova escala e o `<select name="filtroGuarnicao">` do filtro), trocar `guarnicoes()` por `guarnicoesVisiveis`:
```html
      @for (guarnicao of guarnicoesVisiveis; track guarnicao.id) {
```
(dois lugares — linhas ~18 e ~92).

- [x] **Step 3: Suíte e build**

Run: `npm test -- --watch=false`
Expected: PASS (o smoke test do componente continua; injeção nova de `AuthService`/`CompanhiasService` usa os providedIn-root reais, que já funcionam nos outros specs).
Run: `npm run build`
Expected: sucesso.

- [x] **Step 4: Commit**

```bash
git add src/app/features/escala-mensal/escala-mensal-page/
git commit -m "feat: scope Escala Mensal to the profile's companhia"
```

---

### Task 5: Página Policiais — diretório só-leitura

**Files:**
- Modify: `src/app/features/policiais/policiais-page/policiais-page.ts`
- Modify: `src/app/features/policiais/policiais-page/policiais-page.html`

**Interfaces:**
- Consumes: `companhiaDoRole` (Task 1), `EscalaMensalService.listEscalaMensal`, `GuarnicoesService.listGuarnicoes`, `CompanhiasService.listCompanhias`.

- [x] **Step 1: Reescrever o componente**

Substituir `src/app/features/policiais/policiais-page/policiais-page.ts` por:

```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { GuarnicoesService } from '../../../core/services/guarnicoes.service';
import {
  EscalaMensalService,
  EscalaMensalRow,
  TipoRecorrencia,
} from '../../../core/services/escala-mensal.service';
import { AuthService, companhiaDoRole } from '../../../core/services/auth.service';

const RECORRENCIA_LABEL: Record<TipoRecorrencia, string> = {
  PARES: 'Pares',
  IMPARES: 'Ímpares',
  DIAS_ESPECIFICOS: 'Dias específicos',
  SEG_A_SEX: 'Seg–Sex',
  TODOS_OS_DIAS: 'Todos os dias',
};

interface EscalaResumo {
  guarnicao: string;
  escala: string;
}

@Component({
  selector: 'app-policiais-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './policiais-page.html',
  styleUrl: './policiais-page.css',
})
export class PoliciaisPage {
  private readonly policiaisService = inject(PoliciaisService);
  private readonly companhiasService = inject(CompanhiasService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly escalaMensalService = inject(EscalaMensalService);
  private readonly authService = inject(AuthService);

  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly escalaPorMatricula = signal<Map<string, EscalaResumo[]>>(new Map());
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly busca = signal('');
  readonly filtroCompanhiaId = signal('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [policiais, companhias, guarnicoes, escala] = await Promise.all([
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
        this.guarnicoesService.listGuarnicoes(),
        this.escalaMensalService.listEscalaMensal(),
      ]);
      this.policiais.set(policiais);
      this.companhias.set(companhias);

      const nomePorGuarnicao = new Map(guarnicoes.map((g) => [g.id, g.nome]));
      const mapa = new Map<string, EscalaResumo[]>();
      for (const linha of escala as EscalaMensalRow[]) {
        const lista = mapa.get(linha.policial_matricula) ?? [];
        lista.push({
          guarnicao: nomePorGuarnicao.get(linha.guarnicao_id) ?? '—',
          escala: `${RECORRENCIA_LABEL[linha.tipo_recorrencia]} · ${linha.horario_inicio.slice(0, 5)}–${linha.horario_fim.slice(0, 5)}`,
        });
        mapa.set(linha.policial_matricula, lista);
      }
      this.escalaPorMatricula.set(mapa);

      // Filtro inicia na companhia do próprio perfil, quando houver.
      const role = this.authService.currentPerfil?.role;
      const nomeCia = role ? companhiaDoRole(role) : null;
      if (nomeCia) {
        const cid = companhias.find((c) => c.nome === nomeCia)?.id;
        if (cid) this.filtroCompanhiaId.set(cid);
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar os policiais.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string | null): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  guarnicaoDe(matricula: string): string {
    const lista = this.escalaPorMatricula().get(matricula) ?? [];
    return lista.length ? lista.map((e) => e.guarnicao).join(' / ') : '—';
  }

  escalaDe(matricula: string): string {
    const lista = this.escalaPorMatricula().get(matricula) ?? [];
    return lista.length ? lista.map((e) => e.escala).join(' / ') : '—';
  }

  get policiaisFiltrados(): PolicialRow[] {
    const busca = this.busca().trim().toLowerCase();
    const cia = this.filtroCompanhiaId();
    return this.policiais().filter((p) => {
      if (cia === '__sem__') {
        if (p.companhia_id) return false;
      } else if (cia && p.companhia_id !== cia) {
        return false;
      }
      if (!busca) return true;
      return (
        p.nome_guerra.toLowerCase().includes(busca) || p.matricula.toLowerCase().includes(busca)
      );
    });
  }
}
```

- [x] **Step 2: Reescrever o template**

Substituir `src/app/features/policiais/policiais-page/policiais-page.html` por:

```html
<h1 class="font-display text-2xl font-semibold text-slate-800 dark:text-slate-100">Policiais</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
}

<section class="mt-6 flex flex-wrap items-center gap-3">
  <input
    class="min-w-[16rem] flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    placeholder="Buscar por nome ou matrícula"
    [ngModel]="busca()"
    (ngModelChange)="busca.set($event)"
    name="busca"
  />
  <select
    class="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    [ngModel]="filtroCompanhiaId()"
    (ngModelChange)="filtroCompanhiaId.set($event)"
    name="filtroCompanhia"
  >
    <option value="">Todas as companhias</option>
    @for (companhia of companhias(); track companhia.id) {
      <option [value]="companhia.id">{{ companhia.nome }}</option>
    }
    <option value="__sem__">Sem companhia</option>
  </select>
</section>

<section class="mt-6 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800">
  @if (loading()) {
    <p class="text-slate-500 dark:text-slate-400">Carregando...</p>
  } @else {
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th class="py-2 pr-3">Matrícula</th>
            <th class="py-2 pr-3">Grad.</th>
            <th class="py-2 pr-3">Nome de guerra</th>
            <th class="py-2 pr-3">Telefone</th>
            <th class="py-2 pr-3">Companhia</th>
            <th class="py-2 pr-3">Guarnição</th>
            <th class="py-2">Escala</th>
          </tr>
        </thead>
        <tbody>
          @for (policial of policiaisFiltrados; track policial.matricula) {
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ policial.matricula }}</td>
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ policial.graduacao }}</td>
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ policial.nome_guerra }}</td>
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ policial.telefone ?? '—' }}</td>
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ companhiaNome(policial.companhia_id) }}</td>
              <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">{{ guarnicaoDe(policial.matricula) }}</td>
              <td class="py-2 text-slate-700 dark:text-slate-200">{{ escalaDe(policial.matricula) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="py-4 text-center text-slate-400 dark:text-slate-500">Nenhum policial encontrado.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
```

- [x] **Step 3: Suíte e build**

Run: `npm test -- --watch=false`
Expected: PASS (o smoke test `should create` do `policiais-page` continua válido).
Run: `npm run build`
Expected: sucesso.

- [x] **Step 4: Commit**

```bash
git add src/app/features/policiais/policiais-page/
git commit -m "feat: Policiais as a read-only directory with search, companhia filter and escala columns"
```

---

### Task 6: Verificação e deploy

**Files:** nenhum (a não ser ajustes pontuais).

- [x] **Step 1: Suíte completa e build**

Run: `npm test -- --watch=false`
Expected: todos os specs passam.
Run: `npm run build`
Expected: sucesso.

- [ ] **Step 2: Conferência manual (`npm start`)** _(pendente — a cargo do usuário, no deploy da Vercel)_

- Logar como **CIA_3**: menu sem Viaturas/Guarnições; Escala Mensal só com guarnições da 3ª CPM (Nova escala + filtro + tabela); Painel do PC com a faixa "Somente leitura", sem "+ Nova viatura", sem arrastar, cliques nos cards/linhas sem efeito, Funções fixas sem formulário; Policiais sem Adicionar/Remover, filtro iniciando em "3ª CPM", busca funcionando, colunas Guarnição e Escala preenchidas.
- Logar como **PC_LANCAMENTO**: Painel do PC com todos os controles de edição, sem a faixa de aviso.
- Logar como **ADMIN**: Escala Mensal com todas as companhias; Painel do PC só-leitura (com a faixa); Policiais sem Adicionar/Remover.
- Navegar direto para `/viaturas` → redireciona para `/`.

- [x] **Step 3: Push**

```bash
git push origin main
```

- [x] **Step 4: Deploy**

O deploy do front-end é automático na Vercel a partir do push na `main` (`pc-integrado.vercel.app`). Sem migração de banco nesta fase. Confirmar que o build da Vercel passou.

## Self-Review

- **Cobertura da spec:** Seção A → Task 1; Seção B → Task 2; Seção C → Task 3; Seção D → Task 4; Seção E → Task 5; verificação → Task 6. Todas as seções mapeadas.
- **Placeholders:** o Step 3c/3d da Task 3 pede um `grep` para confirmar os nomes exatos dos métodos de mutação do Painel do PC antes de guardá-los — necessário porque o arquivo tem ~770 linhas e não foi transcrito inteiro aqui; os nomes candidatos estão listados.
- **Consistência de tipos:** `companhiaDoRole` retorna `string | null` e é consumida assim nas Tasks 4 e 5; `RECORRENCIA_LABEL` cobre todos os valores de `TipoRecorrencia` (`PARES`, `IMPARES`, `DIAS_ESPECIFICOS`, `SEG_A_SEX`, `TODOS_OS_DIAS`). Nomes de companhia (`'1ª CPM'` etc.) idênticos aos do banco e do seed.
- **Risco:** a Task 3 é a mais extensa em template. As guardas de método (Step 3c) são a rede de segurança — mesmo que algum controle escape do `@if` no template, a mutação não acontece. O smoke test + conferência manual (Task 6 Step 2) fecham a verificação de UI.
- **Ordem:** Task 1 é pré-requisito de 4 e 5. Task 2 é independente. Task 3 é independente. 4 e 5 dependem de 1. Executar 1 → 2 → 3 → 4 → 5 → 6.
