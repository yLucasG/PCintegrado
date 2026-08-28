# RBAC por CIA e limpeza de telas — Design

**Data:** 2026-08-28
**Status:** Aprovado (brainstorming)

## Contexto

Uma conta de CIA (`CIA_3`) foi criada e revelou vários problemas de
permissão e de organização das telas:

- A CIA vê a Escala Mensal de **todas** as companhias, não só a sua.
- As CIAs conseguem **editar** o Painel do PC (só deveriam ver).
- As telas Viaturas, Guarnições e Policiais expõem "Adicionar"/"Remover"
  para quem não deveria mexer nesses cadastros.
- Viaturas e Guarnições não precisam existir como telas próprias.

O app hoje faz **RBAC só no cliente** (guards de rota lendo `route.data.roles`
e `@if` no template); o RLS do Postgres é permissivo (`using (true)` para
qualquer `authenticated`). Esta fase mantém essa abordagem — nada de RLS
novo.

Perfis (`perfis_usuarios.role`): `ADMIN`, `CIA_1`, `CIA_2`, `CIA_3`,
`PCTAT`, `PJES`, `PC_LANCAMENTO`. `perfis_usuarios` **não** tem
`companhia_id` — a companhia é derivada do role.

## Objetivo

1. Extinguir as telas Viaturas e Guarnições.
2. Painel do PC vira só-leitura para todos, exceto `PC_LANCAMENTO`.
3. Escala Mensal fica restrita à companhia do perfil (ADMIN vê tudo).
4. Página Policiais vira diretório só-leitura com busca, filtro por
   companhia e colunas de guarnição + recorrência.

Tudo client-side. Sem migração de schema.

## Seção A — Mapa perfil → companhia

Nova função pura exportada de `src/app/core/services/auth.service.ts`:

```typescript
/** Companhia à qual o perfil está restrito, ou null quando vê tudo. */
export function companhiaDoRole(role: RoleUsuario): string | null {
  switch (role) {
    case 'CIA_1': return '1ª CPM';
    case 'CIA_2': return '2ª CPM';
    case 'CIA_3': return '3ª CPM';
    case 'PCTAT': return 'PCTAT';
    case 'PJES': return 'PJES';
    default: return null; // ADMIN, PC_LANCAMENTO
  }
}
```

Consumida pela Escala Mensal (Seção D) e pela Policiais (Seção E). Testada
em `auth.service.spec.ts`.

## Seção B — Extinguir Viaturas e Guarnições

**Remoções:**
- `src/app/features/viaturas/` (componente, template, css, spec) — apagado.
- `src/app/features/guarnicoes/` (idem) — apagado.
- `src/app/core/services/viaturas.service.ts` + `.spec.ts` — apagados: o
  único consumidor era a tela `viaturas-page` (confirmado por grep).
- `src/app/app.routes.ts` — remove os blocos das rotas `viaturas` e
  `guarnicoes`.
- `src/app/layout/top-bar/top-bar.html` e `bottom-nav/bottom-nav.html` —
  o bloco `@if (podeGerenciarEscalas())` passa a ter só o link "Escala
  Mensal".

**Mantido:**
- `GuarnicoesService` — usado por Painel do PC, Policiais e Relatório SEI.
  Só as **telas** somem.
- A criação de viatura ad-hoc dentro do Painel do PC (fluxo próprio via
  `GuarnicoesService`, e só para `PC_LANCAMENTO` após a Seção C).
- `podeGerenciarEscalas()` continua existindo (agora só gateia o link
  "Escala Mensal"); pode ser renomeado para `podeVerEscalaMensal()` se
  ficar mais claro — decisão do executor, sem impacto funcional.

## Seção C — Painel do PC só-leitura (exceto PC_LANCAMENTO)

A rota `/lancamento` continua **sem `roleGuard`** — todo autenticado
visualiza.

Novo getter no `PainelPcPage`:
```typescript
podeEditar(): boolean {
  return this.authService.currentPerfil?.role === 'PC_LANCAMENTO';
}
```
(`ADMIN` **não** edita o Painel do PC nesta fase — decisão do produto.)

Quando `podeEditar()` é falso, ficam **ocultos/desabilitados**:
- botão "+ Nova viatura" e seu modal;
- `cdkDropList`/`cdkDrag` (remanejamento por arrastar) — as listas
  renderizam sem as diretivas de drag, ou com `cdkDropListDisabled`;
- clique na linha do card que abre o modal de lançamento
  (FALTA/ATRASADO/PERMUTA/FOLGA/REMANEJAMENTO/LICENCA);
- toggle de baixa (desativar) e o "reativar";
- modal de OS (abrir/editar);
- ações "Desfazer" (remanejamento, etc.);
- seção "Funções fixas do dia": formulário de criar e botão remover.

Continuam visíveis para todos: seletor de data, filtros de horário /
"Ativas agora" / busca, e todos os cards com efetivo, status e badges.

Uma faixa discreta no topo indica "Somente leitura — apenas o PC de
Lançamento edite este painel." quando `!podeEditar()`.

## Seção D — Escala Mensal restrita à companhia

`EscalaMensalPage` passa a considerar `companhiaDoRole(role)`:

- **`null` (ADMIN):** comportamento atual — todas as guarnições no select
  da "Nova escala", filtro "Todas as guarnições" com todas, lista completa.
- **companhia definida (CIA_1/2/3, PCTAT):**
  - o `<select>` "Guarnição" da Nova escala lista só guarnições cuja
    `companhia_id` corresponde à companhia do perfil;
  - o filtro "Escalas cadastradas" lista só essas guarnições (e a opção
    "Todas as guarnições" passa a significar "todas as da minha CIA");
  - a tabela de escalas mostra só linhas cujas guarnições são da
    companhia do perfil (filtro derivado de `guarnicao.companhia_id`).

Precisa cruzar `escala_mensal.guarnicao_id` → `guarnicoes.companhia_id` →
`companhias.nome`. `EscalaMensalPage` já injeta `GuarnicoesService`; passa
a injetar `CompanhiasService` também (ou resolve companhia via um
`Map<guarnicaoId, companhiaNome>`).

Client-side: um usuário de CIA ainda poderia inserir escala de outra
companhia via API direta — trade-off aceito (igual ao resto do app).

Acesso à rota `/escala-mensal` continua `['ADMIN','CIA_1','CIA_2','CIA_3','PCTAT']`.

## Seção E — Página Policiais: diretório só-leitura

`PoliciaisPage`:

**Remoções:**
- card "Novo policial" (formulário + botão Adicionar) — some para todos.
- coluna e botão "Remover" — some para todos (inclusive ADMIN).
- métodos `onCreate` / `onRemove` e os signals do formulário.

**Cadastro de policial:** por enquanto só via migração. (Uma futura fase
dará às CIAs uma forma de importar as próprias escalas, que criará os
policiais junto.)

**Adições:**
- **Busca** (input de texto): filtra por `nome_guerra` ou `matricula`
  (case-insensitive, substring) — mesmo padrão do Painel do PC.
- **Filtro por companhia** (`<select>`): opções `Todas`, cada companhia
  (`companhias` do banco) e `Sem companhia`. Valor inicial = a companhia
  do próprio perfil quando `companhiaDoRole(role)` não é null; senão
  `Todas`. O usuário pode trocar livremente (é só um diretório).
- **Coluna "Guarnição"**: nome da guarnição em que o policial está
  escalado na escala mensal (via `escala_mensal` → `guarnicoes.nome`).
  Um policial aparece em no máximo uma guarnição nos dados atuais; se
  estiver em mais de uma, junta com " / ". "—" se não escalado.
- **Coluna "Escala"**: recorrência + horário da linha de escala do
  policial, ex. `Ímpares · 06:00–18:00`. Rótulos: `PARES`→"Pares",
  `IMPARES`→"Ímpares", `DIAS_ESPECIFICOS`→"Dias específicos",
  `SEG_A_SEX`→"Seg–Sex", `TODOS_OS_DIAS`→"Todos os dias". "—" se não
  escalado.
- A coluna "Função" atual (tipo da guarnição no roster de hoje / "P.O.")
  **sai**; `funcaoHojePorMatricula` e o `listRosterDoDia` deixam de ser
  necessários — a página passa a carregar `listPoliciais`,
  `listCompanhias`, `listGuarnicoes` e `listEscalaMensal`.

Colunas finais: Matrícula · Grad. · Nome de guerra · Telefone · Companhia
· Guarnição · Escala.

Acesso à rota `/policiais` continua
`['ADMIN','CIA_1','CIA_2','CIA_3','PCTAT','PJES']`.

## Fora de escopo

- RLS / enforcement no banco (mantém permissivo).
- `companhia_id` em `perfis_usuarios`.
- Fluxo de importação de escala pelas CIAs (fase futura).
- Corrigir o e-mail de recuperação de senha (gap conhecido, não relacionado).
- Mudanças no Relatório SEI, Dashboard ou Admin.

## Verificação

- `npm test` e `npm run build` verdes; specs de `viaturas-page`,
  `guarnicoes-page` e `viaturas.service` removidos, `auth.service.spec`
  cobre `companhiaDoRole`.
- Conta `CIA_3`: menu sem Viaturas/Guarnições; Escala Mensal só com
  guarnições da 3ª CPM; Painel do PC sem nenhum controle de edição;
  Policiais sem Adicionar/Remover, com busca + filtro (iniciando em
  "3ª CPM") e as colunas Guarnição/Escala preenchidas.
- Conta `ADMIN`: Escala Mensal com tudo; Painel do PC também só-leitura;
  Policiais sem Adicionar/Remover.
- Conta `PC_LANCAMENTO`: Painel do PC com todos os controles de edição
  como hoje; sem acesso a Policiais/Escala Mensal (inalterado).
- Navegar direto para `/viaturas` ou `/guarnicoes` cai no `**` →
  redireciona para `/`.
