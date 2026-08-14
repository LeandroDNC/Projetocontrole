-- ═══════════════════════════════════════════════════════════════════════
-- CONSERTO RÁPIDO — "function crypt(text, text) does not exist"
-- ═══════════════════════════════════════════════════════════════════════
-- Só recria as duas funções que usam crypt()/gen_salt(), agora enxergando
-- também o schema "extensions" (onde o Supabase instala o pgcrypto por
-- padrão). Não mexe em mais nada — pode colar e rodar direto no SQL
-- Editor do Supabase, mesmo já tendo rodado o security_migration.sql
-- inteiro antes.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.hash_senha_sistema_usuarios()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.senha is not null and new.senha !~ '^\$2[aby]\$' then
    new.senha := crypt(new.senha, gen_salt('bf'));
  end if;
  return new;
end;
$$;

create or replace function public.rpc_login(p_username text, p_password text)
returns table (
  id uuid,
  nome text,
  username text,
  role text,
  cargo text,
  idade integer,
  congregacao text,
  congregacao_id uuid,
  setor_id uuid,
  ativo boolean,
  frequenta_ebd boolean,
  papel_ebd text,
  vocacao text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.nome, u.username, u.role, u.cargo, u.idade,
         u.congregacao, u.congregacao_id, u.setor_id, u.ativo,
         u.frequenta_ebd, u.papel_ebd, u.vocacao
  from public.sistema_usuarios u
  where u.username = p_username
    and u.ativo = true
    and u.senha is not null
    and crypt(p_password, u.senha) = u.senha;
end;
$$;

revoke all on function public.rpc_login(text, text) from public;
grant execute on function public.rpc_login(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
