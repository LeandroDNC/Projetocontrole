/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_menu_fix.js
   Carregar por ÚLTIMO no HTML, depois de patch_jovens_fora_umadalpe.js:
     <script src="patch_menu_fix.js"></script>

   PROBLEMA: os menus "Membros" e "Jovens (Fora UMADALPE)" eram
   injetados por um setTimeout de tempo fixo, disparado assim que
   o script carregava — ou seja, ANTES do login acontecer. Se a
   sessão fosse restaurada automaticamente (reload), dava tempo de
   currentUser já existir. Num login manual (mais lento que o
   timeout), o menu não aparecia até recarregar a página.

   SOLUÇÃO: prender a injeção ao evento real de "login concluído"
   (startApp), garantindo que rode sempre com currentUser e
   permissionsCache já carregados — sem depender de tempo.
   ═══════════════════════════════════════════════════════════ */

function pfInjetarMenusExtras() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  // Membros
  if (!nav.querySelector('[data-page="todos_membros"]') && typeof canVerMembros === 'function' && canVerMembros()) {
    const div = document.createElement('div');
    div.className = 'nav-item'; div.dataset.page = 'todos_membros';
    div.innerHTML = `<span class="nav-icon"><i data-lucide="users-round"></i></span><span class="nav-lbl">Membros</span>`;
    div.addEventListener('click', () => { navigate('todos_membros'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const usersItem = nav.querySelector('[data-page="usuarios"]');
    if (usersItem) nav.insertBefore(div, usersItem.nextSibling); else nav.appendChild(div);
  }

  // Jovens (Fora UMADALPE)
  if (!nav.querySelector('[data-page="jovens_fora_umadalpe"]') && typeof canVerJovensFU === 'function' && canVerJovensFU()) {
    const div2 = document.createElement('div');
    div2.className = 'nav-item'; div2.dataset.page = 'jovens_fora_umadalpe';
    div2.innerHTML = `<span class="nav-icon"><i data-lucide="user-round-search"></i></span><span class="nav-lbl">Jovens (Fora UMADALPE)</span>`;
    div2.addEventListener('click', () => { navigate('jovens_fora_umadalpe'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const membrosItem = nav.querySelector('[data-page="todos_membros"]');
    if (membrosItem) nav.insertBefore(div2, membrosItem.nextSibling); else nav.appendChild(div2);
  }

  if (typeof refreshLucide === 'function') refreshLucide();
}

const _origStartAppFix = window.startApp;
if (typeof _origStartAppFix === 'function' && !window._startAppPatchedMenuFix) {
  window._startAppPatchedMenuFix = true;
  window.startApp = function (user) {
    _origStartAppFix(user);
    // pequeno atraso só pra garantir que loadPermissions() (chamado em
    // doLogin antes de startApp) já resolveu o preenchimento de
    // permissionsCache antes de decidirmos mostrar o menu ou não.
    setTimeout(pfInjetarMenusExtras, 50);
  };
}

console.log('[patch_menu_fix] carregado ✓');