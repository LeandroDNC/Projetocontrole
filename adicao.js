/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_atuacao_visitas.js
   Carregar por ÚLTIMO no HTML, depois de patch_ajustes.js:
     <script src="patch_atuacao_visitas.js"></script>

   O QUE ESTE ARQUIVO FAZ:
   1. Adiciona o campo "Atuação" (Superintendência / Coordenação /
      Liderança) + "Específico" no cadastro de Membro (novo, editar
      e no menu global de Membros).
   2. Adiciona a seção "Visitas de Obreiros" nos formulários de
      evento (congregação e setorial): permite adicionar VÁRIOS
      filtros (ex: Obreiro Local + Superintendência, e também
      UMADALPE + Liderança ao mesmo tempo), buscar os membros que
      batem com cada filtro (sempre excluindo cargo = "Membro") e
      marcá-los para entrar em participante_ids.
   3. Cria as permissões "alterar_membros" e "visualizar_membros" e
      o menu lateral "Membros", reaproveitando a permissão já
      existente "ver_todos_setores" como a alavanca de "ver todos os
      setores nesta tela" (mesma regra usada no Dashboard).
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────
   0) DADOS DE ATUAÇÃO
   ─────────────────────────────────────────────────────────── */
const ATUACAO_OPCOES = ['Superintendência', 'Coordenação', 'Liderança'];
const ATUACAO_ESPECIFICO = {
  'Superintendência': ['Superintendente', 'Secretário(a)', 'Adjunto'],
  'Coordenação': ['Secretário(a) do Setor'],
  'Liderança': ['Dirigente', 'Vice-Dirigente', 'Secretário(a)', 'Auxiliar', 'Mídia'],
};

function pfAtuacaoSelectHtml(idPrefix, atuacaoAtual, especificoAtual) {
  return `
  <div class="form-row">
    <div class="form-group">
      <label>Atuação</label>
      <select id="${idPrefix}-atuacao" onchange="pfAtualizarEspecifico('${idPrefix}')">
        <option value="">— Nenhuma —</option>
        ${ATUACAO_OPCOES.map(a => `<option value="${a}" ${a === atuacaoAtual ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Específico</label>
      <select id="${idPrefix}-especifico"></select>
    </div>
  </div>`;
}

window.pfAtualizarEspecifico = function (idPrefix, manter) {
  const atuacao = document.getElementById(`${idPrefix}-atuacao`)?.value || '';
  const espSel = document.getElementById(`${idPrefix}-especifico`);
  if (!espSel) return;
  const opts = ATUACAO_ESPECIFICO[atuacao] || [];
  espSel.innerHTML = `<option value="">— Nenhum —</option>${opts.map(o => `<option value="${o}" ${o === manter ? 'selected' : ''}>${o}</option>`).join('')}`;
  espSel.disabled = !atuacao;
};

/* ───────────────────────────────────────────────────────────
   1) PERMISSÕES NOVAS
   ─────────────────────────────────────────────────────────── */
if (typeof PERM_DESC !== 'undefined') {
  PERM_DESC['alterar_membros'] = { label: 'Alterar Membros', desc: 'Editar dados dos membros do próprio setor. A permissão "Ver Todos os Setores" libera também um filtro de setor nesta tela.' };
  PERM_DESC['visualizar_membros'] = { label: 'Visualizar Membros', desc: 'Ver a lista de membros do próprio setor. A permissão "Ver Todos os Setores" libera também um filtro de setor nesta tela.' };
}

const canVerMembros = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && (hasPerm('visualizar_membros') || hasPerm('gerenciar_membros')));
const canAlterarMembros = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && (hasPerm('alterar_membros') || hasPerm('gerenciar_membros')));

/* ───────────────────────────────────────────────────────────
   2) CADASTRO DE MEMBRO — campo Atuação
   ─────────────────────────────────────────────────────────── */
window.openEditMembro = function (id) {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" value="${escHtml(m.telefone || '')}"/></div>
    <div class="form-group"><label>Email</label><input id="em-email" value="${escHtml(m.email || '')}"/></div>
    <div class="form-group"><label>Vocação</label><textarea id="em-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia...">${escHtml(m.vocacao || '')}</textarea></div>
    <div class="form-section-title">${lc("shield", 14)} Atuação</div>
    ${pfAtuacaoSelectHtml('em', m.atuacao, m.atuacao_especifico)}
    <div class="form-section-title">${lc("book-open", 14)} Escola Bíblica Dominical</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="em-ebd"><option value="false" ${!m.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${m.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
      <div class="form-group"><label>Papel</label><select id="em-papel-ebd"><option value="" ${!m.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${m.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${m.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${m.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
    </div>`;
    pfAtualizarEspecifico('em', m.atuacao_especifico);
    const modal = document.querySelector('.modal');
    if (modal && !modal.querySelector('.modal-foot')) { const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveMembro('${id}')">${lc("save", 14)} Salvar</button>`; modal.appendChild(foot); }
  });
};

window.saveMembro = async function (id) {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  const payload = {
    nome: ($('em-nome')?.value || '').trim(),
    cargo: $('em-cargo')?.value,
    idade: parseInt($('em-idade')?.value) || null,
    telefone: ($('em-tel')?.value || '').trim(),
    email: ($('em-email')?.value || '').trim(),
    vocacao: ($('em-vocacao')?.value || '').trim() || null,
    atuacao: $('em-atuacao')?.value || null,
    atuacao_especifico: $('em-especifico')?.value || null,
    frequenta_ebd: $('em-ebd')?.value === 'true',
    papel_ebd: $('em-papel-ebd')?.value || null
  };
  if (!payload.nome) { toast('Nome obrigatório', 'error'); return; }
  const { error } = await q('membros').update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast('Membro atualizado!');
  if (currentPage === 'setores') renderSetores();
  if (currentPage === 'todos_membros' && typeof renderTodosMembros === 'function') renderTodosMembros();
};

window.openMemberModal = async function (id) {
  showModal(loadingPage());
  const { data: m, error } = await q('membros').select('*').eq('id', id).single();
  if (error || !m) { closeModal(); toast('Erro', 'error'); return; }
  const ebdInfo = m.frequenta_ebd ? `<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:#38bdf8;margin-bottom:4px">${lc("book-open", 14)} Escola Bíblica Dominical</div><div class="c3">Papel: <strong style="color:var(--txt)">${escHtml(m.papel_ebd || 'Aluno')}</strong></div></div>` : '';
  const vocacaoInfo = m.vocacao ? `<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--gold);margin-bottom:4px">${lc("sparkles", 14)} Vocação</div><div class="c2">${escHtml(m.vocacao)}</div></div>` : '';
  const atuacaoInfo = m.atuacao ? `<div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--violet);margin-bottom:4px">${lc("shield", 14)} Atuação</div><div class="c2">${escHtml(m.atuacao)}${m.atuacao_especifico ? ' · ' + escHtml(m.atuacao_especifico) : ''}</div></div>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${atuacaoInfo}${vocacaoInfo}${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${canAlterarMembros() ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};

/* Formulário de "Novo Membro" na tela de congregação */
const _origOpenAddModal = window.openAddModal;
window.openAddModal = function (type) {
  if (type !== 'membro') { if (typeof _origOpenAddModal === 'function') _origOpenAddModal(type); return; }
  showModal(`<div class="modal-hdr"><span>${lc("plus-circle", 14)}</span><h2>Novo Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Nome Completo *</label><input id="add-nome"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="add-cargo">${CARGOS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="add-idade" type="number"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="add-tel"/></div>
    <div class="form-group"><label>Email</label><input id="add-email" type="email"/></div>
    <div class="form-section-title">${lc("shield", 14)} Atuação</div>
    ${pfAtuacaoSelectHtml('add', '', '')}
    <div class="form-section-title">${lc("book-open", 14)} EBD</div>
    <div class="form-row"><div class="form-group"><label>Frequenta EBD?</label><select id="add-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-group"><label>Papel</label><select id="add-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div></div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAdd('membro')">${lc("plus-circle", 14)} Criar</button></div>`);
  pfAtualizarEspecifico('add');
  setTimeout(() => { const n = $('add-nome'); if (n) n.focus(); }, 100);
};

const _origSubmitAdd = window.submitAdd;
window.submitAdd = async function (type) {
  if (type !== 'membro') { if (typeof _origSubmitAdd === 'function') return _origSubmitAdd(type); return; }
  const nome = ($('add-nome')?.value || '').trim(); if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  if (!hasPerm('gerenciar_membros') && !canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  const { error } = await q('membros').insert({
    nome, congregacao_id: navState.cong.id, setor_id: navState.setor.id,
    cargo: $('add-cargo').value, idade: parseInt($('add-idade')?.value) || null,
    telefone: $('add-tel')?.value || null, email: $('add-email')?.value || null,
    atuacao: $('add-atuacao')?.value || null, atuacao_especifico: $('add-especifico')?.value || null,
    frequenta_ebd: $('add-ebd')?.value === 'true', papel_ebd: $('add-papel-ebd')?.value || null
  });
  if (error) { toast(error.message, 'error'); return; }
  toast('Membro adicionado!'); closeModal(); renderSetores();
};

/* ───────────────────────────────────────────────────────────
   3) MENU "MEMBROS" — lista global com permissões próprias
   ─────────────────────────────────────────────────────────── */
setTimeout(() => {
  const nav = document.querySelector('.sidebar-nav');
  if (nav && !nav.querySelector('[data-page="todos_membros"]') && canVerMembros()) {
    const div = document.createElement('div');
    div.className = 'nav-item'; div.dataset.page = 'todos_membros';
    div.innerHTML = `<span class="nav-icon"><i data-lucide="users-round"></i></span><span class="nav-lbl">Membros</span>`;
    div.addEventListener('click', () => { navigate('todos_membros'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const usersItem = nav.querySelector('[data-page="usuarios"]');
    if (usersItem) nav.insertBefore(div, usersItem.nextSibling); else nav.appendChild(div);
    if (typeof refreshLucide === 'function') refreshLucide();
  }
}, 700);

const _origNavigate2 = window.navigate;
if (typeof _origNavigate2 === 'function' && !window._navPatchedMembros2) {
  window._navPatchedMembros2 = true;
  window.navigate = function (page) {
    if (page === 'todos_membros') {
      if (currentPage) pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
      currentPage = 'todos_membros';
      document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === 'todos_membros'));
      $('page-title').textContent = 'Membros';
      renderTodosMembros();
      return;
    }
    _origNavigate2(page);
  };
}

window._membrosSetorFiltro = window._membrosSetorFiltro || '';

window.renderTodosMembros = async function () {
  const pc = $('page-content'); if (!pc) return;
  if (!canVerMembros()) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão.</p></div>`; return; }
  pc.innerHTML = loadingPage();

  const podeTodosSetores = canSeeAllSetores();
  const sidFiltro = podeTodosSetores ? (window._membrosSetorFiltro || '') : (currentUser?.setor_id || '');

  const { data: setoresAll } = podeTodosSetores ? await q('setores').select('id,nome').order('nome') : { data: [] };

  let qMems = q('membros').select('*, congregacoes(nome), setores(nome)').order('nome');
  if (sidFiltro) qMems = qMems.eq('setor_id', sidFiltro);
  else if (!podeTodosSetores && currentUser?.setor_id) qMems = qMems.eq('setor_id', currentUser.setor_id);

  const { data: mems, error } = await qMems;
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${error.message}</p></div>`; return; }

  window._allMembrosCache = mems || [];
  const canManage = canAlterarMembros();

  const filtroSetorHtml = podeTodosSetores ? `
  <div class="form-group" style="margin:0">
    <label>Setor</label>
    <select id="membros-setor-filtro" onchange="window._membrosSetorFiltro=this.value;renderTodosMembros()" style="min-width:180px">
      <option value="">Todos os setores</option>
      ${(setoresAll || []).map(s => `<option value="${s.id}" ${s.id === sidFiltro ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
    </select>
  </div>` : '';

  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Membros <span class="count-badge">${(mems || []).length}</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      ${canManage ? `<button class="btn btn-primary btn-sm" onclick="openAddMembroGlobal()">+ Novo Membro</button>` : ''}
    </div>
  </div>
  ${podeTodosSetores ? `<div class="filter-bar"><div class="filter-title">${lc('map-pin', 14)} Filtro</div><div class="filter-fields">${filtroSetorHtml}</div></div>` : ''}
  <div class="responsive-table-wrap">
    <input type="text" id="membros-global-search" placeholder="Buscar por nome..." oninput="filterTodosMembros(this.value)" style="margin-bottom:12px;max-width:320px;border-radius:5px"/>
    <div id="membros-global-list">${renderMembrosGlobalCards(window._allMembrosCache)}</div>
  </div>`;
  refreshLucide();
};

function renderMembrosGlobalCards(membros) {
  if (!membros || !membros.length) return `<div class="empty"><div class="empty-ico">${lc('users', 44)}</div><p>Nenhum membro encontrado.</p></div>`;
  const canManage = canAlterarMembros();
  return `<div style="display:flex;flex-direction:column;gap:8px">${membros.map(m => `
    <div class="user-card">
      <div class="user-card-main">
        <div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
        <div class="user-card-info">
          <div class="fw5 fs-sm">${escHtml(m.nome)}</div>
          <div class="fs-xs c3">${escHtml(m.cargo || '—')} · ${m.congregacoes ? escHtml(m.congregacoes.nome) : '—'}${m.setores ? ' · ' + escHtml(m.setores.nome) : ''}</div>
    <div class="user-card-tags">
  ${m.cargo ? `<span class="role-badge">${escHtml(m.cargo)}</span>` : ''}
  ${m.setores ? `<span class="tag tag-blue fs-xs">${escHtml(m.setores.nome)}</span>` : '<span class="tag tag-rose fs-xs">Sem setor</span>'}
  ${m.congregacoes ? `<span class="tag tag-gold fs-xs">${lc("church",14)} ${escHtml(m.congregacoes.nome)}</span>` : ''}
  ${m.atuacao ? `<span class="tag tag-violet fs-xs">${lc("shield",14)} ${escHtml(m.atuacao)}${m.atuacao_especifico ? ' · ' + escHtml(m.atuacao_especifico) : ''}</span>` : ''}
  ${m.frequenta_ebd ? `<span class="tag tag-blue fs-xs">${lc("book-open",14)} EBD</span>` : ''}
  ${m.vocacao ? `<span class="tag tag-gold fs-xs">${lc("sparkles",14)} ${escHtml(m.vocacao)}</span>` : ''}
</div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openMemberModal('${m.id}')">${lc('eye', 14)}</button>
        ${canManage ? `<button class="btn btn-secondary btn-sm" onclick="openEditMembro('${m.id}')">${lc('pencil', 14)}</button>` : ''}
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delMembro('${m.id}','${escHtml(m.nome)}')">${lc('trash-2', 14)}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

window.filterTodosMembros = function (qStr) {
  const t = (qStr || '').toLowerCase();
  const arr = (window._allMembrosCache || []).filter(m => m.nome.toLowerCase().includes(t));
  const list = document.getElementById('membros-global-list');
  if (list) list.innerHTML = renderMembrosGlobalCards(arr);
};

window.openAddMembroGlobal = async function () {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc('plus-circle', 14)}</span><h2>Novo Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="amg-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAddMembroGlobal()">${lc('save', 14)} Salvar</button></div>`);
  let qSetores = q('setores').select('id,nome').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qSetores = qSetores.eq('id', currentUser.setor_id);
  const [{ data: setores }, { data: congs }] = await Promise.all([qSetores, q('congregacoes').select('id,nome,setor_id').order('nome')]);
  window._cacheCongsGlobal = congs || [];
  $('amg-body').innerHTML = `
  <div class="form-group"><label>Nome Completo *</label><input id="amg-nome"/></div>
  <div class="form-row">
    <div class="form-group"><label>Setor *</label><select id="amg-setor" onchange="updateCongsGlobal()"><option value="">— Selecione —</option>${(setores || []).map(s => `<option value="${s.id}">${escHtml(s.nome)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Congregação *</label><select id="amg-cong"><option value="">— Selecione Setor —</option></select></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Cargo</label><select id="amg-cargo">${CARGOS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label>Idade</label><input id="amg-idade" type="number"/></div>
  </div>
  <div class="form-group"><label>Telefone</label><input id="amg-tel"/></div>
  <div class="form-group"><label>Email</label><input id="amg-email" type="email"/></div>
  <div class="form-section-title">${lc('shield', 14)} Atuação</div>
  ${pfAtuacaoSelectHtml('amg', '', '')}
  <div class="form-section-title">${lc('book-open', 14)} EBD</div>
  <div class="form-row"><div class="form-group"><label>Frequenta EBD?</label><select id="amg-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-group"><label>Papel na EBD</label><select id="amg-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div></div>`;
  pfAtualizarEspecifico('amg');
  setTimeout(() => window.updateCongsGlobal(), 50);
};

window.updateCongsGlobal = function () {
  const sid = document.getElementById('amg-setor')?.value;
  const cSel = document.getElementById('amg-cong');
  if (!cSel) return;
  if (!sid) { cSel.innerHTML = '<option value="">— Selecione Setor —</option>'; return; }
  const cgs = (window._cacheCongsGlobal || []).filter(c => c.setor_id === sid);
  cSel.innerHTML = cgs.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('') || '<option value="">Nenhuma congregação</option>';
};

window.submitAddMembroGlobal = async function () {
  const nome = (document.getElementById('amg-nome')?.value || '').trim();
  const setor_id = document.getElementById('amg-setor')?.value;
  const congregacao_id = document.getElementById('amg-cong')?.value;
  if (!nome || !setor_id || !congregacao_id) return toast('Preencha Nome, Setor e Congregação', 'error');
  const payload = {
    nome, setor_id, congregacao_id,
    cargo: document.getElementById('amg-cargo')?.value,
    idade: parseInt(document.getElementById('amg-idade')?.value) || null,
    telefone: (document.getElementById('amg-tel')?.value || '').trim() || null,
    email: (document.getElementById('amg-email')?.value || '').trim() || null,
    atuacao: document.getElementById('amg-atuacao')?.value || null,
    atuacao_especifico: document.getElementById('amg-especifico')?.value || null,
    frequenta_ebd: document.getElementById('amg-ebd')?.value === 'true',
    papel_ebd: document.getElementById('amg-papel-ebd')?.value || null
  };
  const { error } = await q('membros').insert(payload);
  if (error) return toast(error.message, 'error');
  toast('Membro adicionado!'); closeModal(); renderTodosMembros();
};

/* ───────────────────────────────────────────────────────────
   4) VISITAS DE OBREIROS — nos formulários de evento
   ─────────────────────────────────────────────────────────── */
window._pfVisitaRowSeq = 0;
window._pfVisitaEncontrados = {}; // id -> {nome, cargo, origem, atuacao}

function pfVisitasSectionHtml() {
  return `
  <div class="form-section-title">${lc('handshake', 14)} Visitas de Obreiros</div>
  <p class="fs-xs c3" style="margin-bottom:8px">Adicione um ou mais filtros (ex: Obreiro Local + Superintendência, e também UMADALPE + Liderança) e clique em Buscar. Os encontrados aparecem na lista abaixo para você marcar quem esteve presente.</p>
  <div id="pf-visita-rows"></div>
  <button type="button" class="btn btn-secondary btn-sm" style="margin:6px 0 12px" onclick="pfAddVisitaRow()">${lc('plus-circle', 14)} Adicionar filtro</button>
  <div class="member-select-list" id="pf-visita-resultados" style="max-height:180px">
    <p class="c3 fs-xs">Nenhum resultado ainda.</p>
  </div>`;
}

window.pfAddVisitaRow = function () {
  const rid = 'pfv' + (++window._pfVisitaRowSeq);
  const container = document.getElementById('pf-visita-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'filter-bar';
  row.style.marginBottom = '10px';
  row.id = `row-${rid}`;
  row.innerHTML = `
    <div class="filter-fields">
      <div class="form-group" style="margin:0"><label>Origem</label>
        <select id="${rid}-origem"><option value="local">Obreiro Local</option><option value="umadalpe">UMADALPE</option></select>
      </div>
      <div class="form-group" style="margin:0"><label>Atuação</label>
        <select id="${rid}-atuacao" onchange="pfAtualizarEspecifico('${rid}')">
          <option value="">Todas</option>
          ${ATUACAO_OPCOES.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0"><label>Específico</label><select id="${rid}-especifico"><option value="">Todos</option></select></div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <button type="button" class="btn btn-primary btn-sm" onclick="pfBuscarVisita('${rid}')">${lc('search', 14)} Buscar</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('row-${rid}').remove()">${lc('trash-2', 14)}</button>
      </div>
    </div>`;
  container.appendChild(row);
}

window.pfBuscarVisita = async function (rid) {
  const origem = document.getElementById(`${rid}-origem`)?.value;
  const atuacao = document.getElementById(`${rid}-atuacao`)?.value;
  const especifico = document.getElementById(`${rid}-especifico`)?.value;

  let qMem = q('membros').select('id,nome,cargo,congregacao_id,setor_id,atuacao,atuacao_especifico').neq('cargo', 'Membro');
  if (atuacao) qMem = qMem.eq('atuacao', atuacao);
  if (especifico) qMem = qMem.eq('atuacao_especifico', especifico);

  const congId = typeof navState !== 'undefined' ? navState.cong?.id : null;
  const setorId = (typeof navState !== 'undefined' && navState.setor?.id) ? navState.setor.id : currentUser?.setor_id;

  if (origem === 'local') {
    if (congId) qMem = qMem.eq('congregacao_id', congId);
    else if (setorId) qMem = qMem.eq('setor_id', setorId);
  } else {
    // UMADALPE: obreiros de outras congregações, mesmo setor (a menos que o usuário veja todos os setores)
    if (congId) qMem = qMem.neq('congregacao_id', congId);
    if (!canSeeAllSetores() && setorId) qMem = qMem.eq('setor_id', setorId);
  }

  const { data, error } = await qMem.order('nome').limit(200);
  if (error) { toast(error.message, 'error'); return; }

  (data || []).forEach(m => {
    window._pfVisitaEncontrados[m.id] = { nome: m.nome, cargo: m.cargo, origem: origem === 'local' ? 'Local' : 'UMADALPE', atuacao: m.atuacao, especifico: m.atuacao_especifico };
  });
  pfRenderVisitaResultados();
};

function pfRenderVisitaResultados() {
  const box = document.getElementById('pf-visita-resultados');
  if (!box) return;
  const entries = Object.entries(window._pfVisitaEncontrados);
  if (!entries.length) { box.innerHTML = '<p class="c3 fs-xs">Nenhum resultado ainda.</p>'; return; }
  box.innerHTML = entries.map(([id, m]) => `
    <label class="check-row">
      <input type="checkbox" class="pf-visita-check" value="${id}" checked/>
      <div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
      <span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo || '')} · <span class="tag tag-violet fs-xs">${escHtml(m.origem)}</span>${m.atuacao ? ' · ' + escHtml(m.atuacao) : ''}${m.especifico ? ' (' + escHtml(m.especifico) + ')' : ''}</em></span>
    </label>`).join('');
}

function pfColetarVisitantesSelecionados() {
  return [...document.querySelectorAll('.pf-visita-check:checked')].map(c => c.value);
}

function pfResetVisitas() {
  window._pfVisitaEncontrados = {};
}

/* Injeta a seção de Visitas no modal de evento de congregação */
const _origOpenEventModal2 = window.openEventModal;
window.openEventModal = async function (tipo) {
  pfResetVisitas();
  if (typeof _origOpenEventModal2 === 'function') await _origOpenEventModal2(tipo);
  const body = document.querySelector('.modal .modal-body');
  if (body) {
    const div = document.createElement('div');
    div.innerHTML = pfVisitasSectionHtml();
    body.appendChild(div);
  }
};

/* Injeta a seção de Visitas no modal de evento setorial */
const _origOpenEventoSetorialModal2 = window.openEventoSetorialModal;
window.openEventoSetorialModal = async function () {
  pfResetVisitas();
  if (typeof _origOpenEventoSetorialModal2 === 'function') await _origOpenEventoSetorialModal2();
  const body = document.querySelector('.modal .modal-body');
  if (body) {
    const div = document.createElement('div');
    div.innerHTML = pfVisitasSectionHtml();
    body.appendChild(div);
  }
};

/* Garante que os visitantes marcados entrem em participante_ids ao registrar */
const _origSubmitEvento2 = window.submitEvento;
window.submitEvento = async function (tipo) {
  const visitantes = pfColetarVisitantesSelecionados();
  if (!visitantes.length) { if (typeof _origSubmitEvento2 === 'function') return _origSubmitEvento2(tipo); return; }
  // injeta checkboxes "fantasma" para o submitEvento original computar o total certo
  const hidden = document.createElement('div'); hidden.style.display = 'none';
  visitantes.forEach(id => { hidden.innerHTML += `<input type="checkbox" class="ev-ext-check" value="${id}" checked>`; });
  document.querySelector('.modal .modal-body')?.appendChild(hidden);
  if (typeof _origSubmitEvento2 === 'function') return _origSubmitEvento2(tipo);
};

const _origSubmitEventoSetorial2 = window.submitEventoSetorial;
window.submitEventoSetorial = async function () {
  const visitantes = pfColetarVisitantesSelecionados();
  if (visitantes.length) {
    const hidden = document.createElement('div'); hidden.style.display = 'none';
    visitantes.forEach(id => { hidden.innerHTML += `<input type="checkbox" class="es-user-check" value="${id}" checked>`; });
    document.querySelector('.modal .modal-body')?.appendChild(hidden);
  }
  if (typeof _origSubmitEventoSetorial2 === 'function') return _origSubmitEventoSetorial2();
};

console.log('[patch_atuacao_visitas] carregado ✓');

const wrapper = document.getElementById("eventos-wrapper");
const lista = document.getElementById("dash-eventos-setoriais");
const btn = document.getElementById("btn-expand-eventos");

btn.addEventListener("click",()=>{

    const aberto = lista.classList.toggle("expanded");

    wrapper.classList.toggle("expanded");

    btn.classList.toggle("open");

    btn.innerHTML = aberto
        ? `${lc("chevrons-up",16)} Recolher lista`
        : `${lc("chevrons-down",16)} Ver todos os eventos`;

    refreshLucide();

});

/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_umadalpe_eventos.js
   Carregar por ÚLTIMO no HTML, depois de patch_atuacao_visitas.js:
     <script src="patch_umadalpe_eventos.js"></script>

   O QUE ESTE ARQUIVO FAZ:
   1. Reorganiza o menu "+ Evento" da tela de congregação:
      - Remove das OPÇÕES NOVAS: Culto, Desviados que Voltaram,
        Pessoas Evangelizadas, Presentes na Oração, Ofertas
        (eventos ANTIGOS desses tipos continuam existindo e
        aparecendo normalmente em todo o sistema — só não dá mais
        pra criar um novo evento desses tipos).
      - Garante que existam: Evangelismo, Saída de Campo, Ponto de
        Pregação, Culto ao Ar Livre, Visita aos Enfermos, Visita
        aos Desviados/Detidos, Visita aos Novos Convertidos, Visita
        a outra UMADALPE, Convocação da Superintendência, Oração.
   2. Adiciona os campos comuns a TODO evento (visitas recebidas da
      UMADALPE, visita da coordenação, visita da superintendência,
      visita do obreiro da congregação, visitas do ministério,
      desviados que voltaram, almas salvas, batismo no Espírito,
      renovo, ofertas) e os campos exclusivos de evento
      evangelístico (pessoas evangelizadas, literaturas
      distribuídas, presentes no evangelismo) — e oculta "Bênçãos
      Agradecidas" nesses últimos.
   3. Mantém intacta a seção "Visitas de Obreiros" (do arquivo
      patch_atuacao_visitas.js).
   4. Adiciona ao Relatório uma seção "Totalizadores UMADALPE" 100%
      automática, calculada a partir dos eventos do período — nada
      é digitado manualmente.
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────
   1) TIPOS DE EVENTO — quais aparecem no menu "+ Evento"
   ─────────────────────────────────────────────────────────── */

// tipos que NÃO devem mais aparecer como opção de criação
// (registros antigos desses tipos continuam funcionando normalmente)
const UMADALPE_TIPOS_OCULTOS = ['culto', 'desviados_voltaram', 'pessoas_evangelizadas', 'presentes_oracao', 'ofertas_umadalpe'];

// tipos evangelísticos (ganham os 3 campos exclusivos e perdem "Bênçãos Agradecidas")
const UMADALPE_TIPOS_EVANGELISTICOS = ['evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao'];

if (typeof TIPOS_EVENTO !== 'undefined') {
  // Garante que os tipos pedidos existam (não sobrescreve se já existirem outras props)
  TIPOS_EVENTO['evangelismo'] = TIPOS_EVENTO['evangelismo'] || { label: 'Evangelismo', grupo: 'Evangelismo', icon: 'megaphone', financeiro: false, evangelismo: true };
  if (TIPOS_EVENTO['saida']) TIPOS_EVENTO['saida'].label = 'Saída de Campo';
  TIPOS_EVENTO['culto_ar_livre'] = TIPOS_EVENTO['culto_ar_livre'] || { label: 'Culto ao Ar Livre', grupo: 'Evangelismo', icon: 'sun', financeiro: false, evangelismo: true };
  TIPOS_EVENTO['ponto_pregacao'] = TIPOS_EVENTO['ponto_pregacao'] || { label: 'Ponto de Pregação', grupo: 'Evangelismo', icon: 'megaphone', financeiro: false, evangelismo: true };
  TIPOS_EVENTO['visita_enfermos'] = TIPOS_EVENTO['visita_enfermos'] || { label: 'Visita aos Enfermos', grupo: 'Visitas', icon: 'heart-pulse' };
  TIPOS_EVENTO['visita_desviados'] = TIPOS_EVENTO['visita_desviados'] || { label: 'Visita aos Desviados/Detidos', grupo: 'Visitas', icon: 'search' };
  TIPOS_EVENTO['visita_detidos'] = TIPOS_EVENTO['visita_detidos'] || { label: 'Visita aos Desviados/Detidos', grupo: 'Visitas', icon: 'lock' };
  TIPOS_EVENTO['visita_convertidos'] = TIPOS_EVENTO['visita_convertidos'] || { label: 'Visita aos Novos Convertidos', grupo: 'Visitas', icon: 'cross' };
  TIPOS_EVENTO['visita_umadalpe'] = TIPOS_EVENTO['visita_umadalpe'] || { label: 'Visita a outra UMADALPE', grupo: 'Visitas', icon: 'handshake' };
  TIPOS_EVENTO['convocacao_superintendencia'] = { label: 'Convocação da Superintendência', grupo: 'Eventos', icon: 'megaphone' };
  TIPOS_EVENTO['oracao'] = { label: 'Oração', grupo: 'Eventos', icon: 'hand' };
}

/* Reescreve o menu suspenso "+ Evento" da tela de congregação */
window.buildEventMenuHtml = function () {
  const ordem = ['evangelismo', 'saida', 'ponto_pregacao', 'culto_ar_livre', 'oracao', 'convocacao_superintendencia', 'ebd', 'evento', 'visita_enfermos', 'visita_desviados', 'visita_detidos', 'visita_convertidos', 'visita_umadalpe'];
  const grupos = {};
  ordem.forEach(tipo => {
    if (UMADALPE_TIPOS_OCULTOS.includes(tipo)) return;
    const info = TIPOS_EVENTO[tipo];
    if (!info) return;
    if (!grupos[info.grupo]) grupos[info.grupo] = [];
    grupos[info.grupo].push({ tipo, ...info });
  });
  return Object.entries(grupos).map(([grupo, itens]) => `<div class="dropdown-label">${grupo}</div>${itens.map(({ tipo, label, icon }) => `<div class="dropdown-item" onclick="openEventModal('${tipo}')">${lc(icon, 14)} ${label}</div>`).join('')}`).join('');
};

/* ───────────────────────────────────────────────────────────
   2) CAMPOS COMUNS + CAMPOS EVANGELÍSTICOS
   ─────────────────────────────────────────────────────────── */
function pfCamposComunsHtml() {
  return `
  <div class="form-section-title">${lc('handshake', 14)} Visitas Recebidas</div>
  <div class="form-row">
    <div class="form-group"><label>Visitas Recebidas da UMADALPE</label><input id="ev-visitas-umadalpe" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Visita da Coordenação do Setor</label><input id="ev-visita-coord" type="number" min="0" placeholder="0"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Visita da Superintendência</label><input id="ev-visita-superint" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Visita do Obreiro da Congregação</label><input id="ev-visita-obreiro" type="number" min="0" placeholder="0"/></div>
  </div>
  <div class="form-group"><label>Visitas do Ministério</label><input id="ev-visitas-ministerio" type="number" min="0" placeholder="0"/></div>

  <div class="form-section-title">${lc('book-open', 14)} Resultados Espirituais</div>
  <div class="form-row">
    <div class="form-group"><label>Desviados que Voltaram</label><input id="ev-desviados-comum" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Almas Salvas</label><input id="ev-almas-comum" type="number" min="0" placeholder="0"/></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Batismo no Espírito Santo</label><input id="ev-batismo-comum" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Renovo</label><input id="ev-renovo-comum" type="number" min="0" placeholder="0"/></div>
  </div>`;
}

function pfCampoBencaosHtml() {
  return `<div class="form-group"><label>Bênçãos Agradecidas</label><input id="ev-bencaos-comum" type="number" min="0" placeholder="0"/></div>`;
}

function pfCamposEvangelisticosHtml() {
  return `
  <div class="form-section-title">${lc('sun', 14)} Evangelismo</div>
  <div class="form-row">
    <div class="form-group"><label>Pessoas Evangelizadas</label><input id="ev-evangelizados-comum" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Literaturas Distribuídas</label><input id="ev-literaturas-comum" type="number" min="0" placeholder="0"/></div>
  </div>
  <div class="form-group"><label>Presentes no Evangelismo</label><input id="ev-presentes-evang" type="number" min="0" placeholder="0"/></div>`;
}

function pfCampoOfertasHtml() {
  if (!canSeeFinanceiro()) return '';
  return `<div class="form-group"><label>Ofertas (R$)</label><input id="ev-ofertas-comum" type="number" step="0.01" min="0" placeholder="0"/></div>`;
}

/* ───────────────────────────────────────────────────────────
   3) MODAL DE EVENTO — reescrito com os campos dinâmicos
   ─────────────────────────────────────────────────────────── */
window.openEventModal = async function (tipo) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  $('event-menu')?.classList.add('hidden');
  if (typeof pfResetVisitas === 'function') pfResetVisitas();

  const info = TIPOS_EVENTO[tipo] || { label: tipo, icon: 'clipboard-list' };
  const ehEvangelistico = UMADALPE_TIPOS_EVANGELISTICOS.includes(tipo);
  const ehEBD = tipo === 'ebd';

  const { data: mems } = await q('membros').select('id,nome,cargo,frequenta_ebd,papel_ebd').eq('congregacao_id', navState.cong.id).order('nome');
  let qExt = q('membros').select('id,nome,cargo,congregacao_id').order('nome').neq('congregacao_id', navState.cong.id);
  if (!canSeeAllSetores() && currentUser?.setor_id) qExt = qExt.eq('setor_id', currentUser.setor_id);
  const { data: allMems } = await qExt;

  let camposEspecificos = '';
  if (ehEBD) {
    camposEspecificos = `
    <div class="form-group"><label>Tema da Lição *</label><input id="ev-tema-licao" placeholder="Ex: A fé de Abraão"/></div>
    <div class="form-group"><label>Referência Bíblica</label><input id="ev-referencia" placeholder="Ex: Gênesis 12"/></div>`;
  }

  const memsParaLista = ehEBD ? (mems || []).filter(m => m.frequenta_ebd) : (mems || []);

  showModal(`<div class="modal-hdr"><span>${lc(info.icon, 20)}</span><h2>Registrar: ${info.label}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="ev-data" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-row">
      <div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time"/></div>
      <div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time"/></div>
    </div>
    <div class="form-group"><label>Resumo / Obs.</label><textarea id="ev-resumo" rows="2" style="resize:vertical"></textarea></div>
    ${camposEspecificos}
    ${pfCamposComunsHtml()}
    ${ehEvangelistico ? pfCamposEvangelisticosHtml() : pfCampoBencaosHtml()}
    ${pfCampoOfertasHtml()}
    <div class="form-group"><label>${ehEBD ? 'Alunos/Professores (EBD)' : 'Participantes da Congregação'}</label>
    <p class="fs-xs c3" style="margin-bottom:6px">Marque os presentes — o total será calculado automaticamente.</p>
    <div class="member-select-list" id="ev-mems-local">${memsParaLista.map(m => `<label class="check-row"><input type="checkbox" class="ev-mem-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}${m.papel_ebd ? ' · ' + m.papel_ebd : ''}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum membro cadastrado.</p>'}</div></div>
    ${!ehEBD ? `<div class="form-group"><label>Externos (mesmo setor)</label><input id="ev-ext-search" placeholder="Buscar..." oninput="filterExtMembers(this.value)" style="margin-bottom:8px"/><div class="member-select-list" id="ev-mems-ext" style="max-height:140px">${(allMems || []).map(m => `<label class="check-row ev-ext-row"><input type="checkbox" class="ev-ext-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}</em></span></label>`).join('') || '<p class="c3 fs-xs">Sem externos.</p>'}</div></div>` : ''}
    ${typeof pfVisitasSectionHtml === 'function' ? pfVisitasSectionHtml() : ''}
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEvento('${tipo}')">${lc("plus-circle", 14)} Registrar</button></div>`);

  const camposParaTravarSeFuturo = '#ev-visitas-umadalpe,#ev-visita-coord,#ev-visita-superint,#ev-visita-obreiro,#ev-visitas-ministerio,#ev-desviados-comum,#ev-almas-comum,#ev-batismo-comum,#ev-renovo-comum,#ev-bencaos-comum,#ev-evangelizados-comum,#ev-literaturas-comum,#ev-presentes-evang,#ev-ofertas-comum';
  setTimeout(() => { if (typeof pfAplicarFuturo === 'function') pfAplicarFuturo('ev-data', camposParaTravarSeFuturo); }, 100);
};

/* ───────────────────────────────────────────────────────────
   4) SUBMIT — salva os campos novos + mantém visitas de obreiros
   ─────────────────────────────────────────────────────────── */
window.submitEvento = async function (tipo) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  const data = $('ev-data')?.value; if (!data) { toast('Data é obrigatória', 'error'); return; }

  const localChecked = [...document.querySelectorAll('.ev-mem-check:checked')].map(c => c.value);
  const extChecked = [...document.querySelectorAll('.ev-ext-check:checked')].map(c => c.value);
  const visitantesObreiros = typeof pfColetarVisitantesSelecionados === 'function' ? pfColetarVisitantesSelecionados() : [];
  const participanteIds = [...new Set([...localChecked, ...extChecked, ...visitantesObreiros])];

  const num = id => parseInt($(id)?.value) || 0;
  const money = id => canSeeFinanceiro() ? (parseFloat($(id)?.value) || 0) : 0;

  const payload = {
    congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data,
    resumo: ($('ev-resumo')?.value || '').trim(),
    participantes: participanteIds.length || 0,
    hora_inicio: $('ev-inicio')?.value || null, hora_fim: $('ev-fim')?.value || null,
    participante_ids: participanteIds,

    // campos comuns a todo evento
    visitas_recebidas_umadalpe: num('ev-visitas-umadalpe'),
    visita_coordenacao_setor: num('ev-visita-coord'),
    visita_superintendencia: num('ev-visita-superint'),
    visita_obreiro_congregacao: num('ev-visita-obreiro'),
    visitas_ministerio: num('ev-visitas-ministerio'),
    desviados_voltaram_campo: num('ev-desviados-comum'),
    almas_salvas: num('ev-almas-comum'),
    batismo_espirito: num('ev-batismo-comum'),
    renovo: num('ev-renovo-comum'),
    ofertas: money('ev-ofertas-comum'),

    // campos evangelísticos OU bênçãos (mutuamente exclusivos)
    evangelizados: num('ev-evangelizados-comum'),
    literaturas_distribuidas: num('ev-literaturas-comum'),
    presentes_evangelismo: num('ev-presentes-evang'),
    bencaos_alcancadas: num('ev-bencaos-comum'),

    // EBD
    tema_licao: ($('ev-tema-licao')?.value || '').trim() || null,
    referencia_biblica: ($('ev-referencia')?.value || '').trim() || null,

    status: 'pendente',
  };
  const { error } = await q('eventos').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal(); renderSetores();
};

/* ───────────────────────────────────────────────────────────
   5) RELATÓRIO — totalizadores 100% automáticos
   ─────────────────────────────────────────────────────────── */
const _origRenderRelatorios = window.renderRelatorios;
window.renderRelatorios = async function () {
  if (typeof _origRenderRelatorios === 'function') await _origRenderRelatorios();
  const pc = $('page-content');
  if (!pc || !hasPerm('ver_relatorios')) return;

  const sid = relSetorFiltro || currentUser?.setor_id || null;
  const cid = relCongFiltro || null;
  let qEv = q('eventos').select('tipo,data,participantes,visitas_recebidas_umadalpe,visita_coordenacao_setor,visita_superintendencia,visita_obreiro_congregacao,visitas_ministerio,desviados_voltaram_campo,almas_salvas,batismo_espirito,renovo,ofertas,evangelizados,literaturas_distribuidas,presentes_evangelismo,bencaos_alcancadas')
    .gte('data', relFiltroInicio).lte('data', relFiltroFim);
  if (sid) qEv = qEv.eq('setor_id', sid);
  if (cid) qEv = qEv.eq('congregacao_id', cid);
  const { data: evs } = await qEv;
  const eventos = evs || [];

  const somar = campo => eventos.reduce((s, e) => s + (e[campo] || 0), 0);
  const tiposEvangelisticos = ['evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao'];
  const presentesEvangelismo = eventos.filter(e => tiposEvangelisticos.includes(e.tipo)).reduce((s, e) => s + (e.participantes || 0), 0);
  const presentesOracao = eventos.filter(e => e.tipo === 'oracao').reduce((s, e) => s + (e.participantes || 0), 0);
  const convocacoesAtendidas = eventos.filter(e => e.tipo === 'convocacao_superintendencia').length;

  const card = (icon, val, label) => `<div class="stat-card"><div class="stat-ico ic-violet">${icon}</div><div><div class="stat-val">${val}</div><div class="stat-lbl">${label}</div></div></div>`;

  const bloco = document.createElement('div');
  bloco.innerHTML = `
  <div class="sec-hdr" style="margin-top:8px"><h2>${lc('shield', 18)} Totalizadores UMADALPE</h2><span class="tag tag-primary">100% automático — calculado dos eventos</span></div>
  <div class="stats-grid stats-4" style="margin-bottom:12px">
    ${card(lc('cross', 20), somar('almas_salvas'), 'Almas Salvas')}
    ${card(lc('heart-handshake', 20), somar('desviados_voltaram_campo'), 'Desviados que Voltaram')}
    ${card(lc('sparkles', 20), somar('batismo_espirito'), 'Batismo no Espírito')}
    ${card(lc('sparkles', 20), somar('renovo'), 'Renovo')}
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:12px">
    ${canSeeFinanceiro() ? card(lc('coins', 20), fmtMoney(somar('ofertas')), 'Ofertas') : ''}
    ${card(lc('user', 20), somar('evangelizados'), 'Pessoas Evangelizadas')}
    ${card(lc('book-open', 20), somar('literaturas_distribuidas'), 'Literaturas Distribuídas')}
    ${card(lc('sun', 20), presentesEvangelismo, 'Presentes no Evangelismo')}
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:12px">
    ${card(lc('handshake', 20), somar('visitas_recebidas_umadalpe'), 'Visitas Recebidas UMADALPE')}
    ${card(lc('briefcase', 20), somar('visita_coordenacao_setor'), 'Visita da Coordenação')}
    ${card(lc('shield-check', 20), somar('visita_superintendencia'), 'Visita da Superintendência')}
    ${card(lc('church', 20), somar('visita_obreiro_congregacao'), 'Visita do Obreiro')}
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:24px">
    ${card(lc('users', 20), somar('visitas_ministerio'), 'Visitas do Ministério')}
    ${card(lc('gift', 20), somar('bencaos_alcancadas'), 'Bênçãos Agradecidas')}
    ${card(lc('check-circle', 20), convocacoesAtendidas, 'Convocações Atendidas')}
    ${card(lc('hand', 20), presentesOracao, 'Presentes na Oração')}
  </div>`;

  const secEventos = pc.querySelector('.sec-hdr');
  if (secEventos && secEventos.parentElement === pc) {
    pc.insertBefore(bloco, secEventos.nextSibling.nextSibling || null);
  } else {
    pc.appendChild(bloco);
  }
  refreshLucide();
};

console.log('[patch_umadalpe_eventos] carregado ✓');







