# Gerador de Relatório SEI — Design

**Status:** Approved by user on 2026-08-27.

## Contexto

Terceiro item do roteiro combinado em `docs/superpowers/specs/` (ver memória
`pcintegrado-roadmap`): (1) conteúdo do Painel/Dashboard — concluído, (2)
gerador de relatório SEI — este documento, (3) importar dados de 1ª CPM, 2ª
CPM e PCTAT.

O modelo de referência é `RelatórioFinalLançamento.pdf`, um ofício de 7
páginas que o 16º BPM remete diariamente à Subcomandante. Ele cobre bem
mais dado do que o Painel do PC captura hoje. Depois de mapear o PDF contra
o schema atual (`docs/superpowers/specs/2026-08-27-lancamento-diario-design.md`),
o usuário decidiu ampliar o modelo de dados antes de gerar o relatório, com
o seguinte escopo:

**Estruturado nesta etapa:**
- Nº SEI em atrasos e viaturas baixadas (permutas e folgas já têm
  `sei_numero`/`autorizacao` desde a etapa anterior — confirmado em código,
  não precisam de alteração).
- Situação e local da OS cumprida.
- LTS/DTS como novo status de efetivo (`LICENCA`), com tabela própria.
- Funções fixas diárias (Guarda do quartel, PC 16º BPM/despachante,
  Graduado de Monitoramento COPOM) como lançamento simples.

**Fora de escopo nesta etapa (viram texto livre editável no relatório
gerado):** PJES/Diária (trilha de lançamento paralela inteira), Fiscalização
(patrulhas extra-ordinárias), POG (Pe Seguro, Papai Noel, Cerne...),
viaturas DIRESP (apoio externo: RC, ROCROP, GE, GI, GB). Podem ganhar
modelagem própria numa etapa futura, se o volume de uso justificar.

## Alterações em tabelas existentes

```sql
alter table public.lancamento_atrasos add column sei_numero text;
alter table public.lancamento_baixas add column sei_numero text;
alter table public.lancamento_os add column situacao text;
alter table public.lancamento_os add column local text;
```

`RegistrarAtrasoInput`, `RegistrarBaixaInput` e `RegistrarOsInput` (em
`lancamento.service.ts`) ganham os campos correspondentes, opcionais. Os
modais de atraso, baixa e OS no Painel do PC (`painel-pc-page.html`/`.ts`)
ganham os inputs de texto correspondentes, seguindo o mesmo padrão visual
já usado para "SEI Nº" e "Autorização" nos modais de permuta/folga.

## Tabelas novas

### `lancamento_licencas` (LTS/DTS)

Difere das demais tabelas de lançamento por ser um **intervalo de datas**,
não um horário de turno dentro de um único dia — reflete exatamente as
colunas "INÍCIO"/"TÉRMINO" do modelo do PDF.

```sql
create table public.lancamento_licencas (
  id uuid primary key default gen_random_uuid(),
  policial_matricula varchar(20) not null references public.policiais (matricula),
  data_inicio date not null,
  data_fim date not null check (data_fim >= data_inicio),
  escala_mensal_id uuid references public.escala_mensal (id),
  sei_numero text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_licencas_criado_por
before insert on public.lancamento_licencas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_licencas enable row level security;
-- authenticated select/insert/delete, mesmo padrão das demais tabelas de lançamento.
```

Não tem `data` própria: uma licença "aparece" em qualquer dia dentro de
`[data_inicio, data_fim]`. `listRosterDoDia(data)` passa a buscar também
`lancamento_licencas` filtrando por `data_inicio <= data and data_fim >= data`
(em vez de `.eq('data', data)` como as demais tabelas), e qualquer
`policial_matricula` com licença vigente naquele dia recebe
`statusEfetivo: 'LICENCA'` em **todas** as suas linhas de roster daquele
dia (a licença é por dia inteiro, não por turno — mesma precedência de
`FALTA`, acima de `ATRASADO`/`SUBSTITUIDO`/`FOLGA`/`REMANEJADO`).

`StatusEfetivo` ganha o valor `'LICENCA'`. Cor semântica: `sky` (ainda não
usada pelas demais), badge `bg-sky-100 text-sky-700 dark:bg-sky-900/40
dark:text-sky-300`, label "LTS/DTS" no Painel do PC e no Dashboard (troca
`STATUS_LABELS`/`STATUS_ORDER`/`STATUS_CARD_CLASSES` em ambos os lugares —
únicos pontos que já centralizam essa lista).

Painel do PC ganha um botão "Registrar LTS/DTS" ao lado dos já existentes
(falta, atraso, permuta, folga, remanejamento), abrindo um modal com
policial, início, término e Nº SEI — mesmo padrão dos modais existentes.
Toggle-off (remoção) segue o mesmo padrão de delete-by-id já usado nos
outros lançamentos.

### `lancamento_funcoes_fixas` (Guarda / PC 16º BPM / COPOM)

Não representa uma viatura nem um policial escalado via `escala_mensal` —
é uma lista solta de nomes por função, por dia, sem vínculo com guarnição.

```sql
create type public.grupo_funcao_fixa as enum ('GUARDA', 'PC_BPM', 'COPOM');

create table public.lancamento_funcoes_fixas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  grupo public.grupo_funcao_fixa not null,
  funcao text not null,               -- ex.: "Comandante", "Auxiliar", "Despachante", "Auxiliar do COPOM"
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
-- authenticated select/insert/delete.
```

Não entra no roster do Painel do PC (não é efetivo escalado por
guarnição) — é consumida só pelo relatório SEI. Tela simples nova
(`/lancamento-funcoes-fixas` ou seção dentro do próprio Painel do PC, a
definir na fase de planejamento) para listar/adicionar linhas por grupo:
policial, função, horário, fone do comandante.

## Página do relatório (`/relatorio-sei`)

Página nova, sem tentar reproduzir o PDF pixel a pixel (ele é um Word
convertido, com cores por turno). Em vez disso, uma visualização HTML na
mesma ordem e títulos de seção do modelo, montada a partir dos dados já
lançados no dia selecionado:

1. Cabeçalho do ofício (brasão, destinatário fixo "Srª SUBCOMANDANTE DO 16º
   BPM", data e horário do turno preenchidos a partir da seleção de
   data/horário).
2. Resumo ORDINÁRIO (totais por tipo de guarnição vindos de
   `guarnicoes.tipo`, totais de ocorrências vindos das tabelas de
   lançamento).
3. 1ª/2ª/3ª/4ª CHAMADA — viaturas ordinárias agrupadas por turno
   (`horario_inicio`), reaproveitando o agrupamento por `cardId` já usado
   no Painel do PC e no Dashboard.
4. Blocos FALTAS / PERMUTAS-SUBSTITUIÇÃO / FOLGAS / LTS-DTS /
   REMANEJAMENTO / viaturas baixadas / OS cumprida.
5. GUARDA / PC 16º BPM / COPOM, a partir de `lancamento_funcoes_fixas`.
6. Blocos de texto livre: PJES/Diária, Fiscalização, POG, viaturas DIRESP,
   Observações — `<textarea>` editável.
7. Rodapé de assinatura (texto fixo, igual ao modelo).

Botão **"Copiar texto"** serializa a página inteira num formato de texto
simples/tabular equivalente, pronto para colar no editor do SEI (não gera
PDF).

Os blocos de texto livre do passo 6 são salvos numa tabela leve, para não
perder o que foi digitado se a página recarregar antes de copiar/enviar:

```sql
create table public.relatorio_sei_complementos (
  data date not null,
  campo text not null,   -- 'PJES_DIARIA' | 'FISCALIZACAO' | 'POG' | 'DIRESP' | 'OBSERVACOES'
  conteudo text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id),
  primary key (data, campo)
);

alter table public.relatorio_sei_complementos enable row level security;
-- authenticated select/insert/update (upsert por data+campo).
```

Sem versionamento/histórico de relatórios gerados nesta etapa — os dados
estruturados são sempre lidos ao vivo das tabelas de lançamento (se algo
for corrigido no Painel do PC depois, o relatório reflete a correção até
o momento em que for de fato copiado/enviado pelo SEI).

## Acesso

Rota `/relatorio-sei` atrás de `roleGuard` restrito a `PC_LANCAMENTO` e
`ADMIN` (`route.data['roles'] = ['PC_LANCAMENTO', 'ADMIN']`), conforme
combinado no início desta fase. Item de navegação em `TopBar`/`BottomNav`
visível só para esses dois perfis — mesmo padrão de
`podeGerenciarEscalas()` já usado para Viaturas/Guarnições/Escala Mensal,
com um método novo (`podeGerarRelatorioSei()`) em vez de reutilizar o
existente, já que o conjunto de perfis é diferente.

## Testes

- `lancamento.service.spec.ts`: casos novos para licenças (overlap de
  data), funções fixas, e os campos novos em atraso/baixa/OS.
- Componente do relatório: monta o texto/HTML esperado a partir de dados
  mockados (roster + lançamentos + complementos).
- `role.guard.spec.ts`: caso novo confirmando bloqueio para perfis fora de
  `PC_LANCAMENTO`/`ADMIN`.
- Verificação end-to-end contra o Supabase real via script Python
  (mesmo padrão usado nas etapas anteriores) antes de considerar pronto:
  registrar licença com overlap de data, confirmar que suprime o roster
  do dia certo e não vaza para fora do intervalo; registrar função fixa;
  conferir que os campos novos de SEI/situação/local persistem e voltam
  corretamente pela API.

## Fora de escopo

- PJES/Diária, Fiscalização, POG e DIRESP como dado estruturado (ficam
  texto livre — ver seção "Página do relatório").
- Geração de PDF de verdade (a página é HTML/texto, para colar no SEI).
- Versionamento/histórico imutável de relatórios já gerados/enviados.
- Edição/remoção de funções fixas já lançadas nesta etapa (só
  criação — mesma simplificação List+Create já usada em outras etapas
  recentes; toggle-off pode vir depois se o uso pedir).
