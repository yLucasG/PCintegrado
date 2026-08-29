create type public.tipo_alteracao as enum (
  'PERMUTA',
  'CURSO',
  'DISPENSA',
  'EXPEDIENTE',
  'FOLGA',
  'FALTA_LTS',
  'AUSENCIA_SERVICO'
);

create table public.lancamento_alteracoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo public.tipo_alteracao not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  policial_substituto_matricula varchar(20) references public.policiais (matricula),
  guarnicao_id uuid references public.guarnicoes (id),
  escala_mensal_id uuid references public.escala_mensal (id),
  horario_inicio time,
  horario_fim time,
  processo_sei text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  constraint lancamento_alteracoes_permuta_tem_substituto
    check (tipo <> 'PERMUTA' or policial_substituto_matricula is not null)
);

create trigger trg_lancamento_alteracoes_criado_por
before insert on public.lancamento_alteracoes
for each row execute function public.fn_set_criado_por_lancamento();

alter table public.lancamento_alteracoes enable row level security;

create policy "authenticated_select_lancamento_alteracoes" on public.lancamento_alteracoes
  for select to authenticated using (true);
create policy "authenticated_insert_lancamento_alteracoes" on public.lancamento_alteracoes
  for insert to authenticated with check (true);
create policy "authenticated_delete_lancamento_alteracoes" on public.lancamento_alteracoes
  for delete to authenticated using (true);
