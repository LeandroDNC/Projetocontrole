/* ═══════════════════════════════════════════════════════════
   EclesiaSync — Service Worker de notificações
   ───────────────────────────────────────────────────────────
   Responsável por:
   1. Receber "push" do servidor (funciona mesmo com o app fechado /
      usuário deslogado) e mostrar a notificação no aparelho. Isso só
      dispara de verdade quando existe um servidor de push configurado
      (VAPID) enviando as mensagens — ver push_notifications.sql.
   2. Ao clicar na notificação, abrir/focar o app na página do evento.
      Se já houver uma janela aberta, ela é focada e recebe a instrução
      de navegar; senão, uma nova é aberta em index.html com os parâmetros
      ?goto=...&ev=... que o app lê no carregamento (e, se o usuário não
      estiver logado, cai na tela de login e a navegação acontece depois
      que ele entra).
   ═══════════════════════════════════════════════════════════ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { title: 'EclesiaSync', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'EclesiaSync';
  const options = {
    body: data.body || '',
    icon: data.icon || 'assets/icon.png',
    badge: data.badge || 'assets/icon.png',
    tag: data.tag || 'eclesiasync-evento',
    renotify: true,
    data: { goto: data.goto || 'eventos_setoriais', ev: data.ev || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  const scope = self.registration.scope; // ex.: https://host/caminho/
  const params = new URLSearchParams();
  if (d.goto) params.set('goto', d.goto);
  if (d.ev) params.set('ev', d.ev);
  const target = scope + 'index.html' + (params.toString() ? ('?' + params.toString()) : '');

  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of janelas) {
      // Reaproveita uma janela já aberta do app (mesma origem).
      if (c.url.indexOf(scope) === 0 && 'focus' in c) {
        await c.focus();
        c.postMessage({ type: 'eclesiasync-goto', goto: d.goto, ev: d.ev });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

/* Permite que o app mostre uma notificação local através do SW enquanto
   está aberto (sem depender do servidor de push). */
self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.type === 'eclesiasync-notify') {
    const o = m.options || {};
    self.registration.showNotification(m.title || 'EclesiaSync', {
      body: o.body || '',
      icon: o.icon || 'assets/icon.png',
      badge: o.badge || 'assets/icon.png',
      tag: o.tag || 'eclesiasync-evento',
      renotify: true,
      data: { goto: o.goto || 'eventos_setoriais', ev: o.ev || null },
    });
  }
});
