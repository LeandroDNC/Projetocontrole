-- ═══════════════════════════════════════════════════════════════════════
-- EclesiaSync — Notificações Push (app fechado / usuário deslogado)
-- ═══════════════════════════════════════════════════════════════════════
--
-- O QUE JÁ FUNCIONA SEM ESTE ARQUIVO
-- O sino de notificações, o liga/desliga e as notificações enquanto o app
-- está ABERTO (mesmo com a aba em segundo plano) já funcionam só com o
-- front-end + o sw.js. Você não precisa de nada disto para isso.
--
-- PARA QUE SERVE ESTE ARQUIVO
-- Para o caso "app totalmente fechado / usuário deslogado por horas", o
-- navegador exige Web Push de verdade: um servidor que assina a mensagem
-- com uma chave VAPID e a entrega ao serviço de push do navegador. Isto
-- aqui prepara o lado do banco (a tabela que guarda as assinaturas). O
-- envio em si é feito por uma Edge Function do Supabase (exemplo no fim).
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase e clique em Run. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 1) TABELA DE ASSINATURAS DE PUSH
--    Cada aparelho/navegador que ativa notificações gera uma "subscription"
--    (endpoint + chaves). O front-end (pfAssinarPush em app.js) grava aqui.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  usuario_id   uuid references public.sistema_usuarios(id) on delete set null,
  subscription jsonb not null,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_push_subs_usuario on public.push_subscriptions (usuario_id);

alter table public.push_subscriptions enable row level security;

-- O app usa a chave anon; ele só precisa INSERIR/ATUALIZAR a própria
-- assinatura (upsert por endpoint). Leitura fica bloqueada para anon — só
-- a Edge Function (com a service_role) lê para enviar os pushes.
drop policy if exists push_subs_insert on public.push_subscriptions;
create policy push_subs_insert on public.push_subscriptions
  for insert to anon, authenticated with check (true);

drop policy if exists push_subs_update on public.push_subscriptions;
create policy push_subs_update on public.push_subscriptions
  for update to anon, authenticated using (true) with check (true);

-- (sem policy de SELECT/DELETE para anon = a chave pública não lê a tabela)


-- ═══════════════════════════════════════════════════════════════════════
-- 2) PASSOS FORA DO SQL (faça uma vez)
-- ═══════════════════════════════════════════════════════════════════════
--
-- a) Gere um par de chaves VAPID (no seu computador, com Node instalado):
--       npx web-push generate-vapid-keys
--    Guarde a "Public Key" e a "Private Key".
--
-- b) No front-end, publique a chave PÚBLICA. Antes de <script src="app.js">
--    no index.html, adicione:
--       <script>window.VAPID_PUBLIC_KEY = 'COLE_A_CHAVE_PUBLICA_AQUI';</script>
--    (Sem isso, o app só faz notificação local — com o app aberto.)
--
-- c) Crie uma Edge Function no Supabase que envia o push. Exemplo (Deno):
--
--    // supabase/functions/enviar-push/index.ts
--    import webpush from 'npm:web-push@3.6.7';
--    import { createClient } from 'npm:@supabase/supabase-js@2';
--
--    const supabase = createClient(
--      Deno.env.get('SUPABASE_URL')!,
--      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // service_role, só no servidor
--    );
--    webpush.setVapidDetails(
--      'mailto:voce@exemplo.com',
--      Deno.env.get('VAPID_PUBLIC_KEY')!,
--      Deno.env.get('VAPID_PRIVATE_KEY')!
--    );
--
--    Deno.serve(async (req) => {
--      const { titulo, corpo, goto, ev } = await req.json();
--      const { data: subs } = await supabase.from('push_subscriptions').select('*');
--      const payload = JSON.stringify({ title: titulo, body: corpo, goto, ev });
--      await Promise.all((subs ?? []).map(s =>
--        webpush.sendNotification(s.subscription, payload).catch(async (err) => {
--          // assinatura expirada (404/410) → remove
--          if (err.statusCode === 404 || err.statusCode === 410)
--            await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
--        })
--      ));
--      return new Response('ok');
--    });
--
--    Configure os segredos da função (Settings → Edge Functions → Secrets):
--       VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
--    (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm por padrão.)
--
-- d) Chame a função quando um evento for publicado. Duas opções:
--    • Simples: no submitFinalizarEventoSetorial (app.js), depois do update,
--      faça um fetch para a URL da Edge Function com { titulo, corpo, goto:
--      'eventos_setoriais', ev: id }. (O push chega aos aparelhos inscritos,
--      mesmo fechados.)
--    • Robusto: crie um Database Webhook (Supabase → Database → Webhooks) na
--      tabela eventos, em UPDATE, quando status muda para 'pendente', que
--      chama a Edge Function. Assim o disparo é do servidor, independente
--      de quem publicou.
--
-- ═══════════════════════════════════════════════════════════════════════
-- FIM. Sem os passos (a)-(d), continua tudo funcionando em modo "app
-- aberto"; com eles, as notificações passam a chegar com o app fechado.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- NOTIFICAÇÃO EM TEMPO REAL (app ABERTO) — para os DEMAIS usuários
-- ═══════════════════════════════════════════════════════════════════════
-- Quando alguém cria um evento, os outros usuários que estão com o app
-- ABERTO recebem o popup + som na hora, via Supabase Realtime. Para isso,
-- a tabela `eventos` precisa estar publicada no Realtime. Rode uma vez:
--
--   alter publication supabase_realtime add table public.eventos;
--
-- (No painel também dá: Database -> Replication -> supabase_realtime ->
--  marcar a tabela `eventos`.)
--
-- Sem isto, quem cria o evento ainda ouve o som e vê o popup no próprio
-- aparelho (é garantido pelo app), mas os demais só recebem com o app
-- fechado se o Web Push (passos a-d acima) estiver configurado.
-- ═══════════════════════════════════════════════════════════════════════
