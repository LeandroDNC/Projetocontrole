/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_ajustes.js
   Correções aplicadas (carregar este arquivo POR ÚLTIMO, depois
   de theme_engine.js):

   1. Botão "Voltar" na tela de Setores
   2. Ranking Mensal agora contabiliza eventos "pendente" + "publicado"
      (antes só contava "publicado", e por isso nunca via os eventos
      reais registrados pelas congregações)
   3. Dashboard: gráficos e cards agora somam QUALQUER evento
      registrado (antes só contava eventos "publicado")
   4. CORREÇÃO CRÍTICA: dashboard_patch.js redefinia window.submitEvento
      com uma versão simplificada que NÃO salvava participante_ids
      (os IDs dos membros marcados no formulário). Isso fazia com que
      a frequência nunca funcionasse, porque o campo ficava sempre
      vazio. Aqui restauramos a versão original (a que respeita os
      checkboxes de membros/externos).
   5. Frequência agora é calculada em cima da tabela `membros`
      (cadastrados em cada congregação), e não mais da tabela de
      usuários do sistema.
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────
   1) BOTÃO VOLTAR EM SETORES
   ─────────────────────────────────────────────────────────── */
window.renderSetoresMain = async function (pc) {
  pc.innerHTML = loadingPage();
  let qSetores = q('setores').select('*').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qSetores = qSetores.eq('id', currentUser.setor_id);
  const { data: setores, error } = await qSetores;
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${error.message}</p></div>`; return; }
  const filtered = (setores || []).filter(s => s.nome.toLowerCase().includes(setorSearch.toLowerCase()));
  const [rC, rM] = await Promise.all([q('congregacoes').select('setor_id'), q('membros').select('setor_id')]);
  const congCount = id => (rC.data || []).filter(c => c.setor_id === id).length;
  const memCount = id => (rM.data || []).filter(m => m.setor_id === id).length;
  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Setores <span class="count-badge">${(setores || []).length}</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      <div class="search-wrap form-group" style="margin:0">
        <span class="search-ico">${lc('search', 13)}</span>
        <input id="setor-search" value="${escHtml(setorSearch)}" placeholder="Buscar setor..." oninput="setorSearch=this.value;renderSetores()" style="width:180px"/>
      </div>
      ${hasPerm('gerenciar_setores') ? `<button class="btn btn-primary btn-sm" onclick="openAddModal('setor')">+ Novo Setor</button>` : ''}
    </div>
  </div>
  ${!canSeeAllSetores() && !isSuperAdmin() ? `<div class="access-notice"><span>${lc('lock', 14)}</span> Você está visualizando apenas o seu setor.</div>` : ''}
  <div class="cards-grid">
    ${filtered.length ? filtered.map((s, i) => `
      <div class="item-card" style="animation-delay:${i * .05}s" onclick="openSetor('${s.id}','${escHtml(s.nome)}','${s.regiao || ''}')">
        <div class="card-head"><div class="card-ico">${lc('map-pin', 17)}</div>
          <div><div class="card-name">${escHtml(s.nome)}</div><div class="card-sub">Região ${s.regiao || '—'}</div></div>
        </div>
        <div class="card-meta"><span class="tag tag-gold">${lc('church', 12)} ${congCount(s.id)} Cong.</span><span class="tag tag-blue">${lc('users', 12)} ${memCount(s.id)} Membros</span></div>
        <div class="card-actions" onclick="event.stopPropagation()">
          ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delSetor('${s.id}','${escHtml(s.nome)}')">${lc('trash-2', 14)}</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="openSetor('${s.id}','${escHtml(s.nome)}','${s.regiao || ''}')">${lc('arrow-right', 14)} Abrir</button>
        </div>
      </div>`).join('')
      : `<div class="empty"><div class="empty-ico">${lc('map-pin', 44)}</div><p>Nenhum setor encontrado.</p></div>`}
  </div>`;
};

/* ───────────────────────────────────────────────────────────
   2) RANKING MENSAL — considerar eventos "pendente" + "publicado"
   ─────────────────────────────────────────────────────────── */
window.apurarRanking = async function (silencioso = false) {
  const client = rkDb(); if (!client) return;
  try {
    const hoje = new Date();
    const semanaAtual = getISOWeek(hoje);
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();

    const { data: cfgArr } = await client.from('ranking_config').select('*').order('created_at', { ascending: false }).limit(1);
    const config = cfgArr?.[0] || { vermelho_min: 1, amarelo_min: 3, verde_min: 5 };

    const { data: congs } = await client.from('congregacoes').select('id,nome,setor_id');

    // FIX: antes só considerava status === 'publicado'. Como os eventos
    // registrados pelas congregações ficam como 'pendente' (a menos que
    // alguém clique em "publicar"), o ranking nunca via os eventos reais.
    const { data: eventos } = await client.from('eventos')
      .select('id,congregacao_id,data,tipo,status')
      .in('status', ['pendente', 'publicado'])
      .lte('data', hoje.toISOString().slice(0, 10));

    if (!congs || !eventos) return;

    const porCong = {};
    congs.forEach(c => { porCong[c.id] = { semanas: {}, totalMes: 0 }; });

    eventos.forEach(ev => {
      if (!ev.congregacao_id || !porCong[ev.congregacao_id]) return;
      const d = new Date(ev.data + 'T00:00:00');
      const semEv = getISOWeek(d);
      const mesEv = d.getMonth() + 1;
      const anoEv = d.getFullYear();
      if (anoEv === anoAtual && mesEv === mesAtual) {
        const key = `${semEv}`;
        if (!porCong[ev.congregacao_id].semanas[key]) porCong[ev.congregacao_id].semanas[key] = 0;
        porCong[ev.congregacao_id].semanas[key]++;
        porCong[ev.congregacao_id].totalMes++;
      }
    });

    const upsertsSem = [];
    const upsertsMen = [];

    congs.forEach(c => {
      const dados = porCong[c.id] || { semanas: {}, totalMes: 0 };
      Object.entries(dados.semanas).forEach(([sem, total]) => {
        const nivel = calcNivel(total, config);
        upsertsSem.push({ madalp_id: c.id, semana: parseInt(sem), mes: mesAtual, ano: anoAtual, total_eventos: total, nivel });
      });
      if (!dados.semanas[String(semanaAtual)]) {
        upsertsSem.push({ madalp_id: c.id, semana: semanaAtual, mes: mesAtual, ano: anoAtual, total_eventos: 0, nivel: 'vermelho' });
      }
      const nivelMensal = calcNivel(dados.totalMes, config);
      upsertsMen.push({ madalp_id: c.id, mes: mesAtual, ano: anoAtual, total_eventos: dados.totalMes, nivel_final: nivelMensal });
    });

    if (upsertsSem.length) {
      await client.from('ranking_semanal').upsert(upsertsSem, { onConflict: 'madalp_id,semana,ano', ignoreDuplicates: false });
    }
    if (upsertsMen.length) {
      await client.from('ranking_mensal').upsert(upsertsMen, { onConflict: 'madalp_id,mes,ano', ignoreDuplicates: false });
    }
    if (!silencioso) rkToast('Ranking apurado com sucesso!');
  } catch (e) {
    console.error('apurarRanking:', e);
    if (!silencioso) rkToast('Erro ao apurar ranking: ' + e.message, 'error');
  }
};

/* ───────────────────────────────────────────────────────────
   3) DASHBOARD — considerar QUALQUER evento (não só "publicado")
   ─────────────────────────────────────────────────────────── */
window.renderDashboard = async function () {
  if (typeof hasPerm === 'function' && !hasPerm('visualizar_dashboard') && !(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
    document.getElementById('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${ico('shield', 40)}</div><p>Sem permissão para acessar o dashboard.</p></div>`;
    return;
  }
  const pc = document.getElementById('page-content');
  pc.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Carregando...</span></div>`;

  const client = dp.db();
  if (!client) { pc.innerHTML = `<div class="empty"><p>Banco não disponível.</p></div>`; return; }

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inicioMes = `${mesAtual}-01`;
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hoje = dp.hoje();
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const hora = now.getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  if (!window.dashSetorFiltroManual) {
    window.dashSetorFiltro = window.currentUser?.setor_id || null;
  }
  const sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  const canFin = typeof canSeeFinanceiro === 'function' ? canSeeFinanceiro() : false;
  const podeVerEvSetoriais = (typeof hasPerm === 'function' && hasPerm('visualizar_eventos_setoriais_dash')) || (typeof isSuperAdmin === 'function' && isSuperAdmin());

  const [{ data: allSetores }] = await Promise.all([client.from('setores').select('id,nome').order('nome')]);

  let qSet = client.from('setores').select('id', { count: 'exact', head: true });
  let qCong = client.from('congregacoes').select('id', { count: 'exact', head: true });
  let qMem = client.from('membros').select('id', { count: 'exact', head: true });
  // FIX: removido filtro de status — considera TODO evento registrado
  let qEv = client.from('eventos').select('*').order('data', { ascending: false });
  let qEvM = client.from('eventos').select('*').gte('data', inicioMes).lte('data', fimMes);
  let qAg = client.from('agenda_semana').select('*,congregacoes(nome)').gte('data', hoje).lte('data', em7).order('data');

  if (sid) { qSet = qSet.eq('id', sid); qCong = qCong.eq('setor_id', sid); qMem = qMem.eq('setor_id', sid); qEv = qEv.eq('setor_id', sid); qEvM = qEvM.eq('setor_id', sid); qAg = qAg.eq('setor_id', sid); }
  if (cid) { qCong = qCong.eq('id', cid); qMem = qMem.eq('congregacao_id', cid); qEv = qEv.eq('congregacao_id', cid); qEvM = qEvM.eq('congregacao_id', cid); qAg = qAg.eq('congregacao_id', cid); }

  const canFS = typeof canFilterSetores === 'function' ? canFilterSetores() : false;
  const canFC = typeof canFilterCong === 'function' ? canFilterCong() : false;
  const congsList = sid ? (await client.from('congregacoes').select('id,nome').eq('setor_id', sid).order('nome')).data || [] : [];
  const [rSet, rCong, rMem, rEv, rEvM, { data: agItems }] = await Promise.all([qSet, qCong, qMem, qEv, qEvM, qAg.limit(10)]);

  const eventos = rEv.data || [];
  const eventosMes = rEvM.data || [];
  const totalOferMes = eventosMes.reduce((s, e) => s + (e.ofertas || 0), 0);
  const totalDizMes = eventosMes.reduce((s, e) => s + (e.dizimos || 0), 0);
  const totalConvMes = eventosMes.reduce((s, e) => s + (e.conversoes || 0), 0);
  const totalPartMes = eventosMes.reduce((s, e) => s + (e.participantes || 0), 0);
  const totalFinMes = totalOferMes + totalDizMes;
  const nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const metaFin = 20000;
  const gaugePct = Math.min(100, Math.round(totalFinMes / metaFin * 100));
  const gaugeR = 56; const gaugeC = Math.PI * gaugeR;
  const gaugeDash = (gaugeC * gaugePct / 100).toFixed(1);
  const gaugeGap = (gaugeC - gaugeC * gaugePct / 100).toFixed(1);

  const setorSel = canFS ? `
  <div class="dash-setor-selector">
    <span class="selector-label">${ico('pin', 13)} Setor</span>
    <select class="selector-select" onchange="window.dashSetorFiltroManual=true;window.dashSetorFiltro=this.value||window.currentUser?.setor_id||null;window.dashCongFiltro=null;renderDashboard()">
      ${(allSetores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${dp.esc(s.nome)}</option>`).join('')}
    </select>
    ${canFC && congsList.length ? `<select class="selector-select" onchange="window.dashCongFiltro=this.value||null;renderDashboard()">
      <option value="">Todas</option>
      ${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${dp.esc(c.nome)}</option>`).join('')}
    </select>` : ''}
    <span class="selector-badge">visualização</span>
  </div>` : `<div class="dash-setor-locked">${ico('pin', 14)} ${dp.esc((allSetores || []).find(s => s.id === sid)?.nome || 'Meu Setor')}</div>`;

  pc.innerHTML = `
  <!-- HEADER -->
  <div class="dash-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div>
        <h2 class="dash-title">${saudacao}, ${dp.esc((window.currentUser?.nome || '').split(' ')[0])}!</h2>
        <p class="dash-sub">Aqui está o resumo da sua igreja.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="renderDashboard()" title="Atualizar" style="padding:6px 10px">${ico('refresh', 15)}</button>
    </div>
    <div class="dash-period">
      ${setorSel}
      <span class="tag tag-primary">${ico('calendar', 12)} ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</span>
    </div>
  </div>

  <!-- 4 CARDS TOPO -->
  <div class="dash-top-grid">
    <div class="stat-card stat-clickable" onclick="dpNavSetores()">
      <div class="stat-ico ic-gold">${SVG.map}</div>
      <div>
        <div class="stat-val">${rSet.count || 0}</div>
        <div class="stat-lbl">Setores</div>
        <div class="stat-chg">Total</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavCongs()">
      <div class="stat-ico ic-blue">${SVG.church}</div>
      <div>
        <div class="stat-val">${rCong.count || 0}</div>
        <div class="stat-lbl">Congregações</div>
        <div class="stat-chg">Total</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavMembros()">
      <div class="stat-ico ic-teal">${SVG.users}</div>
      <div>
        <div class="stat-val">${rMem.count || 0}</div>
        <div class="stat-lbl">Membros</div>
        <div class="stat-chg">Total</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()">
      <div class="stat-ico ic-violet">${SVG.calendar}</div>
      <div>
        <div class="stat-val">${eventosMes.length}</div>
        <div class="stat-lbl">Eventos</div>
        <div class="stat-chg">Este mês</div>
      </div>
    </div>
  </div>
  <div class="dash-shortcuts" style="margin-bottom:24px">
    ${((typeof hasPerm === 'function' && (hasPerm('visualizar_ranking') || hasPerm('gerenciar_ranking'))) || (typeof isSuperAdmin === 'function' && isSuperAdmin())) ? `
    <div class="shortcut-btn" onclick="navigate('ranking')">
      <div class="shortcut-ico ic-gold">${SVG.trophy}</div><small>Ranking Mensal</small>
    </div>` : ''}
    <div class="shortcut-btn" onclick="navigate('frequencia')">
      <div class="shortcut-ico ic-blue">${SVG.freq}</div><small>Frequência</small>
    </div>
    ${((typeof hasPerm === 'function' && hasPerm('editar_permissoes')) || (typeof isSuperAdmin === 'function' && isSuperAdmin())) ? `
    <div class="shortcut-btn" onclick="navigate('permissoes')">
      <div class="shortcut-ico ic-teal">${SVG.shield}</div><small>Permissões</small>
    </div>` : ''}
    ${canFin ? `
    <div class="shortcut-btn" onclick="navigate('financeiro')">
      <div class="shortcut-ico ic-violet">${SVG.wallet}</div><small>Financeiro</small>
    </div>` : ''}
  </div>
  <!-- RESUMO DO MÊS -->
  <div class="sec-hdr"><h2>Resumo do Mês</h2><span class="tag tag-primary">Tempo real</span></div>
  <div class="mes-grid">
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()">
      <div class="stat-ico ic-blue">${SVG.people}</div>
      <div>
        <div class="stat-val">${totalPartMes}</div>
        <div class="stat-lbl">Participantes</div>
        <div class="stat-chg">este mês</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()">
      <div class="stat-ico ic-violet">${SVG.cross}</div>
      <div>
        <div class="stat-val">${totalConvMes}</div>
        <div class="stat-lbl">Conversões</div>
        <div class="stat-chg">este mês</div>
      </div>
    </div>
  </div>

  ${canFin ? `
  <div class="sec-hdr"><h2>Financeiro do Mês</h2><span class="tag tag-gold">Acumulado</span></div>
  <div class="fin-grid">
    <div class="gauge-card">
      <svg class="gauge-svg" viewBox="0 0 140 90">
        <path d="M 14 82 A 56 56 0 0 1 126 82" class="gauge-track"/>
        <path d="M 14 82 A 56 56 0 0 1 126 82" class="gauge-fill"
          stroke="url(#gGrad)"
          stroke-dasharray="${gaugeDash} ${gaugeGap}"
          stroke-dashoffset="0"/>
        <defs>
          <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#4ade80"/>
            <stop offset="55%" stop-color="#fdcb6e"/>
            <stop offset="100%" stop-color="#ff6b9d"/>
          </linearGradient>
        </defs>
      </svg>
      <div class="gauge-pct">${gaugePct}%</div>
      <div class="gauge-ico">${ico('chart', 22, 'rgba(255,255,255,.8)')}</div>
      <div class="gauge-label">Valor Recebido</div>
      <div class="gauge-value">${dp.fmtM(totalFinMes)}</div>
      <div class="gauge-meta">Meta: ${dp.fmtM(metaFin)}</div>
    </div>
    <div class="fin-right">
      <div class="fin-card" onclick="openOfertasModal()" style="cursor:pointer">
        <div class="fin-card-ico ic-gold">${SVG.coins}</div>
        <div class="fin-card-body">
          <div class="fin-card-lbl">Ofertas</div>
          <div class="fin-card-val">${dp.fmtM(totalOferMes)}</div>
          <div class="fin-card-sub">Este mês</div>
        </div>
      </div>
      <div class="fin-card" onclick="openDizimosModal()" style="cursor:pointer">
        <div class="fin-card-ico ic-violet">${SVG.gem}</div>
        <div class="fin-card-body">
          <div class="fin-card-lbl">Dízimos</div>
          <div class="fin-card-val">${dp.fmtM(totalDizMes)}</div>
          <div class="fin-card-sub">Este mês</div>
        </div>
      </div>
    </div>
  </div>` : ''}

  <div class="charts-grid" style="margin-bottom:24px">
    <div class="chart-card chart-span2">
      <div class="chart-card-header">
        <div><h3>Participantes por Mês</h3><p>Acumulado do ano — todos os eventos</p></div>
        <button class="chart-period-btn">${ico('calendar', 12)} Este ano</button>
      </div>
      <canvas id="chart-dash-line" height="80"></canvas>
    </div>
    <div class="chart-card">
      <h3>Tipos de Eventos</h3><p>Distribuição — todos os eventos</p>
      <canvas id="chart-dash-bar" height="160"></canvas>
    </div>
  </div>

  <div class="sec-hdr"><h2>${ico('calendar', 16)} Agenda da Semana</h2><span class="tag">Próximos 7 dias</span></div>
  <div class="agenda-strip" style="margin-bottom:24px">${dpAgendaStrip(agItems || [])}</div>

  ${podeVerEvSetoriais ? `
  <div class="sec-hdr"><h2>${ico('cityHall', 16)} Eventos Setoriais</h2><span class="tag tag-gold">Inclui futuros</span></div>
  <div id="dash-eventos-setoriais" class="act-list" style="margin-bottom:24px">${dpLoadingMini()}</div>` : ''}

  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="navigate('relatorios')">Ver todos</button>
  </div>
  <div class="act-list">
    ${eventos.slice(0, 8).map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
      <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>
      <div class="f1">
        <div class="fw5 fs-sm">${dpTipoLabel(e.tipo)}</div>
        <div class="fs-xs c3">${dp.esc(e.resumo || '')}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
        <span class="tag">${ico('people', 11)} ${e.participantes || 0}</span>
        ${e.conversoes ? `<span class="tag tag-teal">${ico('cross', 10)} ${e.conversoes}</span>` : ''}
        ${canFin && e.ofertas ? `<span class="tag tag-gold">${dp.fmtM(e.ofertas)}</span>` : ''}
      </div>
      <span class="act-time">${dp.fmtD(e.data)}</span>
    </div>`).join('') || '<p class="c3" style="padding:16px">Nenhum evento registrado.</p>'}
  </div>`;

  if (typeof Chart !== 'undefined') {
    const byMonth = Array(12).fill(0);
    eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); byMonth[m] += (e.participantes || 0); });
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const lCtx = document.getElementById('chart-dash-line');
    if (lCtx) new Chart(lCtx, { type: 'line', data: { labels: meses, datasets: [{ label: 'Participantes', data: byMonth, borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,.1)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#4f8ef7', pointBorderColor: 'var(--bg-card,#121830)', pointBorderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#636e72' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#636e72' }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
    const cultos = eventos.filter(e => e.tipo === 'culto').length;
    const genEvt = eventos.filter(e => e.tipo === 'evento').length;
    const saidas = eventos.filter(e => e.tipo === 'saida').length;
    const outros = Math.max(0, eventos.length - cultos - genEvt - saidas);
    const bCtx = document.getElementById('chart-dash-bar');
    if (bCtx) new Chart(bCtx, { type: 'doughnut', data: { labels: ['Cultos', 'Eventos', 'Saídas', 'Outros'], datasets: [{ data: [cultos, genEvt, saidas, outros], backgroundColor: ['rgba(79,142,247,.85)', 'rgba(56,217,192,.85)', 'rgba(167,139,250,.85)', 'rgba(240,192,96,.85)'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } }, position: 'bottom' } }, cutout: '62%' } });
  }

  if (podeVerEvSetoriais) {
    const esC = document.getElementById('dash-eventos-setoriais');
    if (esC) {
      try {
        const vetodosSetores = (typeof canSeeAllSetores === 'function' && canSeeAllSetores()) || (typeof isSuperAdmin === 'function' && isSuperAdmin());
        let qES = client.from('eventos').select('*').eq('tipo', 'evento_setorial').order('data', { ascending: true }).limit(15);
        if (!vetodosSetores && window.currentUser?.setor_id) qES = qES.eq('setor_id', window.currentUser.setor_id);
        const { data: evS } = await qES;
        const { data: setS } = await client.from('setores').select('id,nome');
        const sN = id => (setS || []).find(s => s.id === id)?.nome || '—';
        const hj = new Date().toISOString().slice(0, 10);
        esC.innerHTML = (evS || []).length ? (evS || []).map(e => {
          const fut = e.data > hj;
          return `<div class="act-item" onclick="openEventoSetorialDetail('${e.id}')" style="cursor:pointer">
            <div class="act-dot" style="background:${fut ? 'var(--primary-l,#7eb3ff)' : 'var(--gold,#f0c060)'}"></div>
            <div class="f1">
              <div class="fw5 fs-sm">${ico('cityHall', 13)} ${dp.esc(e.resumo || 'Evento Setorial')}</div>
              <div class="fs-xs c3">${dp.esc(sN(e.setor_id))}${fut ? ' · <span style="color:var(--primary-l,#7eb3ff);font-weight:600">Agendado</span>' : ''}</div>
            </div>
            <span class="tag">${e.participantes || 0} pess.</span>
            <span class="act-time">${dp.fmtD(e.data)}</span>
          </div>`;
        }).join('') : '<p class="c3" style="padding:16px;text-align:center">Nenhum evento setorial.</p>';
      } catch (err) { esC.innerHTML = '<p class="c3" style="padding:16px;text-align:center">Erro ao carregar.</p>'; }
    }
  }
};

/* ───────────────────────────────────────────────────────────
   4) RESTAURA submitEvento ORIGINAL (com participante_ids)
      dashboard_patch.js sobrescrevia esta função com uma versão
      que não salvava os membros selecionados no formulário.
   ─────────────────────────────────────────────────────────── */
window.submitEvento = async function (tipo) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  const data = $('ev-data')?.value; if (!data) { toast('Data é obrigatória', 'error'); return; }
  const localChecked = [...document.querySelectorAll('.ev-mem-check:checked')].map(c => c.value);
  const extChecked = [...document.querySelectorAll('.ev-ext-check:checked')].map(c => c.value);
  const participanteIds = [...localChecked, ...extChecked];
  const payload = {
    congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data,
    resumo: ($('ev-resumo')?.value || '').trim(),
    participantes: parseInt($('ev-participantes')?.value) || participanteIds.length || 0,
    hora_inicio: $('ev-inicio')?.value || null, hora_fim: $('ev-fim')?.value || null,
    conversoes: parseInt($('ev-conversoes')?.value) || 0,
    ofertas: canSeeFinanceiro() ? parseFloat($('ev-ofertas')?.value) || 0 : 0,
    dizimos: canSeeFinanceiro() ? parseFloat($('ev-dizimos')?.value) || 0 : 0,
    evangelizados: parseInt($('ev-evangelizados')?.value) || 0,
    participante_ids: participanteIds,
    almas_salvas: parseInt($('ev-almas-salvas')?.value) || 0,
    batismo_espirito: parseInt($('ev-batismo-espirito')?.value) || 0,
    renovo: parseInt($('ev-renovo')?.value) || 0,
    bencaos_alcancadas: parseInt($('ev-bencaos')?.value) || 0,
    desviados_voltaram_campo: parseInt($('ev-desviados')?.value) || 0,
    literaturas_distribuidas: parseInt($('ev-literaturas')?.value) || 0,
    tema_licao: ($('ev-tema-licao')?.value || '').trim() || null,
    referencia_biblica: ($('ev-referencia')?.value || '').trim() || null,
    // Já nasce "pendente" — assim aparece imediatamente no ranking,
    // gráficos e relatórios, sem depender de um botão "publicar".
    status: 'pendente',
  };
  const { error } = await q('eventos').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal(); renderSetores();
};

/* ───────────────────────────────────────────────────────────
   5) FREQUÊNCIA — agora baseada na tabela `membros`
   ─────────────────────────────────────────────────────────── */
window.renderFrequencia = async function () {
  if (!hasPerm('ver_frequencia_usuarios')) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("shield-off", 14)}</div><p>Sem permissão.</p></div>`; return; }
  $('page-content').innerHTML = loadingPage();
  const now = new Date();
  if (!freqFiltroInicio) freqFiltroInicio = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (!freqFiltroFim) freqFiltroFim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { data: setores } = await q('setores').select('id,nome').order('nome');
  if (!freqSetorFiltro) freqSetorFiltro = currentUser?.setor_id || '';
  const sid = freqSetorFiltro || currentUser?.setor_id || null;
  const cid = freqCongFiltro || null;
  let congsList = [];
  if (sid) { const { data: cs } = await q('congregacoes').select('id,nome').eq('setor_id', sid).order('nome'); congsList = cs || []; }

  // Base: MEMBROS cadastrados nas congregações (não mais sistema_usuarios)
  let qMembros = q('membros').select('id,nome,cargo,setor_id,congregacao_id,frequenta_ebd,papel_ebd').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qMembros = qMembros.eq('setor_id', currentUser.setor_id);
  else if (sid) qMembros = qMembros.eq('setor_id', sid);
  if (cid) qMembros = qMembros.eq('congregacao_id', cid);

  const qEventos = q('eventos').select('id,tipo,data,participante_ids,setor_id,congregacao_id,resumo').gte('data', freqFiltroInicio).lte('data', freqFiltroFim);
  const [{ data: membrosList }, { data: eventos }] = await Promise.all([qMembros, qEventos]);
  const membrosArr = membrosList || [], eventosList = eventos || [];
  const eventosSetor = sid ? eventosList.filter(e => e.setor_id === sid) : eventosList;
  const eventosBase = cid ? eventosSetor.filter(e => e.congregacao_id === cid) : eventosSetor;
  const totalEventos = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;

  const congNomeById = {};
  (congsList || []).forEach(c => congNomeById[c.id] = c.nome);
  // Se não houver congsList carregada (ex: super admin sem setor selecionado), busca sob demanda
  const congIdsFaltantes = [...new Set(membrosArr.map(m => m.congregacao_id).filter(cId => cId && !congNomeById[cId]))];
  if (congIdsFaltantes.length) {
    const { data: extraCongs } = await q('congregacoes').select('id,nome').in('id', congIdsFaltantes);
    (extraCongs || []).forEach(c => congNomeById[c.id] = c.nome);
  }

  const freqData = membrosArr.map(m => {
    const evParticipou = eventosBase.filter(e => (e.participante_ids || []).includes(m.id));
    const cultosParticipou = evParticipou.filter(e => e.tipo === 'culto').length;
    const pctTotal = totalEventos > 0 ? Math.round((evParticipou.length / totalEventos) * 100) : 0;
    const pctCultos = totalCultos > 0 ? Math.round((cultosParticipou / totalCultos) * 100) : 0;
    const setorNome = (setores || []).find(s => s.id === m.setor_id)?.nome || '—';
    const congNome = congNomeById[m.congregacao_id] || '—';
    return { ...m, evParticipou, cultosParticipou, totalParticipou: evParticipou.length, pctTotal, pctCultos, setorNome, congNome };
  }).sort((a, b) => b.pctTotal - a.pctTotal);

  const canFilterS = canFilterSetores() && canSeeAllSetores();
  const setorSelect = canFilterS ? `<div class="form-group" style="margin:0"><label>Setor</label><select id="freq-setor" style="min-width:160px">${(setores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}</select></div>` : `<div style="font-size:.82rem;color:var(--txt2)">${lc("map-pin", 14)} <strong>${escHtml((setores || []).find(s => s.id === sid)?.nome || '—')}</strong></div>`;
  const congSelect = canFilterCong() && congsList.length ? `<div class="form-group" style="margin:0"><label>Congregação</label><select id="freq-cong" style="min-width:160px"><option value="">Todas</option>${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}</select></div>` : '';

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Frequência <span class="count-badge">${membrosArr.length} membros</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      ${hasPerm('exportar_dados') ? `<button class="btn btn-primary btn-sm" onclick="exportarFrequenciaPDF()">📄 PDF</button><button class="btn btn-secondary btn-sm" onclick="exportarFrequenciaExcel()">${lc("bar-chart-3", 14)} Excel</button>` : ''}
    </div>
  </div>
  <div class="filter-bar">
    <div class="filter-title">${lc("calendar", 14)} Filtro</div>
    <div class="filter-fields">
      ${setorSelect}${congSelect}
      <div class="form-group" style="margin:0"><label>Início</label><input type="date" id="freq-inicio" value="${freqFiltroInicio}" onchange="freqFiltroInicio=this.value"/></div>
      <div class="form-group" style="margin:0"><label>Fim</label><input type="date" id="freq-fim" value="${freqFiltroFim}" onchange="freqFiltroFim=this.value"/></div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="${canFilterS ? "freqSetorFiltro=$('freq-setor')?.value||'';" : ''} ${canFilterCong() ? "freqCongFiltro=$('freq-cong')?.value||null;" : ''} renderFrequencia()">${lc("search", 14)} Filtrar</button>
        <button class="btn btn-secondary btn-sm" onclick="freqFiltroInicio='';freqFiltroFim='';freqSetorFiltro='';freqCongFiltro=null;renderFrequencia()">↺</button>
      </div>
    </div>
    <div class="filter-presets">
      <button class="btn btn-secondary btn-sm" onclick="setFreqFiltro('mes')">Este mês</button>
      <button class="btn btn-secondary btn-sm" onclick="setFreqFiltro('quinzena1')">1ª quinzena</button>
      <button class="btn btn-secondary btn-sm" onclick="setFreqFiltro('quinzena2')">2ª quinzena</button>
      <button class="btn btn-secondary btn-sm" onclick="setFreqFiltro('semana')">Esta semana</button>
      <button class="btn btn-secondary btn-sm" onclick="setFreqFiltro('ano')">Este ano</button>
    </div>
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:24px">
    ${statCard(lc("clipboard-list", 14), 'ic-gold', totalEventos, 'Eventos', '')}${statCard(lc("church", 14), 'ic-blue', totalCultos, 'Cultos', '')}${statCard(lc("users", 18), 'ic-teal', membrosArr.length, 'Membros', '')}${statCard(lc("trending-up", 14), 'ic-violet', freqData.length > 0 ? `${freqData[0]?.pctTotal || 0}%` : '—', 'Maior Freq.', freqData[0]?.nome?.split(' ')[0] || '')}
  </div>
  <div class="freq-legend"><span class="freq-leg-item"><span class="freq-dot" style="background:#14b8a6"></span>≥75%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f59e0b"></span>50–74%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f43f5e"></span>&lt;50%</span></div>
  <div class="freq-list">
    ${freqData.length ? freqData.map(m => {
      const corG = m.pctTotal >= 75 ? '#14b8a6' : m.pctTotal >= 50 ? '#f59e0b' : '#f43f5e';
      const corC = m.pctCultos >= 75 ? '#14b8a6' : m.pctCultos >= 50 ? '#f59e0b' : '#f43f5e';
      return `<div class="freq-item">
        <div class="freq-item-user"><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div><div class="fw5 fs-sm">${escHtml(m.nome)}</div><div class="fs-xs c3">${escHtml(m.cargo || '—')} · ${escHtml(m.congNome || '—')}</div>${m.frequenta_ebd ? `<span class="tag tag-blue" style="font-size:.6rem">${lc("book-open", 14)} EBD ${m.papel_ebd ? '· ' + m.papel_ebd : ''}</span>` : ''}</div></div>
        <div class="freq-item-bars">
          <div class="freq-bar-row"><span class="freq-bar-label">Geral</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${m.pctTotal}%;background:${corG}"></div></div><span class="freq-pct" style="color:${corG}">${m.pctTotal}%</span></div>
          <div class="freq-bar-row"><span class="freq-bar-label">Cultos</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${m.pctCultos}%;background:${corC}"></div></div><span class="freq-pct" style="color:${corC}">${m.pctCultos}%</span></div>
        </div>
        <div class="freq-item-info"><span class="tag fs-xs">${m.totalParticipou}/${totalEventos} ev.</span><span class="tag fs-xs">${m.cultosParticipou}/${totalCultos} cul.</span></div>
        <button class="btn btn-secondary btn-sm" onclick="openFreqDetalhe('${m.id}','${escHtml(m.nome)}')">Ver ${lc("arrow-right", 14)}</button>
      </div>`;
    }).join('') : `<div class="empty"><div class="empty-ico">${lc("trending-up", 14)}</div><p>Nenhum membro encontrado.</p></div>`}
  </div>
  <div class="chart-card" style="margin-bottom:28px"><h3>Top Membros por Frequência</h3><canvas id="chart-freq" height="80"></canvas></div>`;

  const top10 = freqData.slice(0, 10);
  const fCtx = document.getElementById('chart-freq');
  if (fCtx && top10.length) chartInstances.freq = new Chart(fCtx, { type: 'bar', data: { labels: top10.map(m => m.nome.split(' ')[0]), datasets: [{ label: 'Freq. Geral (%)', data: top10.map(m => m.pctTotal), backgroundColor: top10.map(m => m.pctTotal >= 75 ? 'rgba(20,184,166,.8)' : m.pctTotal >= 50 ? 'rgba(245,158,11,.8)' : 'rgba(244,63,94,.8)'), borderRadius: 8 }, { label: 'Freq. Cultos (%)', data: top10.map(m => m.pctCultos), backgroundColor: 'rgba(201,168,76,.4)', borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
};

/* Exports em PDF/Excel também baseados em `membros` */
window.exportarFrequenciaPDF = async function () {
  if (!hasPerm('exportar_dados')) { toast('Sem permissão', 'error'); return; }
  const { jsPDF } = window.jspdf; if (!jsPDF) { toast('Biblioteca não carregada', 'error'); return; }
  toast('Gerando PDF...', 'info');
  const sid = freqSetorFiltro || currentUser?.setor_id || null;
  let qM = q('membros').select('id,nome,cargo,setor_id,congregacao_id').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qM = qM.eq('setor_id', currentUser.setor_id);
  else if (sid) qM = qM.eq('setor_id', sid);
  const [{ data: membros }, { data: eventos }, { data: setores }, { data: congs }] = await Promise.all([
    qM,
    q('eventos').select('id,tipo,data,participante_ids,setor_id').gte('data', freqFiltroInicio).lte('data', freqFiltroFim),
    q('setores').select('id,nome'),
    q('congregacoes').select('id,nome'),
  ]);
  const eventosBase = sid ? (eventos || []).filter(e => e.setor_id === sid) : (eventos || []);
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;
  const congNome = id => (congs || []).find(c => c.id === id)?.nome || '—';
  const freqData = (membros || []).map(m => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(m.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => e.tipo === 'culto').length / totalCultos) * 100) : 0; return { nome: m.nome, cargo: m.cargo || '—', setorNome: (setores || []).find(s => s.id === m.setor_id)?.nome || '—', congregacao: congNome(m.congregacao_id), partTotal: evP.length, cultosPart: evP.filter(e => e.tipo === 'culto').length, pctTotal, pctCultos }; }).sort((a, b) => b.pctTotal - a.pctTotal);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const W = 210, margin = 16; let y = 20;
  doc.setFillColor(9, 12, 24); doc.rect(0, 0, W, 44, 'F'); doc.setTextColor(201, 168, 76); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text('EclesiaSync', margin, 18); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184); doc.text('Relatório de Frequência (Membros)', margin, 25); doc.text(`Período: ${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}`, margin, 31); doc.text(`Gerado por: ${currentUser?.nome || '—'} · ${new Date().toLocaleDateString('pt-BR')}`, margin, 37); y = 54;
  doc.setFontSize(13); doc.setTextColor(201, 168, 76); doc.setFont('helvetica', 'bold'); doc.text('Frequência por Membro', margin, y); y += 8;
  doc.autoTable({ startY: y, margin: { left: margin, right: margin }, head: [['Membro', 'Cargo', 'Congregação', 'Freq. Geral', 'Freq. Cultos', 'Part./Total', 'Cultos/Total']], body: freqData.map(m => [m.nome, m.cargo, m.congregacao, `${m.pctTotal}%`, `${m.pctCultos}%`, `${m.partTotal}/${totalEv}`, `${m.cultosPart}/${totalCultos}`]), theme: 'grid', headStyles: { fillColor: [9, 12, 24], textColor: [201, 168, 76], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 250] }, styles: { fontSize: 8.5 }, didParseCell: function (data) { if (data.section === 'body' && data.column.index === 3) { const p = parseInt(data.cell.text[0]); data.cell.styles.textColor = p >= 75 ? [20, 184, 166] : p >= 50 ? [245, 158, 11] : [244, 63, 94]; } } });
  doc.save(`EclesiaSync-Frequencia-${freqFiltroInicio}-${freqFiltroFim}.pdf`); toast('PDF gerado!');
};

window.exportarFrequenciaExcel = async function () {
  if (!hasPerm('exportar_dados')) { toast('Sem permissão', 'error'); return; }
  toast('Gerando Excel...', 'info');
  const sid = freqSetorFiltro || currentUser?.setor_id || null;
  let qM = q('membros').select('id,nome,cargo,setor_id,congregacao_id').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qM = qM.eq('setor_id', currentUser.setor_id);
  else if (sid) qM = qM.eq('setor_id', sid);
  const [{ data: membros }, { data: eventos }, { data: setores }, { data: congs }] = await Promise.all([
    qM,
    q('eventos').select('id,tipo,data,participante_ids,setor_id,resumo').gte('data', freqFiltroInicio).lte('data', freqFiltroFim),
    q('setores').select('id,nome'),
    q('congregacoes').select('id,nome'),
  ]);
  const eventosBase = sid ? (eventos || []).filter(e => e.setor_id === sid) : (eventos || []);
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;
  const congNome = id => (congs || []).find(c => c.id === id)?.nome || '—';
  const rows = [['EclesiaSync — Frequência (Membros)'], ['Período:', `${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}`], ['Gerado em:', new Date().toLocaleString('pt-BR')], [], ['Membro', 'Cargo', 'Setor', 'Congregação', 'Freq. Geral (%)', 'Freq. Cultos (%)', 'Participações', 'Cultos', 'Total Eventos', 'Total Cultos']];
  (membros || []).forEach(m => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(m.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => e.tipo === 'culto').length / totalCultos) * 100) : 0; rows.push([m.nome, m.cargo || '—', (setores || []).find(s => s.id === m.setor_id)?.nome || '—', congNome(m.congregacao_id), pctTotal, pctCultos, evP.length, evP.filter(e => e.tipo === 'culto').length, totalEv, totalCultos]); });
  rows.push([]); rows.push(['Data', 'Tipo', 'Resumo', 'Participantes']);
  eventosBase.forEach(e => { const nomes = (e.participante_ids || []).map(mid => { const m = (membros || []).find(x => x.id === mid); return m ? m.nome : '(ext)'; }).join('; '); rows.push([fmtDate(e.data), tipoLabel(e.tipo), e.resumo || '—', nomes || 'Nenhum']); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `EclesiaSync-Frequencia-${freqFiltroInicio}-${freqFiltroFim}.csv`; a.click(); URL.revokeObjectURL(url); toast('Excel gerado!');
};

console.log('[patch_ajustes] carregado ✓');