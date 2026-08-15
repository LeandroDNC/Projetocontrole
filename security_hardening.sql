-- ═══════════════════════════════════════════════════════════════════════
-- EclesiaSync / UMADALPE — Endurecimento de Segurança (Etapa 2)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PRÉ-REQUISITO
-- O arquivo security_migration.sql (senha em bcrypt + rpc_login + RLS
-- ligada) já deve ter sido executado antes deste. Se ainda não foi, rode
-- aquele primeiro.
--
-- COMO RODAR
-- 1. Abra https://supabase.com/dashboard → seu projeto
-- 2. Menu lateral → "SQL Editor" → "New query"
-- 3. Cole este arquivo INTEIRO e clique em "Run"
-- 4. O resultado esperado é "Success" (podem aparecer avisos NOTICE)
--
-- Este script é idempotente: pode ser rodado mais de uma vez sem problema.
--
-- ───────────────────────────────────────────────────────────────────────
-- O PROBLEMA QUE ESTE SCRIPT ATACA
-- ───────────────────────────────────────────────────────────────────────
-- Hoje o site inteiro conversa com o banco usando a MESMA chave pública
-- (anon key), e as permissões ("é admin?", "pode ver financeiro?") são
-- verificadas apenas no navegador, dentro do app.js. Como o navegador está
-- na mão do usuário, essas verificações podem ser contornadas: bastava
-- abrir o console do navegador e chamar a API do Supabase direto para
-- ler ou alterar QUALQUER tabela — inclusive dados de menores de idade
-- (jovens_fora_umadalpe) e a própria tabela de permissões.
--
-- A CORREÇÃO DESTE SCRIPT
-- Passamos a emitir um "token de sessão" de verdade, gerado DENTRO do
-- banco no momento do login, e as operações sensíveis passam a exigir
-- esse token. O banco então descobre sozinho quem é o usuário e confere a
-- permissão dele NO PRÓPRIO BANCO — não dá mais para mentir pelo console.
--
-- LIMITE HONESTO DESTE SCRIPT (leia)
-- Isto NÃO é o mesmo que migrar para o Supabase Auth. As tabelas que este
-- script não cobre continuam acessíveis pela chave anon como antes. O que
-- ele entrega é: (a) sessão real verificável, (b) proteção contra força
-- bruta no login, (c) as operações de PERMISSÃO e os dados de MENORES
-- passam a ser verificados no servidor. É uma redução grande de risco,
-- mas o fechamento completo continua dependendo do Supabase Auth.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 0) EXTENSÕES
-- ───────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;


-- ───────────────────────────────────────────────────────────────────────
-- 1) TABELA DE SESSÕES
--    Guardamos apenas o HASH (SHA-256) do token, nunca o token em si.
--    Motivo: se algum dia alguém conseguir ler esta tabela, ainda assim
--    não conseguirá se passar por ninguém — do hash não se volta para o
--    token original. É o mesmo princípio da senha em bcrypt.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.sessoes (
  token_hash  text primary key,
  usuario_id  uuid not null references public.sistema_usuarios(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  revogada    boolean not null default false
);

-- Busca por usuário (usado ao derrubar sessões antigas no login) e
-- limpeza por data. Índice parcial: só as sessões vivas interessam.
create index if not exists idx_sessoes_usuario
  on public.sessoes (usuario_id)
  where revogada = false;

create index if not exists idx_sessoes_expira
  on public.sessoes (expira_em);

-- A tabela de sessões NUNCA deve ser lida ou escrita direto pelo site —
-- só pelas funções abaixo (que rodam como SECURITY DEFINER).
alter table public.sessoes enable row level security;
revoke all on public.sessoes from anon, authenticated;
-- Sem nenhuma policy criada, e com RLS ligada, o acesso direto fica
-- bloqueado para anon/authenticated mesmo que algum GRANT escape.


-- ───────────────────────────────────────────────────────────────────────
-- 2) REGISTRO DE TENTATIVAS DE LOGIN (proteção contra força bruta)
--    Sem isto, um atacante pode testar milhões de senhas contra a função
--    de login sem nenhuma barreira.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.login_tentativas (
  id         bigserial primary key,
  username   text not null,
  sucesso    boolean not null,
  criado_em  timestamptz not null default now()
);

-- Índice para a contagem "falhas deste usuário nos últimos X minutos".
create index if not exists idx_login_tentativas_username_data
  on public.login_tentativas (username, criado_em desc);

alter table public.login_tentativas enable row level security;
revoke all on public.login_tentativas from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 3) FUNÇÃO INTERNA: token → usuário
--    Recebe o token que o navegador guardou e devolve o id do usuário,
--    desde que a sessão exista, não esteja revogada e não tenha vencido.
--    É a base de toda a verificação deste arquivo.
--
--    Observação de segurança: todas as funções aqui declaram
--    "set search_path" explicitamente. Sem isso, uma função SECURITY
--    DEFINER pode ser enganada a executar código de um schema plantado
--    pelo atacante (sequestro de search_path).
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.sessao_usuario(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.usuario_id
  from public.sessoes s
  join public.sistema_usuarios u on u.id = s.usuario_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.revogada = false
    and s.expira_em > now()
    and u.ativo = true;
$$;

-- Função interna: não deve ser chamável pelo site.
revoke all on function public.sessao_usuario(text) from public, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 4) FUNÇÃO INTERNA: o usuário desta sessão é admin?
--    Verifica o papel NO BANCO — é isto que substitui o isSuperAdmin()
--    do navegador, que podia ser burlado pelo console.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.sessao_e_admin(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.sistema_usuarios u
    where u.id = public.sessao_usuario(p_token)
      and lower(u.role) = 'admin'
      and u.ativo = true
  );
$$;

revoke all on function public.sessao_e_admin(text) from public, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 5) LOGIN v2 — agora emite a sessão e trava força bruta
--    Mudanças em relação ao rpc_login do arquivo anterior:
--      • bloqueia após 10 falhas do mesmo usuário em 15 minutos;
--      • registra cada tentativa;
--      • ao autenticar, gera um token aleatório forte DENTRO do banco e
--        devolve junto com os dados (coluna nova: session_token);
--      • derruba as sessões anteriores do mesmo usuário (mantém a regra
--        de "um dispositivo por vez" que o sistema já tinha).
--
--    O retorno ganhou uma coluna, então é preciso DROP antes do CREATE
--    (o Postgres não deixa trocar o tipo de retorno com CREATE OR REPLACE).
-- ───────────────────────────────────────────────────────────────────────
drop function if exists public.rpc_login(text, text);

create function public.rpc_login(p_username text, p_password text)
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
  vocacao text,
  session_token text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_falhas   integer;
  v_user     public.sistema_usuarios%rowtype;
  v_token    text;
  v_validade interval := interval '12 hours';
begin
  -- Limpeza oportunista de registros velhos (mantém a tabela pequena).
  delete from public.login_tentativas where criado_em < now() - interval '7 days';
  delete from public.sessoes where expira_em < now() - interval '7 days';

  -- ── Trava de força bruta ──────────────────────────────────────────
  select count(*) into v_falhas
  from public.login_tentativas t
  where t.username = p_username
    and t.sucesso = false
    and t.criado_em > now() - interval '15 minutes';

  if v_falhas >= 10 then
    -- Mensagem propositalmente genérica quanto ao motivo real, mas clara
    -- para o usuário legítimo entender que é temporário.
    raise exception 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.'
      using errcode = 'P0001';
  end if;

  -- ── Verificação da senha (bcrypt, dentro do banco) ────────────────
  select * into v_user
  from public.sistema_usuarios u
  where u.username = p_username
    and u.ativo = true
    and u.senha is not null
    and crypt(p_password, u.senha) = u.senha;

  if v_user.id is null then
    insert into public.login_tentativas (username, sucesso) values (p_username, false);
    return; -- devolve zero linhas = credencial inválida
  end if;

  insert into public.login_tentativas (username, sucesso) values (p_username, true);

  -- ── Emissão da sessão ─────────────────────────────────────────────
  -- Token de 256 bits vindo do gerador criptográfico do Postgres.
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Mantém a regra "um dispositivo por vez": invalida sessões anteriores.
  update public.sessoes
     set revogada = true
   where usuario_id = v_user.id
     and revogada = false;

  insert into public.sessoes (token_hash, usuario_id, expira_em)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_user.id, now() + v_validade);

  return query
  select v_user.id, v_user.nome, v_user.username, v_user.role, v_user.cargo,
         v_user.idade, v_user.congregacao, v_user.congregacao_id,
         v_user.setor_id, v_user.ativo, v_user.frequenta_ebd,
         v_user.papel_ebd, v_user.vocacao, v_token;
end;
$$;

revoke all on function public.rpc_login(text, text) from public;
grant execute on function public.rpc_login(text, text) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 6) VALIDAÇÃO E ENCERRAMENTO DE SESSÃO
--    Substituem o que o site fazia lendo/escrevendo a coluna
--    session_token direto na tabela sistema_usuarios — o que permitia a
--    qualquer pessoa ler o token de sessão de todos os usuários.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.rpc_sessao_valida(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.sessao_usuario(p_token) is not null;
$$;

revoke all on function public.rpc_sessao_valida(text) from public;
grant execute on function public.rpc_sessao_valida(text) to anon, authenticated;


create or replace function public.rpc_logout(p_token text)
returns void
language sql
volatile
security definer
set search_path = public, extensions
as $$
  update public.sessoes
     set revogada = true
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

revoke all on function public.rpc_logout(text) from public;
grant execute on function public.rpc_logout(text) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 7) FECHA A COLUNA session_token DA TABELA DE USUÁRIOS
--    A sessão agora vive na tabela public.sessoes (com hash). A coluna
--    antiga não é mais a fonte da verdade e não deve ser legível: ela
--    permitia que qualquer um lesse o token de sessão de outra pessoa e
--    se passasse por ela.
--    Fica só o REVOKE (não removemos a coluna) para não quebrar nada que
--    ainda a referencie e para permitir voltar atrás com facilidade.
-- ───────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sistema_usuarios'
      and column_name = 'session_token'
  ) then
    execute 'revoke select (session_token), update (session_token) on public.sistema_usuarios from anon, authenticated';
  else
    raise notice 'Coluna session_token não existe — nada a revogar.';
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────
-- 8) PERMISSÕES: verificação de admin passa a ser feita NO BANCO
--    Antes, o site chamava toggle_role_permission / toggle_user_permission
--    depois de checar isSuperAdmin() no navegador — e, se a função
--    falhasse, gravava direto na tabela. Qualquer usuário podia repetir
--    essas chamadas pelo console e se tornar admin.
--    Agora exige-se o token, e o banco confere se aquele usuário é admin.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.rpc_set_role_permission(
  p_token text, p_role text, p_perm text, p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.sessao_e_admin(p_token) then
    raise exception 'Acesso negado: somente administradores podem alterar permissões.'
      using errcode = 'P0001';
  end if;

  insert into public.role_permissions (role, permission_code, ativo)
  values (p_role, p_perm, p_ativo)
  on conflict (role, permission_code) do update set ativo = excluded.ativo;

  -- O app grava também na tabela legada "permissoes" (nomes de coluna
  -- diferentes). Mantemos as duas em sincronia para não mudar o
  -- comportamento atual das telas.
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'permissoes') then
    insert into public.permissoes (role, permissao, ativo)
    values (p_role, p_perm, p_ativo)
    on conflict (role, permissao) do update set ativo = excluded.ativo;
  end if;
end;
$$;

revoke all on function public.rpc_set_role_permission(text, text, text, boolean) from public;
grant execute on function public.rpc_set_role_permission(text, text, text, boolean) to anon, authenticated;


create or replace function public.rpc_set_user_permission(
  p_token text, p_target_user uuid, p_perm text, p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.sessao_e_admin(p_token) then
    raise exception 'Acesso negado: somente administradores podem alterar permissões.'
      using errcode = 'P0001';
  end if;

  insert into public.user_permissions (user_id, permission_code, ativo)
  values (p_target_user, p_perm, p_ativo)
  on conflict (user_id, permission_code) do update set ativo = excluded.ativo;
end;
$$;

revoke all on function public.rpc_set_user_permission(text, uuid, text, boolean) from public;
grant execute on function public.rpc_set_user_permission(text, uuid, text, boolean) to anon, authenticated;


-- Criação e exclusão de PERFIS (roles). Necessárias porque o passo 9
-- bloqueia a escrita direta nessas tabelas — sem estas funções, a tela
-- "Permissões" perderia os botões de criar/excluir perfil.
create or replace function public.rpc_criar_role(
  p_token text, p_nome text, p_descricao text, p_perms text[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nome text := lower(regexp_replace(trim(coalesce(p_nome, '')), '\s+', '_', 'g'));
  v_p    text;
begin
  if not public.sessao_e_admin(p_token) then
    raise exception 'Acesso negado: somente administradores podem criar perfis.'
      using errcode = 'P0001';
  end if;

  if v_nome = '' then
    raise exception 'Nome do perfil é obrigatório.' using errcode = 'P0001';
  end if;

  -- Nomes reservados: a mesma regra que o app aplica no navegador, agora
  -- também no banco (a checagem do navegador pode ser contornada).
  if v_nome in ('admin', 'dirigente', 'adjunto', 'usuario') then
    raise exception 'Nome de perfil reservado.' using errcode = 'P0001';
  end if;

  insert into public.roles (nome, descricao) values (v_nome, p_descricao);

  foreach v_p in array coalesce(p_perms, array[]::text[]) loop
    perform public.rpc_set_role_permission(p_token, v_nome, v_p, true);
  end loop;
end;
$$;

revoke all on function public.rpc_criar_role(text, text, text, text[]) from public;
grant execute on function public.rpc_criar_role(text, text, text, text[]) to anon, authenticated;


create or replace function public.rpc_excluir_role(p_token text, p_nome text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.sessao_e_admin(p_token) then
    raise exception 'Acesso negado: somente administradores podem excluir perfis.'
      using errcode = 'P0001';
  end if;

  -- Perfis internos do sistema não podem ser removidos.
  if lower(p_nome) in ('admin', 'dirigente', 'adjunto', 'usuario') then
    raise exception 'Este perfil é do sistema e não pode ser excluído.'
      using errcode = 'P0001';
  end if;

  delete from public.role_permissions where role = p_nome;
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'permissoes') then
    delete from public.permissoes where role = p_nome;
  end if;
  delete from public.roles where nome = p_nome;
end;
$$;

revoke all on function public.rpc_excluir_role(text, text) from public;
grant execute on function public.rpc_excluir_role(text, text) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 9) TRANCA A ESCRITA DIRETA NAS TABELAS DE PERMISSÃO
--    Com as funções acima no lugar, o site não precisa mais escrever
--    direto nessas tabelas. Leitura continua liberada (o app precisa
--    montar a tela de Permissões); a ESCRITA passa a ser exclusiva das
--    funções verificadas do passo 8.
--    Este é o passo que efetivamente fecha o caminho de "virar admin".
-- ───────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['role_permissions', 'user_permissions', 'roles', 'permissions', 'permissoes'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
      raise notice 'Escrita direta bloqueada em %', t;
    else
      raise notice 'Tabela % não existe, pulando.', t;
    end if;
  end loop;
end $$;


-- ───────────────────────────────────────────────────────────────────────
-- 10) DADOS DE MENORES — jovens_fora_umadalpe
--     Esta tabela guarda dados pessoais de menores de idade e hoje está
--     inteiramente legível/gravável por qualquer um que tenha a chave
--     pública do site. É o item mais sensível do sistema.
--
--     Passa a exigir sessão válida para QUALQUER operação. Note que isso
--     ainda não distingue "qual usuário pode ver qual jovem" — para isso
--     é preciso o Supabase Auth — mas já exige estar autenticado de
--     verdade, o que elimina o acesso anônimo direto pela API.
-- ───────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'jovens_fora_umadalpe') then
    raise notice 'Tabela jovens_fora_umadalpe não existe — pulando passo 10.';
    return;
  end if;

  -- Remove a policy permissiva criada pelo script anterior.
  execute 'drop policy if exists jovens_fora_umadalpe_allow_all on public.jovens_fora_umadalpe';
  execute 'alter table public.jovens_fora_umadalpe enable row level security';

  -- Sem policy permissiva e sem GRANT direto, o acesso pela chave anon
  -- fica bloqueado; o app passa a usar as funções rpc_jfu_* abaixo.
  execute 'revoke all on public.jovens_fora_umadalpe from anon, authenticated';
end $$;


-- Resolve uma permissão do usuário da sessão DENTRO do banco, seguindo a
-- mesma regra do app: admin pode tudo; senão, um override individual em
-- user_permissions tem prioridade sobre a permissão do papel em
-- role_permissions.
create or replace function public.sessao_tem_permissao(p_token text, p_perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := public.sessao_usuario(p_token);
  v_role     text;
  v_override boolean;
  v_role_ok  boolean;
begin
  if v_uid is null then return false; end if;

  select lower(u.role) into v_role from public.sistema_usuarios u where u.id = v_uid;
  if v_role = 'admin' then return true; end if;

  select up.ativo into v_override
  from public.user_permissions up
  where up.user_id = v_uid and up.permission_code = p_perm;

  if v_override is not null then return v_override; end if;

  select rp.ativo into v_role_ok
  from public.role_permissions rp
  where rp.role = v_role and rp.permission_code = p_perm;

  return coalesce(v_role_ok, false);
end;
$$;

revoke all on function public.sessao_tem_permissao(text, text) from public, anon, authenticated;


-- Listagem. Devolve jsonb no MESMO formato que o PostgREST devolvia com
-- "select('*, congregacoes(nome), setores(nome)')", para que a tela
-- continue lendo j.congregacoes.nome e j.setores.nome sem alteração.
--
-- IMPORTANTE (escopo de setor): quem não tem 'ver_todos_setores' recebe
-- SOMENTE os jovens do próprio setor — e isso é decidido aqui, não pelo
-- parâmetro que o navegador manda. Se o filtro viesse do cliente, bastaria
-- alterá-lo no console para ver todo mundo; por isso o setor do usuário
-- sobrescreve o pedido quando ele não tem a permissão ampla.
create or replace function public.rpc_jfu_listar(p_token text, p_setor_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := public.sessao_usuario(p_token);
  v_ver_todos boolean;
  v_setor     uuid;
  v_filtro    uuid;
begin
  if v_uid is null then
    raise exception 'Sessão inválida ou expirada. Faça login novamente.'
      using errcode = 'P0001';
  end if;

  if not (public.sessao_tem_permissao(p_token, 'visualizar_jovens_fora_umadalpe')
       or public.sessao_tem_permissao(p_token, 'gerenciar_jovens_fora_umadalpe')) then
    raise exception 'Acesso negado.' using errcode = 'P0001';
  end if;

  v_ver_todos := public.sessao_tem_permissao(p_token, 'ver_todos_setores');
  select u.setor_id into v_setor from public.sistema_usuarios u where u.id = v_uid;

  -- Sem permissão ampla: o setor do próprio usuário manda, ignorando o
  -- que o cliente pediu.
  v_filtro := case when v_ver_todos then p_setor_id else v_setor end;

  return (
    select coalesce(jsonb_agg(t.obj order by t.nome), '[]'::jsonb)
    from (
      select j.nome as nome,
             to_jsonb(j)
               || jsonb_build_object(
                    'congregacoes',
                    case when c.id is null then null
                         else jsonb_build_object('nome', c.nome) end,
                    'setores',
                    case when s.id is null then null
                         else jsonb_build_object('nome', s.nome) end
                  ) as obj
      from public.jovens_fora_umadalpe j
      left join public.congregacoes c on c.id = j.congregacao_id
      left join public.setores s on s.id = j.setor_id
      where v_filtro is null or j.setor_id = v_filtro
    ) t
  );
end;
$$;

revoke all on function public.rpc_jfu_listar(text, uuid) from public;
grant execute on function public.rpc_jfu_listar(text, uuid) to anon, authenticated;


-- Busca de um único registro (telas de visualizar e editar). Mesmo
-- formato com os joins embutidos; devolve null se não encontrar.
create or replace function public.rpc_jfu_obter(p_token text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := public.sessao_usuario(p_token);
  v_ver_todos boolean;
  v_setor     uuid;
  v_obj       jsonb;
  v_setor_reg uuid;
begin
  if v_uid is null then
    raise exception 'Sessão inválida ou expirada. Faça login novamente.'
      using errcode = 'P0001';
  end if;

  if not (public.sessao_tem_permissao(p_token, 'visualizar_jovens_fora_umadalpe')
       or public.sessao_tem_permissao(p_token, 'gerenciar_jovens_fora_umadalpe')) then
    raise exception 'Acesso negado.' using errcode = 'P0001';
  end if;

  select j.setor_id,
         to_jsonb(j)
           || jsonb_build_object(
                'congregacoes',
                case when c.id is null then null else jsonb_build_object('nome', c.nome) end,
                'setores',
                case when s.id is null then null else jsonb_build_object('nome', s.nome) end
              )
    into v_setor_reg, v_obj
  from public.jovens_fora_umadalpe j
  left join public.congregacoes c on c.id = j.congregacao_id
  left join public.setores s on s.id = j.setor_id
  where j.id = p_id;

  if v_obj is null then return null; end if;

  -- Mesma regra de escopo da listagem: sem 'ver_todos_setores', só enxerga
  -- registros do próprio setor (evita burlar o filtro pedindo um id direto).
  v_ver_todos := public.sessao_tem_permissao(p_token, 'ver_todos_setores');
  if not v_ver_todos then
    select u.setor_id into v_setor from public.sistema_usuarios u where u.id = v_uid;
    if v_setor_reg is distinct from v_setor then
      raise exception 'Acesso negado.' using errcode = 'P0001';
    end if;
  end if;

  return v_obj;
end;
$$;

revoke all on function public.rpc_jfu_obter(text, uuid) from public;
grant execute on function public.rpc_jfu_obter(text, uuid) to anon, authenticated;


create or replace function public.rpc_jfu_salvar(p_token text, p_dados jsonb)
returns public.jovens_fora_umadalpe
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row    public.jovens_fora_umadalpe;
  v_atual  public.jovens_fora_umadalpe;
  v_id     uuid := nullif(p_dados->>'id', '')::uuid;
begin
  if public.sessao_usuario(p_token) is null then
    raise exception 'Sessão inválida ou expirada. Faça login novamente.'
      using errcode = 'P0001';
  end if;

  -- Criar/editar exige a permissão de GERENCIAR (a de visualizar não basta).
  if not public.sessao_tem_permissao(p_token, 'gerenciar_jovens_fora_umadalpe') then
    raise exception 'Acesso negado: você não tem permissão para alterar estes dados.'
      using errcode = 'P0001';
  end if;

  -- jsonb_populate_record converte o JSON direto para o tipo da tabela,
  -- então chaves desconhecidas são ignoradas e os tipos (date, uuid…) são
  -- convertidos pelo próprio Postgres — não há montagem de SQL por
  -- concatenação de texto aqui, logo não há espaço para SQL injection.
  -- ATENÇÃO: a lista de colunas do UPDATE abaixo é explícita. Se você
  -- adicionar uma coluna nova em jovens_fora_umadalpe, inclua-a também
  -- nas duas listas do UPDATE, senão ela não será salva nas edições.
  if v_id is null then
    -- INSERT: 'id' é removido para o banco gerar o valor padrão.
    insert into public.jovens_fora_umadalpe
    select * from jsonb_populate_record(null::public.jovens_fora_umadalpe, p_dados - 'id')
    returning * into v_row;
  else
    select * into v_atual from public.jovens_fora_umadalpe where id = v_id;
    if v_atual.id is null then
      raise exception 'Registro não encontrado.' using errcode = 'P0001';
    end if;

    -- Partindo da linha atual, sobrescreve apenas as chaves enviadas
    -- (campos ausentes no JSON mantêm o valor que já estava gravado).
    -- O 'id' é forçado de volta para impedir troca de identidade.
    select * into v_row
    from jsonb_populate_record(v_atual, (p_dados - 'id'));
    v_row.id := v_id;

    update public.jovens_fora_umadalpe set (
      nome, sexo, data_nascimento, telefone, responsavel, endereco,
      bairro, cidade, estado, observacoes, setor_id, congregacao_id
    ) = (
      v_row.nome, v_row.sexo, v_row.data_nascimento, v_row.telefone,
      v_row.responsavel, v_row.endereco, v_row.bairro, v_row.cidade,
      v_row.estado, v_row.observacoes, v_row.setor_id, v_row.congregacao_id
    )
    where id = v_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.rpc_jfu_salvar(text, jsonb) from public;
grant execute on function public.rpc_jfu_salvar(text, jsonb) to anon, authenticated;


create or replace function public.rpc_jfu_excluir(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Mesma regra que a tela aplica hoje (canGerJovensFU): quem gerencia
  -- pode excluir. A diferença é que agora a regra é conferida no servidor.
  if not public.sessao_tem_permissao(p_token, 'gerenciar_jovens_fora_umadalpe') then
    raise exception 'Acesso negado: você não tem permissão para excluir estes dados.'
      using errcode = 'P0001';
  end if;
  delete from public.jovens_fora_umadalpe where id = p_id;
end;
$$;

revoke all on function public.rpc_jfu_excluir(text, uuid) from public;
grant execute on function public.rpc_jfu_excluir(text, uuid) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 11) Recarrega o cache de schema do PostgREST para as funções novas
--     ficarem visíveis para o site imediatamente.
-- ───────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- DEPOIS DE RODAR — CHECKLIST DE TESTE (faça nesta ordem)
--
--  1. Publique a nova versão do app.js (ela já chama as funções acima).
--  2. Faça login normalmente. Deve entrar como sempre.
--  3. Erre a senha 10 vezes seguidas: deve aparecer a mensagem de
--     "Muitas tentativas". Espere 15 min (ou limpe a tabela
--     login_tentativas) para destravar.
--  4. Abra a tela "Permissões" como admin e ligue/desligue uma permissão:
--     deve continuar funcionando.
--  5. Entre com um usuário NÃO-admin e confirme que ele não consegue
--     alterar permissões.
--  6. Abra a tela "Jovens (Fora UMADALPE)": listar, criar e editar devem
--     funcionar; excluir só para admin.
--
-- PARA VOLTAR ATRÁS (se algo quebrar), rode:
--   grant insert, update, delete on public.role_permissions,
--     public.user_permissions, public.roles, public.permissions to anon;
--   grant all on public.jovens_fora_umadalpe to anon;
--   create policy jovens_fora_umadalpe_allow_all on public.jovens_fora_umadalpe
--     for all using (true) with check (true);
--   notify pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════
