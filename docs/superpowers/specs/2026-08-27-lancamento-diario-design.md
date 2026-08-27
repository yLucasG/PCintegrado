# Sub-projeto 2: Lançamento Diário / Painel do PC — Design

**Status:** Approved by user on 2026-08-27.

## Contexto

Segunda das três etapas do "Painel do PC / Lançamento" (ver
`docs/superpowers/specs/2026-08-27-escala-mensal-design.md` para o
Sub-projeto 1 — dados mestres e escala mensal recorrente, já concluído e
deployado). Ordem acordada:

1. ~~Dados mestres + Escala Mensal Recorrente~~ (concluído)
2. **Lançamento Diário / Painel do PC** (este documento)
3. Mapa de Força em Tempo Real + Filtros (esta etapa já cobre boa parte
   disso, ver abaixo)

O usuário testou o app publicado e confirmou que faltava exatamente a tela
operacional do dia-a-dia: ver o lançamento por turno, marcar faltas,
gerar relatório. Este documento cobre as duas primeiras; o gerador de
relatório no formato exato do `RelatórioFinalLançamento.pdf` fica para uma
etapa futura — decisão explícita do usuário, dado o tamanho da tarefa
(múltiplas seções, layout específico para colar no SEI).

## Modelo de dados

A tabela `escalas` da Etapa 1 (com `status` PREVISTO/PRESENTE/FALTA/
ATESTADO) foi cogitada para isso, mas o usuário optou por **tabelas
separadas por tipo de alteração**, espelhando as seções de "ALTERAÇÕES DE
SERVIÇO ORDINÁRIO" do `RelatórioFinalLançamento.pdf`: FALTAS, PERMUTAS/
SUBSTITUIÇÃO, FOLGAS, REMANEJAMENTO DE EFETIVO. A tabela `escalas` da
Etapa 1 fica sem uso nesta etapa (não removida — pode servir a um
propósito futuro, mas o "roster esperado" já vem de
`fn_resolve_escala_dia`, tornando-a redundante para este fluxo).

**Fora de escopo nesta etapa**: LTS/DTS (afastamento prolongado — mais
próximo de indisponibilidade de efetivo de médio prazo do que um
lançamento do dia), viaturas baixadas/setores desativados, gerador de
relatório final SEI.

### `lancamento_faltas`
```
id uuid pk
data date
policial_matricula varchar fk policiais
escala_mensal_id uuid fk escala_mensal (nullable — rastreabilidade)
horario_inicio / horario_fim time (nullable)
motivo text
criado_em / criado_por
```

### `lancamento_permutas`
```
id uuid pk
data date
policial_substituto_matricula varchar fk policiais
policial_substituido_matricula varchar fk policiais
escala_mensal_id uuid fk escala_mensal (nullable)
horario_inicio / horario_fim time (nullable)
sei_numero text
criado_em / criado_por
```

### `lancamento_folgas`
```
id uuid pk
data date
policial_matricula varchar fk policiais
escala_mensal_id uuid fk escala_mensal (nullable)
horario_inicio / horario_fim time (nullable)
sei_numero text
autorizacao text
criado_em / criado_por
```

### `lancamento_remanejamentos`
```
id uuid pk
data date
policial_matricula varchar fk policiais
escala_mensal_id uuid fk escala_mensal (nullable)
horario_inicio / horario_fim time (nullable)
destino text
criado_em / criado_por
```

RLS: mesmo padrão já usado (authenticated select/insert/delete, sem
granularidade por companhia).

## Painel do PC (`/lancamento`)

Tela nova, atrás do `authGuard` existente (sem `roleGuard` — mesmo padrão
de acesso amplo já usado nas telas de dados mestres; o role
`PC_LANCAMENTO` já existe no enum desde a Etapa 1 mas restringir por role
fica para quando o RBAC for refinado de verdade).

Fluxo:
1. Seletor de data (padrão: hoje).
2. `LancamentoService` chama `fn_resolve_escala_dia(data)` via RPC para
   obter o roster esperado do dia.
3. Em paralelo, busca as linhas de `lancamento_faltas`,
   `lancamento_permutas`, `lancamento_folgas`, `lancamento_remanejamentos`
   para a mesma data.
4. No frontend, cruza os dois conjuntos: cada linha do roster esperado
   recebe um `statusEfetivo` calculado — `PREVISTO` por padrão, ou
   `FALTA` / `SUBSTITUIDO` / `FOLGA` / `REMANEJADO` se houver uma linha
   correspondente numa das quatro tabelas de lançamento (casando por
   `policial_matricula` + `data`).
5. Tabela exibindo guarnição, policial, função, horário, status efetivo,
   com:
   - Filtro por guarnição (dropdown) e busca por nome/matrícula do
     policial — os "Filtros (Horário, Policial, Prefixo)" do fluxograma
     original.
   - Botão de ação por linha para lançar falta / substituição / folga /
     remanejamento, abrindo um formulário inline que grava na tabela
     correspondente.

## Fora de escopo (fica para depois)

- Gerador de relatório final (texto formatado igual ao SEI).
- LTS/DTS, viaturas baixadas/setores desativados.
- RBAC granular usando o role `PC_LANCAMENTO`.
- Edição/remoção de lançamentos já registrados (só criação nesta etapa,
  mesma simplificação List+Create já usada no Sub-projeto 1).
