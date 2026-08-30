-- RPC para o painel de administração: lista os perfis com o e-mail da conta.
-- O cliente (authenticated) não pode ler auth.users diretamente, então esta
-- função SECURITY DEFINER faz o join — mas só retorna linhas se quem chama
-- for ADMIN.
create or replace function public.admin_listar_usuarios()
returns table (id uuid, role public.role_usuario, email text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.role, u.email::text
  from public.perfis_usuarios p
  join auth.users u on u.id = p.id
  where exists (
    select 1 from public.perfis_usuarios me
    where me.id = auth.uid() and me.role = 'ADMIN'
  )
  order by u.email;
$$;

revoke all on function public.admin_listar_usuarios() from public;
grant execute on function public.admin_listar_usuarios() to authenticated;
