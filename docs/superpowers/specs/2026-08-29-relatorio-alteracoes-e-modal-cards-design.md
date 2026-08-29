# Relatório de Alterações do Serviço + alterações do efetivo pelos cards

**Data:** 2026-08-29
**Status:** aprovado (design) — aguardando revisão da spec

## Contexto e objetivo

A aba **Relatório SEI** que existe hoje gera o *RELATÓRIO DE LANÇAMENTO*
(o modelo `RelatórioFinalLançamento.pdf`). O PC de Lançamento, porém,
usa no dia a dia um documento diferente — o **RELATÓRIO DE ALTERAÇÕES DO
SERVIÇO** (`SEI - RELATÓRIO ORDINÁRIO_AGOSTO2026.pdf`). Este documento
descreve as alterações do efetivo do dia (permutas, cursos, dispensas,
faltas, LTS, ausências...), os totais do serviço ordinário, as O.S.
cumpridas e alguns quadros fixos (PJES/Diária, substituição de
patrimônios de viaturas).

Hoje esse relatório é montado à mão. O objetivo é:

1. Registrar as alterações do efetivo **pelos cards** do Painel do PC,
   de forma visual, ao longo do dia.
2. Gerar automaticamente, numa **aba nova ("Relatório Original")**, o
   RELATÓRIO DE ALTERAÇÕES DO SERVIÇO daquele dia, já preenchido a
   partir dos cards, com campos editáveis na própria página.
3. Não mexer na aba **Relatório SEI** atual — ela continua como está.

Naming confirmado com o usuário:
- **"Relatório Original"** = a aba nova, o modelo do PDF de agosto/2026
  (é o que o PC usa hoje de verdade).
- **"Relatório SEI"** = a aba que já existe no app (o *RELATÓRIO DE
  LANÇAMENTO*). Permanece intocada.

## Fora de escopo (fases futuras, decisão explícita do usuário)

- **Perfil P3** que envia Ordens de Serviço e define os dias, para que
  as O.S. apareçam pré-preenchidas para o Lançamento e as GTs que
  cumprem cada O.S. sejam atribuídas pelos cards (uma GT pode cumprir
  mais de uma O.S. no mesmo dia). Nesta fase a lista de O.S. é uma
  **lista fixa** (hardcoded) das O.S. permanentes do PDF.
- Auto-preenchimento das seções **POG a pé / Ciclopatrulha / PBS** e da
  **substituição de patrimônios de viaturas** — ficam como tabelas
  pré-montadas (vazias ou com a lista fixa do PDF), editáveis no SEI
  após colar.
- Quadros **PJES / DIÁRIA** — tabelas pré-montadas vazias.
- Qualquer mudança na aba **Relatório SEI** atual.

---

## Seção 1 — Modelo de dados

### Nova tabela `lancamento_alteracoes`

Uma tabela única para todas as alterações do efetivo do dia. As tabelas
atuais (`lancamento_faltas`, `lancamento_atrasos`, `lancamento_permutas`,
`lancamento_folgas`, `lancamento_remanejamentos`, `lancamento_licencas`)
**permanecem** — elas alimentam a aba *Relatório SEI*.

```sql
create type public.tipo_alteracao as enum (
  'PERMUTA',
  'CURSO',
  'DISPENSA',
  'EXPEDIENTE',
  'FOLGA',
  'FALTA_LTS',       -- FALTA (LTS) / LTS-DTS
  'AUSENCIA_SERVICO' -- falta sem amparo
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

- `guarnicao_id` = o "SETOR" do policial (deriva o prefixo GT/MO/CP/…
  para a coluna SETOR do relatório). Preenchido automaticamente a
  partir do card ao registrar pelo Painel.
- `escala_mensal_id` = linha da escala que originou a alteração
  (mesmo padrão das outras tabelas de lançamento).
- `horario_inicio` / `horario_fim` = herdados da escala do dia;
  usados para saber turno (diurno/noturno) e para a coluna de horário.
- `processo_sei` e `observacao` são opcionais para todos os tipos.

### Novos campos em `relatorio_sei_complementos`

`relatorio_sei_complementos` é `(data, campo, conteudo)`. Reaproveitamos
para os campos editáveis do novo relatório, com `campo` novos (não
colidem com os atuais `PJES_DIARIA`/`FISCALIZACAO`/`POG`/`DIRESP`/
`OBSERVACOES`):

| `campo` | uso |
|---|---|
| `ALT_GRAD_MONITORAMENTO` | nome do graduado de monitoramento (cabeçalho + assinatura) |
| `ALT_ESCALA_1CIA` | nº SEI da escala mensal da 1ª Cia |
| `ALT_ESCALA_2CIA` | nº SEI da escala mensal da 2ª Cia |
| `ALT_ESCALA_3CIA` | nº SEI da escala mensal da 3ª Cia |
| `ALT_ESCALA_PJES` | nº SEI da escala PJES |
| `ALT_OBSERVACOES` | observações livres do relatório de alterações |

Nenhuma migração de schema para isso — só uso de novas chaves. (A
migração da Seção 1 é só a tabela + o enum.)

**Migração:** `supabase/migrations/20260829120000_lancamento_alteracoes.sql`.

---

## Seção 2 — `LancamentoService`: API de alterações

Novos tipos e métodos em `src/app/core/services/lancamento.service.ts`:

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

- `listAlteracoesDoDia(data): Promise<AlteracaoRow[]>`
- `registrarAlteracao(input): Promise<void>`
- `removerAlteracao(id): Promise<void>`

Segue exatamente o padrão dos métodos `registrar*`/`remover*` já
existentes (insert/delete, `throw error`).

### Merge no roster (`listRosterDoDia`)

`listRosterDoDia` passa a buscar também `lancamento_alteracoes` do dia
(mais um item no `Promise.all`) e a considerá-las no `.map` de
resolução de status.

Novos valores de `StatusEfetivo`:

```ts
export type StatusEfetivo =
  | 'PREVISTO' | 'FALTA' | 'ATRASADO' | 'SUBSTITUIDO'
  | 'FOLGA' | 'REMANEJADO' | 'LICENCA'
  | 'CURSO' | 'DISPENSA' | 'EXPEDIENTE' | 'AUSENCIA';   // novos
```

Mapa tipo de alteração → status no card:

| `tipo` | `statusEfetivo` | detalhe exibido |
|---|---|---|
| `PERMUTA` | `SUBSTITUIDO` | "Substituído por «nome do substituto»" |
| `CURSO` | `CURSO` | `observacao` (ex. "CFSD") |
| `DISPENSA` | `DISPENSA` | `observacao` (ex. "AUTORIZADO PELA CIA") |
| `EXPEDIENTE` | `EXPEDIENTE` | `observacao` |
| `FOLGA` | `FOLGA` | `observacao` |
| `FALTA_LTS` | `LICENCA` | `observacao` (reusa o badge LTS/DTS) |
| `AUSENCIA_SERVICO` | `AUSENCIA` | `observacao` |

**Precedência:** licença (tabela antiga) > alterações novas > falta >
atraso > permuta antiga > folga antiga > remanejamento antigo >
PREVISTO. Como o Painel novo grava só em `lancamento_alteracoes` e as
tabelas antigas passam a ser alimentadas apenas pela aba *Relatório
SEI*, na prática não há conflito; a ordem só define o desempate.

### PERMUTA: o substituto entra no card

Quando há uma alteração `PERMUTA` para uma linha do roster:
1. A linha do substituído fica com status `SUBSTITUIDO` (como hoje).
2. Uma **linha sintética nova** é adicionada ao roster para o
   substituto, na mesma guarnição/função/horário, com um status
   `PREVISTO` e um marcador `isSubstituto: true` + `detalhe:
   "Substituindo «matrícula do substituído»"`.

`RosterRow` ganha o campo opcional `substituindoMatricula?: string | null`
para o template renderizar o rótulo "Substituindo". O card mostra as
duas linhas.

---

## Seção 3 — Painel do PC: modal dos cards

Arquivo: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts`
(+ `.html`).

O modal atual (`modalRow`) tem um seletor `tipoLancamento` com
`['FALTA', 'ATRASADO', 'PERMUTA', 'FOLGA', 'REMANEJAMENTO', 'LICENCA']`
e um `switch` em `onRegistrarModal()`.

### Novo conjunto de tipos no modal

```ts
type TipoLancamento =
  | 'ATRASADO' | 'REMANEJAMENTO'            // continuam, gravam nas tabelas antigas
  | 'PERMUTA' | 'CURSO' | 'DISPENSA'
  | 'EXPEDIENTE' | 'FOLGA' | 'FALTA_LTS'
  | 'AUSENCIA_SERVICO';                     // gravam em lancamento_alteracoes
```

Removidos da lista do modal: `FALTA` e `LICENCA` "puras" (a falta sem
amparo vira `AUSENCIA_SERVICO`; a LTS vira `FALTA_LTS`). Os botões
rápidos `toggleFalta`/`toggleAtraso` e o drag-drop de remanejamento
continuam funcionando como hoje (gravam nas tabelas antigas — servem à
aba *Relatório SEI*).

### Campos por tipo

| Tipo | Campos no modal |
|---|---|
| `PERMUTA` | **substituto** — `<select>` de policiais (obrigatório) · **processo SEI** (opcional) |
| `CURSO` / `DISPENSA` / `EXPEDIENTE` / `FOLGA` / `FALTA_LTS` / `AUSENCIA_SERVICO` | **processo SEI** (opcional) · **observação** (texto livre, opcional) |
| `ATRASADO` | horário de chegada · motivo · SEI (como hoje) |
| `REMANEJAMENTO` | destino (como hoje) |

Reaproveita os signals de formulário já existentes onde der
(`formSubstitutoMatricula`, `formSeiNumero`, `formHorarioChegada`,
`formMotivo`, `formDestino`); adiciona `formObservacao` e
`formProcessoSei` (separa do `formSeiNumero` do atraso para não
confundir).

### `onRegistrarModal()`

`switch (this.tipoLancamento())`:
- `ATRASADO` → `registrarAtraso(...)` (inalterado)
- `REMANEJAMENTO` → `registrarRemanejamento(...)` (inalterado)
- os demais → `registrarAlteracao({ data, tipo, policial_matricula,
  policial_substituto_matricula, guarnicao_id: modalRow.guarnicaoId,
  escala_mensal_id: modalRow.escalaMensalId, horario_inicio/fim da
  escala, processo_sei, observacao })`

Depois de salvar: `reload()` (recarrega roster, que já vem com o
substituto na PERMUTA). Guarda de RBAC `if (!this.podeEditar()) return;`
mantida.

### Card: exibição

- `STATUS_BADGE_CLASSES` e `STATUS_LABELS` ganham entradas para
  `CURSO` / `DISPENSA` / `EXPEDIENTE` / `AUSENCIA` (cores no padrão
  atual — ex. `CURSO` indigo, `DISPENSA` teal, `EXPEDIENTE` cyan,
  `AUSENCIA` rose).
- Linha do substituto: badge "Substituindo" + nome; a linha do
  substituído mostra "Substituído por …".
- Botão de remover a alteração (só `podeEditar()`), chamando
  `removerAlteracao(row.detalheId)`.

---

## Seção 4 — Aba nova "Relatório Original"

### Rota e navegação

- `src/app/app.routes.ts`: nova rota `relatorio-original` com
  `roleGuard` e `data: { roles: ['PC_LANCAMENTO', 'ADMIN'] }` (mesmo
  conjunto da rota `relatorio-sei`).
- `src/app/layout/top-bar/top-bar.ts` + `.html` e
  `bottom-nav.ts` + `.html`: link "Relatório Original", visível sob a
  mesma condição de `podeGerarRelatorioSei()` (renomear/duplicar o
  helper — ambos os relatórios têm o mesmo público). Ordem no menu:
  "Relatório Original" antes de "Relatório SEI".

### Componente `RelatorioOriginalPage`

`src/app/features/relatorio-original/relatorio-original-page/` —
estrutura espelha `relatorio-sei-page`:
- seletor de **Data** (recarrega)
- **sem** toggle diurno/noturno (o relatório de alterações é do dia
  inteiro)
- bloco de **campos editáveis** no topo (textareas/inputs):
  graduado de monitoramento, 4 nºs SEI das escalas, observações —
  salvos em `relatorio_sei_complementos` no `blur` (mesmo padrão de
  `onSalvarComplemento`)
- botão **"Copiar para o SEI"** (mesmo `ClipboardItem` html+plain)
- **pré-visualização** `[innerHTML]` com `bypassSecurityTrustHtml`

### Serviço `RelatorioAlteracoesService`

`src/app/core/services/relatorio-alteracoes.service.ts`:
- `listComplementos(data)` / `salvarComplemento(data, campo, conteudo)`
  — reusa a mesma tabela; pode até reusar `RelatorioSeiService`, mas
  para manter os serviços focados criamos um fino wrapper próprio com
  as chaves `ALT_*`.
- função pura exportada **`montarRelatorioAlteracoesHtml(input:
  RelatorioAlteracoesInput): string`** — testável isoladamente, todo
  valor dinâmico passa por `esc()`. Mesma abordagem de HTML inline com
  estilos (sobrevive ao CKEditor do SEI) já usada em
  `relatorio-sei.service.ts`.

### `RelatorioAlteracoesInput`

```ts
interface RelatorioAlteracoesInput {
  data: string;
  guarnicoes: GuarnicaoRow[];
  policiais: PolicialRow[];
  roster: RosterRow[];            // do dia (para os totais ORDINÁRIO)
  alteracoes: AlteracaoRow[];     // do dia
  baixas: BaixaRow[];             // VT'S/MO'S DESATIVADAS
  complementos: Record<string, string>;  // ALT_*
}
```

### Estrutura do HTML gerado (ordem do PDF)

1. **Cabeçalho fixo:** SDS / PMPE / 16º BPM – Batalhão Frei Caneca /
   "RELATÓRIO DE ALTERAÇÕES DO SERVIÇO".
2. **Data por extenso** + "GRADUADO DE MONITORAMENTO: «campo»".
3. **Parágrafo de abertura** (texto fixo do modelo).
4. **ESCALAS** — lista com os 4 nºs SEI (`ALT_ESCALA_*`).
5. **ALTERAÇÕES DO EFETIVO** — tabela **automática** a partir de
   `alteracoes`. Colunas: ALTERAÇÃO (rótulo do tipo) · GRAD. ·
   MATRÍCULA · NOME · OME (fixo "16ºBPM") · SETOR (prefixo da
   `guarnicao_id`) · PROCESSO SEI · OBSERVAÇÃO.
   - `PERMUTA` gera **uma linha** ("PERMUTA") com o nome do substituído
     e, na observação, "Substituído por «substituto»" (ou o texto do
     modelo); o SEI da permuta vai na coluna PROCESSO SEI.
   - Rótulos: `FALTA_LTS` → "LTS/DTS", `AUSENCIA_SERVICO` → "AUSÊNCIA
     DO SERVIÇO", demais = o próprio nome.
6. **ALTERAÇÕES OPERAÇÃO PATRULHA / REMANEJAMENTOS** — POG A PÉ,
   CICLOPATRULHA, PBS: **tabelas pré-montadas vazias** + linha "OBS:".
7. **SUBSTITUIÇÃO DE PATRIMÔNIOS DE VIATURAS** — tabela pré-montada
   com a **lista fixa do PDF** (as viaturas GT 16300 / GT 16000 / …
   com colunas "substituto" e "motivo" em branco).
8. **ORDINÁRIO — TOTAL DE LANÇAMENTOS** — **automático**: contagem das
   guarnições ativas no dia por rótulo do modelo (GS'S, GT'S, PB'S,
   GV, MO'S, CP, CR, GG, MP, POG). Reusa o mapa `ROTULO_TIPO` /
   contagem de `relatorio-sei.service.ts`.
9. **ORDINÁRIO — SERVIÇO EM GERAL** — **automático**, contando o
   `roster` do dia por `statusEfetivo` (uma fonte só, já resolvida
   por `listRosterDoDia`) + `baixas`:
   FALTAS (`FALTA` + `AUSENCIA`), LTS/DTS (`LICENCA`), PERMUTAS
   (`SUBSTITUIDO`), AUSÊNCIA DO SERVIÇO (`AUSENCIA`), FOLGAS (`FOLGA`),
   LICENÇA PATERNIDADE (0 nesta fase), REMANEJAMENTO (`REMANEJADO`),
   VT'S/MO'S DESATIVADAS (de `baixas`), VIATURA FORA DA ÁREA EM MISSÃO
   (0 — manual no SEI), QUANTIDADE DE "OS" CUMPRIDA (0 nesta fase —
   futura P3).
10. **PJES / DIÁRIA** — dois quadros **pré-montados vazios**.
11. **"O.S" CUMPRIDAS** — **lista fixa hardcoded** das O.S. permanentes
    do PDF (constante `OS_PERMANENTES` no serviço). Editável depois de
    colar no SEI.
12. **Assinatura** — nome do graduado de monitoramento (`ALT_GRAD_MONITORAMENTO`).

Os remanejamentos e faltas "puras" que entram nessa contagem vêm das
tabelas antigas, mas o relatório não as lê diretamente: `listRosterDoDia`
já as resolve em `statusEfetivo`, e é essa lista única que o input
carrega.

---

## Seção 5 — Testes

Convenção do repo: specs de componente são smoke (`should create`);
asserções reais em specs de serviço / funções puras exportadas.

- `lancamento.service.spec.ts` — novos `describe`:
  - `registrarAlteracao` faz insert com o payload certo
  - `listRosterDoDia` marca `SUBSTITUIDO` + injeta linha do substituto
    quando há `PERMUTA` em `lancamento_alteracoes`
  - `listRosterDoDia` mapeia `CURSO`/`DISPENSA`/`AUSENCIA_SERVICO` para
    o `statusEfetivo` certo
- `relatorio-alteracoes.service.spec.ts` (novo):
  - `montarRelatorioAlteracoesHtml` renderiza título, data, `<table>`
  - lista uma alteração `CURSO` na tabela ALTERAÇÕES DO EFETIVO com
    matrícula, nome, SETOR (prefixo da guarnição) e processo SEI
  - `PERMUTA` gera a linha com o substituído + observação
  - conta guarnições em TOTAL DE LANÇAMENTOS (GTS = N)
  - conta `SERVIÇO EM GERAL` a partir do roster (FALTAS = N,
    PERMUTAS = N)
  - inclui a lista fixa `OS_PERMANENTES`
  - escapa HTML nos nomes
- `relatorio-original-page.spec.ts` — smoke.
- `painel-pc-page.spec.ts` — continua smoke.

---

## Plano de implementação (2 fases)

- **Fase 1 — dados + Painel:** migração `lancamento_alteracoes`;
  `LancamentoService` (tipos, `registrar/list/removerAlteracao`, merge
  no roster com substituto sintético, novos `StatusEfetivo`); modal do
  Painel do PC (novos tipos, campos, `onRegistrarModal`); badges/labels
  dos cards; testes de serviço.
- **Fase 2 — relatório:** `RelatorioAlteracoesService` +
  `montarRelatorioAlteracoesHtml`; `RelatorioOriginalPage` + rota +
  navegação; constante `OS_PERMANENTES`; quadros pré-montados; testes
  do serviço.

Deploy da migração: fluxo sem Docker (parse estático + `db push`),
conforme memória `supabase-no-docker.md`.

---

## Apêndice A — Conteúdo fixo extraído do PDF

### A.1 ORDINÁRIO — rótulos das duas colunas (ordem do PDF)

**TOTAL DE LANÇAMENTOS** (valor automático salvo indicação de manual):

| Rótulo | Fonte |
|---|---|
| GS'S | contagem de guarnições ativas `tipo = GT_ORDINARIO` |
| GT'S | contagem de guarnições ativas `tipo = GT_TATICO` |
| PB'S | 0 (sem tipo correspondente — manual no SEI) |
| GV | contagem `tipo = GV` |
| MO'S | contagem `tipo = MO` |
| CP | contagem `tipo = CP` |
| CR | contagem `tipo = CR` |
| GG | contagem `tipo = GG` |
| MP | 0 (manual no SEI) |
| POG A PE NO TERRENO - 03 TURNOS | 0 (manual no SEI) |

**SERVIÇO EM GERAL** (automático a partir do `roster` por `statusEfetivo` + `baixas`):

| Rótulo | Fonte |
|---|---|
| FALTAS | `roster` count `statusEfetivo === 'FALTA'` |
| LTS / DTS | count `statusEfetivo === 'LICENCA'` (inclui `FALTA_LTS`) |
| PERMUTAS | count `statusEfetivo === 'SUBSTITUIDO'` |
| AUSÊNCIA DO SERVIÇO | count `statusEfetivo === 'AUSENCIA'` |
| FOLGAS (TÁTICO/MO/GT/PB/CICLO) | count `statusEfetivo === 'FOLGA'` |
| LICENÇA PATERNIDADE | 0 (manual no SEI) |
| REMANEJAMENTO GT/MO/PB - ORDINÁRIA | count `statusEfetivo === 'REMANEJADO'` |
| VT'S/MO'S/DESATIVADAS | `baixas.length` |
| VIATURA/MO FORA DA ÁREA EM MISSÃO | 0 (manual no SEI) |
| QUANTIDADE DE "OS" CUMPRIDA | 0 nesta fase (futura P3) |

Os valores numéricos que aparecem no PDF (`GT'S 19`, `CP 13`, etc.) são
do dia daquele relatório — servem só de exemplo, não são fixos.

### A.2 `SUBSTITUICAO_PATRIMONIOS` — tabela-modelo fixa

Colunas: `GT` · `PATRI. INICIAL` · `HORÁRIO` · `PATRI. SUBSTITUTO` (em
branco) · `HORÁRIO` (em branco) · `MOTIVO` (em branco).

```
GT 16300 | 710268   | 05h às 14h / 14h às 23h
GT 16000 | 710265   | 06h às 18h / 18h às 06h
GT 16111 | 710279   | 06h às 18h
GT 16111 | 710268   | 18h às 06h
GT 16113 | 710274   | 19h às 07h
GG 16450 | 710265   | 06h às 06h
GG 16550 | 710269   | 06h às 06h
CR 16750 | 710271   | 06h às 06h
GT 16224 | 710270   | 08h às 20h
GT 16250 | 710272   | 13h à 01h
GT 16350 | 710280   | 13h à 01h
GV 16112 | SNR 7E44 | 14h às 02h
MP 16150 | 71210    | 06h às 14h
MO 16334 | 710255   | 06h às 14h
MO 16335 | 710258   | 06h às 14h
MO 16336 | 710260   | 06h às 14h
MO 16131 | 710246   | 14h às 22h
MO 16132 | 710248   | 14h às 22h
MO 16133 | 710249   | 14h às 22h
MO 16221 | 710246   | 15h às 23h
MO 16222 | 710248   | 15h às 23h
MO 16223 | 710250   | 15h às 23h
MO 16331 | 710249   | 15h às 23h
MO 16332 | 710250   | 15h às 23h
MO 16333 | 710260   | 15h às 23h
GT 16231 | 710XXX   | 06h às 18h
GT 16331 | 710278   | 06h às 18h
GT 16332 | 710286   | 06h às 18h
GT 16232 | 710XXX   | 07h às 19h
GT 16332 | 710273   | 17h às 05h
GT 16231 | 710XXX   | 18h às 06h
GT 16232 | 710XXX   | 19h às 07h
GT 16233 | 710284   | 20h às 08h
GT 16333 | 710276   | 20h às 08h
GT 16510 | 710XXX   | 16h às 00h
```

### A.3 `OS_PERMANENTES` — lista fixa "O.S" CUMPRIDAS

Colunas: `QNT` (índice) · `Nº DA O.S` · `MODALIDADE DE POLICIAMENTO`
(texto da coluna 3 do PDF — a atribuição-padrão; vira dinâmica na
fase P3).

```
1  | OS Nº 1358/2025 – INT. POLICIAMENTO NOS TI DE JOANA BEZERRA, RECIFE E CAIS DE SANTA RITA – 31 DE OUTUBRO ATÉ ULTERIOR DELIBERAÇÃO | GG 16450 / GG 16550
2  | OS Nº 1601/2025 - PBAC NO LOCAL EM FRENTE AO CTT – CENTRO DE TREINAMENTO TÁTICO PMPE – 18 DE DEZEMBRO A ULTERIOR DELIBERAÇÃO | 01 PB/GT DISPONÍVEL
3  | OS Nº 28 - INT. POLICIAMENTO NOS BAIRROS DA BOA VISTA, ILHA DO LEITE, SÃO JOSÉ E SANTO ANTÔNIO – 13 DE JANEIRO ATÉ ULTERIOR DELIBERAÇÃO | GT 16416
4  | OS Nº 160/2026 - Operação Impacto Integrado – Frei Caneca | GT 16000 + 02 GTs OPS
5  | OS Nº 300 - INT.POL. EDF 13 DE MAIO/BOA VISTA - 24H | 01 GT/PB EM RONDAS
6  | OS Nº 302 - INT.POL. NA PRAÇA SERGIO LORETO - 24H | 01 GT/PB EM RONDAS
7  | OS 307 – OPERAÇÃO OCTOPUS - A PARTIR DE MARÇO DE 2026 ATÉ ULTERIOR DELIBERAÇÃO - 13H ÀS 21H | GT 16000 + 01 GT DISPONÍVEL
8  | OS Nº 311 - INT.POL. NO CONSULADO GERAL DOS ESTADOS UNIDOS DA AMÉRICA - 03 DE MARÇO ATÉ ULTERIOR DELIBERAÇÃO - 24H | GT 16000 + 01 GT DISPONÍVEL
9  | OS Nº 383/2026 – POLICIAMENTO PRAÇA ODÍLIA FREIRE | PB ou 01 GT disponível
10 | OS Nº 441 – PROMOTORIAS (PAULO CAVALCANTI) | RONDAS + PB (15min/hora)
11 | OS Nº 846 - INTENSIFICAÇÃO DO POLICIAMENTO PRAÇA DOM VITAL - 08 a 31JUL26 | CICLOPATRULHA - PEs do 01 ao 20 min de cada hora / 01 MO DISPONÍVEL - PEs do 20 ao 40 min de cada hora
12 | OS Nº 853 - INT. DO POLICIAMENTO NA RUA INCONFIDÊNCIA (JOANA BEZERRA) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026 | PB JOANA BEZERRA / rondas no setor de origem com paradas de 10 minutos a cada duas horas na rua citada
13 | OS Nº 854 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA DROGASIL (ILHA DO LEITE) - DE 07 DE JULHO A 07 DE AGOSTO DE 2026 | PB ILHA DO LEITE / rondas no setor de origem e abordagens a indivíduos em atitudes suspeitas na proximidade do local
14 | OS Nº 855 - INT. DO POLICIAMENTO NAS PROXIMIDADES DA CASA DA CULTURA - DE 07 DE JULHO A 07 DE AGOSTO DE 2026 | GT DISPONÍVEL OU PB SÃO JOSÉ / POG 25 RUA FLORIANO PEIXOTO (DA CASA DA CULTURA ATÉ TI DO RECIFE)
15 | OS Nº 887 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 13JUL2026 ATÉ ULTERIOR | 01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável
16 | OS Nº 905 - APOIO A CAMIL - AGENDA INSTITUCIONAL RELATIVO AO GOVERNO DO ESTADO DE PE - 20JUL2026 ATÉ ULTERIOR DELIBERAÇÃO | 01 GT DISPONÍVEL - permanecer no local até liberação pelo Responsável
17 | OS Nº 946 - PALÁCIO JOAQUIM NABUCO - 28JUL26 a 31AGO26 | GT 16000 / GT DISPONÍVEL / MO 16331 / CICLO PATRULHA (BOA VISTA)
18 | OS Nº 948 - OPERAÇÃO TRANSPORTE SEGURO (OTS) - AGOSTO 2026 | GT 16250 / GT 16350
19 | OS Nº 1046 - OPERAÇÃO OCTHOPUS | MO 16131
20 | OS Nº 1077 - OPERAÇÃO FORÇA TOTAL | GT 16550
```

### A.4 Quadros pré-montados vazios

- **PJES / DIÁRIA** — dois quadros (`TOTAL DE LANÇAMENTOS` |
  `SERVIÇO EM GERAL`), reusar `PJES_TOTAL`/`PJES_SERVICO` do
  `relatorio-sei.service.ts` como referência de rótulos, valores em
  branco.
- **POG A PÉ / CICLOPATRULHA / PBS** — três tabelas de cabeçalho
  só, com uma linha "OBS:" em branco.
