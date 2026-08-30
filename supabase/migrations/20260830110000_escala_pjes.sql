create type public.funcao_pjes as enum ('CMT', 'MOT', 'PAT', 'OUTRO');
create type public.origem_pjes as enum ('PDF', 'MANUAL');
create type public.status_pjes as enum ('PREVISTO', 'FALTA', 'ATRASADO');

create table public.escala_pjes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  gt_rotulo text not null,
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
