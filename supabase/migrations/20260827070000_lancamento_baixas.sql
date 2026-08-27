create table public.lancamento_baixas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  guarnicao_id uuid not null references public.guarnicoes (id),
  horario_inicio time not null,
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_baixas_criado_por
before insert on public.lancamento_baixas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_baixas enable row level security;

create policy "authenticated_select_lancamento_baixas" on public.lancamento_baixas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_baixas" on public.lancamento_baixas
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_baixas" on public.lancamento_baixas
  for delete to authenticated using (true);
