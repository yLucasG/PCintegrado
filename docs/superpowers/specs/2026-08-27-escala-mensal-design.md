# Sub-projeto 1: Dados Mestres + Escala Mensal Recorrente — Design

**Status:** Approved by user on 2026-08-27.

## Contexto

Esta é a primeira de três etapas do "Painel do PC / Lançamento" (ver
fluxograma original e `docs/superpowers/specs/2026-08-27-pcintegrado-scaffold-design.md`
para a Etapa 1 já concluída — auth, RBAC, shell responsivo). A ordem
acordada com o usuário:

1. **Dados mestres + Escala Mensal Recorrente** (este documento)
2. Lançamento Diário (deriva da escala mensal, registra desvios do dia)
3. Mapa de Força em Tempo Real + Filtros

O processo real do 16º BPM usa dois conceitos distintos, confirmados pelos
documentos SEI fornecidos pelo usuário (escalas de serviço mensais da 1ª,
2ª, 3ª CPM e do Pelotão de Comando Tático, todas para Agosto/2026):

- **Escala mensal fixa**: um padrão recorrente (pares/ímpares do mês, dias
  específicos, segunda-a-sexta, etc.) que define quem ocupa qual função em
  qual guarnição, publicado uma vez por mês como documento SEI.
- **Lançamento diário**: o que de fato aconteceu num dia específico
  (faltas, substituições, remanejamento) — objeto do Sub-projeto 2.

Este sub-projeto modela apenas a escala mensal fixa e os dados mestres que
ela referencia.

## Escopo de dados a importar

Guarnições do tipo **GT (tático e ordinário), MO (motopatrulhamento), CP
(ciclopatrulha) e GV** das 4 companhias (1ª CPM, 2ª CPM, 3ª CPM, PCTAT) —
são as que usam as funções CMT/MOT/PAT já existentes no schema da Etapa 1
e têm viatura associada, alinhando com o conceito de "Mapa de Força de
viaturas" do fluxograma original.

**Fora de escopo nesta etapa** (funções que o enum `funcao_escala`
CMT/MOT/PAT não cobre — decisão explícita do usuário de não expandir o
enum agora): Efetivo Administrativo (Comandante/Subcomandante/
Sargenteante/Auxiliar), Guarda (Monitor/Comandante de Guarda/Sentinela),
COPOM/Monitoramento (Despachante), POG a pé sem viatura (ex: POG 47 —
Rua do Lazer), PJES/diária extra, Operação Maria da Penha, Operação
Transporte Seguro, Operação Alerta Celular. Podem ser trazidas numa etapa
futura expandindo `funcao_escala`.

## Modelo de dados

Duas tabelas novas, uma migration em cima da já aplicada em
`supabase/migrations/20260827000000_initial_schema.sql`.

### `guarnicoes`

Representa um posto de serviço fixo (não um turno individual — os turnos
vêm de `escala_mensal`).

```
id uuid pk
nome text                      -- "GT 16332 - Boa Vista"
tipo tipo_guarnicao             -- enum: GT_TATICO, GT_ORDINARIO, MO, CP, GV
companhia_id uuid fk companhias
area_atuacao text
prefixos text[]                 -- ['16332'] ou ['16221','16222','16223']
criado_em / atualizado_em
```

`prefixos` é array, não uma FK única para `viaturas`, porque os
documentos mostram grupos que dividem uma equipe entre várias viaturas
(ex: "CP 16221, CP 16222, CP 16223" cobertos pela mesma escala de
ciclopatrulha; "MO 16131, MO 16132, MO 16133" idem). Uma FK singular
para `viaturas.prefixo` não representaria essa realidade.

### `escala_mensal`

Uma linha por (guarnição, policial, função, padrão de recorrência,
período de vigência).

```
id uuid pk
guarnicao_id uuid fk guarnicoes
policial_matricula varchar fk policiais
funcao funcao_escala             -- reaproveita enum CMT/MOT/PAT da Etapa 1
horario_inicio / horario_fim time
tipo_recorrencia tipo_recorrencia -- enum: PARES, IMPARES, DIAS_ESPECIFICOS,
                                     SEG_A_SEX, TODOS_OS_DIAS
dias_especificos int[]           -- só quando tipo_recorrencia = DIAS_ESPECIFICOS
vigencia_inicio date
vigencia_fim date                -- null = ainda vigente
escala_origem text               -- ex: "SEI 91852564", rastreabilidade ao doc
criado_em / atualizado_em / criado_por / atualizado_por
```

### Função de resolução

`fn_resolve_escala_dia(p_data date)` retorna as linhas de `escala_mensal`
cuja regra de recorrência casa com `p_data` e cuja vigência cobre a data:

- `PARES`: `extract(day from p_data)::int % 2 = 0`
- `IMPARES`: `extract(day from p_data)::int % 2 = 1`
- `DIAS_ESPECIFICOS`: `extract(day from p_data)::int = any(dias_especificos)`
- `SEG_A_SEX`: `extract(isodow from p_data) between 1 and 5`
- `TODOS_OS_DIAS`: sempre verdadeiro
- E sempre: `vigencia_inicio <= p_data and (vigencia_fim is null or vigencia_fim >= p_data)`

Essa função é a base que o Sub-projeto 2 (Lançamento Diário) vai chamar
para gerar o roster esperado de um dia antes de aplicar os desvios.

### RLS

Mesmo padrão da Etapa 1: RLS habilitada em `guarnicoes` e
`escala_mensal`, `authenticated` pode ler tudo e escrever
(select/insert/update) — sem granularidade por companhia nesta etapa,
consistente com a decisão já tomada no scaffold original.

## Telas Angular (CRUD)

Novas rotas sob o `Shell` existente, atrás do `authGuard` (sem
`roleGuard` — qualquer usuário autenticado pode gerenciar dados mestres
nesta etapa; refinar por role é trabalho futuro):

- `/policiais` — lista + formulário criar/editar (matrícula, graduação,
  nome_guerra, telefone, companhia)
- `/viaturas` — lista + formulário criar/editar (prefixo, área_atuação)
- `/guarnicoes` — lista + formulário criar/editar (nome, tipo, companhia,
  área_atuação, prefixos)
- `/escala-mensal` — lista filtrável por companhia/guarnição + formulário
  criar/editar (guarnição, policial, função, horário, recorrência,
  vigência)

Cada tela segue o padrão já estabelecido na Etapa 1: standalone
component, service dedicado por recurso (`PoliciaisService`,
`ViaturasService`, `GuarnicoesService`, `EscalaMensalService`) chamando
`SupabaseService.client`, testes Vitest cobrindo o service (não apenas
"should create" do componente, já que aqui a lógica de negócio real mora
no service).

## Importação dos dados reais (Agosto/2026)

Transcrição manual, direto em uma migration de seed
(`supabase/migrations/<timestamp>_seed_escala_mensal_agosto_2026.sql`),
dos documentos SEI já fornecidos pelo usuário nesta conversa:

- `SEI - ESCALA MENSAL 1ª CPM - AGOSTO 2026.pdf`
- `SEI - ESCALA MENSAL 2°CPM AGOSTO a contar do dia 12.pdf`
- `SEI - ESCALA DE SERVIÇO - 3ª CPM - AGOSTO.pdf`
- `SEI - ESCALA MENSAL PC TÁTICO - AGOSTO2026.pdf`

Cobrindo apenas as guarnições GT/MO/CP/GV conforme escopo acima. Cada
policial referenciado precisa existir em `policiais` antes do insert em
`escala_mensal` — a migration cria as linhas de `policiais` primeiro
(matrícula, graduação extraída do prefixo GRAD/MAT ex: "SD 130512-3" →
graduação "SD", matrícula "130512-3"; nome_guerra; telefone quando
presente), depois `viaturas` (prefixos citados), depois `guarnicoes`,
depois `escala_mensal`.

## Fora de escopo (fica para depois)

- Lançamento diário e desvios (Sub-projeto 2).
- Mapa de força / filtros (Sub-projeto 3).
- Expansão do enum `funcao_escala` além de CMT/MOT/PAT.
- Importação via upload de CSV pela UI (usuário optou por transcrição
  direta agora; import reutilizável fica para quando o processo mensal
  precisar se repetir).
- RLS granular por companhia.
