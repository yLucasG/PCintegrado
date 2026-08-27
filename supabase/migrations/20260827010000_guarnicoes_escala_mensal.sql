-- Guarnições (postos de serviço fixos): GT tático/ordinário, MO, CP, GV
create type public.tipo_guarnicao as enum (
  'GT_TATICO', 'GT_ORDINARIO', 'MO', 'CP', 'GV'
);

create table public.guarnicoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.tipo_guarnicao not null,
  companhia_id uuid not null references public.companhias (id),
  area_atuacao text,
  prefixos text[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Escala mensal recorrente
create type public.tipo_recorrencia as enum (
  'PARES', 'IMPARES', 'DIAS_ESPECIFICOS', 'SEG_A_SEX', 'TODOS_OS_DIAS'
);

create table public.escala_mensal (
  id uuid primary key default gen_random_uuid(),
  guarnicao_id uuid not null references public.guarnicoes (id),
  policial_matricula varchar(20) not null references public.policiais (matricula),
  funcao public.funcao_escala not null,
  horario_inicio time not null,
  horario_fim time not null,
  tipo_recorrencia public.tipo_recorrencia not null,
  dias_especificos int[],
  vigencia_inicio date not null,
  vigencia_fim date,
  escala_origem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

create trigger trg_escala_mensal_set_criado_por
before insert on public.escala_mensal
for each row execute function public.fn_set_criado_por();

-- Resolve quem deveria estar escalado numa data específica
create or replace function public.fn_resolve_escala_dia(p_data date)
returns setof public.escala_mensal
language sql
stable
as $$
  select *
  from public.escala_mensal em
  where em.vigencia_inicio <= p_data
    and (em.vigencia_fim is null or em.vigencia_fim >= p_data)
    and (
      (em.tipo_recorrencia = 'PARES' and extract(day from p_data)::int % 2 = 0)
      or (em.tipo_recorrencia = 'IMPARES' and extract(day from p_data)::int % 2 = 1)
      or (em.tipo_recorrencia = 'DIAS_ESPECIFICOS' and extract(day from p_data)::int = any(em.dias_especificos))
      or (em.tipo_recorrencia = 'SEG_A_SEX' and extract(isodow from p_data) between 1 and 5)
      or (em.tipo_recorrencia = 'TODOS_OS_DIAS')
    );
$$;

-- RLS
alter table public.guarnicoes enable row level security;
alter table public.escala_mensal enable row level security;

create policy "authenticated_select_guarnicoes" on public.guarnicoes
  for select to authenticated using (true);
create policy "authenticated_insert_guarnicoes" on public.guarnicoes
  for insert to authenticated with check (true);
create policy "authenticated_delete_guarnicoes" on public.guarnicoes
  for delete to authenticated using (true);

create policy "authenticated_select_escala_mensal" on public.escala_mensal
  for select to authenticated using (true);
create policy "authenticated_insert_escala_mensal" on public.escala_mensal
  for insert to authenticated with check (true);
create policy "authenticated_delete_escala_mensal" on public.escala_mensal
  for delete to authenticated using (true);
