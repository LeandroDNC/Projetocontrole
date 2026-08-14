// UMADALPE_TIPOS_OCULTOS e UMADALPE_TIPOS_EVANGELISTICOS já são declarados
// em adicao.js (carregado antes deste arquivo, com os mesmos valores) —
// redeclará-los aqui com "const" quebrava o carregamento deste script
// inteiro (SyntaxError: identificador já declarado), fazendo nada do que
// vem abaixo (menu de eventos, campos, relatório) rodar de verdade.

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
  TIPOS_EVENTO['convocacao_superintendencia'] = { label: 'Evento da Superintendência', grupo: 'Eventos', icon: 'megaphone' };
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
const _origRenderRelatorios2 = window.renderRelatorios;
window.renderRelatorios = async function () {
  if (typeof _origRenderRelatorios2 === 'function') await _origRenderRelatorios2();
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







