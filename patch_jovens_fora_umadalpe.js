if (typeof PERM_DESC !== 'undefined') {
  PERM_DESC['visualizar_jovens_fora_umadalpe'] = { label: 'Visualizar Jovens (Fora UMADALPE)', desc: 'Ver a lista de jovens que ainda não estão matriculados na UMADALPE. A permissão "Ver Todos os Setores" libera também um filtro de setor nesta tela.' };
  PERM_DESC['gerenciar_jovens_fora_umadalpe'] = { label: 'Gerenciar Jovens (Fora UMADALPE)', desc: 'Adicionar, editar e excluir jovens fora da UMADALPE.' };
}

const canVerJovensFU = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && (hasPerm('visualizar_jovens_fora_umadalpe') || hasPerm('gerenciar_jovens_fora_umadalpe')));
const canGerJovensFU = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && hasPerm('gerenciar_jovens_fora_umadalpe'));

/* Menu lateral */
setTimeout(() => {
  const nav = document.querySelector('.sidebar-nav');
  if (nav && !nav.querySelector('[data-page="jovens_fora_umadalpe"]') && canVerJovensFU()) {
    const div = document.createElement('div');
    div.className = 'nav-item'; div.dataset.page = 'jovens_fora_umadalpe';
    div.innerHTML = `<span class="nav-icon"><i data-lucide="user-round-search"></i></span><span class="nav-lbl">Jovens (Fora UMADALPE)</span>`;
    div.addEventListener('click', () => { navigate('jovens_fora_umadalpe'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const membrosItem = nav.querySelector('[data-page="todos_membros"]');
    if (membrosItem) nav.insertBefore(div, membrosItem.nextSibling); else nav.appendChild(div);
    if (typeof refreshLucide === 'function') refreshLucide();
  }
}, 750);

const _origNavigate3 = window.navigate;
if (typeof _origNavigate3 === 'function' && !window._navPatchedJovensFU) {
  window._navPatchedJovensFU = true;
  window.navigate = function (page) {
    if (page === 'jovens_fora_umadalpe') {
      if (currentPage) pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
      currentPage = 'jovens_fora_umadalpe';
      document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === 'jovens_fora_umadalpe'));
      $('page-title').textContent = 'Jovens (Fora UMADALPE)';
      renderJovensForaUmadalpe();
      return;
    }
    _origNavigate3(page);
  };
}

window._jfuSetorFiltro = window._jfuSetorFiltro || '';

window.renderJovensForaUmadalpe = async function () {
  const pc = $('page-content'); if (!pc) return;
  if (!canVerJovensFU()) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão.</p></div>`; return; }
  pc.innerHTML = loadingPage();

  const podeTodosSetores = canSeeAllSetores();
  const sidFiltro = podeTodosSetores ? (window._jfuSetorFiltro || '') : (currentUser?.setor_id || '');
  const { data: setoresAll } = podeTodosSetores ? await q('setores').select('id,nome').order('nome') : { data: [] };

  let qJ = q('jovens_fora_umadalpe').select('*, congregacoes(nome), setores(nome)').order('nome');
  if (sidFiltro) qJ = qJ.eq('setor_id', sidFiltro);
  else if (!podeTodosSetores && currentUser?.setor_id) qJ = qJ.eq('setor_id', currentUser.setor_id);

  const { data: jovens, error } = await qJ;
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${error.message}</p></div>`; return; }

  window._jfuCache = jovens || [];
  const canManage = canGerJovensFU();

  const filtroSetorHtml = podeTodosSetores ? `
  <div class="form-group" style="margin:0">
    <label>Setor</label>
    <select id="jfu-setor-filtro" onchange="window._jfuSetorFiltro=this.value;renderJovensForaUmadalpe()" style="min-width:180px">
      <option value="">Todos os setores</option>
      ${(setoresAll || []).map(s => `<option value="${s.id}" ${s.id === sidFiltro ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
    </select>
  </div>` : '';

  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Jovens (Fora UMADALPE) <span class="count-badge">${(jovens || []).length}</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      ${canManage ? `<button class="btn btn-primary btn-sm" onclick="openAddJovemFU()">+ Novo Jovem</button>` : ''}
    </div>
  </div>
  ${podeTodosSetores ? `<div class="filter-bar"><div class="filter-title">${lc('map-pin', 14)} Filtro</div><div class="filter-fields">${filtroSetorHtml}</div></div>` : ''}
  <input type="text" id="jfu-search" placeholder="Buscar por nome..." oninput="filterJovensFU(this.value)" style="margin-bottom:12px;max-width:320px"/>
  <div id="jfu-list">${renderJovensFUCards(window._jfuCache)}</div>`;
  refreshLucide();
};

function renderJovensFUCards(jovens) {
  if (!jovens || !jovens.length) return `<div class="empty"><div class="empty-ico">${lc('user-round-search', 44)}</div><p>Nenhum jovem cadastrado.</p></div>`;
  const canManage = canGerJovensFU();
  return `<div style="display:flex;flex-direction:column;gap:8px">${jovens.map(j => `
    <div class="user-card">
      <div class="user-card-main">
        <div class="av av-sm" style="background:${avatarColor(j.nome)}">${initials(j.nome)}</div>
        <div class="user-card-info">
          <div class="fw5 fs-sm">${escHtml(j.nome)}</div>
          <div class="fs-xs c3">${j.sexo ? escHtml(j.sexo) + ' · ' : ''}${j.congregacoes ? escHtml(j.congregacoes.nome) : '—'}${j.setores ? ' · ' + escHtml(j.setores.nome) : ''}</div>
          ${j.responsavel ? `<div class="fs-xs c3">${lc('user', 11)} Responsável: ${escHtml(j.responsavel)}</div>` : ''}
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openViewJovemFU('${j.id}')">${lc('eye', 14)}</button>
        ${canManage ? `<button class="btn btn-secondary btn-sm" onclick="openEditJovemFU('${j.id}')">${lc('pencil', 14)}</button>` : ''}
        ${canManage ? `<button class="btn btn-danger btn-sm" onclick="delJovemFU('${j.id}','${escHtml(j.nome)}')">${lc('trash-2', 14)}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

window.filterJovensFU = function (qStr) {
  const t = (qStr || '').toLowerCase();
  const arr = (window._jfuCache || []).filter(j => j.nome.toLowerCase().includes(t));
  const list = document.getElementById('jfu-list');
  if (list) list.innerHTML = renderJovensFUCards(arr);
};

function jfuFormFields(j) {
  j = j || {};
  return `
  <div class="form-group"><label>Nome Completo *</label><input id="jfu-nome" value="${escHtml(j.nome || '')}"/></div>
  <div class="form-row">
    <div class="form-group"><label>Sexo</label><select id="jfu-sexo"><option value="">—</option><option value="Masculino" ${j.sexo === 'Masculino' ? 'selected' : ''}>Masculino</option><option value="Feminino" ${j.sexo === 'Feminino' ? 'selected' : ''}>Feminino</option></select></div>
    <div class="form-group"><label>Data de Nascimento</label><input id="jfu-nasc" type="date" value="${j.data_nascimento || ''}"/></div>
  </div>
  <div class="form-group"><label>Telefone</label><input id="jfu-tel" value="${escHtml(j.telefone || '')}"/></div>
  <div class="form-group"><label>Responsável</label><input id="jfu-resp" value="${escHtml(j.responsavel || '')}" placeholder="Nome do responsável (se menor de idade)"/></div>
  <div class="form-group"><label>Endereço</label><input id="jfu-end" value="${escHtml(j.endereco || '')}"/></div>
  <div class="form-row">
    <div class="form-group"><label>Bairro</label><input id="jfu-bairro" value="${escHtml(j.bairro || '')}"/></div>
    <div class="form-group"><label>Cidade</label><input id="jfu-cidade" value="${escHtml(j.cidade || '')}"/></div>
  </div>
  <div class="form-group"><label>Estado</label><input id="jfu-estado" value="${escHtml(j.estado || '')}" maxlength="2" placeholder="PE"/></div>
  <div class="form-group"><label>Observações</label><textarea id="jfu-obs" rows="2">${escHtml(j.observacoes || '')}</textarea></div>`;
}

window.openAddJovemFU = async function () {
  if (!canGerJovensFU()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc('plus-circle', 14)}</span><h2>Novo Jovem (Fora UMADALPE)</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="jfu-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAddJovemFU()">${lc('save', 14)} Salvar</button></div>`);
  let qSetores = q('setores').select('id,nome').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qSetores = qSetores.eq('id', currentUser.setor_id);
  const [{ data: setores }, { data: congs }] = await Promise.all([qSetores, q('congregacoes').select('id,nome,setor_id').order('nome')]);
  window._cacheCongsJFU = congs || [];
  $('jfu-body').innerHTML = `
  ${jfuFormFields()}
  <div class="form-row">
    <div class="form-group"><label>Setor</label><select id="jfu-setor" onchange="updateCongsJFU()"><option value="">— Selecione —</option>${(setores || []).map(s => `<option value="${s.id}">${escHtml(s.nome)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Congregação (referência)</label><select id="jfu-cong"><option value="">— Selecione Setor —</option></select></div>
  </div>`;
  setTimeout(() => window.updateCongsJFU(), 50);
};

window.updateCongsJFU = function () {
  const sid = document.getElementById('jfu-setor')?.value;
  const cSel = document.getElementById('jfu-cong');
  if (!cSel) return;
  if (!sid) { cSel.innerHTML = '<option value="">— Selecione Setor —</option>'; return; }
  const cgs = (window._cacheCongsJFU || []).filter(c => c.setor_id === sid);
  cSel.innerHTML = '<option value="">— Nenhuma —</option>' + cgs.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
};

window.submitAddJovemFU = async function () {
  const nome = (document.getElementById('jfu-nome')?.value || '').trim();
  if (!nome) return toast('Nome é obrigatório', 'error');
  const payload = {
    nome,
    sexo: document.getElementById('jfu-sexo')?.value || null,
    data_nascimento: document.getElementById('jfu-nasc')?.value || null,
    telefone: (document.getElementById('jfu-tel')?.value || '').trim() || null,
    responsavel: (document.getElementById('jfu-resp')?.value || '').trim() || null,
    endereco: (document.getElementById('jfu-end')?.value || '').trim() || null,
    bairro: (document.getElementById('jfu-bairro')?.value || '').trim() || null,
    cidade: (document.getElementById('jfu-cidade')?.value || '').trim() || null,
    estado: (document.getElementById('jfu-estado')?.value || '').trim() || null,
    observacoes: (document.getElementById('jfu-obs')?.value || '').trim() || null,
    setor_id: document.getElementById('jfu-setor')?.value || null,
    congregacao_id: document.getElementById('jfu-cong')?.value || null,
  };
  const { error } = await q('jovens_fora_umadalpe').insert(payload);
  if (error) return toast(error.message, 'error');
  toast('Jovem cadastrado!'); closeModal(); renderJovensForaUmadalpe();
};

window.openEditJovemFU = async function (id) {
  if (!canGerJovensFU()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc('pencil', 14)}</span><h2>Editar Jovem</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="jfu-edit-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEditJovemFU('${id}')">${lc('save', 14)} Salvar</button></div>`);
  const [{ data: j }, { data: setores }, { data: congs }] = await Promise.all([
    q('jovens_fora_umadalpe').select('*').eq('id', id).single(),
    q('setores').select('id,nome').order('nome'),
    q('congregacoes').select('id,nome,setor_id').order('nome'),
  ]);
  if (!j) return;
  window._cacheCongsJFU = congs || [];
  $('jfu-edit-body').innerHTML = `
  ${jfuFormFields(j)}
  <div class="form-row">
    <div class="form-group"><label>Setor</label><select id="jfu-setor" onchange="updateCongsJFU()">${(setores || []).map(s => `<option value="${s.id}" ${s.id === j.setor_id ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Congregação (referência)</label><select id="jfu-cong"></select></div>
  </div>`;
  setTimeout(() => { window.updateCongsJFU(); const sel = document.getElementById('jfu-cong'); if (sel && j.congregacao_id) sel.value = j.congregacao_id; }, 50);
};

window.submitEditJovemFU = async function (id) {
  const nome = (document.getElementById('jfu-nome')?.value || '').trim();
  if (!nome) return toast('Nome é obrigatório', 'error');
  const payload = {
    nome,
    sexo: document.getElementById('jfu-sexo')?.value || null,
    data_nascimento: document.getElementById('jfu-nasc')?.value || null,
    telefone: (document.getElementById('jfu-tel')?.value || '').trim() || null,
    responsavel: (document.getElementById('jfu-resp')?.value || '').trim() || null,
    endereco: (document.getElementById('jfu-end')?.value || '').trim() || null,
    bairro: (document.getElementById('jfu-bairro')?.value || '').trim() || null,
    cidade: (document.getElementById('jfu-cidade')?.value || '').trim() || null,
    estado: (document.getElementById('jfu-estado')?.value || '').trim() || null,
    observacoes: (document.getElementById('jfu-obs')?.value || '').trim() || null,
    setor_id: document.getElementById('jfu-setor')?.value || null,
    congregacao_id: document.getElementById('jfu-cong')?.value || null,
  };
  const { error } = await q('jovens_fora_umadalpe').update(payload).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Jovem atualizado!'); closeModal(); renderJovensForaUmadalpe();
};

window.openViewJovemFU = async function (id) {
  showModal(loadingPage());
  const { data: j, error } = await q('jovens_fora_umadalpe').select('*, congregacoes(nome), setores(nome)').eq('id', id).single();
  if (error || !j) { closeModal(); toast('Erro', 'error'); return; }
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(j.nome)}">${initials(j.nome)}</div><div class="mem-modal-name">${escHtml(j.nome)}</div>${j.sexo ? `<span class="tag tag-blue">${escHtml(j.sexo)}</span>` : ''}</div>
  <div class="mem-info-grid">
    <div class="inf-item"><label>Nascimento</label><span>${j.data_nascimento ? fmtDate(j.data_nascimento) : '—'}</span></div>
    <div class="inf-item"><label>Telefone</label><span>${escHtml(j.telefone || '—')}</span></div>
    <div class="inf-item"><label>Setor</label><span>${j.setores ? escHtml(j.setores.nome) : '—'}</span></div>
    <div class="inf-item"><label>Congregação</label><span>${j.congregacoes ? escHtml(j.congregacoes.nome) : '—'}</span></div>
  </div>
  ${j.responsavel ? `<div style="padding:0 30px 12px;font-size:.82rem" class="c2"><strong>Responsável:</strong> ${escHtml(j.responsavel)}</div>` : ''}
  ${j.endereco || j.bairro || j.cidade ? `<div style="padding:0 30px 12px;font-size:.82rem" class="c2"><strong>Endereço:</strong> ${escHtml([j.endereco, j.bairro, j.cidade, j.estado].filter(Boolean).join(', '))}</div>` : ''}
  ${j.observacoes ? `<div style="padding:0 30px 12px;font-size:.82rem" class="c2"><strong>Obs.:</strong> ${escHtml(j.observacoes)}</div>` : ''}
  <div class="mem-modal-foot">${j.telefone ? `<a href="https://wa.me/${j.telefone.replace(/\D/g, '')}" target="_blank" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${canGerJovensFU() ? `<button class="btn btn-secondary" onclick="openEditJovemFU('${j.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};

window.delJovemFU = async function (id, nome) {
  if (!canGerJovensFU()) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir jovem?', `Isso removerá "${nome}" permanentemente.`);
  if (!r.isConfirmed) return;
  const { error } = await q('jovens_fora_umadalpe').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Jovem excluído!'); renderJovensForaUmadalpe();
};

console.log('[patch_jovens_fora_umadalpe] carregado ✓');