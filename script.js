/* ═══════════════════════════════════════════════════════════
   EclesiaSync · financeiro_module.js v5.2
   USA o cliente Supabase (db) já instanciado no script_v5.js
   ═══════════════════════════════════════════════════════════ */

const WHATSAPP_ADMIN = '5581999999999';

/* ── Aguarda o objeto db estar disponível ───────────────── */
function getDb() {
  if (typeof db !== 'undefined') return db;
  if (typeof window.db !== 'undefined') return window.db;
  return null;
}

function fmtM(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function fmtD(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
}
function escH(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function avHtml(nome) {
  const colors = ['#3b82f6','#8b5cf6','#14b8a6','#f43f5e','#f59e0b'];
  const bg = colors[(nome||'A').charCodeAt(0) % colors.length];
  const ini = (nome||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return `<div class="av av-sm" style="background:${bg}">${ini}</div>`;
}

/* ── VERIFICAÇÃO DE LICENÇA ─────────────────────────────── */ 
window.checkLicenca = async function(userId) {
  const client = getDb();
  if (!client) return true;

  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const { data, error } = await client
      .from('financeiro_licencas')
      .select('*')
      .eq('usuario_id', userId)
      .order('data_fim', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // tabela não existe ou outro erro → libera acesso
      console.warn('checkLicenca:', error.message);
      return true;
    }

    if (!data) return true; // sem registro = livre

    const vencido = data.ativo === false || (data.data_fim && data.data_fim < hoje);
    if (!vencido) return true;

    document.body.innerHTML = `
      <div style="min-height:100vh;min-height:100dvh;display:flex;align-items:center;
        justify-content:center;background:#090c18;font-family:'DM Sans',sans-serif;padding:20px">
        <div style="text-align:center;padding:48px 40px;background:#111827;
          border:1px solid rgba(244,63,94,.3);border-radius:20px;
          max-width:440px;width:100%;box-shadow:0 0 40px rgba(244,63,94,.08)">
          <div style="font-size:56px;margin-bottom:16px">${typeof lc==='function'?lc('lock',56):'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}</div>
          <h2 style="font-family:'Cinzel',serif;color:#f43f5e;font-size:1.3rem;margin-bottom:10px">
            Acesso Bloqueado
          </h2>
          <p style="color:#94a3b8;font-size:.9rem;margin-bottom:28px;line-height:1.6">
            Sua licença expirou. Realize o pagamento para continuar usando o sistema.
          </p>
          <a href="https://wa.me/${WHATSAPP_ADMIN}?text=${encodeURIComponent('Olá! Preciso renovar minha licença do EclesiaSync.')}"
            target="_blank"
            style="display:inline-flex;align-items:center;gap:8px;background:#25d366;
              color:#fff;padding:13px 28px;border-radius:12px;text-decoration:none;
              font-weight:600;font-size:.9rem">
            Falar no WhatsApp
          </a>
          <p style="color:#475569;font-size:.75rem;margin-top:16px">
            Vencimento: ${fmtD(data.data_fim)}
          </p>
        </div>
      </div>`;
    return false;

  } catch (e) {
    console.warn('checkLicenca erro:', e);
    return true;
  }
};

/* ── INJETAR MENU ───────────────────────────────────────── */
function injectFinanceiroMenu() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return false;

  const temPerm = (typeof isSuperAdmin === 'function' && isSuperAdmin()) ||
                  (typeof hasPerm === 'function' && hasPerm('gerenciar_financeiro'));
  if (!temPerm) return true;

  if (nav.querySelector('[data-page="financeiro"]')) return true;

  const div = document.createElement('div');
  div.className = 'nav-item';
  div.dataset.page = 'financeiro';
  div.innerHTML = `<span class="nav-icon"><i data-lucide="wallet"></i></span><span class="nav-lbl">Financeiro</span>`;
  div.addEventListener('click', () => {
    if (typeof navigate === 'function') navigate('financeiro');
    if (typeof toggleMobile === 'function') toggleMobile(false);
  });

  // Insere antes do label "Sistema"
  const labels = nav.querySelectorAll('.nav-label');
  let sistemaLabel = null;
  labels.forEach(el => { if (el.textContent.trim() === 'Sistema') sistemaLabel = el; });
  if (sistemaLabel) nav.insertBefore(div, sistemaLabel);
  else nav.appendChild(div);

  return true;
}

/* ── RENDER FINANCEIRO ──────────────────────────────────── */
window.renderFinanceiro = async function() {
  const pc = document.getElementById('page-content');
  if (!pc) return;

  const temPerm = (typeof isSuperAdmin === 'function' && isSuperAdmin()) ||
                  (typeof hasPerm === 'function' && hasPerm('gerenciar_financeiro'));
  if (!temPerm) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc==='function'?lc('shield-off',44):''}</div><p>Sem permissão para acessar o módulo financeiro.</p></div>`;
    return;
  }

  pc.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Carregando financeiro...</span></div>`;

  const client = getDb();
  if (!client) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc==='function'?lc('alert-triangle',44):''}</div><p>Supabase não inicializado.</p></div>`;
    return;
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const em7  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const [{ data: licencas, error: errLic }, { data: usuarios, error: errUsu }] = await Promise.all([
      client.from('financeiro_licencas').select('*').order('data_fim', { ascending: true }),
      client.from('sistema_usuarios').select('id,nome,cargo,congregacao,setor_id').order('nome'),
    ]);

    if (errLic) throw new Error('Erro ao buscar licenças: ' + errLic.message);

    const lista = (licencas || []).map(l => {
      const user     = (usuarios || []).find(u => u.id === l.usuario_id);
      const vencido  = l.data_fim && l.data_fim < hoje;
      const proximo  = !vencido && l.data_fim && l.data_fim <= em7;
      const status   = vencido ? 'vencido' : proximo ? 'proximo' : 'ok';
      const cor      = status === 'ok' ? '#14b8a6' : status === 'proximo' ? '#f59e0b' : '#f43f5e';
      const label    = status === 'ok' ? 'Em dia' : status === 'proximo' ? 'Vence em breve' : 'VENCIDO';
      // barra de progresso
      let pct = 0;
      if (l.data_inicio && l.data_fim) {
        const total   = new Date(l.data_fim + 'T00:00:00') - new Date(l.data_inicio + 'T00:00:00');
        const passado = Date.now() - new Date(l.data_inicio + 'T00:00:00');
        pct = Math.max(0, Math.min(100, Math.round((passado / total) * 100)));
      }
      return { ...l, user, status, cor, label, pct };
    });

    const totalOk      = lista.filter(l => l.status === 'ok').length;
    const totalProximo = lista.filter(l => l.status === 'proximo').length;
    const totalVencido = lista.filter(l => l.status === 'vencido').length;
    const totalValor   = lista.reduce((s, l) => s + (l.valor || 0), 0);

    const porMes = Array(12).fill(0);
    lista.forEach(l => {
      if (l.data_inicio) porMes[new Date(l.data_inicio + 'T00:00:00').getMonth()] += (l.valor || 0);
    });
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    const isSA = typeof isSuperAdmin === 'function' && isSuperAdmin();
    const backHtml = typeof backBtn === 'function' ? backBtn() : '';

    pc.innerHTML = `
    <div class="sec-hdr">
      <h2>${typeof lc==='function'?lc('wallet',20):''} Módulo Financeiro — Licenças</h2>
      <div class="sec-actions">
        ${backHtml}
        <button class="btn btn-primary btn-sm" onclick="openAddLicencaModal()">+ Adicionar</button>
      </div>
    </div>

    <div class="stats-grid stats-4" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-ico ic-teal">${typeof lc==='function'?lc('check-circle',20):''}</div><div><div class="stat-val">${totalOk}</div><div class="stat-lbl">Em dia</div></div></div>
      <div class="stat-card"><div class="stat-ico ic-gold">${typeof lc==='function'?lc('alert-triangle',20):''}</div><div><div class="stat-val">${totalProximo}</div><div class="stat-lbl">Vencem em 7 dias</div></div></div>
      <div class="stat-card"><div class="stat-ico ic-violet">${typeof lc==='function'?lc('x-circle',20):''}</div><div><div class="stat-val">${totalVencido}</div><div class="stat-lbl">Vencidos</div></div></div>
      <div class="stat-card"><div class="stat-ico ic-blue">${typeof lc==='function'?lc('coins',20):''}</div><div><div class="stat-val" style="font-size:1.1rem">${fmtM(totalValor)}</div><div class="stat-lbl">Total cadastrado</div></div></div>
    </div>

    <div class="charts-grid" style="margin-bottom:24px">
      <div class="chart-card"><h3>Status das Licenças</h3><p>Distribuição atual</p><canvas id="chart-fin-status" height="180"></canvas></div>
      <div class="chart-card"><h3>Receita por Mês</h3><p>Valor das licenças por mês de início</p><canvas id="chart-fin-mes" height="180"></canvas></div>
    </div>

    <div class="freq-legend" style="margin-bottom:16px">
      <span class="freq-leg-item"><span class="freq-dot" style="background:#14b8a6"></span>Em dia</span>
      <span class="freq-leg-item"><span class="freq-dot" style="background:#f59e0b"></span>Vence em 7 dias</span>
      <span class="freq-leg-item"><span class="freq-dot" style="background:#f43f5e"></span>Vencido</span>
    </div>

    <div class="sec-hdr"><h2>Licenças <span class="count-badge">${lista.length}</span></h2></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${lista.length ? lista.map(l => `
        <div class="user-card" style="border-left:3px solid ${l.cor}">
          <div class="user-card-main">
            ${avHtml(l.user?.nome)}
            <div class="user-card-info">
              <div class="fw5 fs-sm">${escH(l.user?.nome || '— usuário removido —')}</div>
              <div class="fs-xs c3">${escH(l.user?.cargo || '—')} · ${escH(l.user?.congregacao || '—')}</div>
              <div class="user-card-tags" style="margin-top:6px">
                <span style="background:${l.cor}22;color:${l.cor};border:1px solid ${l.cor}44;border-radius:99px;padding:2px 10px;font-size:.7rem;font-weight:600">${l.label}</span>
                <span class="tag tag-gold">${fmtM(l.valor)}</span>
                <span class="tag">${typeof lc==='function'?lc('calendar',12):''} ${fmtD(l.data_inicio)} → ${fmtD(l.data_fim)}</span>
              </div>
              <div style="margin-top:8px;background:rgba(255,255,255,.06);border-radius:99px;height:4px;overflow:hidden">
                <div style="height:100%;width:${l.pct}%;background:${l.cor};border-radius:99px;transition:width .5s"></div>
              </div>
              ${l.observacoes ? `<div class="fs-xs c3" style="margin-top:4px">${typeof lc==='function'?lc('file-text',12):''} ${escH(l.observacoes)}</div>` : ''}
            </div>
          </div>
          <div class="user-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openEditLicencaModal('${l.id}')">${typeof lc==='function'?lc('pencil',14):''} Editar</button>
            <button class="btn btn-teal btn-sm" onclick="renovarLicenca('${l.id}','${escH(l.user?.nome || '')}')">${typeof lc==='function'?lc('refresh-cw',14):''} +30 dias</button>
            <button class="btn btn-danger btn-sm" onclick="delLicenca('${l.id}')">${typeof lc==='function'?lc('trash-2',14):''}</button>
          </div>
        </div>`).join('') :
      `<div class="empty"><div class="empty-ico">${typeof lc==='function'?lc('wallet',44):''}</div>
        <p>Nenhuma licença cadastrada.</p>
        <p class="fs-xs c3" style="margin-top:6px">Clique em "+ Adicionar" para cadastrar.</p>
      </div>`}
    </div>`;

    // Gráficos
    if (typeof Chart !== 'undefined') {
      const sCtx = document.getElementById('chart-fin-status');
      if (sCtx) new Chart(sCtx, {
        type: 'doughnut',
        data: { labels: ['Em dia','Vence em breve','Vencido'], datasets: [{ data: [totalOk, totalProximo, totalVencido], backgroundColor: ['rgba(20,184,166,.8)','rgba(245,158,11,.8)','rgba(244,63,94,.8)'], borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' }
      });
      const mCtx = document.getElementById('chart-fin-mes');
      if (mCtx) new Chart(mCtx, {
        type: 'bar',
        data: { labels: meses, datasets: [{ label: 'R$', data: porMes, backgroundColor: 'rgba(20,184,166,.7)', borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,.05)' } } } }
      });
    }

  } catch (e) {
    console.error('renderFinanceiro:', e);
    pc.innerHTML = `
      <div class="empty">
        <div class="empty-ico">${typeof lc==='function'?lc('alert-triangle',44):''}</div>
        <p>Erro ao carregar o módulo financeiro.</p>
        <p class="fs-xs c3" style="margin-top:8px;max-width:400px;margin-left:auto;margin-right:auto">${escH(e.message)}</p>
        <div style="margin-top:16px;padding:14px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:10px;font-size:.8rem;color:#93c5fd;max-width:420px;margin-left:auto;margin-right:auto;text-align:left">
          <strong>Verifique:</strong><br>
          1. Execute o <code>fix_permissions.sql</code> no Supabase<br>
          2. Confirme que a tabela <code>financeiro_licencas</code> existe<br>
          3. Verifique o console do navegador (F12)
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="renderFinanceiro()">${typeof lc==='function'?lc('refresh-cw',14):''} Tentar novamente</button>
      </div>`;
  }
};

/* ── MODAL ADICIONAR ────────────────────────────────────── */
window.openAddLicencaModal = async function() {
  if (typeof showModal !== 'function') return;

  showModal(`
    <div class="modal-hdr"><span>${typeof lc==='function'?lc('wallet',20):''}</span><h2>Adicionar Licença</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="fin-modal-body"><div class="loading-page"><div class="spinner"></div></div></div>
    <div class="modal-foot" id="fin-modal-foot"></div>`);

  const client = getDb();
  if (!client) return;

  try {
    const { data: usuarios } = await client
      .from('sistema_usuarios')
      .select('id,nome,cargo,congregacao')
      .eq('ativo', true)
      .order('nome');

    document.getElementById('fin-modal-body').innerHTML = `
      <div class="form-group">
        <label>Usuário *</label>
        <select id="lic-user-id">
          <option value="">— Selecione —</option>
          ${(usuarios || []).map(u => `<option value="${u.id}">${escH(u.nome)}${u.cargo ? ' · ' + escH(u.cargo) : ''}${u.congregacao ? ' (' + escH(u.congregacao) + ')' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$) *</label>
        <input id="lic-valor" type="number" step="0.01" min="0" placeholder="Ex: 49.90"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data de Início *</label>
          <input id="lic-inicio" type="date" value="${new Date().toISOString().slice(0,10)}"/>
        </div>
        <div class="form-group">
          <label>Data de Vencimento *</label>
          <input id="lic-fim" type="date"/>
        </div>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="lic-obs" rows="2" placeholder="Ex: Plano mensal, Pagamento via PIX..."></textarea>
      </div>`;

    // Pré-calcula +30 dias ao definir início
    document.getElementById('lic-inicio')?.addEventListener('change', e => {
      const d = new Date(e.target.value + 'T00:00:00');
      d.setDate(d.getDate() + 30);
      const fim = document.getElementById('lic-fim');
      if (fim && !fim.value) fim.value = d.toISOString().slice(0, 10);
    });

    document.getElementById('fin-modal-foot').innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveLicencaModal(null)">${typeof lc==='function'?lc('save',14):''} Salvar</button>`;

  } catch (e) {
    document.getElementById('fin-modal-body').innerHTML =
      `<p class="c3" style="padding:20px;text-align:center">Erro ao carregar usuários: ${escH(e.message)}</p>`;
    document.getElementById('fin-modal-foot').innerHTML =
      `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
  }
};

/* ── MODAL EDITAR ───────────────────────────────────────── */
window.openEditLicencaModal = async function(id) {
  if (typeof showModal !== 'function') return;

  showModal(`
    <div class="modal-hdr"><span>${typeof lc==='function'?lc('pencil',20):''}</span><h2>Editar Licença</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="fin-modal-body"><div class="loading-page"><div class="spinner"></div></div></div>
    <div class="modal-foot" id="fin-modal-foot"></div>`);

  const client = getDb();
  if (!client) return;

  try {
    const [{ data: l, error: errL }, { data: usuarios }] = await Promise.all([
      client.from('financeiro_licencas').select('*').eq('id', id).single(),
      client.from('sistema_usuarios').select('id,nome,cargo,congregacao').order('nome'),
    ]);

    if (errL || !l) throw new Error(errL?.message || 'Licença não encontrada');

    document.getElementById('fin-modal-body').innerHTML = `
      <div class="form-group">
        <label>Usuário *</label>
        <select id="lic-user-id">
          ${(usuarios || []).map(u => `<option value="${u.id}" ${u.id === l.usuario_id ? 'selected' : ''}>${escH(u.nome)}${u.cargo ? ' · ' + escH(u.cargo) : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$) *</label>
        <input id="lic-valor" type="number" step="0.01" min="0" value="${l.valor || 0}"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data de Início *</label>
          <input id="lic-inicio" type="date" value="${l.data_inicio || ''}"/>
        </div>
        <div class="form-group">
          <label>Data de Vencimento *</label>
          <input id="lic-fim" type="date" value="${l.data_fim || ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="lic-ativo">
          <option value="true" ${l.ativo !== false ? 'selected' : ''}>Ativo</option>
          <option value="false" ${l.ativo === false ? 'selected' : ''}>Bloqueado manualmente</option>
        </select>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="lic-obs" rows="2">${escH(l.observacoes || '')}</textarea>
      </div>`;

    document.getElementById('fin-modal-foot').innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveLicencaModal('${id}')">${typeof lc==='function'?lc('save',14):''} Salvar</button>`;

  } catch (e) {
    document.getElementById('fin-modal-body').innerHTML =
      `<p class="c3" style="padding:20px;text-align:center">Erro: ${escH(e.message)}</p>`;
    document.getElementById('fin-modal-foot').innerHTML =
      `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
  }
};

/* ── SALVAR (INSERT ou UPDATE) ──────────────────────────── */
window.saveLicencaModal = async function(id) {
  const usuario_id  = document.getElementById('lic-user-id')?.value?.trim();
  const valorRaw    = document.getElementById('lic-valor')?.value;
  const data_inicio = document.getElementById('lic-inicio')?.value;
  const data_fim    = document.getElementById('lic-fim')?.value;
  const obs         = (document.getElementById('lic-obs')?.value || '').trim();
  const ativo       = document.getElementById('lic-ativo')?.value !== 'false';

  if (!usuario_id)  { if (typeof toast === 'function') toast('Selecione um usuário', 'error'); return; }
  if (!data_inicio) { if (typeof toast === 'function') toast('Data de início obrigatória', 'error'); return; }
  if (!data_fim)    { if (typeof toast === 'function') toast('Data de vencimento obrigatória', 'error'); return; }
  if (data_fim < data_inicio) { if (typeof toast === 'function') toast('Vencimento deve ser após o início', 'error'); return; }

  const payload = {
    usuario_id,
    valor: parseFloat(valorRaw) || 0,
    data_inicio,
    data_fim,
    ativo,
    observacoes: obs || null,
  };

  const client = getDb();
  if (!client) return;

  try {
    let error;
    if (id) {
      ({ error } = await client.from('financeiro_licencas').update(payload).eq('id', id));
    } else {
      ({ error } = await client.from('financeiro_licencas').insert(payload));
    }

    if (error) throw new Error(error.message);

    if (typeof toast === 'function') toast(id ? 'Licença atualizada!' : 'Licença adicionada!');
    if (typeof closeModal === 'function') closeModal();
    if (typeof renderFinanceiro === 'function') renderFinanceiro();

  } catch (e) {
    console.error('saveLicenca:', e);
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

/* ── RENOVAR +30 dias ───────────────────────────────────── */
window.renovarLicenca = async function(id, nome) {
  if (typeof confirmDialog === 'function') {
    const r = await confirmDialog('Renovar Licença', `Adicionar +30 dias à licença de "${nome}"?`);
    if (!r.isConfirmed) return;
  }

  const client = getDb();
  if (!client) return;

  try {
    const { data: l, error: errL } = await client
      .from('financeiro_licencas').select('data_fim').eq('id', id).single();
    if (errL || !l) throw new Error(errL?.message || 'Não encontrado');

    const base = (l.data_fim && l.data_fim > new Date().toISOString().slice(0, 10))
      ? l.data_fim : new Date().toISOString().slice(0, 10);
    const novoFim = new Date(new Date(base + 'T00:00:00').getTime() + 30 * 86400000)
      .toISOString().slice(0, 10);

    const { error } = await client
      .from('financeiro_licencas').update({ data_fim: novoFim, ativo: true }).eq('id', id);
    if (error) throw new Error(error.message);

    if (typeof toast === 'function') toast('Licença renovada por +30 dias!');
    if (typeof renderFinanceiro === 'function') renderFinanceiro();

  } catch (e) {
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

/* ── EXCLUIR ────────────────────────────────────────────── */
window.delLicenca = async function(id) {
  if (typeof confirmDialog === 'function') {
    const r = await confirmDialog('Excluir Licença', 'Esta licença será removida permanentemente.');
    if (!r.isConfirmed) return;
  }

  const client = getDb();
  if (!client) return;

  try {
    const { error } = await client.from('financeiro_licencas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (typeof toast === 'function') toast('Licença excluída!');
    if (typeof renderFinanceiro === 'function') renderFinanceiro();
  } catch (e) {
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

/* ── INIT ───────────────────────────────────────────────── */
(function() {
  const app = document.getElementById('screen-app');
  if (!app) return;

  // Tenta injetar imediatamente se app já visível
  if (!app.classList.contains('hidden')) {
    setTimeout(injectFinanceiroMenu, 300);
    return;
  }

  // Observa quando o app ficar visível (após login)
  const observer = new MutationObserver(() => {
    if (!app.classList.contains('hidden')) {
      setTimeout(injectFinanceiroMenu, 300);
      observer.disconnect();
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });
})();
