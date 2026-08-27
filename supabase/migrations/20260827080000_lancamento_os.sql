create table public.lancamento_os (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  guarnicao_id uuid not null references public.guarnicoes (id),
  horario_inicio time not null,
  numero_os text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_os_criado_por
before insert on public.lancamento_os
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_os enable row level security;

create policy "authenticated_select_lancamento_os" on public.lancamento_os
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_os" on public.lancamento_os
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_os" on public.lancamento_os
  for delete to authenticated using (true);
