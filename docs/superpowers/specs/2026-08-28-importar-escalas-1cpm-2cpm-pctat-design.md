# Importar escalas de 1ª CPM, 2ª CPM e PCTAT — Design

**Data:** 2026-08-28
**Status:** Aprovado (brainstorming)

## Contexto

O terceiro e último item da roadmap `pcintegrado-roadmap` é "importar dados
de 1ª CPM, 2ª CPM e PCTAT". Hoje o banco só tem a escala de Agosto/2026 da
3ª CPM, carregada via `supabase/migrations/20260827020000_seed_3cpm_agosto_2026.sql`
(viaturas, policiais, guarnições, escala_mensal). O Painel do PC, o Dashboard
e o Gerador de Relatório SEI já são genéricos por companhia — basta popular
as tabelas para que as outras companhias apareçam.

Este trabalho importa as guarnições **motorizadas** das escalas de serviço
de Agosto/2026 das três companhias restantes, seguindo o mesmo formato de
seed da 3ª CPM, mais uma pequena extensão de schema (dois novos tipos de
guarnição).

### Fontes (documentos SEI/GOVPE)

| Escala | Documento SEI | A contar de | Assinatura |
|---|---|---|---|
| 1ª CPM — nº 73 | 91599032 (CRC F560943B) | 11/08/2026 | 14/08/2026 |
| 2ª CPM — nº 72 | 91687160 (CRC 40A80A50) | 08/08/2026 | 12/08/2026 |
| PC Tático — nº 19 | 91852564 (CRC ACC49C39) | 14/08/2026 | 13/08/2026 |
| 3ª CPM — Agosto (já no banco) | — | 01/08/2026 | — |

Também recebidos como apoio: escala de Julho/2026 da 3ª CPM, "Mapa de
Lançamentos de Guarnições" do 16º BPM e o modelo `RelatórioFinalLançamento`.
Servem só de conferência cruzada.

## Objetivo

Ao final, um `supabase db reset` local (ou `db push` em produção) deixa as
tabelas `companhias`, `viaturas`, `policiais`, `guarnicoes` e `escala_mensal`
com as guarnições motorizadas de 1ª CPM, 2ª CPM, PCTAT e 3ª CPM de
Agosto/2026, sem nenhum policial escalado em duas guarnições ao mesmo tempo.

## Escopo

### Incluído

Guarnições **motorizadas** de cada escala (as que aparecem no Mapa de Força):

- **GT táticos de área** → `tipo = GT_TATICO`
- **Motopatrulha (MO)** → `tipo = MO`
- **Ciclopatrulha (CP)** → `tipo = CP`
- **GV 16650** → `tipo = GV`
- **GG 16450/16550** (Guarnição de Graduado) → `tipo = GG` (novo)
- **CR 16750** (Carro de Reforço) → `tipo = CR` (novo)
- **GT de comando/apoio** — GT 16000, 16100, 16200, 16300 da 1ª CPM →
  `tipo = GT_ORDINARIO`, recorrência `TODOS_OS_DIAS`
- **Operação Maria da Penha** (GT 16150, 1ª CPM) → `tipo = GT_ORDINARIO`,
  recorrência `SEG_A_SEX`, `nome = 'Operação Maria da Penha (GT 16150)'`
- **Operação Transporte Seguro / OTS** (GT 16250/16350, 2ª CPM) →
  `tipo = GT_ORDINARIO`, `nome = 'Operação Transporte Seguro / OTS (GT 16250/16350)'`

### Fora de escopo

- POGs / cartões-programa (postos a pé)
- Guarda do quartel, COPOM/Monitoramento, PC 16º BPM / despachantes
- GT 16050 (Operação Alerta Celular) — fica como texto livre no Relatório SEI
- Efetivo administrativo das companhias
- Efetivo indisponível / férias / LTS / RTS / à disposição de outros órgãos
  (o Relatório SEI já trata LTS/DTS por `lancamento_licencas`)
- Qualquer alteração na escala da 3ª CPM além de realocar policiais que
  passem a constar numa escala de maior precedência

## Regras de mapeamento

### Tipos de guarnição

Nova migration de schema adiciona dois valores ao enum:

```sql
alter type public.tipo_guarnicao add value 'GG';
alter type public.tipo_guarnicao add value 'CR';
```

Quatro arquivos de front-end estendem listas já existentes (sem mudança de
lógica):

- `src/app/core/services/guarnicoes.service.ts` — union `TipoGuarnicao`
- `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts` — array `tipos`
- `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts` — array `tiposGuarnicao`
- `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts` — array `TIPOS_ORDINARIO`

### Nome da guarnição

Padrão herdado do seed da 3ª CPM: `"<PREFIXO> - <área>"` (ex.:
`"GT 16221 - Joana Bezerra"`). Exceções nomeadas: Maria da Penha e OTS
(ver Escopo). Ciclopatrulha/Motopatrulha com múltiplos prefixos:
`"Ciclopatrulha 16221/222/223 - Ilha do Leite"`.

### Recorrência

- `PARES` / `IMPARES` — turnos de dia par / ímpar
- `SEG_A_SEX` — Maria da Penha
- `TODOS_OS_DIAS` — GT 16000/16100/16200/16300 e OTS
- `DIAS_ESPECIFICOS` — equipes ALFA/BRAVO/CHARLIE/DELTA de GG e CR:
  - ALFA: `{4,8,12,16,20,24,28}`
  - BRAVO: `{1,5,9,13,17,21,25,29}`
  - CHARLIE: `{2,6,10,14,18,22,26,30}`
  - DELTA: `{3,7,11,15,19,23,27,31}`

### Vigência

`vigencia_inicio = '2026-08-01'` para todas as linhas, **exceto** policiais
marcados "AC dd/mm" / "a/c de dd/mm" no PDF, que recebem `vigencia_inicio`
individual naquela data (ex.: `'2026-08-20'`). Mesmo tratamento que o seed
da 3ª CPM deu a ERICK (129414-8) e THALYS SARAIVA (128508-4).
`escala_origem` = `"Escala de Serviço <Nª CPM/PCTAT> - Agosto 2026"`.

## Regras de deduplicação

Um policial só pode estar em **uma** guarnição.

1. **Precedência entre escalas:** `1ª CPM > PCTAT > 2ª CPM > 3ª CPM`.
   Se a mesma matrícula aparece em mais de uma escala, vale a de maior
   precedência; as demais ocorrências são descartadas.
2. **Dentro da mesma escala:** se a matrícula aparece em mais de uma
   guarnição, vale a **primeira** aparição na ordem do documento.
3. **Realocação a partir da 3ª CPM:** se a matrícula já existe em
   `escala_mensal` (carga da 3ª CPM) e passa a constar numa escala de maior
   precedência, a migration de seed:
   - `delete from public.escala_mensal where policial_matricula = '<mat>'`
     (remove a(s) linha(s) da 3ª CPM);
   - `update public.policiais set companhia_id = <nova>, atualizado_em = now()
     where matricula = '<mat>'`;
   - insere a(s) nova(s) linha(s).
   *(Conferência preliminar: nenhuma das 36 matrículas do seed da 3ª CPM
   aparece nas três escalas novas, então na prática este passo tende a ficar
   vazio — mas o plano deve validar mecanicamente.)*
4. **Inserção idempotente:**
   - `insert into public.viaturas (...) ... on conflict (prefixo) do nothing`
   - `insert into public.policiais (...) ... on conflict (matricula) do nothing`
   - `companhia_id` do policial = companhia da escala de maior precedência
     em que ele aparece.
5. **Grafia divergente:** quando nome de guerra / telefone divergem entre
   documentos para a mesma matrícula (ex.: JEANILSON/JEANISON 129412-1,
   MIQUÉAS/MIQUEIAS 128974-8, HEERICLES/HEERICLIS 129134-3), vale a grafia
   da escala de maior precedência em que a matrícula é usada.
6. **Vagas não preenchidas:** linhas marcadas "PJES", "PAT PJES" ou em
   branco no PDF não geram registro.

## Estrutura da entrega

### Migration 1 — schema

`supabase/migrations/20260827100000_tipo_guarnicao_gg_cr.sql`

```sql
alter type public.tipo_guarnicao add value 'GG';
alter type public.tipo_guarnicao add value 'CR';
```

### Migration 2 — seed

`supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql`,
nesta ordem:

1. `delete from public.escala_mensal where policial_matricula in (...)` —
   matrículas da 3ª CPM realocadas (pode ser vazio).
2. `insert into public.viaturas ... on conflict (prefixo) do nothing`
3. `insert into public.policiais ... on conflict (matricula) do nothing`
4. `update public.policiais set companhia_id = ... where matricula in (...)` —
   realocados que já existiam.
5. `insert into public.guarnicoes ...` — UUIDs fixos na faixa
   `b0000000-0000-4000-8000-0000000000XX` (a 3ª CPM usa a faixa `a0…`).
6. `insert into public.escala_mensal ...` — linhas já deduplicadas.

### Front-end

Os quatro arquivos listados em "Tipos de guarnição". Rodar a suíte Vitest
completa e `npm run build`; nenhum spec existente deve quebrar (os arrays
de tipo não são assertados diretamente).

## Verificação

- `supabase db reset` local aplica as duas migrations sem erro.
- `select companhia_id, count(*) from guarnicoes group by 1` bate com o
  inventário (Apêndice A): 1ª CPM 10, 2ª CPM 7, PCTAT 5, 3ª CPM 4.
- `select tipo, count(*) from guarnicoes group by 1` inclui `GG` e `CR`.
- Nenhuma matrícula com duas linhas ativas simultâneas:
  `select policial_matricula, tipo_recorrencia, count(*)
   from escala_mensal group by 1,2 having count(*) > 1` só deve trazer casos
  legítimos (mesmo policial em turnos de recorrência diferente da mesma
  guarnição — não deve ocorrer neste seed) → esperado: 0 linhas.
- `select * from fn_resolve_escala_dia('2026-08-11')` (dia ímpar) e
  `('2026-08-12')` (dia par) retornam guarnições das quatro companhias e
  nenhuma matrícula repetida.
- `npm test -- --watch=false` e `npm run build` verdes.
- No Relatório SEI, a seção "resumo por tipo" lista `GG` e `CR`.
- Deploy: `./tools/supabase.exe db push` aplica `20260827100000` e
  `20260827110000`.

## Apêndice A — Inventário de guarnições

UUIDs `b0000000-0000-4000-8000-0000000000XX` (hex do índice).

### 1ª CPM (`companhia = '1ª CPM'`) — 10 guarnições

| # | Nome | Tipo | Prefixos | Recorrências |
|---|---|---|---|---|
| 01 | GT 16111 - São José / Cabanga | GT_TATICO | 16111 | PARES 05–17 / 17–05; ÍMPARES 05–17 / 17–05 |
| 02 | GT 16112 - São José / Santo Antônio | GT_TATICO | 16112 | ÍMPARES 06–18 / 18–06; PARES 06–18 / 18–06 |
| 03 | GT 16113 - São José / Santo Antônio | GT_TATICO | 16113 | ÍMPARES 07–19 / 19–07; PARES 07–19 / 19–07 |
| 04 | Ciclopatrulha 16111/112/113 - São José / Santo Antônio | CP | CP16111, CP16112, CP16113 | PARES 07–15 |
| 05 | Ciclopatrulha 16114/115/116 - São José / Santo Antônio | CP | CP16114, CP16115, CP16116 | ÍMPARES 05–13 / 13–21; PARES 05–13 / 13–21 |
| 06 | GT 16000 - Apoio ao Oficial de Operações | GT_ORDINARIO | GT16000 | TODOS_OS_DIAS (2 turnos 06–18 / 18–06, PAT+MOT) |
| 07 | GT 16100 - Comando | GT_ORDINARIO | GT16100 | TODOS_OS_DIAS 06–18 |
| 08 | GT 16200 - Subcomando | GT_ORDINARIO | GT16200 | TODOS_OS_DIAS 06–18 |
| 09 | GT 16300 - Motorista de Fiscalização de POG/CP | GT_ORDINARIO | GT16300 | TODOS_OS_DIAS 05–17 (só MOT) |
| 10 | Operação Maria da Penha (GT 16150) | GT_ORDINARIO | GT16150 | SEG_A_SEX 06–14 |

### 2ª CPM (`companhia = '2ª CPM'`) — 7 guarnições

| # | Nome | Tipo | Prefixos | Recorrências |
|---|---|---|---|---|
| 11 | GT 16221 - Joana Bezerra | GT_TATICO | 16221 | ÍMPARES 05–17; PARES 17–05 |
| 12 | GT 16222 - Ilha do Leite | GT_TATICO | 16222 | PARES 06–18 / 18–06; ÍMPARES 06–18 / 18–06 |
| 13 | GT 16223 - Joana Bezerra | GT_TATICO | 16223 | PARES 07–19 / 19–07; ÍMPARES 07–19 / 19–07 |
| 14 | GT 16224 - RHP / Ilha do Leite | GT_TATICO | 16224 | ÍMPARES 08–20 / 20–08; PARES 08–20 |
| 15 | Motopatrulha 16221/222/223 - Ilha do Leite / Joana Bezerra / Paissandu | MO | MO16221, MO16222, MO16223 | ÍMPARES 06–14 / 15–23; PARES 06–14 (só linhas com efetivo) |
| 16 | Ciclopatrulha 16221/222/223 - Ilha do Leite | CP | CP16221, CP16222, CP16223 | ÍMPARES 06–14 / 14–22; PARES 06–14 / 14–22 |
| 17 | Operação Transporte Seguro / OTS (GT 16250/16350) | GT_ORDINARIO | GT16250, GT16350 | TODOS_OS_DIAS 13–01 |

### PCTAT (`companhia = 'PCTAT'`) — 5 guarnições

| # | Nome | Tipo | Prefixos | Recorrências |
|---|---|---|---|---|
| 18 | GG 16450/16550 - Guarnição de Graduado | GG | GG16450, GG16550 | DIAS_ESPECIFICOS por equipe (ALFA/BRAVO/CHARLIE/DELTA), 06–06 |
| 19 | CR 16750 - Carro de Reforço | CR | CR16750 | DIAS_ESPECIFICOS por equipe, 06–06 |
| 20 | Motopatrulha 16131/132/133 - Santo Antônio / São José / Cabanga | MO | MO16131, MO16132, MO16133 | PARES 05–13 / 14–22; ÍMPARES 05–13 / 14–22 |
| 21 | Motopatrulha 16331/332/333 - Boa Vista / Soledade / Santo Amaro | MO | MO16331, MO16332, MO16333 | PARES 07–15 / 15–23; ÍMPARES 07–15 / 15–23 |
| 22 | GV 16650 | GV | GV16650 | ÍMPARES 14–02; PARES 14–02 |

Total: **22 guarnições novas** + 4 da 3ª CPM = 26.

## Apêndice B — Notas de extração

- Horários no PDF em `HHhMM`; converter para `time` (`06:00`).
- Graduações: `SD`, `CB`, `ASP`, `ST`, `1º SGT`, `2º SGT`, `3º SGT`,
  `2º TEN` — `policiais.graduacao` é `text` livre, sem constraint.
- `funcao` em `escala_mensal` aceita `CMT`, `MOT`, `PAT` (segundo PAT
  permitido, como já ocorre no seed da 3ª CPM).
- 2ª CPM GT 16224: o turno PARES 20–08 não consta no PDF; importar só o
  que está escrito.
- 2ª CPM MO 16221/222/223: várias vagas "PAT PJES" / "CMT PJES" — só
  entram linhas com matrícula real.
- O plano de implementação deve conter as tabelas completas
  policial → guarnição → função → turno → recorrência → vigência,
  extraídas dos três PDFs, com a checagem mecânica de matrículas repetidas
  entre as quatro escalas antes de gerar o SQL.
