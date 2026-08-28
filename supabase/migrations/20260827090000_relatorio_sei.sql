alter table public.lancamento_atrasos add column sei_numero text;
alter table public.lancamento_baixas add column sei_numero text;
alter table public.lancamento_os add column situacao text;
alter table public.lancamento_os add column local text;

create table public.lancamento_licencas (
  id uuid primary key default gen_random_uuid(),
  policial_matricula varchar(20) not null references public.policiais (matricula),
  data_inicio date not null,
  data_fim date not null,
  escala_mensal_id uuid references public.escala_mensal (id),
  sei_numero text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  constraint lancamento_licencas_periodo_valido check (data_fim >= data_inicio)
);

create trigger trg_lancamento_licencas_criado_por
before insert on public.lancamento_licencas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_licencas enable row level security;

create policy "authenticated_select_lancamento_licencas" on public.lancamento_licencas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_licencas" on public.lancamento_licencas
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_licencas" on public.lancamento_licencas
  for delete to authenticated using (true);

create type public.grupo_funcao_fixa as enum ('GUARDA', 'PC_BPM', 'COPOM');

create table public.lancamento_funcoes_fixas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  grupo public.grupo_funcao_fixa not null,
  funcao text not null,
  horario_inicio time not null,
  horario_fim time not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  fone_cmt text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

create trigger trg_lancamento_funcoes_fixas_criado_por
before insert on public.lancamento_funcoes_fixas
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_funcoes_fixas enable row level security;

create policy "authenticated_select_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_funcoes_fixas" on public.lancamento_funcoes_fixas
  for delete to authenticated using (true);

create table public.relatorio_sei_complementos (
  data date not null,
  campo text not null,
  conteudo text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id),
  primary key (data, campo)
);

alter table public.relatorio_sei_complementos enable row level security;

create policy "authenticated_select_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for select to authenticated using (true);
create policy "authenticated_insert_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for insert to authenticated with check (true);
create policy "authenticated_update_relatorio_sei_complementos" on public.relatorio_sei_complementos
  for update to authenticated using (true) with check (true);
