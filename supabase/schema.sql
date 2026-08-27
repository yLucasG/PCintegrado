-- Deploy with:
--   supabase login
--   supabase link --project-ref lyeoxvvhwdhwrscnvwhl
--   supabase db push

-- Enums
create type public.role_usuario as enum (
  'ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT', 'PJES', 'PC_LANCAMENTO'
);
create type public.funcao_escala as enum ('CMT', 'MOT', 'PAT');
create type public.status_escala as enum ('PREVISTO', 'PRESENTE', 'FALTA', 'ATESTADO');

-- Companhias (lookup table backing policiais.companhia_id)
create table public.companhias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

insert into public.companhias (nome) values
  ('1ª CPM'), ('2ª CPM'), ('3ª CPM'), ('PCTAT'), ('PJES');

-- Perfis (role assignment; rows are only ever written by the Edge Function
-- via the service_role key, which bypasses RLS)
create table public.perfis_usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.role_usuario not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Policiais
create table public.policiais (
  matricula varchar(20) primary key,
  graduacao text not null,
  nome_guerra text not null,
  telefone text,
  companhia_id uuid references public.companhias (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Viaturas
create table public.viaturas (
  prefixo varchar(20) primary key,
  area_atuacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Escalas
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  horario_inicio time not null,
  horario_fim time not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  viatura_prefixo varchar(20) references public.viaturas (prefixo),
  funcao public.funcao_escala not null,
  status public.status_escala not null default 'PREVISTO',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Auditoria
create table public.auditoria_escalas (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antigos jsonb,
  dados_novos jsonb,
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

-- Stamp criado_por/atualizado_por on insert
create or replace function public.fn_set_criado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por = auth.uid();
  new.atualizado_por = auth.uid();
  return new;
end;
$$;

create trigger trg_escalas_set_criado_por
before insert on public.escalas
for each row execute function public.fn_set_criado_por();

create trigger trg_policiais_set_criado_por
before insert on public.policiais
for each row execute function public.fn_set_criado_por();

create trigger trg_viaturas_set_criado_por
before insert on public.viaturas
for each row execute function public.fn_set_criado_por();

-- Audit trigger for escalas
create or replace function public.fn_auditoria_escalas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.auditoria_escalas (escala_id, operacao, dados_novos, usuario_id)
    values (new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif (tg_op = 'UPDATE') then
    new.atualizado_em = now();
    new.atualizado_por = auth.uid();
    insert into public.auditoria_escalas (escala_id, operacao, dados_antigos, dados_novos, usuario_id)
    values (new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.auditoria_escalas (escala_id, operacao, dados_antigos, usuario_id)
    values (old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_auditoria_escalas
before insert or update or delete on public.escalas
for each row execute function public.fn_auditoria_escalas();

-- Row Level Security
alter table public.companhias enable row level security;
alter table public.perfis_usuarios enable row level security;
alter table public.policiais enable row level security;
alter table public.viaturas enable row level security;
alter table public.escalas enable row level security;
alter table public.auditoria_escalas enable row level security;

create policy "authenticated_select_companhias" on public.companhias
  for select to authenticated using (true);

create policy "authenticated_select_perfis" on public.perfis_usuarios
  for select to authenticated using (true);

create policy "authenticated_select_policiais" on public.policiais
  for select to authenticated using (true);
create policy "authenticated_insert_policiais" on public.policiais
  for insert to authenticated with check (true);
create policy "authenticated_update_policiais" on public.policiais
  for update to authenticated using (true);

create policy "authenticated_select_viaturas" on public.viaturas
  for select to authenticated using (true);
create policy "authenticated_insert_viaturas" on public.viaturas
  for insert to authenticated with check (true);
create policy "authenticated_update_viaturas" on public.viaturas
  for update to authenticated using (true);

create policy "authenticated_select_escalas" on public.escalas
  for select to authenticated using (true);
create policy "authenticated_insert_escalas" on public.escalas
  for insert to authenticated with check (true);
create policy "authenticated_update_escalas" on public.escalas
  for update to authenticated using (true);

create policy "authenticated_select_auditoria" on public.auditoria_escalas
  for select to authenticated using (true);
