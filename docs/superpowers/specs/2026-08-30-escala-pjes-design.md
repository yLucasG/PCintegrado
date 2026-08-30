# Escala PJES — importação de PDF, cards de serviço extra e integração no relatório

**Data:** 2026-08-30
**Status:** aprovado (design) — usuário dispensou a revisão da spec, execução autônoma autorizada

## Contexto e objetivo

A seção de **Serviços Extras (PJES)** do batalhão monta uma escala diária de
serviço extra ("OPERAÇÃO PERNAMBUCO SEGURO" e afins) e hoje entrega isso ao
Lançamento só em PDF. O modelo é o `SSPJES AGOSTO OPS 19 à 31.pdf`: uma
página por dia, seções por GT (SUPERVISÃO / FISCALIZAÇÃO POG / 1º-2º-3º CPM /
OPERAÇÃO OCTOPUS / COMBATE AO MVI), colunas `GRAD. · MAT. · NOME DE GUERRA ·
OME · TELEFONE · HORÁRIO`, linhas `CMT / MOT / PAT` (ou `16431 / 16432` no MO).

Objetivo:

1. Criar o **perfil PJES** operacional (o `RoleUsuario` já existe) com uma
   aba própria **"Escala PJES"** onde a seção sobe o PDF (lido no navegador,
   revisado numa tabela editável, salvo depois de confirmar) **ou** lança
   manualmente (bloco por GT).
2. Essa escala aparece **automaticamente** como cards marcados
   **"PJES · Serviço Extra"** no **Painel Principal**, no **Painel do PC** e
   na seção **"PJES / DIÁRIA"** do **Relatório Original**.
3. Nos cards PJES do Painel do PC o Lançamento marca **Faltou / Atrasado**
   (mesmo gesto dos cards ordinários); isso reflete no relatório.

O roster ordinário (`escala_mensal` + `fn_resolve_escala_dia` +
`listRosterDoDia`) **não é alterado**. PJES é um caminho paralelo e
independente.

## Decisões (confirmadas com o usuário)

- **Modelo de dados:** tabela própria e independente `escala_pjes`, sem FK
  para `policiais` nem `guarnicoes` (gente do PJES frequentemente não é do
  efetivo do 16º); GT é texto livre.
- **PDF:** lido no navegador (`pdfjs-dist`), tabela de pré-visualização
  editável, nada grava sem o botão "Confirmar e salvar".
- **Cards PJES:** aparecem na grade dos painéis num bloco próprio com selo
  "PJES · Serviço Extra"; entram na contagem "ativas agora".
- **Falta:** mesmo fluxo (Faltou/Atrasado) → grava numa tabela de presença
  própria do PJES; o "Relatório Original" preenche "PJES / DIÁRIA"
  automaticamente.
- **Acesso PJES:** menu = Painel Principal + Painel do PC (só ver) + Escala
  PJES. Nada mais.
- **Formato do PDF:** o layout do `SSPJES` é fixo; o parser é feito para
  ele.
- **Entrada manual:** bloco por GT.

## Fora de escopo

- PERMUTA / CURSO / DISPENSA / etc. nos cards PJES — só FALTA e ATRASADO.
- Alimentar a seção PJES do **Relatório SEI** antigo.
- Parser tolerante a outros layouts de PDF.
- Auto-criar `policiais` a partir do PJES.
- Editar uma linha PJES já salva (fluxo é: remover + re-lançar, ou
  reimportar o dia).

---

## Seção 1 — Modelo de dados

### `escala_pjes` (migração nova)

```sql
create type public.funcao_pjes as enum ('CMT', 'MOT', 'PAT', 'OUTRO');
create type public.origem_pjes as enum ('PDF', 'MANUAL');

create table public.escala_pjes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  gt_rotulo text not null,              -- "GT 16100 - Supervisão"
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
```

### `pjes_presenca` (mesma migração)

```sql
create type public.status_pjes as enum ('PREVISTO', 'FALTA', 'ATRASADO');

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

Reimportar/relançar um dia: o app apaga as `escala_pjes` daquele `data` com
`origem = 'PDF'` (na importação) antes de inserir as novas — o
`on delete cascade` limpa a presença junto. Lançamento manual não apaga
nada; sempre adiciona.

Migração: `supabase/migrations/20260830110000_escala_pjes.sql`.

---

## Seção 2 — `PjesService` (core)

`src/app/core/services/pjes.service.ts`:

```ts
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

/** Linha PJES já no formato de card (status resolvido de pjes_presenca). */
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
```

Métodos:

- `listEscalaPjesDoDia(data): Promise<EscalaPjesRow[]>` — `select *` em
  `escala_pjes` `.eq('data', data)`, mapeado camelCase, ordenado por
  `gt_rotulo, funcao`.
- `listPjesRosterDoDia(data): Promise<PjesRosterRow[]>` — busca
  `escala_pjes` do dia + `pjes_presenca` (por `escala_pjes_id in (...)`),
  junta: cada linha vira `PjesRosterRow` com `status` da presença (ou
  `PREVISTO`).
- `inserirLinhas(linhas: NovaLinhaPjes[]): Promise<void>` — `insert` em
  lote.
- `substituirDiaImportado(data, linhas: NovaLinhaPjes[]): Promise<void>` —
  `delete` de `escala_pjes` `.eq('data', data).eq('origem','PDF')`, depois
  `insert` das novas.
- `removerLinha(id): Promise<void>` — `delete` `.eq('id', id)`.
- `registrarPresencaPjes(escalaPjesId, status: StatusPjes, opts?: { horario_chegada?: string|null; motivo?: string|null }): Promise<void>`
  — `upsert` em `pjes_presenca` com `onConflict: 'escala_pjes_id'`.
- `limparPresencaPjes(escalaPjesId): Promise<void>` — `delete`
  `.eq('escala_pjes_id', id)` (volta a `PREVISTO`).

Spec `pjes.service.spec.ts`: asserções reais (stubs de Supabase no padrão
do `lancamento.service.spec.ts`) — insert em lote, mapeamento
snake→camel, `substituirDiaImportado` chama delete+insert, `upsert` de
presença com o `onConflict` certo, junção status.

---

## Seção 3 — Parser do PDF (pura, testável)

`src/app/core/services/pjes-pdf.parser.ts` — **função pura**, sem
dependência do Angular, recebe o texto já extraído:

```ts
/** Um item de texto do pdf.js: string + posição na página. */
export interface ItemTextoPdf { str: string; x: number; y: number; page: number; }

export interface LinhaPjesExtraida {
  data: string;            // ISO "2026-08-19"
  gtRotulo: string;        // "GT 16100 - SUPERVISÃO"
  funcao: FuncaoPjes;
  graduacao: string | null;
  matricula: string | null;
  nomeGuerra: string;
  telefone: string | null;
  horarioInicio: string;   // "HH:MM"
  horarioFim: string;      // "HH:MM"
}

export function extrairEscalaPjes(itens: ItemTextoPdf[]): LinhaPjesExtraida[];
```

Algoritmo (por página):

1. **Data:** achar o item que casa `/(\d{1,2})\/(\w+)\/(\d{4})/` com mês
   por extenso pt-BR (`janeiro..dezembro`) → ISO.
2. **Linhas:** agrupar itens por `y` aproximado (tolerância ~3pt) → linhas
   visuais, ordenadas top→bottom; dentro da linha ordenar por `x`.
3. **Cabeçalho de seção GT:** uma linha cujo primeiro texto casa
   `/GT ?\d{4,5}/i` **ou** `/^MO$/i`; o texto seguinte na mesma linha (ou
   na linha imediatamente abaixo) é o rótulo ("SUPERVISÃO", "1º CPM"…).
   `gtRotulo = "<GT> - <rótulo>"` em maiúsculas.
4. **Linha de dados:** vem depois de uma linha-cabeçalho de colunas
   (`GRAD. MAT. NOME DE GUERRA ...`). O primeiro token é a função
   (`CMT|MOT|PAT` → enum; um número de 5 dígitos como `16431` → `OUTRO`,
   `funcaoLabel` vira parte do nome ou observação — manter simples:
   `OUTRO`). Depois: graduação (token curto tipo `TC`, `SD`, `CB`,
   `3º SGT`, `ASP`, `2º TEN`…), matrícula (`\d{5,6}-?\d?`), nome de guerra
   (resto até `OME`), OME ignorado, telefone (`\d{10,11}` ou vazio),
   horário.
5. **Horário:** `/(\d{1,2})h?\s*(?:às|à|as)\s*(\d{1,2})h?/i` → `HH:00`.
   `23:59 às 05:59` e `05h à 14h` etc. Se o horário estiver numa célula
   que a tabela mesclou (aparece só uma vez pro bloco), aplicar a mesma
   faixa às linhas do bloco sem horário próprio. Default se nada casar:
   `null` → a tela de revisão exige preencher.
6. Toda incerteza é resolvida na **tela de revisão** (Seção 4) — o parser
   nunca inventa; campo que não deu, vem vazio/`null`.

Testes `pjes-pdf.parser.spec.ts`: alimentar arrays de `ItemTextoPdf`
representando 2–3 blocos do modelo real (ex.: 19/ago GT 16100 CMT GRISI
16h-0h; GT 16141 1º CPM CMT MARTA 23:59-05:59) e conferir a extração.
Também um caso de horário mesclado e um de matrícula ausente.

---

## Seção 4 — Aba "Escala PJES"

Rota `escala-pjes`, `roleGuard` `data: { roles: ['PJES', 'ADMIN'] }`.
Componente `EscalaPjesPage`
(`src/app/features/escala-pjes/escala-pjes-page/`).

Serviço fino `PjesPdfService` (`src/app/core/services/pjes-pdf.service.ts`)
que só faz a ponte com `pdfjs-dist`:

```ts
async extrairItens(file: File): Promise<ItemTextoPdf[]>
```

- carrega `pdfjs-dist` (build `legacy` + `GlobalWorkerOptions.workerSrc`
  apontando para o worker empacotado); para cada página chama
  `getTextContent()` e converte `item.transform` → `{ str, x, y, page }`.
- É um wrapper isolado justamente para o `pjes-pdf.parser.ts` continuar
  puro e testável.

### Layout da página

1. **Importar PDF**
   - `<input type="file" accept="application/pdf">` → `extrairItens` →
     `extrairEscalaPjes` → preenche `linhasRevisao = signal<LinhaRevisao[]>`.
   - `LinhaRevisao` = `LinhaPjesExtraida` + `{ selecionada: boolean; erros: string[] }`.
   - **Tabela editável**: colunas Data · GT · Função (`<select>`) ·
     Graduação · Matrícula · Nome · Telefone · Início · Fim · [remover
     linha]. Toda célula é `<input>`/`<select>` com `[ngModel]`.
   - Validação por linha (mostra em vermelho, bloqueia salvar): `data`,
     `gtRotulo`, `nomeGuerra`, `horarioInicio`, `horarioFim` obrigatórios;
     horários no formato `HH:MM`.
   - Botão **"Confirmar e salvar escala"** → agrupa por `data`, e para
     cada data chama `pjesService.substituirDiaImportado(data, linhas)`.
     Aviso: "As linhas importadas de cada dia substituem as anteriores
     importadas por PDF; lançamentos manuais não são afetados."
   - Só habilitado quando não há linha com `erros`.

2. **Adicionar manual (bloco por GT)**
   - Formulário: Data · GT/Setor (texto) · Horário início/fim (aplicados a
     todas as linhas do bloco, mas editáveis por linha) · três linhas
     CMT/MOT/PAT com Graduação/Matrícula/Nome/Telefone; "+ adicionar
     linha" para `OUTRO`.
   - Botão "Adicionar à escala" → `pjesService.inserirLinhas([...])`
     (`origem: 'MANUAL'`).

3. **Escala salva**
   - Seletor de **Data** (default hoje) → `listEscalaPjesDoDia`.
   - Tabela: GT · Função · Grad · Matrícula · Nome · Horário · Origem ·
     [remover]. Remover chama `removerLinha` (com confirmação simples).

Spec do componente: smoke (`should create`).

`pdfjs-dist`: adicionar como dependência (`npm i pdfjs-dist`), versão
fixada pelo plano; usar o build `pdfjs-dist/legacy/build/pdf.mjs` +
`pdf.worker.mjs`. Se o worker não puder ser resolvido no bundle do Angular,
cair para `GlobalWorkerOptions.workerSrc` com o arquivo servido de
`assets/` (o plano decide na Task).

---

## Seção 5 — PJES nas 3 telas

Nenhuma mexe em `listRosterDoDia`. Cada tela busca o PJES à parte e
renderiza um bloco separado.

### `PjesRosterRow` → card

Agrupamento: por `gtRotulo + horarioInicio` (mesma ideia do roster). Um
card PJES = `{ chave, gtRotulo, horario, rows: PjesRosterRow[] }`.

Selo visual: etiqueta "PJES · SERVIÇO EXTRA" no topo do bloco e um badge
`bg-fuchsia-*` em cada card PJES (cor ainda não usada no app), borda
esquerda própria.

### Painel Principal (`dashboard-page`)

- `pjesRoster = signal<PjesRosterRow[]>([])`, carregado no `reload()`.
- Novo bloco abaixo da grade ordinária: "PJES · Serviço Extra" com os
  cards PJES (GT, horário, efetivo, status).
- **Contagem "ativas agora" / totais:** os cards PJES ativos no
  `filtroMomento` (via `turnoAtivoEm(horarioInicio, horarioFim, momento)`)
  somam em `totalAtivas` e `totalLancados`. Faltas PJES somam no card de
  "Faltas" do dashboard (contagem por `status`).
- Um `PjesRosterRow` não tem `guarnicaoId`; a lógica de bairro/área
  ignora PJES (não há área). Documentar.

### Painel do PC (`painel-pc-page`)

- `pjesRoster = signal<PjesRosterRow[]>([])` no `reloadRoster()` (ou um
  `reloadPjes()` chamado junto).
- Bloco "PJES · Serviço Extra" com os cards PJES, **depois** da grade
  ordinária.
- Em cada linha PJES: botões **Faltou** / **Atrasado** (só
  `podeEditar()`), espelhando `toggleFalta`/`toggleAtraso`:
  - `togglePjesFalta(row)`: se `row.status === 'FALTA'` →
    `limparPresencaPjes(row.escalaPjesId)`, senão
    `registrarPresencaPjes(row.escalaPjesId, 'FALTA')`. `reloadPjes()`.
  - `togglePjesAtraso(row)`: idem com `'ATRASADO'` (sem modal de horário
    nesta fase — só marca; motivo/horário ficam para a edição manual
    futura). Registrar `status: 'ATRASADO'`.
  - guard `if (!this.podeEditar()) return;`.
- Filtro por horário/momento também filtra os cards PJES.
- PJES (perfil) continua sem poder editar (o `podeEditar()` só é true para
  `PC_LANCAMENTO`).

Specs de componente: continuam smoke.

---

## Seção 6 — Relatório Original: seção "PJES / DIÁRIA"

`src/app/core/services/relatorio-alteracoes.service.ts` +
`relatorio-original-page.ts`.

- `RelatorioAlteracoesInput` ganha `pjes: PjesRosterRow[]`.
- `relatorio-original-page.ts` `reload()` passa a buscar
  `pjesService.listPjesRosterDoDia(data)` (mais um item no `Promise.all`)
  e a incluir em `montarInput()`.
- `montarRelatorioAlteracoesHtml`: a seção **"PJES / DIÁRIA"** (hoje
  `tabela(['TOTAL DE LANÇAMENTOS','','SERVIÇO EM GERAL',''], [['','','','']])`
  — quadro vazio) passa a renderizar:

  Quando `input.pjes.length > 0`: uma tabela
  `GT · FUNÇÃO · GRAD · MATRÍCULA · NOME · HORÁRIO · SITUAÇÃO`
  com uma linha por `PjesRosterRow`; SITUAÇÃO = `PRESENTE` /
  `FALTOU` / `ATRASADO` conforme `status`. Ordenado por `gtRotulo,
  funcao`.

  Quando vazio: mantém o quadro pré-montado atual (labels
  `PJES_TOTAL_ALT`/`PJES_SERVICO_ALT`) para preenchimento manual no SEI.

- Testes em `relatorio-alteracoes.service.spec.ts`: com `pjes` populado, a
  seção lista GT/matrícula/nome e marca `FALTOU` para um `status: 'FALTA'`;
  com `pjes: []`, cai no quadro pré-montado (assert `GS'S EXTRA` ainda
  aparece).

---

## Seção 7 — RBAC / navegação

- `app.routes.ts`: rota `escala-pjes` → `EscalaPjesPage`,
  `canActivate: [roleGuard]`, `data: { roles: ['PJES', 'ADMIN'] }`.
- `top-bar.ts` / `bottom-nav.ts`: `PERFIS_COM_ACESSO_ESCALA_PJES =
  ['PJES', 'ADMIN']`, helper `podeVerEscalaPjes()`.
- `top-bar.html` / `bottom-nav.html`: link "Escala PJES" sob
  `@if (podeVerEscalaPjes())`.
- **Perfil PJES vê no menu apenas:** Painel (`/`, sem guard — ok), Painel
  do PC (`/lancamento`, sem guard — ok, e `podeEditar()` já o mantém
  só-leitura), Escala PJES. Os demais links (`podeVerPoliciais()`,
  `podeGerenciarEscalas()`, `podeGerarRelatorioSei()`, Admin) já não
  incluem `PJES` — conferir e, se algum incluir, remover.
- `role.guard` já manda quem não tem acesso para `/` — nenhum ajuste.

---

## Seção 8 — Testes / build

- `pjes.service.spec.ts` — asserções reais (novo).
- `pjes-pdf.parser.spec.ts` — asserções reais sobre a função pura (novo).
- `relatorio-alteracoes.service.spec.ts` — 2 casos novos (PJES populado /
  vazio).
- `escala-pjes-page.spec.ts`, alterações nos specs de `dashboard-page` /
  `painel-pc-page` — smoke (`should create`), ajustando só stubs se o
  `tsc` exigir.
- `npx tsc --noEmit -p tsconfig.app.json` limpo; `npx ng test
  --watch=false` verde.
- Migração deployada pelo fluxo sem Docker (`db push`), memória
  `supabase-no-docker.md`.

## Plano de implementação (fases)

- **F1 — dados + serviço:** migração `escala_pjes`/`pjes_presenca`;
  `PjesService` + spec.
- **F2 — parser:** `pjes-pdf.parser.ts` puro + spec; `PjesPdfService`
  wrapper de `pdfjs-dist`.
- **F3 — aba Escala PJES:** `EscalaPjesPage` (importar / manual / salvas)
  + rota + nav + guard.
- **F4 — painéis:** bloco PJES no `dashboard-page` e no `painel-pc-page`
  (com Faltou/Atrasado).
- **F5 — relatório:** seção "PJES / DIÁRIA" automática + testes.
