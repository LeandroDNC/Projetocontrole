-- ═══════════════════════════════════════════════════════════════════════
-- EclesiaSync / UMADALPE — Migração de Segurança
-- ═══════════════════════════════════════════════════════════════════════
--
-- COMO RODAR
-- 1. Abra o painel do seu projeto em https://supabase.com/dashboard
-- 2. No menu lateral, clique em "SQL Editor"
-- 3. Clique em "New query"
-- 4. Cole o conteúdo INTEIRO deste arquivo e clique em "Run"
-- 5. Confira no final que apareceu "Success. No rows returned" (ou os
--    avisos NOTICE listados abaixo) e não nenhuma mensagem de erro.
--
-- AVISO IMPORTANTE — LEIA ANTES DE RODAR
-- Depois que este script rodar, o login do site (script_v5.js) passa a
-- chamar a função `rpc_login` criada aqui em vez de comparar a senha em
-- texto puro. Ou seja: o login SÓ funciona depois que este script for
-- executado no seu projeto Supabase. Rode este script ANTES de publicar
-- a nova versão do script_v5.js (ou rode os dois quase juntos — a janela
-- de "login fora do ar" é só o tempo entre publicar o JS novo e rodar
-- este SQL).
--
-- O QUE ESTE SCRIPT FAZ (resumo)
-- 1. Liga a extensão pgcrypto (necessária para hash de senha).
-- 2. Converte todas as senhas hoje gravadas em texto puro na tabela
--    sistema_usuarios para hash bcrypt — SEM apagar nenhum usuário nem
--    pedir para ninguém trocar de senha.
-- 3. Cria um gatilho (trigger) para que, dali em diante, toda vez que o
--    próprio site salvar/alterar uma senha (tela "Usuários" já existente,
--    sem nenhuma mudança nela), o banco já grave em hash automaticamente
--    — o front-end continua enviando a senha como sempre enviou.
-- 4. Cria a função rpc_login(usuario, senha), que faz a verificação da
--    senha DENTRO do banco (nunca mais expõe a senha nem o hash pro
--    navegador) e devolve só os dados seguros do usuário.
-- 5. Impede que a coluna "senha" seja lida diretamente por qualquer
--    consulta comum (só a função acima, internamente, consegue lê-la).
-- 6. Liga Row Level Security (RLS) em todas as tabelas do schema, o que
--    hoje está desligado — ou seja, hoje, teoricamente, qualquer pessoa
--    com a chave pública do projeto (que já está visível no código-fonte
--    do site, isso é normal em projetos Supabase) conseguiria ler/editar
--    QUALQUER tabela direto pela API, sem passar pelo site nem pelas
--    permissões que você configura na tela "Permissões". Ligar RLS é o
--    requisito mínimo do Supabase para essa porta parar de ficar
--    escancarada.
--
-- LIMITAÇÃO HONESTA (leia isto também)
-- Este site não usa "Supabase Auth" — o login é uma tabela própria
-- (sistema_usuarios) e cada usuário nunca fica "autenticado" para o
-- banco de dados em si; todo mundo (o site inteiro) fala com o Supabase
-- usando a MESMA chave pública (anon key). Por isso, o Postgres não tem
-- como saber "quem" está fazendo cada consulta para aplicar regras do
-- tipo "só o dono do registro pode editar" — isso é o que Row Level
-- Security faz de verdade em apps que usam Supabase Auth, e este app não
-- usa. Sem migrar para Supabase Auth (ou reescrever cada tela para
-- passar por funções verificadas, uma por uma), a política de RLS que dá
-- para aplicar aqui é "permitir", só formalizando o que já é o
-- comportamento atual — o ganho real deste script está nos itens 1-5
-- acima (senha, e a porta "RLS totalmente desligada"). As tabelas mais
-- sensíveis (sistema_usuarios, role_permissions, user_permissions,
-- roles, permissions, financeiro_licencas, jovens_fora_umadalpe — que
-- guarda dados de menores) estão marcadas abaixo como prioridade para
-- quando o projeto migrar para autenticação real do Supabase.
--
-- Este script é seguro para rodar mais de uma vez (idempotente): ele
-- confere se cada coisa já existe antes de criar de novo.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 1) EXTENSÃO PARA HASH DE SENHA
-- ───────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;


-- ───────────────────────────────────────────────────────────────────────
-- 2) MIGRA SENHAS EXISTENTES DE TEXTO PURO PARA HASH (bcrypt)
--    Só mexe em linhas cuja senha ainda NÃO parece um hash bcrypt
--    (hash bcrypt sempre começa com $2a$, $2b$ ou $2y$), então é seguro
--    rodar de novo sem re-hashear o que já foi hasheado.
-- ───────────────────────────────────────────────────────────────────────
update public.sistema_usuarios
set senha = crypt(senha, gen_salt('bf'))
where senha is not null
  and senha !~ '^\$2[aby]\$';


-- ───────────────────────────────────────────────────────────────────────
-- 3) GATILHO: qualquer novo INSERT/UPDATE de senha vira hash sozinho
--    Assim o formulário "Novo/Editar Usuário" do site (que já manda a
--    senha em texto puro no payload, sem nenhuma mudança necessária nele)
--    continua funcionando exatamente igual — o banco é que passa a
--    guardar só o hash.
-- ───────────────────────────────────────────────────────────────────────
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

drop trigger if exists trg_hash_senha_sistema_usuarios on public.sistema_usuarios;
create trigger trg_hash_senha_sistema_usuarios
  before insert or update of senha on public.sistema_usuarios
  for each row
  execute function public.hash_senha_sistema_usuarios();


-- ───────────────────────────────────────────────────────────────────────
-- 4) FUNÇÃO DE LOGIN SEGURA — verifica a senha DENTRO do banco
--    SECURITY DEFINER: roda com o privilégio de quem criou a função
--    (portanto consegue ler a coluna "senha" mesmo depois do REVOKE do
--    passo 5), mas o próprio código da função NUNCA devolve a senha nem
--    o hash — só os campos que a tela já usa hoje.
-- ───────────────────────────────────────────────────────────────────────
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

-- Só quem está usando a chave anon/authenticated do app pode chamar a
-- função de login (é assim que o front-end chama hoje via supabase-js).
revoke all on function public.rpc_login(text, text) from public;
grant execute on function public.rpc_login(text, text) to anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 5) IMPEDE LEITURA DIRETA DA COLUNA "senha"
--    A partir daqui, um SELECT * (ou select('*') do supabase-js) na
--    tabela sistema_usuarios simplesmente falha para anon/authenticated
--    se tentar trazer essa coluna — só a função rpc_login (rodando como
--    dona da função) consegue ler. Isso é uma segunda camada de proteção
--    além da correção já feita no código-fonte (script_v5.js/ajuste.js
--    pararam de pedir essa coluna nas listagens de usuário).
-- ───────────────────────────────────────────────────────────────────────
revoke select (senha) on public.sistema_usuarios from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 6) ROW LEVEL SECURITY — liga em todas as tabelas do schema
--    Política "using (true)" = mantém o mesmo acesso de leitura/escrita
--    que o app já tem hoje (nenhuma tela para de funcionar), mas fecha o
--    cenário de RLS completamente desligada. Ver "LIMITAÇÃO HONESTA" no
--    topo do arquivo sobre o que isso não resolve sozinho.
-- ───────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tabelas text[] := array[
    'setores', 'congregacoes', 'membros', 'usuarios', 'permissoes',
    'atividades', 'sistema_usuarios', 'eventos', 'agenda_semana',
    'roles', 'permissions', 'role_permissions', 'user_permissions',
    'financeiro_licencas', 'ranking_config', 'ranking_semanal',
    'ranking_mensal', 'jovens_fora_umadalpe'
  ];
begin
  foreach t in array tabelas loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security', t);

      -- remove política antiga do mesmo nome antes de recriar (idempotente)
      execute format('drop policy if exists %I on public.%I', t || '_allow_all', t);
      execute format(
        'create policy %I on public.%I for all using (true) with check (true)',
        t || '_allow_all', t
      );
    else
      raise notice 'Tabela % não existe neste projeto, pulando.', t;
    end if;
  end loop;
end $$;

-- A tabela sistema_usuarios já tem a política "allow all" acima (mantém
-- as telas de Usuários funcionando), MAS a coluna senha continua
-- protegida pelo REVOKE do passo 5 independentemente da política de RLS
-- — RLS é por linha, o REVOKE de coluna é a proteção específica da senha.


-- ═══════════════════════════════════════════════════════════════════════
-- FIM. Depois de rodar sem erros:
--  1. Publique a nova versão de script_v5.js (já ajustada para chamar
--     rpc_login em vez de comparar a senha em texto puro).
--  2. Teste um login normal para confirmar que continua funcionando.
--  3. Teste criar/editar um usuário na tela "Usuários" — a senha nova
--     deve continuar funcionando no próximo login (o gatilho do passo 3
--     cuida do hash sozinho).
-- ═══════════════════════════════════════════════════════════════════════
