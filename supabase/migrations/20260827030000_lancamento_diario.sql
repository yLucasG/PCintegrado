create table public.lancamento_faltas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_permutas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_substituto_matricula varchar(20) not null references public.policiais (matricula),
  policial_substituido_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  sei_numero text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_folgas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  sei_numero text,
  autorizacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create table public.lancamento_remanejamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  destino text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create or replace function public.fn_set_criado_por_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por = auth.uid();
  return new;
end;
$$;

create trigger trg_lancamento_faltas_criado_por
before insert on public.lancamento_faltas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_permutas_criado_por
before insert on public.lancamento_permutas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_folgas_criado_por
before insert on public.lancamento_folgas
for each row execute function public.fn_set_criado_por_lancamento();

create trigger trg_lancamento_remanejamentos_criado_por
before insert on public.lancamento_remanejamentos
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_faltas enable row level security;
alter table public.lancamento_permutas enable row level security;
alter table public.lancamento_folgas enable row level security;
alter table public.lancamento_remanejamentos enable row level security;

create policy "authenticated_select_lancamento_faltas" on public.lancamento_faltas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_faltas" on public.lancamento_faltas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_permutas" on public.lancamento_permutas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_permutas" on public.lancamento_permutas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_folgas" on public.lancamento_folgas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_folgas" on public.lancamento_folgas
  for insert to authenticated with check (true);

create policy "authenticated_select_lancamento_remanejamentos" on public.lancamento_remanejamentos
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_remanejamentos" on public.lancamento_remanejamentos
  for insert to authenticated with check (true);
