/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_frequencia_membros.js
   Carregar por ÚLTIMO no HTML, depois de patch_menu_fix.js:
     <script src="patch_frequencia_membros.js"></script>

   Reafirma (de forma definitiva, por cima de qualquer outra
   versão carregada antes) que a tela de Frequência é calculada
   em cima da tabela `membros` — os membros cadastrados em cada
   congregação — e NÃO da tabela `sistema_usuarios`.

   Como funciona o cálculo:
   - Busca os MEMBROS do setor/congregação selecionado.
   - Busca os EVENTOS do período selecionado.
   - Para cada membro, conta em quantos eventos o `id` dele aparece
     dentro de `eventos.participante_ids` (preenchido pelos
     checkboxes de "Participantes da Congregação" no cadastro de
     evento) — e calcula a % sobre o total de eventos e sobre o
     total de cultos/eventos evangelísticos do período.
   ═══════════════════════════════════════════════════════════ */

window.renderFrequencia = async function () {
  if (!hasPerm('ver_frequencia_usuarios')) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("shield-off", 44)}</div><p>Sem permissão.</p></div>`; return; }
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

  // Base: MEMBROS cadastrados nas congregações (NUNCA sistema_usuarios)
  let qMembros = q('membros').select('id,nome,cargo,setor_id,congregacao_id,frequenta_ebd,papel_ebd,atuacao,atuacao_especifico').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qMembros = qMembros.eq('setor_id', currentUser.setor_id);
  else if (sid) qMembros = qMembros.eq('setor_id', sid);
  if (cid) qMembros = qMembros.eq('congregacao_id', cid);

  const qEventos = q('eventos').select('id,tipo,data,participante_ids,setor_id,congregacao_id,resumo').gte('data', freqFiltroInicio).lte('data', freqFiltroFim);
  const [{ data: membrosList, error: errMem }, { data: eventos }] = await Promise.all([qMembros, qEventos]);
  if (errMem) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${errMem.message}</p></div>`; return; }

  const membrosArr = membrosList || [], eventosList = eventos || [];
  const eventosSetor = sid ? eventosList.filter(e => e.setor_id === sid) : eventosList;
  const eventosBase = cid ? eventosSetor.filter(e => e.congregacao_id === cid) : eventosSetor;
  const totalEventos = eventosBase.length;
  const totalCultos = eventosBase.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length;

  const congNomeById = {};
  (congsList || []).forEach(c => congNomeById[c.id] = c.nome);
  const congIdsFaltantes = [...new Set(membrosArr.map(m => m.congregacao_id).filter(cId => cId && !congNomeById[cId]))];
  if (congIdsFaltantes.length) {
    const { data: extraCongs } = await q('congregacoes').select('id,nome').in('id', congIdsFaltantes);
    (extraCongs || []).forEach(c => congNomeById[c.id] = c.nome);
  }

  const freqData = membrosArr.map(m => {
    const evParticipou = eventosBase.filter(e => (e.participante_ids || []).includes(m.id));
    const cultosParticipou = evParticipou.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length;
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
    ${statCard(lc("clipboard-list", 14), 'ic-gold', totalEventos, 'Eventos', '')}${statCard(lc("church", 14), 'ic-blue', totalCultos, 'Cultos/Evangelismo', '')}${statCard(lc("users", 18), 'ic-teal', membrosArr.length, 'Membros', '')}${statCard(lc("trending-up", 14), 'ic-violet', freqData.length > 0 ? `${freqData[0]?.pctTotal || 0}%` : '—', 'Maior Freq.', freqData[0]?.nome?.split(' ')[0] || '')}
  </div>
  <div class="freq-legend"><span class="freq-leg-item"><span class="freq-dot" style="background:#14b8a6"></span>≥75%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f59e0b"></span>50–74%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f43f5e"></span>&lt;50%</span></div>
  <div class="freq-list">
    ${freqData.length ? freqData.map(m => {
      const corG = m.pctTotal >= 75 ? '#14b8a6' : m.pctTotal >= 50 ? '#f59e0b' : '#f43f5e';
      const corC = m.pctCultos >= 75 ? '#14b8a6' : m.pctCultos >= 50 ? '#f59e0b' : '#f43f5e';
      return `<div class="freq-item">
        <div class="freq-item-user"><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div><div class="fw5 fs-sm">${escHtml(m.nome)}</div><div class="fs-xs c3">${escHtml(m.cargo || '—')} · ${escHtml(m.congNome || '—')}</div>${m.atuacao ? `<span class="tag tag-violet" style="font-size:.6rem">${lc("shield", 12)} ${escHtml(m.atuacao)}</span>` : ''}${m.frequenta_ebd ? `<span class="tag tag-blue" style="font-size:.6rem">${lc("book-open", 14)} EBD ${m.papel_ebd ? '· ' + m.papel_ebd : ''}</span>` : ''}</div></div>
        <div class="freq-item-bars">
          <div class="freq-bar-row"><span class="freq-bar-label">Geral</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${m.pctTotal}%;background:${corG}"></div></div><span class="freq-pct" style="color:${corG}">${m.pctTotal}%</span></div>
          <div class="freq-bar-row"><span class="freq-bar-label">Cultos</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${m.pctCultos}%;background:${corC}"></div></div><span class="freq-pct" style="color:${corC}">${m.pctCultos}%</span></div>
        </div>
        <div class="freq-item-info"><span class="tag fs-xs">${m.totalParticipou}/${totalEventos} ev.</span><span class="tag fs-xs">${m.cultosParticipou}/${totalCultos} cul.</span></div>
        <button class="btn btn-secondary btn-sm" onclick="openFreqDetalhe('${m.id}','${escHtml(m.nome)}')">Ver ${lc("arrow-right", 14)}</button>
      </div>`;
    }).join('') : `<div class="empty"><div class="empty-ico">${lc("trending-up", 44)}</div><p>Nenhum membro encontrado.</p></div>`}
  </div>
  <div class="chart-card" style="margin-bottom:28px"><h3>Top Membros por Frequência</h3><canvas id="chart-freq" height="80"></canvas></div>`;

  const top10 = freqData.slice(0, 10);
  const fCtx = document.getElementById('chart-freq');
  if (fCtx && top10.length) chartInstances.freq = new Chart(fCtx, { type: 'bar', data: { labels: top10.map(m => m.nome.split(' ')[0]), datasets: [{ label: 'Freq. Geral (%)', data: top10.map(m => m.pctTotal), backgroundColor: top10.map(m => m.pctTotal >= 75 ? 'rgba(20,184,166,.8)' : m.pctTotal >= 50 ? 'rgba(245,158,11,.8)' : 'rgba(244,63,94,.8)'), borderRadius: 8 }, { label: 'Freq. Cultos (%)', data: top10.map(m => m.pctCultos), backgroundColor: 'rgba(201,168,76,.4)', borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
  refreshLucide();
};

/* ───────────────────────────────────────────────────────────
   Detalhe do membro (lista de eventos em que participou)
   ─────────────────────────────────────────────────────────── */
window.openFreqDetalhe = async function (membroId, nome) {
  showModal(loadingPage());
  const { data: eventos } = await q('eventos').select('id,tipo,data,resumo,participante_ids').gte('data', freqFiltroInicio).lte('data', freqFiltroFim).order('data', { ascending: false });
  const participou = (eventos || []).filter(e => (e.participante_ids || []).includes(membroId));
  showModal(`<div class="modal-hdr"><span>${lc('user', 20)}</span><h2>${escHtml(nome)}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <p class="fs-xs c3" style="margin-bottom:10px">${participou.length} evento(s) no período de ${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}</p>
    <div class="act-list">
      ${participou.length ? participou.map(e => `<div class="act-item"><div class="act-dot" style="background:${dpTipoColor ? dpTipoColor(e.tipo) : '#4f8ef7'}"></div><div class="f1"><div class="fw5 fs-sm">${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(e.resumo || '')}</div></div><span class="act-time">${fmtDate(e.data)}</span></div>`).join('') : '<p class="c3" style="padding:16px">Nenhum evento no período.</p>'}
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};

/* ───────────────────────────────────────────────────────────
   Exportações — também baseadas em `membros`
   ─────────────────────────────────────────────────────────── */
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
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length;
  const congNome = id => (congs || []).find(c => c.id === id)?.nome || '—';
  const freqData = (membros || []).map(m => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(m.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length / totalCultos) * 100) : 0; return { nome: m.nome, cargo: m.cargo || '—', setorNome: (setores || []).find(s => s.id === m.setor_id)?.nome || '—', congregacao: congNome(m.congregacao_id), partTotal: evP.length, cultosPart: evP.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length, pctTotal, pctCultos }; }).sort((a, b) => b.pctTotal - a.pctTotal);
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
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length;
  const congNome = id => (congs || []).find(c => c.id === id)?.nome || '—';
  const rows = [['EclesiaSync — Frequência (Membros)'], ['Período:', `${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}`], ['Gerado em:', new Date().toLocaleString('pt-BR')], [], ['Membro', 'Cargo', 'Setor', 'Congregação', 'Freq. Geral (%)', 'Freq. Cultos (%)', 'Participações', 'Cultos', 'Total Eventos', 'Total Cultos']];
  (membros || []).forEach(m => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(m.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length / totalCultos) * 100) : 0; rows.push([m.nome, m.cargo || '—', (setores || []).find(s => s.id === m.setor_id)?.nome || '—', congNome(m.congregacao_id), pctTotal, pctCultos, evP.length, evP.filter(e => ['culto', 'evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao', 'oracao'].includes(e.tipo)).length, totalEv, totalCultos]); });
  rows.push([]); rows.push(['Data', 'Tipo', 'Resumo', 'Participantes']);
  eventosBase.forEach(e => { const nomes = (e.participante_ids || []).map(mid => { const m = (membros || []).find(x => x.id === mid); return m ? m.nome : '(ext)'; }).join('; '); rows.push([fmtDate(e.data), tipoLabel(e.tipo), e.resumo || '—', nomes || 'Nenhum']); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `EclesiaSync-Frequencia-${freqFiltroInicio}-${freqFiltroFim}.csv`; a.click(); URL.revokeObjectURL(url); toast('Excel gerado!');
};

console.log('[patch_frequencia_membros] carregado ✓ (base: membros, não usuários)');