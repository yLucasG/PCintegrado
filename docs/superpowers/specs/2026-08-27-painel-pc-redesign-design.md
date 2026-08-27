# Painel do PC — Redesign (quadro de cards + tema claro/escuro) — Design

**Status:** Approved by user on 2026-08-27.

## Contexto

O usuário testou o Painel do PC (Sub-projeto 2, concluído) e pediu uma
reformulação visual e funcional inspirada em referências do
aura.build (prints anexados: um card "5-Day Outlook" e um card "Mission
Control" com badges coloridos, ícones circulares, stats grandes e um
card de botão pill minimalista). Ele confirmou gostar desse estilo e
pediu tema claro OU alternância claro/escuro, com legibilidade garantida
em ambos.

O tema visual escolhido — "mission control" / console de despacho — se
encaixa tematicamente com o próprio Painel do PC (é literalmente um
centro de operações de viaturas), então a cor e a estrutura carregam
significado funcional (não são só decoração): a borda colorida do card
indica a saúde daquela guarnição no relance.

**Escopo desta etapa**: reformular apenas o Shell (top bar / bottom nav)
e o Painel do PC. As telas de Policiais/Viaturas/Guarnições/Escala
Mensal continuam com a aparência atual (clara, sem os novos tokens) —
decisão já tomada anteriormente ("reskin das outras telas fica pra
depois"). Elas vão continuar legíveis (mesmo Tailwind claro de sempre),
só não vão mudar de cara quando o tema escuro for ativado.

## Sistema de tema (claro/escuro)

- Tailwind v4: adicionar `@custom-variant dark (&:where(.dark, .dark
  *));` em `src/styles.css`, ligando o variant `dark:` à classe `.dark`
  na tag `<html>` (em vez do `prefers-color-scheme` puro do padrão do
  Tailwind v4), permitindo controle explícito pelo usuário.
- `ThemeService` novo: signal `theme: 'light' | 'dark' | 'system'`,
  persistido em `localStorage` (`pcintegrado-theme`). Resolve o tema
  efetivo (`light`/`dark`) — se `system`, usa
  `window.matchMedia('(prefers-color-scheme: dark)')` — e aplica/remove
  a classe `.dark` em `document.documentElement` via `effect()`.
- Controle no `TopBar`: três botões pequenos (sol / monitor / lua),
  mesmo padrão visual do seletor do próprio aura.build mostrado nos
  prints.
- Paleta: em vez de criar variáveis CSS customizadas, usar a paleta
  padrão do Tailwind com sufixo `dark:` diretamente nos templates
  (`bg-white dark:bg-slate-900`, `bg-slate-950` pro fundo geral no modo
  escuro, etc.) — mantém consistência com o Tailwind já em uso e
  contraste testado, sem camada de tokens extra pra manter.
- Cores semânticas de status (usadas nos badges do Painel do PC, cada
  uma com par claro/escuro): PREVISTO `emerald`, FALTA `red`, ATRASADO
  `orange`, SUBSTITUIDO `amber`, FOLGA `blue`, REMANEJADO `violet`.

## Tipografia

Duas famílias via Google Fonts, carregadas em `src/index.html`:
- **Chakra Petch** (títulos, eyebrows, labels, botões) — fonte angular
  e técnica, reforça a sensação de painel tático/HUD sem ser genérica.
- **Inter** (corpo, tabelas, formulários) — extremamente legível em
  texto denso (nomes, matrículas, horários).

Configuradas via `@theme` do Tailwind v4 em `styles.css`
(`--font-display` / `--font-sans`), gerando as utilities `font-display`
e `font-sans`.

## Painel do PC — quadro de cards

Substitui a tabela atual por um grid de cards, um por guarnição/viatura
presente no roster do dia:

- **Cabeçalho do card**: título = nome curto da guarnição (ex:
  "GT16332"), subtítulo = área de atuação, indicador de status agregado
  (ponto colorido: verde se todo mundo PREVISTO, vermelho/laranja se
  houver falta/atraso).
- **Borda lateral colorida** (elemento de assinatura): reflete a mesma
  saúde agregada do card — permite ao operador identificar qual
  guarnição precisa de atenção sem ler o conteúdo.
- **Linhas de efetivo**: rank + nome, badge indicando comandante (CMT)
  vs não, badge de status efetivo (cores da seção anterior), dois ícones
  de ação rápida (marcar Falta / marcar Atrasado) e alça de arrastar.
- **Rodapé**: faixa com o horário do turno daquela guarnição.
- **Arrastar para remanejar**: arrastar uma linha de policial de um card
  para outro chama `registrarRemanejamento` com `destino` = nome da
  guarnição de destino. Implementado com `@angular/cdk` (`DragDropModule`)
  — nova dependência, mas é o pacote oficial do time Angular
  especificamente para isso, com suporte a touch (relevante se o PC usar
  tablet).

## Filtro por horário de lançamento

Troca o dropdown de guarnição (que já existe) por abas/pills no topo com
cada horário distinto presente no roster do dia (ex: "06h", "08h",
"14h..."), calculadas a partir das linhas resolvidas do dia. Selecionar
uma aba filtra as linhas de efetivo por `horarioInicio` antes de agrupar
em cards — só aparecem cards que tenham pelo menos uma linha naquele
horário. Sem seleção = mostra tudo. A busca por policial (já existente)
continua disponível.

## Novo status: ATRASADO

Nova tabela `lancamento_atrasos`, mesmo padrão das outras quatro
(`lancamento_faltas`, `lancamento_permutas`, `lancamento_folgas`,
`lancamento_remanejamentos`):
```
id uuid pk
data date
policial_matricula varchar fk policiais
escala_mensal_id uuid fk escala_mensal (nullable)
horario_chegada time (nullable)
motivo text
criado_em / criado_por
```
`LancamentoService.listRosterDoDia` passa a considerar também essa
tabela (nova opção `ATRASADO` em `StatusEfetivo`), com a seguinte ordem
de precedência quando há mais de um registro pro mesmo policial/dia
(caso de dado inconsistente): FALTA → ATRASADO → SUBSTITUIDO → FOLGA →
REMANEJADO. Novo método `registrarAtraso`.

## Fora de escopo (fica para depois)

- Reskin das telas de Policiais/Viaturas/Guarnições/Escala Mensal.
- Gerador de relatório SEI (ainda not touched — ficará mais fácil depois
  que o quadro de cards estabilizar o modelo de dados de desvios).
- Substituição visual de outras telas (Login, Admin) pelo novo tema.
