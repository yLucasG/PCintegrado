# PCintegrado — Etapa 1: Scaffold (Angular + Supabase) Design

**Status:** Approved by user on 2026-08-27.

## Goal

Bootstrap the MVP for a police-battalion scheduling/effective-management system
(16º BPM). Frontend deploys to Vercel from GitHub; backend is Supabase Cloud
(Postgres + Auth + Edge Functions). No Docker anywhere in this architecture —
Vercel builds the Angular app directly from the repo, and Supabase Cloud hosts
the database and functions.

Navigation UX constraint: no sidebar. A Top App Bar on desktop that becomes a
Bottom Navigation Bar on mobile (CSS breakpoint only, no JS breakpoint
service).

## Repository / Deployment Targets

- GitHub: `https://github.com/yLucasG/PCintegrado.git`
- Supabase project: `https://lyeoxvvhwdhwrscnvwhl.supabase.co`
  - `anon` public key is embedded in the committed `environment.ts` files —
    this key is designed to be public and is constrained by Row Level
    Security, not secrecy.
  - `service_role` key is never stored in the repo. The Edge Function reads
    it from `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects automatically
    into every deployed Edge Function's runtime environment.

## Tech Stack

- Angular 21 (standalone components, no NgModules), Angular CLI scaffold.
- Tailwind CSS v4 (`@tailwindcss/postcss`, no `tailwind.config.js` needed for
  this MVP — v4's engine scans the project automatically).
- `@supabase/supabase-js` v2 client.
- Supabase Postgres, Supabase Auth, one Supabase Edge Function (Deno).
- Testing: Angular CLI default unit test setup (Jasmine + Karma), used for
  guards and services. Layout/presentational components get the CLI's
  default "should create" spec — deeper TDD is reserved for business logic
  (guards, auth state, RBAC), not static shells.

## Data Model (`supabase/schema.sql`)

Enums:
- `role_usuario`: `ADMIN`, `CIA_1`, `CIA_2`, `CIA_3`, `PCTAT`, `PJES`,
  `PC_LANCAMENTO`
- `funcao_escala`: `CMT`, `MOT`, `PAT`
- `status_escala`: `PREVISTO`, `PRESENTE`, `FALTA`, `ATESTADO`

Tables:
- `companhias(id uuid pk, nome text unique)` — new table (not in the
  original prompt) to give `policiais.companhia_id` a real foreign key,
  seeded with 1ª CPM / 2ª CPM / 3ª CPM / PCTAT / PJES to match the
  battalion's org chart.
- `perfis_usuarios(id uuid pk → auth.users, role role_usuario)`
- `policiais(matricula varchar pk, graduacao, nome_guerra, telefone,
  companhia_id → companhias)`
- `viaturas(prefixo varchar pk, area_atuacao)`
- `escalas(id uuid pk, data, horario_inicio, horario_fim,
  policial_matricula → policiais, viatura_prefixo → viaturas, funcao,
  status)`
- `auditoria_escalas(id uuid pk, escala_id, operacao, dados_antigos jsonb,
  dados_novos jsonb, usuario_id, criado_em)`

Cross-cutting:
- `policiais`, `viaturas`, `escalas` all carry `criado_em`, `atualizado_em`,
  `criado_por`, `atualizado_por` (the latter two FK `auth.users`).
- A `BEFORE INSERT OR UPDATE OR DELETE` trigger on `escalas` writes to
  `auditoria_escalas` and stamps `atualizado_em`/`atualizado_por` on update,
  reading the caller via `auth.uid()`.
- A separate `BEFORE INSERT` trigger on `escalas` stamps `criado_por` /
  `atualizado_por` on creation.
- RLS is enabled on every operational table. `authenticated` can read
  everything and write to `policiais`/`viaturas`/`escalas`. `perfis_usuarios`
  has no `authenticated` write policy — only the Edge Function (via
  `service_role`, which bypasses RLS) may create profiles, which is how role
  assignment stays admin-controlled.

No Realtime subscriptions are enabled — "live" updates happen via RxJS
polling in the frontend, added in a later phase.

## Edge Function: `create-user`

Deno function at `supabase/functions/create-user/index.ts`. Flow:
1. Reads the caller's JWT from the `Authorization` header, validates the
   session with an anon-key-scoped client.
2. Looks up the caller's `perfis_usuarios.role` using a `service_role`
   client; rejects with 403 unless `role = 'ADMIN'`.
3. Validates `{ email, password, role }` in the request body.
4. Creates the auth user via `auth.admin.createUser`, then inserts the
   matching `perfis_usuarios` row. If the profile insert fails, the created
   auth user is rolled back with `auth.admin.deleteUser`.
5. Returns the created user's `id`/`email`/`role`, or a JSON error with an
   appropriate HTTP status.

Deployment (`supabase functions deploy create-user`) and DB migration
(`supabase db push`) require the user's own `supabase login` /
`supabase link --project-ref lyeoxvvhwdhwrscnvwhl` — those are interactive
auth steps outside this session's reach, so the plan documents the exact
commands rather than executing them.

## Angular App Structure

```
src/app/
  core/
    services/supabase.service.ts   → wraps createClient()
    services/auth.service.ts       → session + perfil state (RxJS)
    guards/auth.guard.ts           → requires a session
    guards/role.guard.ts           → requires session + role ∈ route data
  layout/
    shell/shell.component.ts       → router-outlet + both nav bars
    top-bar/top-bar.component.ts   → `hidden md:flex`
    bottom-nav/bottom-nav.component.ts → `flex md:hidden fixed bottom-0`
  features/
    auth/login-page.component.ts   → email/password sign-in form
    dashboard/dashboard-page.component.ts → placeholder landing page
    admin/admin-users-page/admin-users-page.component.ts
      → lists perfis_usuarios, form to create a user via the Edge Function
```

Routing: `/login` (public), `/` (Shell, behind `authGuard`) with children
`''` (Dashboard) and `'admin'` (behind `roleGuard`, `data.roles: ['ADMIN']`).

## Out of Scope for This Phase

- Actual CRUD screens for `policiais` / `viaturas` / `escalas` (Painel do
  PC / Lançamento, per the earlier flowchart) — later phase.
- RxJS polling for near-real-time updates — later phase.
- SEI export / relatório generation — later phase.
- Fine-grained RLS (e.g., restricting writes by `companhia_id`) — the MVP
  uses broad `authenticated` policies; tightened later once role-based data
  scoping is designed.
