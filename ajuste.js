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

  const hojeStr = new Date().toISOString().slice(0, 10);
  const eventosFuturos = eventos.filter(e => e.data > hojeStr && e.tipo !== 'evento_setorial');
  const eventosPassados = eventos.filter(e => e.data <= hojeStr && e.tipo !== 'evento_setorial');

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
  <div class="dash-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div>
        <h2 class="dash-title">${saudacao}, ${dp.esc((window.currentUser?.nome || '').split(' ')[0])}!</h2>
        <p class="dash-sub">Aqui está o resumo da sua igreja.</p>
      </div>
      <button class="btn btn-secondary btn-sm refresh-btn-animated" onclick="this.classList.add('spin'); setTimeout(() => this.classList.remove('spin'), 800); renderDashboard()" title="Atualizar" style="padding:6px 10px">${typeof lc==='function'?lc('refresh-cw',15):ico('refresh', 15)}</button>
    </div>
    <div class="dash-period">
      ${setorSel}
      <span class="tag tag-primary">${ico('calendar', 12)} ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</span>
    </div>
  </div>

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

  ${eventosFuturos.length ? `
  <div class="sec-hdr">
    <h2>${ico('calendar', 16)} Eventos Futuros</h2>
    <span class="tag" style="background:rgba(79,142,247,.15);color:#7eb3ff">Agendados</span>
  </div>
  <div class="act-list" style="margin-bottom:24px">
    ${eventosFuturos.slice(0, 8).map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer;border-left:3px solid #7eb3ff">
      <div class="act-dot" style="background:#7eb3ff"></div>
      <div class="f1">
        <div class="fw5 fs-sm">${dpTipoLabel(e.tipo)}</div>
        <div class="fs-xs c3">${dp.esc(e.resumo || '')}</div>
      </div>
      <span class="tag" style="background:rgba(79,142,247,.15);color:#7eb3ff">Agendado</span>
      <span class="act-time">${dp.fmtD(e.data)}</span>
    </div>`).join('')}
  </div>` : ''}

  ${podeVerEvSetoriais ? `
  <div class="sec-hdr"><h2>${ico('cityHall', 16)} Eventos Setoriais</h2><span class="tag tag-gold">Inclui futuros</span></div>
  <div id="dash-eventos-setoriais" class="act-list" style="margin-bottom:24px">${dpLoadingMini()}</div>` : ''}

  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="navigate('relatorios')">Ver todos</button>
  </div>
  <div class="act-list">
    ${eventosPassados.slice(0, 8).map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer;transition:all .2s">
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
        let qES = client.from('eventos').select('*').eq('tipo', 'evento_setorial').order('data', { ascending: true }).limit(20);
        if (!vetodosSetores && window.currentUser?.setor_id) qES = qES.eq('setor_id', window.currentUser.setor_id);
        const { data: evS } = await qES;
        const { data: setS } = await client.from('setores').select('id,nome');
        const sN = id => (setS || []).find(s => s.id === id)?.nome || '—';
        const hj = new Date().toISOString().slice(0, 10);
        const setFuturos = (evS || []).filter(e => e.data > hj);
        const setPassados = (evS || []).filter(e => e.data <= hj).reverse();
        const evOrdenados = [...setFuturos, ...setPassados];
        esC.innerHTML = evOrdenados.length ? evOrdenados.map(e => {
          const fut = e.data > hj;
          return `<div class="act-item" onclick="openEventoSetorialDetail('${e.id}')" style="cursor:pointer;transition:all .2s${fut ? ';border-left:3px solid #7eb3ff' : ''}">
            <div class="act-dot" style="background:${fut ? '#7eb3ff' : 'var(--gold,#f0c060)'}"></div>
            <div class="f1">
              <div class="fw5 fs-sm">${ico('cityHall', 13)} ${dp.esc(e.resumo || 'Evento Setorial')}</div>
              <div class="fs-xs c3">${dp.esc(sN(e.setor_id))}${fut ? ' · <span style="color:#7eb3ff;font-weight:600">Agendado</span>' : ''}</div>
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
    participantes: participanteIds.length || 0,
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

window.openUserModal = function (id) {
  const ROLES_FIXOS = ['admin', 'dirigente', 'adjunto', 'usuario'];
  showModal(`<div class="modal-hdr"><span>👤</span><h2>${id ? 'Editar Usuário' : 'Novo Usuário'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="user-modal-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot" id="user-modal-foot"></div>`);
  Promise.all([
    id ? q('sistema_usuarios').select('*').eq('id', id).single() : { data: null },
    q('setores').select('id,nome').order('nome'),
    q('congregacoes').select('id,nome,setor_id').order('nome'),
    q('roles').select('nome').order('nome'),
  ]).then(([{ data: u }, { data: setores }, { data: congs }, { data: rolesCustom }]) => {
    const ROLES = [...ROLES_FIXOS, ...(rolesCustom || []).map(r => r.nome).filter(n => !ROLES_FIXOS.includes(n))];
    $('user-modal-body').innerHTML = userFormHtml(u, ROLES, setores || [], congs || []);
    $('user-modal-foot').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveUser('${id || ''}')">${lc("save", 14)} Salvar</button>`;
    const setorSel = document.getElementById('um-setor');
    const congSel = document.getElementById('um-cong-sel');
    if (setorSel && congSel) {
      setorSel.addEventListener('change', () => {
        const sid = setorSel.value;
        const filtered = sid ? (congs || []).filter(c => c.setor_id === sid) : (congs || []);
        congSel.innerHTML = `<option value="">— Sem vínculo —</option>${filtered.map(c => `<option value="${c.id}" ${c.id === u?.congregacao_id ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}`;
      });
    }
  });
};

window.userFormHtml = function (u, ROLES, setores = [], congs = []) {
  const congsFiltradas = u?.setor_id ? (congs || []).filter(c => c.setor_id === u.setor_id) : (congs || []);
  return `
  <div class="form-group"><label>Nome Completo *</label><input id="um-name" value="${escHtml(u?.nome || '')}" placeholder="Nome completo"/></div>
  <div class="form-group"><label>Username *</label><input id="um-username" value="${escHtml(u?.username || '')}"/></div>
  <div class="form-group"><label>Senha ${!u ? '*' : '(vazio = manter)'}</label><input id="um-pass" type="password"/></div>
  <div class="form-row">
    <div class="form-group"><label>Idade</label><input id="um-age" type="number" value="${u?.idade || ''}"/></div>
    <div class="form-group"><label>Tipo de Acesso</label><select id="um-role">${ROLES.map(r => `<option value="${r}" ${r === (u?.role || 'usuario') ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
  </div>
  <div class="form-group"><label>Setor *</label>
    <select id="um-setor">
      <option value="">— Selecione —</option>
      ${setores.map(s => `<option value="${s.id}" ${s.id === u?.setor_id ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label>Congregação (select)</label>
    <select id="um-cong-sel">
      <option value="">— Sem vínculo —</option>
      ${congsFiltradas.map(c => `<option value="${c.id}" ${c.id === u?.congregacao_id ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label>Cargo</label><select id="um-cargo">${(typeof CARGOS !== 'undefined' ? CARGOS : ['Pastor Local','Presbítero','Diácono','Dirigente','Membro']).map(c => `<option ${c === (u?.cargo || 'Membro') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
  <div class="form-group"><label>Status</label><select id="um-ativo"><option value="true" ${u?.ativo !== false ? 'selected' : ''}>Ativo</option><option value="false" ${u?.ativo === false ? 'selected' : ''}>Inativo</option></select></div>
  <div class="form-group"><label>Vocação</label><textarea id="um-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia...">${escHtml(u?.vocacao || '')}</textarea></div>
  <div class="form-section-title">${lc("book-open", 14)} EBD</div>
  <div class="form-row">
    <div class="form-group"><label>Frequenta EBD?</label><select id="um-ebd"><option value="false" ${!u?.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${u?.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
    <div class="form-group"><label>Papel na EBD</label><select id="um-papel-ebd"><option value="" ${!u?.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${u?.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${u?.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${u?.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
  </div>`;
};

window.saveUser = async function (id) {
  const nome = ($('um-name')?.value || '').trim(), username = ($('um-username')?.value || '').trim(), senha = ($('um-pass')?.value || '').trim();
  if (!nome || !username) { toast('Nome e username obrigatórios', 'error'); return; }
  if (!id && !senha) { toast('Senha obrigatória', 'error'); return; }
  const congId = $('um-cong-sel')?.value || null;
  const congNomeVal = (typeof allCongsCache !== 'undefined' ? allCongsCache : []).find(c => c.id === congId)?.nome || '';
  const payload = {
    nome, username,
    role: $('um-role').value,
    cargo: $('um-cargo').value,
    congregacao: congNomeVal,
    congregacao_id: congId,
    idade: parseInt($('um-age')?.value) || null,
    ativo: $('um-ativo').value === 'true',
    setor_id: $('um-setor')?.value || null,
    frequenta_ebd: $('um-ebd')?.value === 'true',
    papel_ebd: $('um-papel-ebd')?.value || null,
    vocacao: ($('um-vocacao')?.value || '').trim() || null,
  };
  if (senha) payload.senha = senha;
  const { error } = id ? await q('sistema_usuarios').update(payload).eq('id', id) : await q('sistema_usuarios').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast(id ? 'Usuário atualizado!' : 'Usuário criado!'); renderUsuarios();
};

function pfAplicarFuturo(dateInputId, disableSelector) {
  const dataInput = document.getElementById(dateInputId);
  if (!dataInput) return;
  const upd = () => {
    document.getElementById('futuro-notice')?.remove();
    const futuro = dataInput.value > new Date().toISOString().slice(0,10);
    if (futuro) {
      const n = document.createElement('div');
      n.id = 'futuro-notice'; n.className = 'futuro-notice';
      n.innerHTML = `${lc('shield',14)} <strong>Evento futuro:</strong> dados não podem ser preenchidos agora. Publique após a realização.`;
      dataInput.parentElement.insertAdjacentElement('afterend', n);
      document.querySelectorAll(disableSelector).forEach(el => { if (el) { el.disabled = true; el.value = 0; } });
    } else {
      document.querySelectorAll(disableSelector).forEach(el => { if (el) el.disabled = false; });
    }
  };
  dataInput.addEventListener('change', upd);
  upd();
}

window.openEventModal = async function (tipo) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  $('event-menu')?.classList.add('hidden');
  const info = TIPOS_EVENTO[tipo] || { label: tipo, icon: 'clipboard-list', financeiro: false, evangelismo: false };
  const { data: mems } = await q('membros').select('id,nome,cargo,frequenta_ebd,papel_ebd').eq('congregacao_id', navState.cong.id).order('nome');
  let qExt = q('membros').select('id,nome,cargo,congregacao_id').order('nome').neq('congregacao_id', navState.cong.id);
  if (!canSeeAllSetores() && currentUser?.setor_id) qExt = qExt.eq('setor_id', currentUser.setor_id);
  const { data: allMems } = await qExt;

  let extraFields = '';
  if (info.financeiro) {
    extraFields = `
    <div class="form-row"><div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time"/></div><div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time"/></div></div>
    <div class="form-group"><label>Conversões</label><input id="ev-conversoes" type="number" min="0" placeholder="0"/></div>
    ${canSeeFinanceiro() ? `<div class="form-row"><div class="form-group"><label>Ofertas (R$)</label><input id="ev-ofertas" type="number" step="0.01" min="0" placeholder="0"/></div><div class="form-group"><label>Dízimos (R$)</label><input id="ev-dizimos" type="number" step="0.01" min="0" placeholder="0"/></div></div>` : ''}
    <div class="form-section-title">${lc("book-open", 14)} Campos Espirituais</div>
    <div class="form-row"><div class="form-group"><label>Almas Salvas</label><input id="ev-almas-salvas" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Batismo no Espírito</label><input id="ev-batismo-espirito" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-row"><div class="form-group"><label>Renovo</label><input id="ev-renovo" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Bênçãos Alcançadas</label><input id="ev-bencaos" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-row"><div class="form-group"><label>Desviados que Voltaram</label><input id="ev-desviados" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Literaturas Distribuídas</label><input id="ev-literaturas" type="number" min="0" placeholder="0"/></div></div>`;
  } else if (info.ebd) {
    extraFields = `
    <div class="form-group"><label>Horário</label><input id="ev-inicio" type="time"/></div>
    <div class="form-group"><label>Tema da Lição *</label><input id="ev-tema-licao" placeholder="Ex: A fé de Abraão"/></div>
    <div class="form-group"><label>Referência Bíblica</label><input id="ev-referencia" placeholder="Ex: Gênesis 12"/></div>`;
  } else if (info.evangelismo) {
    extraFields = `
    <div class="form-row"><div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time"/></div><div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time"/></div></div>
    <div class="form-group"><label>Evangelizados</label><input id="ev-evangelizados" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Vidas Salvas</label><input id="ev-conversoes" type="number" min="0" placeholder="0"/></div>`;
  }

  const memsParaEBD = info.ebd ? (mems || []).filter(m => m.frequenta_ebd) : (mems || []);

  showModal(`<div class="modal-hdr"><span>${lc(info.icon, 20)}</span><h2>Registrar: ${info.label}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="ev-data" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-group"><label>Resumo / Obs.</label><textarea id="ev-resumo" rows="2" style="resize:vertical"></textarea></div>
    ${extraFields}
    <div class="form-group"><label>${info.ebd ? 'Alunos/Professores (EBD)' : 'Participantes da Congregação'}</label>
    <p class="fs-xs c3" style="margin-bottom:6px">Marque os presentes — o total será calculado automaticamente.</p>
    <div class="member-select-list" id="ev-mems-local">${memsParaEBD.map(m => `<label class="check-row"><input type="checkbox" class="ev-mem-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}${m.papel_ebd ? ' · ' + m.papel_ebd : ''}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum membro cadastrado.</p>'}</div></div>
    ${!info.ebd ? `<div class="form-group"><label>Externos (mesmo setor)</label><input id="ev-ext-search" placeholder="Buscar..." oninput="filterExtMembers(this.value)" style="margin-bottom:8px"/><div class="member-select-list" id="ev-mems-ext" style="max-height:140px">${(allMems || []).map(m => `<label class="check-row ev-ext-row"><input type="checkbox" class="ev-ext-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}</em></span></label>`).join('') || '<p class="c3 fs-xs">Sem externos.</p>'}</div></div>` : ''}
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEvento('${tipo}')">${lc("plus-circle", 14)} Registrar</button></div>`);

  setTimeout(() => pfAplicarFuturo('ev-data', '#ev-conversoes,#ev-ofertas,#ev-dizimos,#ev-evangelizados,#ev-almas-salvas,#ev-batismo-espirito,#ev-renovo,#ev-bencaos,#ev-desviados,#ev-literaturas'), 100);
};

window.openEventoSetorialModal = async function () {
  const { data: setores } = await q('setores').select('id,nome').order('nome');
  const { data: usuarios } = await q('sistema_usuarios').select('id,nome,cargo,setor_id').eq('ativo', true).order('nome');
  const sid = currentUser?.setor_id || null;
  const usersSetor = sid ? (usuarios || []).filter(u => u.setor_id === sid) : (usuarios || []);

  showModal(`
  <div class="modal-hdr"><span>${lc('building-2', 20)}</span><h2>Novo Evento Setorial</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="es-data" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-group"><label>Setor</label>
      <select id="es-setor">
        ${(setores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Horário Início</label><input id="es-inicio" type="time"/></div>
      <div class="form-group"><label>Horário Fim</label><input id="es-fim" type="time"/></div>
    </div>
    <div class="form-group"><label>Resumo / Título *</label><input id="es-resumo" placeholder="Ex: Reunião de Líderes do Setor"/></div>
    <div class="form-group"><label>Conversões</label><input id="es-conversoes" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Participantes do Setor</label>
      <p class="fs-xs c3" style="margin-bottom:6px">Marque os presentes — o total será calculado automaticamente.</p>
      <div class="member-select-list" style="max-height:180px">
        ${usersSetor.map(u => `<label class="check-row"><input type="checkbox" class="es-user-check" value="${u.id}" data-nome="${escHtml(u.nome)}"/>
        <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
        <span>${escHtml(u.nome)} <em class="c3">${escHtml(u.cargo || '—')}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum usuário no setor.</p>'}
      </div>
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEventoSetorial()">${lc('plus-circle', 14)} Registrar</button></div>`);

  setTimeout(() => pfAplicarFuturo('es-data', '#es-conversoes'), 100);
};

window.submitEventoSetorial = async function () {
  const data = $('es-data')?.value;
  const resumo = ($('es-resumo')?.value || '').trim();
  if (!data || !resumo) { toast('Data e resumo são obrigatórios', 'error'); return; }
  const futuro = data > new Date().toISOString().slice(0,10);
  const checks = [...document.querySelectorAll('.es-user-check:checked')].map(c => c.value);
  const payload = {
    tipo: 'evento_setorial',
    setor_id: $('es-setor')?.value || currentUser?.setor_id,
    data, resumo,
    hora_inicio: $('es-inicio')?.value || null,
    hora_fim: $('es-fim')?.value || null,
    participantes: checks.length || 0,
    conversoes: futuro ? 0 : (parseInt($('es-conversoes')?.value) || 0),
    participante_ids: checks,
    congregacao_id: null,
    ofertas: 0, dizimos: 0, evangelizados: 0,
    status: futuro ? 'rascunho' : 'pendente',
  };
  const { error } = await q('eventos').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  toast(futuro ? 'Evento setorial agendado como rascunho.' : 'Evento setorial registrado!');
  closeModal(); renderEventosSetoriais();
};

window.openEditMembro = function (id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" value="${escHtml(m.telefone || '')}"/></div>
    <div class="form-group"><label>Email</label><input id="em-email" value="${escHtml(m.email || '')}"/></div>
    <div class="form-group"><label>Vocação</label><textarea id="em-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia...">${escHtml(m.vocacao || '')}</textarea></div>
    <div class="form-section-title">${lc("book-open", 14)} Escola Bíblica Dominical</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="em-ebd"><option value="false" ${!m.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${m.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
      <div class="form-group"><label>Papel</label><select id="em-papel-ebd"><option value="" ${!m.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${m.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${m.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${m.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
    </div>`;
    const modal = document.querySelector('.modal');
    if (modal && !modal.querySelector('.modal-foot')) { const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveMembro('${id}')">${lc("save", 14)} Salvar</button>`; modal.appendChild(foot); }
  });
};

window.saveMembro = async function (id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  const payload = {
    nome: ($('em-nome')?.value || '').trim(),
    cargo: $('em-cargo')?.value,
    idade: parseInt($('em-idade')?.value) || null,
    telefone: ($('em-tel')?.value || '').trim(),
    email: ($('em-email')?.value || '').trim(),
    vocacao: ($('em-vocacao')?.value || '').trim() || null,
    frequenta_ebd: $('em-ebd')?.value === 'true',
    papel_ebd: $('em-papel-ebd')?.value || null
  };
  if (!payload.nome) { toast('Nome obrigatório', 'error'); return; }
  const { error } = await q('membros').update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast('Membro atualizado!'); if (currentPage === 'setores') renderSetores();
};

window.openMemberModal = async function (id) {
  showModal(loadingPage());
  const { data: m, error } = await q('membros').select('*').eq('id', id).single();
  if (error || !m) { closeModal(); toast('Erro', 'error'); return; }
  const ebdInfo = m.frequenta_ebd ? `<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:#38bdf8;margin-bottom:4px">${lc("book-open", 14)} Escola Bíblica Dominical</div><div class="c3">Papel: <strong style="color:var(--txt)">${escHtml(m.papel_ebd || 'Aluno')}</strong></div></div>` : '';
  const vocacaoInfo = m.vocacao ? `<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--gold);margin-bottom:4px">${lc("sparkles", 14)} Vocação</div><div class="c2">${escHtml(m.vocacao)}</div></div>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${vocacaoInfo}${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${hasPerm('gerenciar_membros') ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};
/* ──────────────────────────────────────────────────────────
   FIX 6 — Menu Global de Membros
   ──────────────────────────────────────────────────────────
   Adiciona a permissão, o item na sidebar e as telas de gestão
   globais de Membros.
════════════════════════════════════════════════════════════ */

if (typeof PERM_DESC !== 'undefined') {
  PERM_DESC['visualizar_membros'] = { label: 'Visualizar Membros', desc: 'Acessar o menu e visualizar todos os membros' };
}

setTimeout(() => {
  if ((typeof hasPerm === 'function' && hasPerm('visualizar_membros')) || window.activeRole === 'admin') {
    const nav = document.querySelector('.sidebar .nav');
    if (nav && !nav.querySelector('[data-page="todos_membros"]')) {
      const div = document.createElement('div');
      div.className = 'nav-item'; div.dataset.page = 'todos_membros';
      div.innerHTML = `<span class="nav-icon">${typeof lc === 'function' ? lc('users-2', 20) || '👥' : '👥'}</span><span class="nav-lbl">Membros</span>`;
      div.addEventListener('click', () => {
        if (typeof navigate === 'function') navigate('todos_membros');
        if (typeof toggleMobile === 'function') toggleMobile(false);
      });
      // Inserir após "Usuários" se existir
      const items = [...nav.querySelectorAll('.nav-item')];
      const usersItem = items.find(el => el.dataset.page === 'usuarios');
      if (usersItem) nav.insertBefore(div, usersItem.nextSibling);
      else nav.appendChild(div);
    }
  }
}, 500);

// Substitui ou intercepta o navigate original caso 'todos_membros' seja chamado
const originalNavigate = window.navigate;
if (typeof originalNavigate === 'function' && !window._navigatePatchedMembros) {
  window._navigatePatchedMembros = true;
  window.navigate = function(page) {
    if (page === 'dashboard') {
      window.dashSetorFiltro = window.currentUser?.setor_id || null;
      window.dashSetorFiltroManual = false;
      window.dashCongFiltro = null;
    }
    if (page === 'relatorios') {
      window.relSetorFiltro = window.currentUser?.setor_id || null;
      window.relCongFiltro = null;
    }
    if (page === 'todos_membros') {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === 'todos_membros'));
      if (window.navState) window.navState.page = 'todos_membros';
      renderTodosMembros();
      return;
    }
    originalNavigate(page);
  };
}

window.renderTodosMembros = async function() {
  const pc = document.getElementById('page-content');
  if (!pc) return;
  if (!hasPerm('visualizar_membros')) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc === 'function' ? lc('shield-off', 44) : '🚫'}</div><p>Sem permissão.</p></div>`;
    return;
  }
  
  pc.innerHTML = loadingPage();
  
  let qMems = q('membros').select('*, congregacoes(nome), setores(nome)').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) {
    qMems = qMems.eq('setor_id', currentUser.setor_id);
  }
  
  const { data: mems, error } = await qMems;
  if (error) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc === 'function' ? lc('alert-triangle', 44) : '⚠️'}</div><p>${error.message}</p></div>`;
    return;
  }
  
  const canManage = hasPerm('gerenciar_membros');
  
  window._allMembrosCache = mems || [];
  
  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Membros ${canSeeAllSetores() ? '(Global)' : '(Meu Setor)'} <span class="count-badge">${(mems || []).length}</span></h2>
    <div class="sec-actions">
      ${canManage ? `<button class="btn btn-primary btn-sm" onclick="openAddMembroGlobal()">+ Novo Membro</button>` : ''}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div style="padding:16px;border-bottom:1px solid var(--bdr);display:flex;gap:12px;align-items:center;">
      <div class="search-box" style="flex:1">
        ${typeof lc === 'function' ? lc('search', 16) : '🔍'}
        <input type="text" id="membros-global-search" placeholder="Buscar membro por nome..." oninput="filterTodosMembros(this.value)">
      </div>
    </div>
    <div class="table-wrap">
      <table class="table" id="membros-global-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cargo</th>
            <th>Congregação</th>
            ${canSeeAllSetores() ? '<th>Setor</th>' : ''}
            <th width="100">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${renderMembrosGlobalRows(window._allMembrosCache)}
        </tbody>
      </table>
    </div>
  </div>
  `;
  
  refreshLucide();
};

window.renderMembrosGlobalRows = function(membros) {
  if (!membros || !membros.length) return '<tr><td colspan="5" style="text-align:center;color:var(--c3);padding:24px">Nenhum membro encontrado.</td></tr>';
  return membros.map(m => {
    const act = `<button class="action-btn" title="Ver Perfil" onclick="openMemberModal('${m.id}')">${typeof lc === 'function' ? lc('eye', 14) : '👁️'}</button> ${hasPerm('gerenciar_membros') ? `<button class="action-btn" title="Editar" onclick="openEditMembro('${m.id}')">${typeof lc === 'function' ? lc('pencil', 14) : '✏️'}</button> <button class="action-btn" style="color:var(--red)" title="Excluir" onclick="delMembro('${m.id}')">${typeof lc === 'function' ? lc('trash', 14) : '🗑️'}</button>` : ''}`;
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
          <span class="fw5">${escHtml(m.nome)}</span>
        </div>
      </td>
      <td><span class="tag tag-gold">${escHtml(m.cargo)}</span></td>
      <td>${m.congregacoes ? escHtml(m.congregacoes.nome) : '—'}</td>
      ${canSeeAllSetores() ? `<td>${m.setores ? escHtml(m.setores.nome) : '—'}</td>` : ''}
      <td>${act}</td>
    </tr>`;
  }).join('');
};

window.filterTodosMembros = function(qStr) {
  const t = qStr.toLowerCase();
  const arr = (window._allMembrosCache || []).filter(m => m.nome.toLowerCase().includes(t));
  const tb = document.querySelector('#membros-global-table tbody');
  if (tb) {
    tb.innerHTML = renderMembrosGlobalRows(arr);
    refreshLucide();
  }
};

window.openAddMembroGlobal = async function() {
  if (!hasPerm('gerenciar_membros')) return toast('Sem permissão', 'error');
  
  showModal(`<div class="modal-hdr"><span>+</span><h2>Novo Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="add-membro-global-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAddMembroGlobal()">${typeof lc === 'function' ? lc('save', 14) : '💾'} Salvar</button></div>`);
  
  let qSetores = q('setores').select('id,nome').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qSetores = qSetores.eq('id', currentUser.setor_id);
  const [{ data: setores }, { data: congs }] = await Promise.all([
    qSetores,
    q('congregacoes').select('id,nome,setor_id').order('nome')
  ]);
  
  window._cacheCongsGlobal = congs || [];
  
  const setorOpts = (setores || []).map(s => `<option value="${s.id}">${escHtml(s.nome)}</option>`).join('');
  
  const bd = document.getElementById('add-membro-global-body');
  if (!bd) return;
  
  bd.innerHTML = `
    <div class="form-group"><label>Nome Completo *</label><input id="amg-nome"/></div>
    <div class="form-row">
      <div class="form-group"><label>Setor *</label><select id="amg-setor" onchange="updateCongsGlobal()">${canSeeAllSetores() ? '<option value="">— Selecione —</option>' : ''}${setorOpts}</select></div>
      <div class="form-group"><label>Congregação *</label><select id="amg-cong"><option value="">— Selecione Setor —</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Cargo</label><select id="amg-cargo">${(typeof CARGOS !== 'undefined' ? CARGOS : ['Pastor Local','Presbítero','Diácono','Dirigente','Membro']).map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="form-group"><label>Idade</label><input id="amg-idade" type="number"/></div>
    </div>
    <div class="form-group"><label>Telefone</label><input id="amg-tel"/></div>
    <div class="form-group"><label>Email</label><input id="amg-email" type="email"/></div>
    <div class="form-group"><label>Vocação</label><textarea id="amg-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia..."></textarea></div>
    <div class="form-section-title">${typeof lc === 'function' ? lc('book-open', 14) : '📖'} EBD</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="amg-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="form-group"><label>Papel na EBD</label><select id="amg-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div>
    </div>
  `;
  setTimeout(() => window.updateCongsGlobal(), 50);
};

window.updateCongsGlobal = function() {
  const sid = document.getElementById('amg-setor')?.value;
  const cSel = document.getElementById('amg-cong');
  if (!cSel) return;
  if (!sid) { cSel.innerHTML = '<option value="">— Selecione Setor —</option>'; return; }
  const cgs = (window._cacheCongsGlobal || []).filter(c => c.setor_id === sid);
  cSel.innerHTML = cgs.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('') || '<option value="">Nenhuma congregação</option>';
};

window.submitAddMembroGlobal = async function() {
  const nome = (document.getElementById('amg-nome')?.value || '').trim();
  const setor_id = document.getElementById('amg-setor')?.value;
  const congregacao_id = document.getElementById('amg-cong')?.value;
  
  if (!nome || !setor_id || !congregacao_id) return toast('Preencha Nome, Setor e Congregação', 'error');
  
  const payload = {
    nome,
    setor_id,
    congregacao_id,
    cargo: document.getElementById('amg-cargo')?.value,
    idade: parseInt(document.getElementById('amg-idade')?.value) || null,
    telefone: (document.getElementById('amg-tel')?.value || '').trim() || null,
    email: (document.getElementById('amg-email')?.value || '').trim() || null,
    vocacao: (document.getElementById('amg-vocacao')?.value || '').trim() || null,
    frequenta_ebd: document.getElementById('amg-ebd')?.value === 'true',
    papel_ebd: document.getElementById('amg-papel-ebd')?.value || null
  };
  
  const { error } = await q('membros').insert(payload);
  if (error) return toast(error.message, 'error');
  
  toast('Membro adicionado!');
  closeModal();
  renderTodosMembros(); // recarrega a tabela global
};

/* ──────────────────────────────────────────────────────────
   FIX 7 — Bloquear Scroll de Fundo ao Abrir Modais
   ──────────────────────────────────────────────────────────
   Intercepta as funções globais de modal para travar o body
════════════════════════════════════════════════════════════ */
const _origShowModal = window.showModal;
const _origCloseModal = window.closeModal;

if (typeof _origShowModal === 'function' && !window._modalScrollPatched) {
  window._modalScrollPatched = true;
  window.showModal = function(html) {
    document.body.style.overflow = 'hidden';
    _origShowModal(html);
  };
  window.closeModal = function() {
    document.body.style.overflow = '';
    _origCloseModal();
  };
}

/* --- FIM DO PATCH --- */
