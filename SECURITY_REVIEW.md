# Checagem de Segurança — EclesiaSync (controledb)

Data: 2026-08-16 · Projeto Supabase: `controledb` (xmemvwegmzykfdimnqbc)

Resumo em uma frase: **o banco está configurado para confiar inteiramente no
navegador.** Todas as tabelas têm RLS "ligada", mas com uma policy
`FOR ALL TO public USING (true)` — ou seja, a chave pública (anon), que está
embutida em `app.js`, tem leitura e escrita totais em tudo. As verificações de
permissão do `app.js` são apenas visuais e podem ser contornadas pelo console.

O time já escreveu o remédio (`security_hardening.sql`), mas **ele ainda não foi
aplicado** neste projeto (as tabelas `sessoes` e `login_tentativas` não existem).

---

## 🔴 Críticos (banco de dados)

### 1. RLS permissiva em todas as tabelas (`USING (true)`)
Confirmado por consulta: `anon` pode **ler** `sistema_usuarios` (inclusive a
coluna `senha`), e pode **escrever** em `role_permissions`. Consequências:

- Qualquer pessoa com a URL do site pode, pelo console/API REST:
  - ler todos os usuários e o **hash bcrypt** das senhas (`select senha from sistema_usuarios`) — permite quebra offline;
  - **se tornar admin** gravando direto em `role_permissions` / `user_permissions` / `permissoes`;
  - ler/alterar/**apagar** eventos, membros, congregações, licenças financeiras, ranking, etc.
- As funções `hasPerm()` / `isSuperAdmin()` no `app.js` não protegem nada — são só UX.

**Positivo:** as senhas estão em **bcrypt** (7/7 registros, 60 chars `$2…`) e o
`rpc_login` verifica com `crypt()` corretamente e não devolve a senha. Bom. O
problema é o acesso direto à tabela que ignora o `rpc_login`.

### 2. Dados de menores expostos — `jovens_fora_umadalpe`
Ainda tem duas policies `allow_all`. Nome, data de nascimento, telefone,
responsável e endereço de menores estão **legíveis e graváveis por qualquer um**
com a chave pública. É o item mais sensível (LGPD) do sistema.

### 3. Escalonamento de privilégio via RPC de permissões
`toggle_role_permission` e `toggle_user_permission` são `SECURITY DEFINER` e
**executáveis por `anon`**. Combinadas com a escrita direta nas tabelas, dão
mais de um caminho para virar admin sem autenticação real.

---

## 🟠 Recomendado

- **`get_user_permissions`, `has_permission`, `can_modify_setor`** — `SECURITY
  DEFINER` executáveis por `anon`. Reveja se precisam ser públicas; senão,
  `REVOKE EXECUTE ... FROM anon`.
- **Coluna `senha` legível pelo `anon`** — mesmo depois do `security_hardening.sql`
  (que não mexe nela), o hash continua legível. Recomendo revogar a leitura da
  coluna: `revoke select (senha, session_token) on public.sistema_usuarios from anon, authenticated;`
- **Views `SECURITY DEFINER`** (`v_eventos_publicados`, `v_licencas_status`) —
  recriar como `security_invoker = true` (Postgres 15+) para respeitarem a RLS
  de quem consulta.
- **`search_path` mutável** em `set_updated_at`, `update_updated_at`,
  `controledb.set_updated_at` — adicionar `SET search_path = public, extensions`
  (evita sequestro de search_path em funções DEFINER).

## 🟡 Limpeza

- **`public.teste_func()`** — função de teste esquecida (retorna `'ok'`).
  Remover: `drop function if exists public.teste_func();`
- Policies duplicadas por tabela (ex.: `allow_all_eventos` **e**
  `eventos_allow_all`) — resquício de migrações repetidas; consolidar ao
  refazer as policies.

---

## Front-end (`app.js`, `index.html`)

- **XSS:** o código escapa texto livre de forma consistente
  (`escHtml` / `escH` / `dp.esc` / `rkEsc`) nos campos de risco (resumo, nome,
  endereço, observações, vocação, tema). Não encontrei injeção crua nos trechos
  auditados. Manter o padrão: todo dado vindo do banco deve passar por `escHtml`
  antes de ir para `innerHTML`.
- **Chave anon no código:** normal e esperado no Supabase — ela é pública **por
  design**; a proteção real precisa vir da RLS/servidor (itens acima), não de
  esconder a chave.
- **Sessão:** login via `rpc_login` (correto). O token de sessão fica em
  `localStorage`; o `app.js` já tem o caminho novo (`rpc_sessao_valida`,
  `rpc_logout`) com fallback para o esquema antigo — ou seja, aplicar o
  `security_hardening.sql` deve ser compatível com o front-end atual.

---

## Plano de correção sugerido (nesta ordem)

1. **Fazer backup** (Supabase → Database → Backups) antes de qualquer mudança.
2. **Aplicar `security_hardening.sql`** no SQL Editor. Ele resolve: sessão real
   verificável, trava de força-bruta, escrita de permissões só via RPC checada,
   e fecha `jovens_fora_umadalpe`. Seguir o checklist de teste no fim do arquivo.
3. **Fechar o que o hardening não cobre** (script curto adicional):
   - trocar as policies `allow_all` de `eventos, membros, congregacoes, setores,
     financeiro_licencas, agenda_semana, ranking_*` por RPCs com token **ou**,
     no mínimo, restringir escrita e a leitura de dados sensíveis;
   - `revoke select (senha, session_token) on public.sistema_usuarios from anon, authenticated;`
   - `drop function if exists public.teste_func();`
   - `SET search_path` nas funções de trigger; views como `security_invoker`.
4. **Caminho definitivo:** migrar para **Supabase Auth** (JWT por usuário) para
   ter RLS por linha de verdade (cada usuário vê só o que lhe cabe). É a única
   forma de fechar 100% — o token próprio já é um bom passo intermediário.

> Não apliquei nenhuma mudança no banco: são alterações voltadas para produção,
> difíceis de reverter e que podem afetar usuários reais. Posso aplicar o
> `security_hardening.sql` e o script complementar mediante sua confirmação.
