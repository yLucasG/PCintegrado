create table public.lancamento_atrasos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_chegada time,
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_atrasos_criado_por
before insert on public.lancamento_atrasos
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_atrasos enable row level security;

create policy "authenticated_select_lancamento_atrasos" on public.lancamento_atrasos
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_atrasos" on public.lancamento_atrasos
  for insert to authenticated with check (true);
