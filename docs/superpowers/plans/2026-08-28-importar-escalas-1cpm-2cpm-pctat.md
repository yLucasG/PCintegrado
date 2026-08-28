# Importar escalas 1ª CPM, 2ª CPM e PCTAT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popular o banco com as guarnições motorizadas das escalas de serviço de Agosto/2026 da 1ª CPM, 2ª CPM e PC Tático, seguindo o mesmo formato de seed já usado para a 3ª CPM, mais dois novos tipos de guarnição (`GG`, `CR`).

**Architecture:** Uma migration de schema adiciona `GG` e `CR` ao enum `public.tipo_guarnicao` e quatro arquivos de front-end estendem as listas de tipos que já existem. Uma segunda migration insere viaturas, policiais, guarnições e linhas de `escala_mensal` das três companhias — dados já deduplicados (os efetivos das quatro escalas são disjuntos, conferido na extração). Nenhuma lógica de aplicação muda.

**Tech Stack:** Angular 21 standalone components, Vitest, Supabase (Postgres + RLS), Tailwind v4. Sem novas dependências. Supabase CLI local (`./tools/supabase.exe`).

**Spec:** `docs/superpowers/specs/2026-08-28-importar-escalas-1cpm-2cpm-pctat-design.md`

## Global Constraints

- Escopo: só guarnições **motorizadas** (GT táticos, MO, CP, GV, GG, CR), os GT de comando/apoio 16000/16100/16200/16300, e as operações Maria da Penha (GT 16150) e Transporte Seguro/OTS (GT 16250/16350). **Fora:** POGs, Guarda, COPOM, PC 16º BPM, GT 16050 (Alerta Celular), efetivo administrativo, indisponíveis/LTS.
- `vigencia_inicio = '2026-08-01'` para todas as linhas, exceto marcações "AC/a-c dd/mm" individuais (só dois casos: matrícula `122672-0` FALCÃO → `2026-08-17`; matrícula `110356-3` T. XAVIER → `2026-08-10`).
- A 3ª CPM (migration `20260827020000`) **não é alterada**.
- UUIDs de guarnição na faixa `b0000000-0000-4000-8000-0000000000XX` (a 3ª CPM usa `a0…`).
- Inserts idempotentes: `on conflict (prefixo) do nothing` em `viaturas`, `on conflict (matricula) do nothing` em `policiais`.
- Telefones gravados só com dígitos (sem espaços, traços ou parênteses), como no seed da 3ª CPM. Onde o PDF traz telefone ilegível/ausente, gravar `null`.
- `nome_guerra` em maiúsculas, com acentos, exatamente como no PDF.
- `graduacao` (texto livre): usar `SD`, `CB`, `ST`, `ASP`, `1º SGT`, `2º SGT`, `3º SGT`, `2º TEN`.
- `funcao` em `escala_mensal`: `CMT`, `MOT`, `PAT` (segundo `PAT` é permitido).

---

### Task 1: Schema — tipos `GG` e `CR`

**Files:**
- Create: `supabase/migrations/20260827100000_tipo_guarnicao_gg_cr.sql`
- Modify: `src/app/core/services/guarnicoes.service.ts:4`
- Modify: `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts:22`
- Modify: `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts:82`
- Modify: `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts:34`

**Interfaces:**
- Produces: enum `public.tipo_guarnicao` passa a aceitar `'GG'` e `'CR'`; type `TipoGuarnicao` passa a incluir `'GG' | 'CR'` — consumido pela migration de seed (Tasks 2–4) e pelas telas.

- [ ] **Step 1: Escrever a migration de schema**

Criar `supabase/migrations/20260827100000_tipo_guarnicao_gg_cr.sql`:
```sql
alter type public.tipo_guarnicao add value 'GG';
alter type public.tipo_guarnicao add value 'CR';
```

- [ ] **Step 2: Estender o type `TipoGuarnicao`**

Em `src/app/core/services/guarnicoes.service.ts`, linha 4:
```typescript
export type TipoGuarnicao = 'GT_TATICO' | 'GT_ORDINARIO' | 'MO' | 'CP' | 'GV' | 'GG' | 'CR';
```

- [ ] **Step 3: Estender as três listas de tipos nas telas**

Em `src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts` (linha ~22):
```typescript
  readonly tipos: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV', 'GG', 'CR'];
```

Em `src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts` (linha ~82):
```typescript
  readonly tiposGuarnicao: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV', 'GG', 'CR'];
```

Em `src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts` (linha ~34):
```typescript
const TIPOS_ORDINARIO: TipoGuarnicao[] = ['GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV', 'GG', 'CR'];
```

- [ ] **Step 4: Rodar a suíte de testes e o build**

Run: `npm test -- --watch=false`
Expected: PASS (nenhum spec assere as listas de tipo diretamente).

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260827100000_tipo_guarnicao_gg_cr.sql src/app/core/services/guarnicoes.service.ts src/app/features/guarnicoes/guarnicoes-page/guarnicoes-page.ts src/app/features/painel-pc/painel-pc-page/painel-pc-page.ts src/app/features/relatorio-sei/relatorio-sei-page/relatorio-sei-page.ts
git commit -m "feat: add GG and CR guarnicao types"
```

---

### Task 2: Seed — 1ª CPM

**Files:**
- Create: `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql`

**Interfaces:**
- Consumes: enum estendido da Task 1; tabelas `companhias`, `viaturas`, `policiais`, `guarnicoes`, `escala_mensal`; função `fn_resolve_escala_dia`.
- Produces: 10 guarnições da 1ª CPM (`b0000000-…-01` a `…-0a`), 14 viaturas, 62 policiais, 62 linhas de `escala_mensal`.

- [ ] **Step 1: Criar o arquivo com o bloco da 1ª CPM**

Criar `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql` com o conteúdo abaixo:

```sql
-- ============================================================
-- Escalas de Serviço Agosto/2026 — 1ª CPM, 2ª CPM e PC Tático
-- Guarnições motorizadas. Efetivos disjuntos entre as 4 escalas
-- (3ª CPM já carregada em 20260827020000). Ver spec
-- docs/superpowers/specs/2026-08-28-importar-escalas-1cpm-2cpm-pctat-design.md
-- ============================================================

-- ========================= 1ª CPM ===========================

insert into public.viaturas (prefixo, area_atuacao) values
  ('16111', 'São José / Cabanga'),
  ('16112', 'São José / Santo Antônio'),
  ('16113', 'São José / Santo Antônio'),
  ('CP16111', 'São José / Santo Antônio'),
  ('CP16112', 'São José / Santo Antônio'),
  ('CP16113', 'São José / Santo Antônio'),
  ('CP16114', 'São José / Santo Antônio'),
  ('CP16115', 'São José / Santo Antônio'),
  ('CP16116', 'São José / Santo Antônio'),
  ('GT16000', 'Toda área do 16º BPM'),
  ('GT16100', 'Toda área do 16º BPM'),
  ('GT16200', 'Toda área do 16º BPM'),
  ('GT16300', 'Toda área do 16º BPM'),
  ('GT16150', 'Toda área do 16º BPM')
on conflict (prefixo) do nothing;

insert into public.policiais (matricula, graduacao, nome_guerra, telefone, companhia_id) values
  ('110361-0', '3º SGT', 'PAULO BEZERRA', '81998314440', (select id from public.companhias where nome = '1ª CPM')),
  ('128452-5', 'SD', 'JEFFERSON ANDRADE', '81996109810', (select id from public.companhias where nome = '1ª CPM')),
  ('128427-4', 'SD', 'DE MELO', '81997678229', (select id from public.companhias where nome = '1ª CPM')),
  ('129525-0', 'SD', 'SOBRINHO', '81984564723', (select id from public.companhias where nome = '1ª CPM')),
  ('127445-7', 'SD', 'SANTOS', '81983798003', (select id from public.companhias where nome = '1ª CPM')),
  ('128554-8', 'SD', 'B. RIBEIRO', '81984683151', (select id from public.companhias where nome = '1ª CPM')),
  ('129198-0', 'SD', 'CAETANO', '81991206813', (select id from public.companhias where nome = '1ª CPM')),
  ('128824-5', 'SD', 'GUILHERME', '81995922264', (select id from public.companhias where nome = '1ª CPM')),
  ('103639-4', '2º SGT', 'R. BRITO', '81996769552', (select id from public.companhias where nome = '1ª CPM')),
  ('107722-8', '3º SGT', 'GUEIROS', '81996701200', (select id from public.companhias where nome = '1ª CPM')),
  ('109360-6', '3º SGT', 'R. ALVES', '81999115498', (select id from public.companhias where nome = '1ª CPM')),
  ('126543-1', 'SD', 'DIAS', '81989925744', (select id from public.companhias where nome = '1ª CPM')),
  ('115684-9', 'CB', 'SUELLEN SANTOS', '81997729347', (select id from public.companhias where nome = '1ª CPM')),
  ('107644-2', '3º SGT', 'CASSIMIRO', '81985796606', (select id from public.companhias where nome = '1ª CPM')),
  ('127059-1', 'SD', 'JOSÉ', '81989023880', (select id from public.companhias where nome = '1ª CPM')),
  ('122672-0', 'SD', 'FALCÃO', '81988483054', (select id from public.companhias where nome = '1ª CPM')),
  ('125765-0', 'SD', 'JOSÉ DIAS', '81984418261', (select id from public.companhias where nome = '1ª CPM')),
  ('113671-2', 'CB', 'T. RODRIGUES', '81997422641', (select id from public.companhias where nome = '1ª CPM')),
  ('125710-2', 'SD', 'NAARA', '81999538738', (select id from public.companhias where nome = '1ª CPM')),
  ('129540-3', 'SD', 'AZARIAS', '79991369708', (select id from public.companhias where nome = '1ª CPM')),
  ('128753-2', 'SD', 'QUINTINO', '81994518720', (select id from public.companhias where nome = '1ª CPM')),
  ('128678-1', 'SD', 'SUELLEN', '87981551686', (select id from public.companhias where nome = '1ª CPM')),
  ('128362-6', 'SD', 'MOURA', '81998871014', (select id from public.companhias where nome = '1ª CPM')),
  ('128431-2', 'SD', 'MOTA DIONÍZIO', '81997849524', (select id from public.companhias where nome = '1ª CPM')),
  ('129181-5', 'SD', 'WILYAN BARROS', '81988993388', (select id from public.companhias where nome = '1ª CPM')),
  ('128499-1', 'SD', 'ODON', '81995084434', (select id from public.companhias where nome = '1ª CPM')),
  ('129460-1', 'SD', 'DUTRA', '81984021757', (select id from public.companhias where nome = '1ª CPM')),
  ('128478-9', 'SD', 'GABRIEL FERREIRA', '81992798787', (select id from public.companhias where nome = '1ª CPM')),
  ('128352-9', 'SD', 'EDUARDA SOUZA', '81992199337', (select id from public.companhias where nome = '1ª CPM')),
  ('120846-2', 'CB', 'RYSTER', '81999107979', (select id from public.companhias where nome = '1ª CPM')),
  ('129211-0', 'SD', 'LEANDRO FELIPE', '81985298990', (select id from public.companhias where nome = '1ª CPM')),
  ('129063-0', 'SD', 'GIZELLE', '81996768209', (select id from public.companhias where nome = '1ª CPM')),
  ('128973-0', 'SD', 'ADELINO', '81996057399', (select id from public.companhias where nome = '1ª CPM')),
  ('129558-6', 'SD', 'BERKEN', '87981620969', (select id from public.companhias where nome = '1ª CPM')),
  ('114055-8', 'CB', 'OLIVEIRA', '81998751444', (select id from public.companhias where nome = '1ª CPM')),
  ('125833-8', 'SD', 'MONTE LINS', '81992437500', (select id from public.companhias where nome = '1ª CPM')),
  ('127396-5', 'SD', 'KAROLAYNE ARAÚJO', '84996170207', (select id from public.companhias where nome = '1ª CPM')),
  ('129544-6', 'SD', 'VALDEIR', '84994335560', (select id from public.companhias where nome = '1ª CPM')),
  ('129059-2', 'SD', 'VINICIUS GOUVEIA', '81988204006', (select id from public.companhias where nome = '1ª CPM')),
  ('129564-0', 'SD', 'EVALDO', '87996282119', (select id from public.companhias where nome = '1ª CPM')),
  ('127563-1', 'SD', 'LOURENÇO LIMA', '87981639065', (select id from public.companhias where nome = '1ª CPM')),
  ('129223-4', 'SD', 'THIERRY', '81997381759', (select id from public.companhias where nome = '1ª CPM')),
  ('127668-9', 'SD', 'VICTÓRIA CONCEIÇÃO', '81998980561', (select id from public.companhias where nome = '1ª CPM')),
  ('129549-7', 'SD', 'DE ALMEIDA', '81994428738', (select id from public.companhias where nome = '1ª CPM')),
  ('129514-4', 'SD', 'MAYCON DOUGLAS', '87988261663', (select id from public.companhias where nome = '1ª CPM')),
  ('129170-0', 'SD', 'A. SANTOS', '87998234409', (select id from public.companhias where nome = '1ª CPM')),
  ('128897-0', 'SD', 'F.SARAIVA', '81996326707', (select id from public.companhias where nome = '1ª CPM')),
  ('112102-2', 'CB', 'KLÉBER SENNA', '81995990846', (select id from public.companhias where nome = '1ª CPM')),
  ('125539-8', 'SD', 'G. CARDOSO', '81985177386', (select id from public.companhias where nome = '1ª CPM')),
  ('129528-4', 'SD', 'VICTOR SOUZA', '81996713954', (select id from public.companhias where nome = '1ª CPM')),
  ('128876-8', 'SD', 'ERIK FREITAS', '87981113662', (select id from public.companhias where nome = '1ª CPM')),
  ('128536-0', 'SD', 'HOLANDA', '87996671540', (select id from public.companhias where nome = '1ª CPM')),
  ('128532-7', 'SD', 'EUDES', '81996768540', (select id from public.companhias where nome = '1ª CPM')),
  ('129210-2', 'SD', 'LUIZ BATISTA', '81986346282', (select id from public.companhias where nome = '1ª CPM')),
  ('127341-8', 'SD', 'JULIANA SOUZA', '82999793135', (select id from public.companhias where nome = '1ª CPM')),
  ('128383-9', 'SD', 'KALEBE MARQUES', '81994411354', (select id from public.companhias where nome = '1ª CPM')),
  ('127830-4', 'SD', 'DEIVISON', '81997125266', (select id from public.companhias where nome = '1ª CPM')),
  ('128899-7', 'SD', 'SILVESTRE', '81994880742', (select id from public.companhias where nome = '1ª CPM')),
  ('129405-9', 'SD', 'GOES', '81986521329', (select id from public.companhias where nome = '1ª CPM')),
  ('128587-4', 'SD', 'J. FONTES', '81998045181', (select id from public.companhias where nome = '1ª CPM')),
  ('128756-7', 'SD', 'LEITE NETO', '87996230559', (select id from public.companhias where nome = '1ª CPM')),
  ('127400-7', 'SD', 'GOUVEIA SILVA', '81996193686', (select id from public.companhias where nome = '1ª CPM'))
on conflict (matricula) do nothing;

insert into public.guarnicoes (id, nome, tipo, companhia_id, area_atuacao, prefixos) values
  ('b0000000-0000-4000-8000-000000000001', 'GT 16111 - São José / Cabanga', 'GT_TATICO', (select id from public.companhias where nome = '1ª CPM'), 'São José / Cabanga', ARRAY['16111']),
  ('b0000000-0000-4000-8000-000000000002', 'GT 16112 - São José / Santo Antônio', 'GT_TATICO', (select id from public.companhias where nome = '1ª CPM'), 'São José / Santo Antônio', ARRAY['16112']),
  ('b0000000-0000-4000-8000-000000000003', 'GT 16113 - São José / Santo Antônio', 'GT_TATICO', (select id from public.companhias where nome = '1ª CPM'), 'São José / Santo Antônio', ARRAY['16113']),
  ('b0000000-0000-4000-8000-000000000004', 'Ciclopatrulha 16111/112/113 - São José / Santo Antônio', 'CP', (select id from public.companhias where nome = '1ª CPM'), 'São José / Santo Antônio', ARRAY['CP16111','CP16112','CP16113']),
  ('b0000000-0000-4000-8000-000000000005', 'Ciclopatrulha 16114/115/116 - São José / Santo Antônio', 'CP', (select id from public.companhias where nome = '1ª CPM'), 'São José / Santo Antônio', ARRAY['CP16114','CP16115','CP16116']),
  ('b0000000-0000-4000-8000-000000000006', 'GT 16000 - Apoio ao Oficial de Operações', 'GT_ORDINARIO', (select id from public.companhias where nome = '1ª CPM'), 'Toda área do 16º BPM', ARRAY['GT16000']),
  ('b0000000-0000-4000-8000-000000000007', 'GT 16100 - Comando', 'GT_ORDINARIO', (select id from public.companhias where nome = '1ª CPM'), 'Toda área do 16º BPM', ARRAY['GT16100']),
  ('b0000000-0000-4000-8000-000000000008', 'GT 16200 - Subcomando', 'GT_ORDINARIO', (select id from public.companhias where nome = '1ª CPM'), 'Toda área do 16º BPM', ARRAY['GT16200']),
  ('b0000000-0000-4000-8000-000000000009', 'GT 16300 - Motorista de Fiscalização de POG/CP', 'GT_ORDINARIO', (select id from public.companhias where nome = '1ª CPM'), 'Toda área do 16º BPM', ARRAY['GT16300']),
  ('b0000000-0000-4000-8000-00000000000a', 'Operação Maria da Penha (GT 16150)', 'GT_ORDINARIO', (select id from public.companhias where nome = '1ª CPM'), 'Toda área do 16º BPM', ARRAY['GT16150']);

-- Escala Mensal — 1ª CPM
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  -- GT 16000
  ('b0000000-0000-4000-8000-000000000006', '110361-0', 'PAT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '128452-5', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '128427-4', 'PAT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '129525-0', 'MOT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '127445-7', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '128554-8', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '129198-0', 'PAT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000006', '128824-5', 'MOT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16100
  ('b0000000-0000-4000-8000-000000000007', '103639-4', 'PAT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000007', '107722-8', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000007', '109360-6', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000007', '126543-1', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16200
  ('b0000000-0000-4000-8000-000000000008', '115684-9', 'PAT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000008', '107644-2', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000008', '127059-1', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000008', '122672-0', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-17', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16300
  ('b0000000-0000-4000-8000-000000000009', '125765-0', 'MOT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000009', '113671-2', 'MOT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16150 (Maria da Penha)
  ('b0000000-0000-4000-8000-00000000000a', '125710-2', 'CMT', '06:00', '14:00', 'SEG_A_SEX', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000a', '129540-3', 'PAT', '06:00', '14:00', 'SEG_A_SEX', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000a', '128753-2', 'MOT', '06:00', '14:00', 'SEG_A_SEX', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16111
  ('b0000000-0000-4000-8000-000000000001', '128678-1', 'CMT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '128362-6', 'MOT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '128431-2', 'CMT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '129181-5', 'MOT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '128499-1', 'CMT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '129460-1', 'MOT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '128478-9', 'CMT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000001', '128352-9', 'MOT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16112
  ('b0000000-0000-4000-8000-000000000002', '120846-2', 'CMT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '129211-0', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '129063-0', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '128973-0', 'CMT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '129558-6', 'MOT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '114055-8', 'CMT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '125833-8', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '127396-5', 'CMT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000002', '129544-6', 'MOT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- GT 16113
  ('b0000000-0000-4000-8000-000000000003', '129059-2', 'CMT', '07:00', '19:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '129564-0', 'MOT', '07:00', '19:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '127563-1', 'CMT', '19:00', '07:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '129223-4', 'MOT', '19:00', '07:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '127668-9', 'CMT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '129549-7', 'PAT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '129514-4', 'MOT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '129170-0', 'CMT', '19:00', '07:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000003', '128897-0', 'MOT', '19:00', '07:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- CP 16111/112/113
  ('b0000000-0000-4000-8000-000000000004', '112102-2', 'CMT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000004', '125539-8', 'PAT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000004', '129528-4', 'PAT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  -- CP 16114/115/116
  ('b0000000-0000-4000-8000-000000000005', '128876-8', 'CMT', '05:00', '13:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128536-0', 'PAT', '05:00', '13:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128532-7', 'PAT', '05:00', '13:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '129210-2', 'CMT', '13:00', '21:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '127341-8', 'PAT', '13:00', '21:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128383-9', 'PAT', '13:00', '21:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '127830-4', 'CMT', '05:00', '13:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128899-7', 'PAT', '05:00', '13:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '129405-9', 'PAT', '05:00', '13:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128587-4', 'CMT', '13:00', '21:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '128756-7', 'PAT', '13:00', '21:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000005', '127400-7', 'PAT', '13:00', '21:00', 'PARES', '2026-08-01', 'Escala de Serviço 1ª CPM - Agosto 2026');
```

- [ ] **Step 2: Aplicar e conferir a 1ª CPM**

Run: `./tools/supabase.exe db reset`
Expected: aplica todas as migrations sem erro.

Run (via `./tools/supabase.exe db reset` seguido de query no Studio local, ou `psql` na connection string local):
```sql
select count(*) from public.guarnicoes g
  join public.companhias c on c.id = g.companhia_id where c.nome = '1ª CPM';
-- Esperado: 10
select count(*) from public.escala_mensal where escala_origem = 'Escala de Serviço 1ª CPM - Agosto 2026';
-- Esperado: 62
select policial_matricula, count(*) from public.escala_mensal
  where escala_origem = 'Escala de Serviço 1ª CPM - Agosto 2026'
  group by 1 having count(*) > 1;
-- Esperado: 0 linhas
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql
git commit -m "feat: seed 1a CPM schedule (Agosto 2026)"
```

---

### Task 3: Seed — 2ª CPM

**Files:**
- Modify: `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql` (append)

**Interfaces:**
- Consumes: mesmo arquivo da Task 2.
- Produces: 7 guarnições da 2ª CPM (`b0000000-…-0b` a `…-11`), 12 viaturas, 56 policiais, 56 linhas de `escala_mensal`.

- [ ] **Step 1: Anexar o bloco da 2ª CPM ao final do arquivo**

Adicionar ao fim de `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql`:

```sql
-- ========================= 2ª CPM ===========================

insert into public.viaturas (prefixo, area_atuacao) values
  ('16221', 'Joana Bezerra'),
  ('16222', 'Ilha do Leite'),
  ('16223', 'Joana Bezerra'),
  ('16224', 'RHP / Ilha do Leite'),
  ('MO16221', 'Ilha do Leite / Joana Bezerra / Paissandu'),
  ('MO16222', 'Ilha do Leite / Joana Bezerra / Paissandu'),
  ('MO16223', 'Ilha do Leite / Joana Bezerra / Paissandu'),
  ('CP16221', 'Ilha do Leite'),
  ('CP16222', 'Ilha do Leite'),
  ('CP16223', 'Ilha do Leite'),
  ('GT16250', 'O.S. 16º BPM 948/2026'),
  ('GT16350', 'O.S. 16º BPM 948/2026')
on conflict (prefixo) do nothing;

insert into public.policiais (matricula, graduacao, nome_guerra, telefone, companhia_id) values
  ('110963-4', '3º SGT', 'RAFAELA RODRIGUES', '81988695948', (select id from public.companhias where nome = '2ª CPM')),
  ('128206-9', 'SD', 'JHONNI', '88999313315', (select id from public.companhias where nome = '2ª CPM')),
  ('104520-2', '3º SGT', 'ROZENDO', '81988819836', (select id from public.companhias where nome = '2ª CPM')),
  ('129571-3', 'SD', 'DARTANAEL', '88988149979', (select id from public.companhias where nome = '2ª CPM')),
  ('127884-3', 'SD', 'P. REIS', '74988135690', (select id from public.companhias where nome = '2ª CPM')),
  ('128222-0', 'SD', 'ROBERTO SANTOS', '87988616682', (select id from public.companhias where nome = '2ª CPM')),
  ('128604-8', 'SD', 'CARLOS SIMÕES', '74981045019', (select id from public.companhias where nome = '2ª CPM')),
  ('129111-4', 'SD', 'FÁBIO ANDRADE', '81997128208', (select id from public.companhias where nome = '2ª CPM')),
  ('129568-3', 'SD', 'M. NASCIMENTO', '81991938102', (select id from public.companhias where nome = '2ª CPM')),
  ('129277-3', 'SD', 'SAMUEL BARBOSA', '81997139507', (select id from public.companhias where nome = '2ª CPM')),
  ('129137-8', 'SD', 'BRUNO SANTOS', '75992849795', (select id from public.companhias where nome = '2ª CPM')),
  ('128423-1', 'SD', 'FRANCISCO MARQUES', '81932779530', (select id from public.companhias where nome = '2ª CPM')),
  ('127730-8', 'SD', 'ROLLAND', '83988773068', (select id from public.companhias where nome = '2ª CPM')),
  ('128442-8', 'SD', 'WILLIAN ALVES', '81983081352', (select id from public.companhias where nome = '2ª CPM')),
  ('128974-8', 'SD', 'MIQUÉAS', '82981229579', (select id from public.companhias where nome = '2ª CPM')),
  ('129346-0', 'SD', 'CARDOSO SANTOS', '9998447180', (select id from public.companhias where nome = '2ª CPM')),
  ('127894-0', 'SD', 'IVONALDO', '81992779530', (select id from public.companhias where nome = '2ª CPM')),
  ('127560-7', 'SD', 'RAVEL', '81984550789', (select id from public.companhias where nome = '2ª CPM')),
  ('128802-4', 'SD', 'EFRAIN', '81985412183', (select id from public.companhias where nome = '2ª CPM')),
  ('128718-4', 'SD', 'ALMIR', '81996394453', (select id from public.companhias where nome = '2ª CPM')),
  ('127717-0', 'SD', 'JOÃO SANTANA', '81984446520', (select id from public.companhias where nome = '2ª CPM')),
  ('129433-4', 'SD', 'AIRTON', '81998324779', (select id from public.companhias where nome = '2ª CPM')),
  ('120297-9', 'CB', 'VARELLA', '81983300899', (select id from public.companhias where nome = '2ª CPM')),
  ('128951-9', 'SD', 'MATHEUS PEREIRA', '83986407304', (select id from public.companhias where nome = '2ª CPM')),
  ('128700-1', 'SD', 'KLAIVER', '81999604676', (select id from public.companhias where nome = '2ª CPM')),
  ('128010-4', 'SD', 'ALEF', '83986681249', (select id from public.companhias where nome = '2ª CPM')),
  ('128294-8', 'SD', 'DE LIMA', '81994713852', (select id from public.companhias where nome = '2ª CPM')),
  ('129271-4', 'SD', 'F. SILVA', '88993548143', (select id from public.companhias where nome = '2ª CPM')),
  ('111005-5', '3º SGT', 'CLÁUDIO SANTOS', '81996631853', (select id from public.companhias where nome = '2ª CPM')),
  ('128184-4', 'SD', 'KLEITON SILVA', '81999897850', (select id from public.companhias where nome = '2ª CPM')),
  ('128725-7', 'SD', 'RANILSON SÁ', '87991104194', (select id from public.companhias where nome = '2ª CPM')),
  ('110356-3', '3º SGT', 'T. XAVIER', '81999147879', (select id from public.companhias where nome = '2ª CPM')),
  ('125847-8', 'SD', 'J LEANDRO', '87981488913', (select id from public.companhias where nome = '2ª CPM')),
  ('128572-6', 'SD', 'NAVIDIEL', '87999682498', (select id from public.companhias where nome = '2ª CPM')),
  ('128937-3', 'SD', 'PAMELA SOARES', '83998482828', (select id from public.companhias where nome = '2ª CPM')),
  ('128530-0', 'SD', 'PETUBA', '82998382827', (select id from public.companhias where nome = '2ª CPM')),
  ('128444-4', 'SD', 'MISAEL SANTANA', '81982276328', (select id from public.companhias where nome = '2ª CPM')),
  ('128194-1', 'SD', 'BRUNO LIMA', '87991642160', (select id from public.companhias where nome = '2ª CPM')),
  ('129264-1', 'SD', 'M. FRANCISCO', '81987388750', (select id from public.companhias where nome = '2ª CPM')),
  ('129534-9', 'SD', 'ISAC MARQUES', '84981394077', (select id from public.companhias where nome = '2ª CPM')),
  ('128596-3', 'SD', 'DANIEL RODRIGUES', '8898853582', (select id from public.companhias where nome = '2ª CPM')),
  ('128271-9', 'SD', 'BRENDA OLIVEIRA', '83987973601', (select id from public.companhias where nome = '2ª CPM')),
  ('129024-0', 'SD', 'LUCAS PEREIRA', '74981146252', (select id from public.companhias where nome = '2ª CPM')),
  ('128711-7', 'SD', 'THIAGO LIMA', '87999728490', (select id from public.companhias where nome = '2ª CPM')),
  ('129240-4', 'SD', 'EDSON FILHO', '81994039945', (select id from public.companhias where nome = '2ª CPM')),
  ('128182-8', 'SD', 'R. NUNES', '81985978010', (select id from public.companhias where nome = '2ª CPM')),
  ('109091-7', '3º SGT', 'FAUSTO AUGUSTO', '81996256776', (select id from public.companhias where nome = '2ª CPM')),
  ('129438-5', 'SD', 'HENRIQUE MELO', '81984488555', (select id from public.companhias where nome = '2ª CPM')),
  ('125846-0', 'SD', 'F. SOUZA', '81987963155', (select id from public.companhias where nome = '2ª CPM')),
  ('116301-9', 'CB', 'DENYS', '81986986415', (select id from public.companhias where nome = '2ª CPM')),
  ('122728-9', 'SD', 'ACIOLY', '81986986415', (select id from public.companhias where nome = '2ª CPM')),
  ('109602-8', '3º SGT', 'SANTANA', '81988231353', (select id from public.companhias where nome = '2ª CPM')),
  ('128329-4', 'SD', 'JACÓ', '65996347553', (select id from public.companhias where nome = '2ª CPM')),
  ('122677-0', 'SD', 'R. LOPES', '81999989482', (select id from public.companhias where nome = '2ª CPM')),
  ('116378-7', 'CB', 'FREDSON', '81983300899', (select id from public.companhias where nome = '2ª CPM')),
  ('129345-1', 'SD', 'GONZAGA', '81991805303', (select id from public.companhias where nome = '2ª CPM'))
on conflict (matricula) do nothing;

insert into public.guarnicoes (id, nome, tipo, companhia_id, area_atuacao, prefixos) values
  ('b0000000-0000-4000-8000-00000000000b', 'GT 16221 - Joana Bezerra', 'GT_TATICO', (select id from public.companhias where nome = '2ª CPM'), 'Joana Bezerra', ARRAY['16221']),
  ('b0000000-0000-4000-8000-00000000000c', 'GT 16222 - Ilha do Leite', 'GT_TATICO', (select id from public.companhias where nome = '2ª CPM'), 'Ilha do Leite', ARRAY['16222']),
  ('b0000000-0000-4000-8000-00000000000d', 'GT 16223 - Joana Bezerra', 'GT_TATICO', (select id from public.companhias where nome = '2ª CPM'), 'Joana Bezerra', ARRAY['16223']),
  ('b0000000-0000-4000-8000-00000000000e', 'GT 16224 - RHP / Ilha do Leite', 'GT_TATICO', (select id from public.companhias where nome = '2ª CPM'), 'RHP / Ilha do Leite', ARRAY['16224']),
  ('b0000000-0000-4000-8000-00000000000f', 'Motopatrulha 16221/222/223 - Ilha do Leite / Joana Bezerra / Paissandu', 'MO', (select id from public.companhias where nome = '2ª CPM'), 'Ilha do Leite / Joana Bezerra / Paissandu', ARRAY['MO16221','MO16222','MO16223']),
  ('b0000000-0000-4000-8000-000000000010', 'Ciclopatrulha 16221/222/223 - Ilha do Leite', 'CP', (select id from public.companhias where nome = '2ª CPM'), 'Ilha do Leite', ARRAY['CP16221','CP16222','CP16223']),
  ('b0000000-0000-4000-8000-000000000011', 'Operação Transporte Seguro / OTS (GT 16250/16350)', 'GT_ORDINARIO', (select id from public.companhias where nome = '2ª CPM'), 'O.S. 16º BPM 948/2026', ARRAY['GT16250','GT16350']);

-- Escala Mensal — 2ª CPM
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  -- GT 16221
  ('b0000000-0000-4000-8000-00000000000b', '110963-4', 'CMT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000b', '128206-9', 'MOT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000b', '104520-2', 'CMT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000b', '129571-3', 'MOT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- GT 16222
  ('b0000000-0000-4000-8000-00000000000c', '127884-3', 'CMT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '128222-0', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '128604-8', 'CMT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '129111-4', 'MOT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '129568-3', 'CMT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '129277-3', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '129137-8', 'CMT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000c', '128423-1', 'MOT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- GT 16223
  ('b0000000-0000-4000-8000-00000000000d', '127730-8', 'CMT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '128442-8', 'MOT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '128974-8', 'PAT', '07:00', '19:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '129346-0', 'CMT', '19:00', '07:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '127894-0', 'MOT', '19:00', '07:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '127560-7', 'CMT', '07:00', '19:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '128802-4', 'MOT', '07:00', '19:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '128718-4', 'PAT', '07:00', '19:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '127717-0', 'CMT', '19:00', '07:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000d', '129433-4', 'MOT', '19:00', '07:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- GT 16224
  ('b0000000-0000-4000-8000-00000000000e', '120297-9', 'CMT', '08:00', '20:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000e', '128951-9', 'MOT', '08:00', '20:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000e', '128700-1', 'CMT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000e', '128010-4', 'MOT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000e', '128294-8', 'CMT', '08:00', '20:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000e', '129271-4', 'MOT', '08:00', '20:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- MO 16221/222/223 (só linhas com efetivo real; vagas PJES ignoradas)
  ('b0000000-0000-4000-8000-00000000000f', '111005-5', 'CMT', '06:00', '14:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000f', '128184-4', 'CMT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000f', '128725-7', 'PAT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000f', '110356-3', 'CMT', '06:00', '14:00', 'PARES', '2026-08-10', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000f', '125847-8', 'PAT', '06:00', '14:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-00000000000f', '128572-6', 'PAT', '06:00', '14:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- CP 16221/222/223
  ('b0000000-0000-4000-8000-000000000010', '128937-3', 'CMT', '06:00', '14:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128530-0', 'PAT', '06:00', '14:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128444-4', 'PAT', '06:00', '14:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128194-1', 'CMT', '14:00', '22:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '129264-1', 'PAT', '14:00', '22:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '129534-9', 'PAT', '14:00', '22:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128596-3', 'CMT', '06:00', '14:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128271-9', 'PAT', '06:00', '14:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '129024-0', 'PAT', '06:00', '14:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128711-7', 'CMT', '14:00', '22:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '129240-4', 'PAT', '14:00', '22:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000010', '128182-8', 'PAT', '14:00', '22:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  -- OTS GT 16250/16350
  ('b0000000-0000-4000-8000-000000000011', '109091-7', 'CMT', '13:00', '01:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '129438-5', 'MOT', '13:00', '01:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '125846-0', 'PAT', '13:00', '01:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '116301-9', 'CMT', '13:00', '01:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '122728-9', 'MOT', '13:00', '01:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '109602-8', 'CMT', '13:00', '01:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '128329-4', 'MOT', '13:00', '01:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '122677-0', 'PAT', '13:00', '01:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '116378-7', 'CMT', '13:00', '01:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000011', '129345-1', 'MOT', '13:00', '01:00', 'PARES', '2026-08-01', 'Escala de Serviço 2ª CPM - Agosto 2026');
```

- [ ] **Step 2: Aplicar e conferir a 2ª CPM**

Run: `./tools/supabase.exe db reset`
Expected: sem erro.

```sql
select count(*) from public.guarnicoes g
  join public.companhias c on c.id = g.companhia_id where c.nome = '2ª CPM';
-- Esperado: 7
select count(*) from public.escala_mensal where escala_origem = 'Escala de Serviço 2ª CPM - Agosto 2026';
-- Esperado: 56
select policial_matricula, count(*) from public.escala_mensal
  group by 1 having count(*) > 1;
-- Esperado: 0 linhas (nenhuma matrícula em duas guarnições, contando também 1ª e 3ª CPM)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql
git commit -m "feat: seed 2a CPM schedule (Agosto 2026)"
```

---

### Task 4: Seed — PC Tático

**Files:**
- Modify: `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql` (append)

**Interfaces:**
- Consumes: mesmo arquivo.
- Produces: 5 guarnições do PCTAT (`b0000000-…-12` a `…-16`), 10 viaturas, 65 policiais, 65 linhas de `escala_mensal`.

- [ ] **Step 1: Anexar o bloco do PCTAT ao final do arquivo**

Adicionar ao fim de `supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql`:

```sql
-- ========================= PC TÁTICO ========================

insert into public.viaturas (prefixo, area_atuacao) values
  ('GG16450', 'Toda área do 16º BPM'),
  ('GG16550', 'Toda área do 16º BPM'),
  ('CR16750', 'Toda área do 16º BPM'),
  ('MO16131', 'Santo Antônio / São José / Cabanga'),
  ('MO16132', 'Santo Antônio / São José / Cabanga'),
  ('MO16133', 'Santo Antônio / São José / Cabanga'),
  ('MO16331', 'Boa Vista / Soledade / Santo Amaro'),
  ('MO16332', 'Boa Vista / Soledade / Santo Amaro'),
  ('MO16333', 'Boa Vista / Soledade / Santo Amaro'),
  ('GV16650', 'Toda área do 16º BPM')
on conflict (prefixo) do nothing;

insert into public.policiais (matricula, graduacao, nome_guerra, telefone, companhia_id) values
  ('111080-2', '3º SGT', 'SILVIO MEDEIROS', '8195173038', (select id from public.companhias where nome = 'PCTAT')),
  ('126581-4', 'SD', 'GALVÃO', '8173354469', (select id from public.companhias where nome = 'PCTAT')),
  ('125855-9', 'SD', 'P. MELO', '81995198880', (select id from public.companhias where nome = 'PCTAT')),
  ('125758-7', 'SD', 'R. LIMA', '8184825885', (select id from public.companhias where nome = 'PCTAT')),
  ('126570-9', 'SD', 'CONSTANTINO', '8188533118', (select id from public.companhias where nome = 'PCTAT')),
  ('122661-4', 'SD', 'ESTÊVÃO', '8183042584', (select id from public.companhias where nome = 'PCTAT')),
  ('126579-2', 'SD', 'CRISTHYAM', '8171037606', (select id from public.companhias where nome = 'PCTAT')),
  ('126584-9', 'SD', 'LUIZ', '8192814701', (select id from public.companhias where nome = 'PCTAT')),
  ('125844-3', 'SD', 'R. ROMÁRIO', '8197824011', (select id from public.companhias where nome = 'PCTAT')),
  ('126481-8', 'SD', 'SÁ', '8788588006', (select id from public.companhias where nome = 'PCTAT')),
  ('105701-4', '3º SGT', 'ELIZEU', '8187771169', (select id from public.companhias where nome = 'PCTAT')),
  ('126534-2', 'SD', 'VIANA', '8171037606', (select id from public.companhias where nome = 'PCTAT')),
  ('126313-7', 'SD', 'ROSÂNGELA BARBOSA', '8184719270', (select id from public.companhias where nome = 'PCTAT')),
  ('125834-6', 'SD', 'FILHO', '8197084490', (select id from public.companhias where nome = 'PCTAT')),
  ('126487-7', 'SD', 'DAMASCENA', '8192529851', (select id from public.companhias where nome = 'PCTAT')),
  ('102813-8', '2º SGT', 'CARLOS FILHO', '8187708870', (select id from public.companhias where nome = 'PCTAT')),
  ('126590-3', 'SD', 'IRANDIR', '8179025930', (select id from public.companhias where nome = 'PCTAT')),
  ('126410-9', 'SD', 'JAIRO', '8186103527', (select id from public.companhias where nome = 'PCTAT')),
  ('122746-7', 'SD', 'RIBEIRO', '8198018071', (select id from public.companhias where nome = 'PCTAT')),
  ('126550-4', 'SD', 'REIS', '8499897779', (select id from public.companhias where nome = 'PCTAT')),
  ('127704-9', 'SD', 'WESLÂNYA', '81994570086', (select id from public.companhias where nome = 'PCTAT')),
  ('129494-6', 'SD', 'F CAMELO', '81971177120', (select id from public.companhias where nome = 'PCTAT')),
  ('129576-4', 'SD', 'JOEMERSON', '81971180291', (select id from public.companhias where nome = 'PCTAT')),
  ('127782-0', 'SD', 'R BERNARDINO', '81997247820', (select id from public.companhias where nome = 'PCTAT')),
  ('128890-3', 'SD', 'VITÓRIA SILVA', '84991976047', (select id from public.companhias where nome = 'PCTAT')),
  ('129049-5', 'SD', 'EBERTY SILVA', '81999567821', (select id from public.companhias where nome = 'PCTAT')),
  ('129134-3', 'SD', 'HEERICLES', '75991441075', (select id from public.companhias where nome = 'PCTAT')),
  ('127902-5', 'SD', 'EMERSON LUCAS', '81996395961', (select id from public.companhias where nome = 'PCTAT')),
  ('128456-8', 'SD', 'DAVISON', '81998245090', (select id from public.companhias where nome = 'PCTAT')),
  ('128773-7', 'SD', 'FORTUNATO', '81989011511', (select id from public.companhias where nome = 'PCTAT')),
  ('128929-2', 'SD', 'RODRIGO SILVA', '81984998681', (select id from public.companhias where nome = 'PCTAT')),
  ('127901-7', 'SD', 'LIVIA FERREIRA', '81996630195', (select id from public.companhias where nome = 'PCTAT')),
  ('128606-4', 'SD', 'LUANA ALMEIDA', '74988455391', (select id from public.companhias where nome = 'PCTAT')),
  ('128659-5', 'SD', 'GONÇALVES SILVA', '81991493631', (select id from public.companhias where nome = 'PCTAT')),
  ('128225-5', 'SD', 'ESLLEY', '81998149299', (select id from public.companhias where nome = 'PCTAT')),
  ('129044-4', 'SD', 'CLOUDE', '81996547664', (select id from public.companhias where nome = 'PCTAT')),
  ('127849-5', 'SD', 'R. SILVA', '88993508842', (select id from public.companhias where nome = 'PCTAT')),
  ('128539-4', 'SD', 'THALES LIMA', '81983681265', (select id from public.companhias where nome = 'PCTAT')),
  ('128800-8', 'SD', 'L. RIBEIRO', '88992941654', (select id from public.companhias where nome = 'PCTAT')),
  ('127337-0', 'SD', 'W. BARBOSA', '81999417361', (select id from public.companhias where nome = 'PCTAT')),
  ('127737-5', 'SD', 'LEONARDO SILVA', '81996444560', (select id from public.companhias where nome = 'PCTAT')),
  ('128797-4', 'SD', 'LOURENÇO', '81995326724', (select id from public.companhias where nome = 'PCTAT')),
  ('127635-2', 'SD', 'ERICK SILVA', '82996655894', (select id from public.companhias where nome = 'PCTAT')),
  ('128210-7', 'SD', 'NASCIMENTO JÚNIOR', '81995670181', (select id from public.companhias where nome = 'PCTAT')),
  ('129376-1', 'SD', 'RIBEIRO FILHO', '88996046287', (select id from public.companhias where nome = 'PCTAT')),
  ('128257-3', 'SD', 'SANDRO HÉLIO', '81994411354', (select id from public.companhias where nome = 'PCTAT')),
  ('129251-0', 'SD', 'CAZAROTO', '81991397489', (select id from public.companhias where nome = 'PCTAT')),
  ('129412-1', 'SD', 'JEANILSON', '81998046376', (select id from public.companhias where nome = 'PCTAT')),
  ('128523-8', 'SD', 'CHAVES', '84998964698', (select id from public.companhias where nome = 'PCTAT')),
  ('128828-8', 'SD', 'FABRÍCIO SANTOS', '81996666218', (select id from public.companhias where nome = 'PCTAT')),
  ('129042-8', 'SD', 'KAYQUE GOMES', '82981027772', (select id from public.companhias where nome = 'PCTAT')),
  ('129537-3', 'SD', 'J. FILHO', '88981241478', (select id from public.companhias where nome = 'PCTAT')),
  ('129567-5', 'SD', 'GUILHERME SILVA', '81996996298', (select id from public.companhias where nome = 'PCTAT')),
  ('129529-2', 'SD', 'GERDSON FRAGA', '81987343582', (select id from public.companhias where nome = 'PCTAT')),
  ('128482-7', 'SD', 'J. FEITOSA', '88981515516', (select id from public.companhias where nome = 'PCTAT')),
  ('129546-2', 'SD', 'G. CLEMENTE', '82996883784', (select id from public.companhias where nome = 'PCTAT')),
  ('129119-0', 'SD', 'R. BARBOSA', '81983746509', (select id from public.companhias where nome = 'PCTAT')),
  ('128831-8', 'SD', 'AMARO', '81988606786', (select id from public.companhias where nome = 'PCTAT')),
  ('128486-0', 'SD', 'JOSUÉ', '82982071371', (select id from public.companhias where nome = 'PCTAT')),
  ('128963-2', 'SD', 'GONÇALVES', '87991806124', (select id from public.companhias where nome = 'PCTAT')),
  ('107741-4', '2º SGT', 'COELHO', '8198495994', (select id from public.companhias where nome = 'PCTAT')),
  ('120447-5', 'SD', 'BARRETO', '8187731725', (select id from public.companhias where nome = 'PCTAT')),
  ('108987-0', 'CB', 'BRAGA', '81996853184', (select id from public.companhias where nome = 'PCTAT')),
  ('111114-0', '3º SGT', 'LEONILDO', '8187860206', (select id from public.companhias where nome = 'PCTAT')),
  ('116226-8', 'CB', 'TÁSSIO SILVA', '8196265885', (select id from public.companhias where nome = 'PCTAT'))
on conflict (matricula) do nothing;

insert into public.guarnicoes (id, nome, tipo, companhia_id, area_atuacao, prefixos) values
  ('b0000000-0000-4000-8000-000000000012', 'GG 16450/16550 - Guarnição de Graduado', 'GG', (select id from public.companhias where nome = 'PCTAT'), 'Toda área do 16º BPM', ARRAY['GG16450','GG16550']),
  ('b0000000-0000-4000-8000-000000000013', 'CR 16750 - Carro de Reforço', 'CR', (select id from public.companhias where nome = 'PCTAT'), 'Toda área do 16º BPM', ARRAY['CR16750']),
  ('b0000000-0000-4000-8000-000000000014', 'Motopatrulha 16131/132/133 - Santo Antônio / São José / Cabanga', 'MO', (select id from public.companhias where nome = 'PCTAT'), 'Santo Antônio / São José / Cabanga', ARRAY['MO16131','MO16132','MO16133']),
  ('b0000000-0000-4000-8000-000000000015', 'Motopatrulha 16331/332/333 - Boa Vista / Soledade / Santo Amaro', 'MO', (select id from public.companhias where nome = 'PCTAT'), 'Boa Vista / Soledade / Santo Amaro', ARRAY['MO16331','MO16332','MO16333']),
  ('b0000000-0000-4000-8000-000000000016', 'GV 16650', 'GV', (select id from public.companhias where nome = 'PCTAT'), 'Toda área do 16º BPM', ARRAY['GV16650']);

-- Escala Mensal — PC Tático
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, dias_especificos, vigencia_inicio, escala_origem) values
  -- GG 16450/16550 — ALFA
  ('b0000000-0000-4000-8000-000000000012', '111080-2', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126581-4', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '125855-9', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '125758-7', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126570-9', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- GG 16450/16550 — BRAVO
  ('b0000000-0000-4000-8000-000000000012', '122661-4', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126579-2', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126584-9', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '125844-3', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126481-8', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- GG 16450/16550 — CHARLIE
  ('b0000000-0000-4000-8000-000000000012', '105701-4', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126534-2', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126313-7', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '125834-6', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126487-7', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- GG 16450/16550 — DELTA
  ('b0000000-0000-4000-8000-000000000012', '102813-8', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126590-3', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126410-9', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '122746-7', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000012', '126550-4', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- CR 16750 — ALFA
  ('b0000000-0000-4000-8000-000000000013', '127704-9', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '129494-6', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '129576-4', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '127782-0', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[4,8,12,16,20,24,28], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- CR 16750 — BRAVO
  ('b0000000-0000-4000-8000-000000000013', '128890-3', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '129049-5', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '129134-3', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '127902-5', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[1,5,9,13,17,21,25,29], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- CR 16750 — CHARLIE
  ('b0000000-0000-4000-8000-000000000013', '128456-8', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '128773-7', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '128929-2', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '127901-7', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[2,6,10,14,18,22,26,30], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- CR 16750 — DELTA
  ('b0000000-0000-4000-8000-000000000013', '128606-4', 'CMT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '128659-5', 'MOT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '128225-5', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000013', '129044-4', 'PAT', '06:00', '06:00', 'DIAS_ESPECIFICOS', ARRAY[3,7,11,15,19,23,27,31], '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- MO 16131/132/133
  ('b0000000-0000-4000-8000-000000000014', '127849-5', 'CMT', '05:00', '13:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '128539-4', 'MOT', '05:00', '13:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '128800-8', 'PAT', '05:00', '13:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '127337-0', 'CMT', '14:00', '22:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '127737-5', 'MOT', '14:00', '22:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '128797-4', 'PAT', '14:00', '22:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '127635-2', 'CMT', '05:00', '13:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '128210-7', 'MOT', '05:00', '13:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '129376-1', 'PAT', '05:00', '13:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '128257-3', 'CMT', '14:00', '22:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '129251-0', 'MOT', '14:00', '22:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000014', '129412-1', 'PAT', '14:00', '22:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- MO 16331/332/333
  ('b0000000-0000-4000-8000-000000000015', '128523-8', 'CMT', '07:00', '15:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '128828-8', 'MOT', '07:00', '15:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129042-8', 'PAT', '07:00', '15:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129537-3', 'CMT', '15:00', '23:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129567-5', 'MOT', '15:00', '23:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129529-2', 'PAT', '15:00', '23:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '128482-7', 'CMT', '07:00', '15:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129546-2', 'MOT', '07:00', '15:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '129119-0', 'PAT', '07:00', '15:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '128831-8', 'CMT', '15:00', '23:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '128486-0', 'MOT', '15:00', '23:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000015', '128963-2', 'PAT', '15:00', '23:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  -- GV 16650
  ('b0000000-0000-4000-8000-000000000016', '107741-4', 'CMT', '14:00', '02:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000016', '120447-5', 'MOT', '14:00', '02:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000016', '108987-0', 'PAT', '14:00', '02:00', 'IMPARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000016', '111114-0', 'CMT', '14:00', '02:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026'),
  ('b0000000-0000-4000-8000-000000000016', '116226-8', 'MOT', '14:00', '02:00', 'PARES', NULL, '2026-08-01', 'Escala de Serviço PC Tático - Agosto 2026');
```

**Nota:** os blocos anteriores (1ª e 2ª CPM) usam o `insert into public.escala_mensal (... 8 colunas ...)` sem `dias_especificos`. Este bloco do PCTAT usa a variante com `dias_especificos` (9 colunas) — é um `insert` separado, então não há conflito. As linhas não-`DIAS_ESPECIFICOS` deste bloco passam `NULL` nessa coluna.

- [ ] **Step 2: Aplicar e conferir o PCTAT**

Run: `./tools/supabase.exe db reset`
Expected: sem erro.

```sql
select count(*) from public.guarnicoes g
  join public.companhias c on c.id = g.companhia_id where c.nome = 'PCTAT';
-- Esperado: 5
select count(*) from public.escala_mensal where escala_origem = 'Escala de Serviço PC Tático - Agosto 2026';
-- Esperado: 65
select tipo, count(*) from public.guarnicoes group by 1 order by 1;
-- Deve incluir linhas GG (1) e CR (1)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql
git commit -m "feat: seed PC Tatico schedule (Agosto 2026)"
```

---

### Task 5: Verificação integrada e deploy

**Files:** nenhum (a não ser correções pontuais no arquivo de seed).

- [ ] **Step 1: Reset limpo e verificação estrutural**

Run: `./tools/supabase.exe db reset`
Expected: todas as migrations aplicam sem erro.

```sql
-- Guarnições por companhia
select c.nome, count(*) from public.guarnicoes g
  join public.companhias c on c.id = g.companhia_id group by 1 order by 1;
-- Esperado: 1ª CPM 10 | 2ª CPM 7 | 3ª CPM 4 | PCTAT 5

-- Tipos presentes
select tipo, count(*) from public.guarnicoes group by 1 order by 1;
-- Esperado: inclui GG e CR

-- Linhas de escala por origem
select escala_origem, count(*) from public.escala_mensal group by 1 order by 1;
-- Esperado: 1ª CPM 62 | 2ª CPM 56 | PC Tático 65 | 3ª CPM 36 (seed anterior). Total 219.

-- Nenhuma matrícula em duas guarnições
select policial_matricula, count(*) from public.escala_mensal
  group by 1 having count(*) > 1;
-- Esperado: 0 linhas

-- Todas as matrículas de escala_mensal existem em policiais (FK garante, mas conferir órfãos de digitação)
select em.policial_matricula from public.escala_mensal em
  left join public.policiais p on p.matricula = em.policial_matricula
  where p.matricula is null;
-- Esperado: 0 linhas
```

- [ ] **Step 2: Verificar resolução por dia**

```sql
select policial_matricula, count(*) from public.fn_resolve_escala_dia('2026-08-11')
  group by 1 having count(*) > 1;
-- Esperado: 0 linhas (dia ímpar; GG/CR resolvem a equipe DELTA {3,7,11,...})
select policial_matricula, count(*) from public.fn_resolve_escala_dia('2026-08-12')
  group by 1 having count(*) > 1;
-- Esperado: 0 linhas (dia par; GG/CR resolvem a equipe ALFA {4,8,12,...})
select count(distinct guarnicao_id) from public.fn_resolve_escala_dia('2026-08-12');
-- Esperado: ~26 (guarnições das 4 companhias ativas em dia par)
```

- [ ] **Step 3: Suíte de testes e build**

Run: `npm test -- --watch=false`
Expected: PASS.

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 4: Conferência visual rápida**

Subir o app (`npm start`), logar como ADMIN e abrir:
- **Guarnições** — as 22 novas aparecem, com tipos GG/CR visíveis no seletor;
- **Painel do PC** num dia par e num ímpar — cards das 4 companhias, sem policial repetido em dois cards;
- **Relatório SEI** — seção "resumo por tipo" lista GG e CR com contagem.

- [ ] **Step 5: Deploy da migração (pedir confirmação ao usuário antes)**

```bash
export SUPABASE_ACCESS_TOKEN="<token>"
./tools/supabase.exe db push
```
Expected: `20260827100000_tipo_guarnicao_gg_cr.sql` e
`20260827110000_seed_1cpm_2cpm_pctat_agosto_2026.sql` aplicadas; `migration list`
mostra ambas como remotas.

- [ ] **Step 6: Commit final (se houve correção) e fechar**

```bash
git add -A
git commit -m "fix: corrections from schedule-import verification"
```

Marcar o item "importar dados de 1ª CPM, 2ª CPM e PCTAT" da roadmap como concluído.

## Self-Review

- **Cobertura da spec:** schema GG/CR + front-end (Task 1); 1ª CPM (Task 2); 2ª CPM (Task 3); PCTAT incl. equipes ALFA/BRAVO/CHARLIE/DELTA via `DIAS_ESPECIFICOS` (Task 4); deduplicação verificada, vigências individuais de FALCÃO/T.XAVIER, verificação de `fn_resolve_escala_dia`, resumo por tipo do Relatório SEI, deploy (Task 5). Fora de escopo (POGs, Guarda, COPOM, Alerta Celular) não gera task — correto.
- **Placeholders:** todo o SQL está escrito; nenhuma referência a tipo/função inexistente.
- **Consistência de tipos:** `TipoGuarnicao` estendido uma vez (Task 1) e usado nas 3 telas com a mesma lista; UUIDs `b0…-01` a `b0…-16` sequenciais e sem repetição entre tasks; `escala_origem` idêntico dentro de cada companhia.
- **Risco conhecido:** `alter type ... add value` (Task 1) precisa estar numa migration **própria**, aplicada antes da migration de seed — por isso são dois arquivos com timestamps distintos (`100000` < `110000`). O Supabase CLI aplica um arquivo por transação, então o novo valor do enum já está commitado quando o seed roda.
- **Risco de extração:** telefones e grafias vêm de OCR de PDF; a conferência visual (Task 5 Step 4) e as queries de contagem são a rede de segurança. Contagens-alvo: 62 / 56 / 65 linhas.
