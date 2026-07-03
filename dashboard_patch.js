/* ═══════════════════════════════════════════════════════════
   EclesiaSync · dashboard_patch.js v1.1
   ═══════════════════════════════════════════════════════════ */

/* ── helpers ─────────────────────────────────────────────── */
const dp = {
  esc: s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  fmtD: d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—',
  fmtM: v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0),
  db: ()=>typeof db!=='undefined'?db:window.db||null,
  hoje: ()=>new Date().toISOString().slice(0,10),
  isFuturo: d=>d>dp.hoje(),
  isPendente: d=>d<=dp.hoje(),
};

/* ── FIX 3: dpLoadingMini estava ausente — causava erro e loop no dashboard ── */
function dpLoadingMini(){
  return `<div class="loading-page" style="padding:20px"><div class="spinner"></div></div>`;
}

/* ══════════════════════════════════════════════════════════
   1. SOBRESCREVE renderDashboard
══════════════════════════════════════════════════════════ */
window.renderDashboard = async function() {
  if(typeof hasPerm==='function'&&!hasPerm('visualizar_dashboard')&&!(typeof isSuperAdmin==='function'&&isSuperAdmin())){
    document.getElementById('page-content').innerHTML=`<div class="empty"><div class="empty-ico">🔐</div><p>Sem permissão para acessar o dashboard.</p></div>`;
    return;
  }
  const pc=document.getElementById('page-content');
  pc.innerHTML=`<div class="loading-page"><div class="spinner"></div><span>Carregando dados...</span></div>`;

  const client=dp.db();
  if(!client){pc.innerHTML=`<div class="empty"><div class="empty-ico">⚠</div><p>Banco não disponível.</p></div>`;return;}

  const now=new Date();
  const mesAtual=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const inicioMes=`${mesAtual}-01`;
  const fimMes=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10);
  const hoje=dp.hoje();
  const em7=new Date(Date.now()+7*86400000).toISOString().slice(0,10);

  const sid=window.dashSetorFiltro||window.currentUser?.setor_id||null;
  const cid=window.dashCongFiltro||null;

  const canFin=typeof canSeeFinanceiro==='function'?canSeeFinanceiro():false;

  let qSet=client.from('setores').select('id',{count:'exact',head:true});
  let qCong=client.from('congregacoes').select('id',{count:'exact',head:true});
  let qMem=client.from('membros').select('id',{count:'exact',head:true});
  let qEv=client.from('eventos').select('*').eq('status','publicado').order('data',{ascending:false});
  let qEvM=client.from('eventos').select('*').eq('status','publicado').gte('data',inicioMes).lte('data',fimMes);
  let qAg=client.from('agenda_semana').select('*,congregacoes(nome)').gte('data',hoje).lte('data',em7).order('data');

  if(sid){qSet=qSet.eq('id',sid);qCong=qCong.eq('setor_id',sid);qMem=qMem.eq('setor_id',sid);qEv=qEv.eq('setor_id',sid);qEvM=qEvM.eq('setor_id',sid);qAg=qAg.eq('setor_id',sid);}
  if(cid){qCong=qCong.eq('id',cid);qMem=qMem.eq('congregacao_id',cid);qEv=qEv.eq('congregacao_id',cid);qEvM=qEvM.eq('congregacao_id',cid);qAg=qAg.eq('congregacao_id',cid);}

  const [{data:allSetores}]=await Promise.all([
    client.from('setores').select('id,nome').order('nome'),
  ]);

  const [rSet,rCong,rMem,rEv,rEvM,{data:agItems}]=await Promise.all([qSet,qCong,qMem,qEv,qEvM,qAg.limit(10)]);

  const eventos=rEv.data||[];
  const eventosMes=rEvM.data||[];
  const totalOferMes=eventosMes.reduce((s,e)=>s+(e.ofertas||0),0);
  const totalDizMes=eventosMes.reduce((s,e)=>s+(e.dizimos||0),0);
  const totalConvMes=eventosMes.reduce((s,e)=>s+(e.conversoes||0),0);
  const totalPartMes=eventosMes.reduce((s,e)=>s+(e.participantes||0),0);
  const nomeMes=now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const canFS=typeof canFilterSetores==='function'?canFilterSetores():false;
  const canFC=typeof canFilterCong==='function'?canFilterCong():false;
  const congsList=sid?(await client.from('congregacoes').select('id,nome').eq('setor_id',sid).order('nome')).data||[]:[];

  const setorSel=canFS?`
  <div class="dash-setor-selector">
    <label class="selector-label">📍 Setor</label>
    <select class="selector-select" onchange="window.dashSetorFiltro=this.value||window.currentUser?.setor_id||null;window.dashCongFiltro=null;renderDashboard()">
      ${(allSetores||[]).map(s=>`<option value="${s.id}" ${s.id===sid?'selected':''}>${dp.esc(s.nome)}</option>`).join('')}
    </select>
    ${canFC&&congsList.length?`<label class="selector-label" style="margin-left:8px">⛪</label>
    <select class="selector-select" onchange="window.dashCongFiltro=this.value||null;renderDashboard()">
      <option value="">Todas</option>
      ${congsList.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${dp.esc(c.nome)}</option>`).join('')}
    </select>`:''}
    <span class="selector-badge">Somente visualização</span>
  </div>`:`<div class="dash-setor-locked"><span>📍</span> ${dp.esc((allSetores||[]).find(s=>s.id===sid)?.nome||'Meu Setor')} <span class="tag tag-blue" style="font-size:.65rem">fixo</span></div>`;

  /* ── FIX 1: conflito de merge resolvido — usa lc() do script_v5.js ── */
  const btnRefresh=typeof lc==='function'
    ?`<button class="btn btn-secondary btn-sm" title="Atualizar dados" onclick="renderDashboard()" style="margin-left:4px;font-size:1rem;padding:6px 10px">${lc('refresh-cw',16)}</button>`
    :`<button class="btn btn-secondary btn-sm" title="Atualizar dados" onclick="renderDashboard()" style="margin-left:4px;font-size:1rem;padding:6px 10px">🔄</button>`;

  /* ── Verifica permissão de eventos setoriais ── */
  const podeVerEvSetoriais=(typeof hasPerm==='function'&&(hasPerm('visualizar_eventos_setoriais_dash')))||(typeof isSuperAdmin==='function'&&isSuperAdmin());

  pc.innerHTML=`
  <div class="dash-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div>
        <h2 class="dash-title">Bem-vindo, ${dp.esc((window.currentUser?.nome||'').split(' ')[0])} </h2>
        <p class="dash-sub">${dp.esc((allSetores||[]).find(s=>s.id===sid)?.nome||'')}${cid&&congsList.find(c=>c.id===cid)?' › '+dp.esc(congsList.find(c=>c.id===cid).nome):''}</p>
      </div>
      ${btnRefresh}
    </div>
    <div class="dash-period">
      ${setorSel}
      <span class="tag tag-gold">📅 ${nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)}</span>
    </div>
  </div>

  <!-- CARDS GRANDES -->
  <div class="stats-grid stats-4" style="cursor:pointer">
    <div class="stat-card stat-clickable" onclick="dpNavSetores()" title="Ver congregações">
      <div class="stat-ico ic-gold">🏙</div>
      <div><div class="stat-val">${rSet.count||0}</div><div class="stat-lbl">Setores</div><div class="stat-chg">↑ clique para ver</div></div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavCongs()" title="Ver congregações do setor">
      <div class="stat-ico ic-blue">⛪</div>
      <div><div class="stat-val">${rCong.count||0}</div><div class="stat-lbl">Congregações</div><div class="stat-chg">↑ clique para ver</div></div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavMembros()" title="Ver membros da minha congregação">
      <div class="stat-ico ic-teal">👥</div>
      <div><div class="stat-val">${rMem.count||0}</div><div class="stat-lbl">Membros</div><div class="stat-chg">↑ clique para ver</div></div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()" title="Ver eventos">
      <div class="stat-ico ic-violet">📋</div>
      <div><div class="stat-val">${eventosMes.length}</div><div class="stat-lbl">Eventos</div><div class="stat-chg">↑ clique para ver</div></div>
    </div>
  </div>

  <!-- RESUMO DO MÊS -->
  <div class="sec-hdr" style="margin-top:4px"><h2>Resumo do Mês</h2><span class="tag tag-gold">Tempo real</span></div>
  <div class="stats-grid stats-4" style="margin-bottom:28px;cursor:pointer">
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()">
      <div class="stat-ico ic-blue">👥</div>
      <div><div class="stat-val">${totalPartMes}</div><div class="stat-lbl">Participantes</div><div class="stat-chg">↑ este mês</div></div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpScrollEventos()">
      <div class="stat-ico ic-violet">✝</div>
      <div><div class="stat-val">${totalConvMes}</div><div class="stat-lbl">Conversões</div><div class="stat-chg">↑ este mês</div></div>
    </div>
    ${canFin?`
    <div class="stat-card stat-clickable" onclick="if(typeof navigate==='function')navigate('relatorios')">
      <div class="stat-ico ic-teal">💰</div>
      <div><div class="stat-val" style="font-size:1.1rem">${dp.fmtM(totalOferMes)}</div><div class="stat-lbl">Ofertas</div><div class="stat-chg">↑ este mês</div></div>
    </div>
    <div class="stat-card stat-clickable" onclick="if(typeof navigate==='function')navigate('relatorios')">
      <div class="stat-ico ic-gold">💎</div>
      <div><div class="stat-val" style="font-size:1.1rem">${dp.fmtM(totalDizMes)}</div><div class="stat-lbl">Dízimos</div><div class="stat-chg">↑ este mês</div></div>
    </div>`:''}
  </div>

  <!-- GRÁFICOS -->
  <div class="charts-grid" style="margin-bottom:28px">
    <div class="chart-card chart-span2"><h3>Participantes por Mês</h3><p>Acumulado do ano</p><canvas id="chart-dash-line" height="100"></canvas></div>
    <div class="chart-card"><h3>Tipos de Eventos</h3><p>Distribuição</p><canvas id="chart-dash-bar" height="180"></canvas></div>
    ${canFin?`<div class="chart-card"><h3>Financeiro do Mês</h3><p>Ofertas vs Dízimos</p><canvas id="chart-dash-fin" height="180"></canvas></div>`:''}
  </div>

  <!-- AGENDA -->
  <div class="sec-hdr"><h2>📅 Agenda da Semana</h2><span class="tag">Próximos 7 dias</span></div>
  <div class="agenda-strip" style="margin-bottom:28px">${dpAgendaStrip(agItems||[])}</div>

  <!-- EVENTOS SETORIAIS (só aparece se tiver permissão) -->
  ${podeVerEvSetoriais?`
  <div class="sec-hdr"><h2>🏙 Eventos Setoriais</h2><span class="tag tag-gold">Inclui futuros</span></div>
  <div id="dash-eventos-setoriais" class="act-list" style="margin-bottom:28px">${dpLoadingMini()}</div>
  `:''}

  <!-- EVENTOS RECENTES -->
  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="if(typeof navigate==='function')navigate('relatorios')">Ver todos →</button>
  </div>
  <div class="act-list">
    ${eventos.slice(0,8).map(e=>`
      <div class="act-item" style="flex-wrap:wrap;gap:6px">
        <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>
        <div class="f1">
          <div class="fw5">${dpTipoIcon(e.tipo)} ${dp.esc(dpTipoLabel(e.tipo))}</div>
          <div class="fs-xs c3">${dp.esc(e.resumo||'')}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          <span class="tag">👥 ${e.participantes||0}</span>
          ${e.conversoes?`<span class="tag tag-teal">✝ ${e.conversoes}</span>`:''}
          ${canFin&&e.ofertas?`<span class="tag tag-gold">💰 ${dp.fmtM(e.ofertas)}</span>`:''}
          ${canFin&&e.dizimos?`<span class="tag tag-gold">💎 ${dp.fmtM(e.dizimos)}</span>`:''}
        </div>
        <span class="act-time">${dp.fmtD(e.data)}</span>
      </div>`).join('')||'<p class="c3" style="padding:16px">Nenhum evento publicado.</p>'}
  </div>`;

  // Charts
  if(typeof Chart!=='undefined'){
    const byMonth=Array(12).fill(0);
    eventos.forEach(e=>{const m=new Date(e.data+'T00:00:00').getMonth();byMonth[m]+=(e.participantes||0);});
    const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const lCtx=document.getElementById('chart-dash-line');
    if(lCtx) new Chart(lCtx,{type:'line',data:{labels:meses,datasets:[{label:'Participantes',data:byMonth,borderColor:'var(--gold)',backgroundColor:'rgba(201,168,76,.1)',tension:.4,fill:true,pointRadius:4,pointBackgroundColor:'var(--gold)'}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.03)'}},y:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.05)'}}}}});
    const cultos=eventos.filter(e=>e.tipo==='culto').length;
    const genEvt=eventos.filter(e=>e.tipo==='evento').length;
    const saidas=eventos.filter(e=>e.tipo==='saida').length;
    const outros=eventos.length-cultos-genEvt-saidas;
    const bCtx=document.getElementById('chart-dash-bar');
    if(bCtx) new Chart(bCtx,{type:'doughnut',data:{labels:['Cultos','Eventos','Saídas','Outros'],datasets:[{data:[cultos,genEvt,saidas,outros],backgroundColor:['rgba(201,168,76,.8)','rgba(59,130,246,.8)','rgba(20,184,166,.8)','rgba(139,92,246,.8)'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8'},position:'bottom'}},cutout:'60%'}});
    if(canFin){
      const fCtx=document.getElementById('chart-dash-fin');
      if(fCtx) new Chart(fCtx,{type:'bar',data:{labels:['Ofertas','Dízimos','Total'],datasets:[{data:[totalOferMes,totalDizMes,totalOferMes+totalDizMes],backgroundColor:['rgba(201,168,76,.8)','rgba(20,184,166,.7)','rgba(139,92,246,.7)'],borderRadius:8}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.03)'}},y:{ticks:{color:'#94a3b8',callback:v=>'R$'+v.toLocaleString()},grid:{color:'rgba(255,255,255,.05)'}}}}});
    }
  }

  // Carrega eventos setoriais de forma assíncrona (não bloqueia o render)
  if(podeVerEvSetoriais){
    const esContainer=document.getElementById('dash-eventos-setoriais');
    if(esContainer){
      try{
        const vetodosSetores=(typeof canSeeAllSetores==='function'&&canSeeAllSetores())||(typeof isSuperAdmin==='function'&&isSuperAdmin());
        let qES=client.from('eventos').select('*').eq('tipo','evento_setorial').order('data',{ascending:true}).limit(15);
        if(!vetodosSetores && window.currentUser?.setor_id){
          qES=qES.eq('setor_id',window.currentUser.setor_id);
        }
        const {data:eventosSetoriais}=await qES;
        const {data:setoresES}=await client.from('setores').select('id,nome');
        const setorNomeES=id=>(setoresES||[]).find(s=>s.id===id)?.nome||'—';
        const hojeStr=new Date().toISOString().slice(0,10);

        esContainer.innerHTML=(eventosSetoriais||[]).length?(eventosSetoriais||[]).map(e=>{
          const futuro=e.data>hojeStr;
          return `<div class="act-item">
            <div class="act-dot" style="background:${futuro?'#3b82f6':'var(--gold)'}"></div>
            <div class="f1">
              <div class="fw5">🏙 ${dp.esc(e.resumo||'Evento Setorial')}</div>
              <div class="fs-xs c3">${dp.esc(setorNomeES(e.setor_id))}${futuro?' · <span style="color:#3b82f6;font-weight:600">Agendado</span>':''}</div>
            </div>
            <span class="tag">${e.participantes||0} pessoas</span>
            <span class="act-time">${dp.fmtD(e.data)}</span>
          </div>`;
        }).join(''):'<p class="c3" style="padding:16px;text-align:center">Nenhum evento setorial.</p>';
      }catch(err){
        const esC=document.getElementById('dash-eventos-setoriais');
        if(esC) esC.innerHTML='<p class="c3" style="padding:16px;text-align:center">Erro ao carregar eventos setoriais.</p>';
      }
    }
  }
};

/* ── AÇÕES DOS CARDS GRANDES ────────────────────────────── */
window.dpNavSetores = function(){
  if(typeof navigate==='function') navigate('setores');
};

window.dpNavCongs = function(){
  const sid=window.currentUser?.setor_id;
  if(!sid){ if(typeof navigate==='function') navigate('setores'); return; }
  if(typeof navState!=='undefined'&&typeof renderSetores==='function'){
    const setor=window.currentUserSetor||{id:sid,nome:'Meu Setor'};
    window.navState={view:'congregacoes',setor,cong:null};
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page==='setores'));
    document.getElementById('page-title').textContent='Setores';
    renderSetores();
  } else {
    if(typeof navigate==='function') navigate('setores');
  }
};

window.dpNavMembros = function(){
  const cong=window.currentUserCong;
  const setor=window.currentUserSetor||{id:window.currentUser?.setor_id,nome:'Meu Setor'};
  if(cong&&typeof navState!=='undefined'&&typeof renderSetores==='function'){
    window.navState={view:'congregacao',setor,cong};
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page==='setores'));
    document.getElementById('page-title').textContent='Setores';
    renderSetores();
  } else if(typeof navigate==='function'){
    navigate('setores');
  }
};

window.dpScrollEventos = function(){
  const el=document.getElementById('dash-eventos-section');
  if(el) el.scrollIntoView({behavior:'smooth'});
};

/* ── HELPERS INTERNOS ────────────────────────────────────── */
function dpAgendaStrip(items){
  if(!items.length) return `<div class="agenda-empty"><span>📭</span><p>Nenhum evento agendado para os próximos 7 dias</p></div>`;
  return items.map(item=>`
    <div class="agenda-item">
      <div class="agenda-date">
        <span class="ag-day">${new Date(item.data+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span>
        <span class="ag-num">${new Date(item.data+'T00:00:00').getDate()}</span>
      </div>
      <div class="agenda-body">
        <div class="fw5 fs-sm">${dp.esc(item.titulo||'')}</div>
        <div class="fs-xs c3">${dp.esc(item.descricao||'')} ${item.congregacoes?`· ${dp.esc(item.congregacoes.nome)}`:''}</div>
      </div>
      ${item.hora?`<span class="tag">${item.hora}</span>`:''}
    </div>`).join('');
}

const TIPO_COLORS={culto:'var(--gold)',ebd:'#38bdf8',evento:'var(--blue)',evento_setorial:'#a78bfa',saida:'var(--teal)',culto_ar_livre:'#fb923c',ponto_pregacao:'#a78bfa'};
function dpTipoColor(t){ return TIPO_COLORS[t]||'#64748b'; }
function dpTipoIcon(t){
  const m={culto:'⛪',ebd:'📖',evento:'🎉',evento_setorial:'🏙',saida:'🚶',visita_enfermos:'🏥',visita_desviados:'🔍',visita_detidos:'🔒',visita_convertidos:'✝',culto_ar_livre:'🌤',ponto_pregacao:'📢',desviados_voltaram:'🙏',presentes_oracao:'🙌',convocacoes_atendidas:'✅'};
  return m[t]||'📋';
}
function dpTipoLabel(t){
  if(typeof tipoLabel==='function') return tipoLabel(t);
  const m={culto:'Culto',ebd:'EBD',evento:'Evento',evento_setorial:'Evento Setorial',saida:'Saída Evangelística'};
  return m[t]||t||'—';
}

/* ══════════════════════════════════════════════════════════
   2. CSS inline
══════════════════════════════════════════════════════════ */
(function injectCSS(){
  if(document.getElementById('dp-styles')) return;
  const style=document.createElement('style');
  style.id='dp-styles';
  style.textContent=`
    .stat-clickable { cursor:pointer; }
    .stat-clickable:hover { border-color:var(--gold) !important; transform:translateY(-4px); box-shadow:0 0 28px rgba(201,168,76,.18); }
    .stat-clickable:hover .stat-ico { transform:scale(1.08); transition:transform .2s; }
    .stat-clickable .stat-chg { color:var(--txt3); font-size:.68rem; }
    .stat-clickable:hover .stat-chg { color:var(--gold); }
    .ev-status-badge { display:inline-block; font-size:.65rem; font-weight:700; padding:2px 8px; border-radius:99px; }
    .ev-status-rascunho  { background:rgba(100,116,139,.15); color:#64748b; }
    .ev-status-pendente  { background:rgba(245,158,11,.15); color:#f59e0b; border:1px solid rgba(245,158,11,.3); }
    .ev-status-publicado { background:rgba(20,184,166,.15); color:#14b8a6; }
    .futuro-notice { background:rgba(59,130,246,.07); border:1px solid rgba(59,130,246,.2); border-radius:10px; padding:12px 16px; margin-bottom:14px; font-size:.82rem; color:#93c5fd; display:flex; align-items:center; gap:8px; }
    .btn-publicar { background:linear-gradient(135deg,#14b8a6,#0d9488); color:#fff; border:none; border-radius:var(--r2); padding:8px 18px; font-size:.82rem; font-weight:700; cursor:pointer; transition:var(--ease); display:inline-flex; align-items:center; gap:6px; }
    .btn-publicar:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(20,184,166,.3); }
  `;
  document.head.appendChild(style);
})();

/* ══════════════════════════════════════════════════════════
   3. SOBRESCREVE submitEvento
══════════════════════════════════════════════════════════ */
window.submitEvento = async function(tipo){
  if(typeof hasPerm==='function'&&!hasPerm('registrar_eventos')){ if(typeof toast==='function') toast('Sem permissão','error'); return; }
  const dataEv=document.getElementById('ev-data')?.value;
  if(!dataEv){ if(typeof toast==='function') toast('Data é obrigatória','error'); return; }

  const futuro=dp.isFuturo(dataEv);
  const status=futuro?'rascunho':'pendente';

  const localChecked=futuro?[]:[...document.querySelectorAll('.ev-mem-check:checked')].map(c=>c.value);
  const extChecked=futuro?[]:[...document.querySelectorAll('.ev-ext-check:checked')].map(c=>c.value);
  const participanteIds=[...localChecked,...extChecked];

  const canFin=typeof canSeeFinanceiro==='function'?canSeeFinanceiro():false;
  const client=dp.db(); if(!client) return;

  const payload={
    congregacao_id:typeof navState!=='undefined'?navState.cong?.id:null,
    setor_id:typeof navState!=='undefined'?navState.setor?.id:null,
    tipo, data:dataEv, status,
    resumo:(document.getElementById('ev-resumo')?.value||'').trim(),
    participantes:futuro?0:(parseInt(document.getElementById('ev-participantes')?.value)||participanteIds.length||0),
    hora_inicio:document.getElementById('ev-inicio')?.value||null,
    hora_fim:document.getElementById('ev-fim')?.value||null,
    conversoes:futuro?0:(parseInt(document.getElementById('ev-conversoes')?.value)||0),
    ofertas:futuro?0:(canFin?parseFloat(document.getElementById('ev-ofertas')?.value)||0:0),
    dizimos:futuro?0:(canFin?parseFloat(document.getElementById('ev-dizimos')?.value)||0:0),
    evangelizados:futuro?0:(parseInt(document.getElementById('ev-evangelizados')?.value)||0),
    participante_ids:participanteIds,
    almas_salvas:futuro?0:(parseInt(document.getElementById('ev-almas-salvas')?.value)||0),
    batismo_espirito:futuro?0:(parseInt(document.getElementById('ev-batismo-espirito')?.value)||0),
    renovo:futuro?0:(parseInt(document.getElementById('ev-renovo')?.value)||0),
    bencaos_alcancadas:futuro?0:(parseInt(document.getElementById('ev-bencaos')?.value)||0),
    desviados_voltaram_campo:futuro?0:(parseInt(document.getElementById('ev-desviados')?.value)||0),
    literaturas_distribuidas:futuro?0:(parseInt(document.getElementById('ev-literaturas')?.value)||0),
    tema_licao:(document.getElementById('ev-tema-licao')?.value||'').trim()||null,
    referencia_biblica:(document.getElementById('ev-referencia')?.value||'').trim()||null,
  };

  const {error}=await client.from('eventos').insert(payload);
  if(error){ if(typeof toast==='function') toast(error.message,'error'); return; }

  const msg=futuro
    ?'Evento agendado como rascunho. Não conta para estatísticas até ser publicado.'
    :'Evento registrado! Clique em "Publicar" quando estiver pronto.';
  if(typeof toast==='function') toast(msg,'info');
  if(typeof closeModal==='function') closeModal();
  if(typeof renderSetores==='function') renderSetores();
};

/* ── PUBLICAR EVENTO ────────────────────────────────────── */
window.publicarEvento = async function(id){
  const client=dp.db(); if(!client) return;
  if(dp.isFuturo((await client.from('eventos').select('data').eq('id',id).single()).data?.data||'')){
    if(typeof toast==='function') toast('Não é possível publicar um evento futuro','error'); return;
  }
  const {error}=await client.from('eventos').update({status:'publicado'}).eq('id',id);
  if(error){ if(typeof toast==='function') toast(error.message,'error'); return; }
  if(typeof toast==='function') toast('Evento publicado! Agora aparece nas estatísticas.');
  if(typeof renderSetores==='function') renderSetores();
};

/* ── PATCH: openEventModal — aviso para eventos futuros ── */
const _origOpenEventModal=window.openEventModal;
window.openEventModal = async function(tipo){
  if(typeof _origOpenEventModal==='function') await _origOpenEventModal(tipo);
  const patchFuturoCheck=()=>{
    const dataInput=document.getElementById('ev-data');
    if(!dataInput) return;
    const updateAviso=()=>{
      const existente=document.getElementById('futuro-notice');
      if(existente) existente.remove();
      if(dp.isFuturo(dataInput.value)){
        const notice=document.createElement('div');
        notice.id='futuro-notice';
        notice.className='futuro-notice';
        notice.innerHTML='🔒 <strong>Evento futuro:</strong> Participantes e dados não podem ser preenchidos agora. Registre como rascunho e publique após a realização.';
        dataInput.parentElement.parentElement.insertBefore(notice,dataInput.parentElement.nextSibling);
        document.querySelectorAll('.ev-mem-check,.ev-ext-check').forEach(el=>el.disabled=true);
        document.querySelectorAll('#ev-participantes,#ev-conversoes,#ev-ofertas,#ev-dizimos,#ev-evangelizados,#ev-almas-salvas,#ev-batismo-espirito,#ev-renovo,#ev-bencaos,#ev-desviados,#ev-literaturas').forEach(el=>{if(el){el.disabled=true;el.value=0;}});
      } else {
        document.querySelectorAll('.ev-mem-check,.ev-ext-check').forEach(el=>el.disabled=false);
        document.querySelectorAll('#ev-participantes,#ev-conversoes,#ev-ofertas,#ev-dizimos,#ev-evangelizados,#ev-almas-salvas,#ev-batismo-espirito,#ev-renovo,#ev-bencaos,#ev-desviados,#ev-literaturas').forEach(el=>{if(el) el.disabled=false;});
      }
    };
    dataInput.addEventListener('change',updateAviso);
    updateAviso();
  };
  setTimeout(patchFuturoCheck,100);
};

/* ── PATCH: renderCongregacao — badge ranking ── */
const _origRenderCong=window.renderCongregacao;
window.renderCongregacao = async function(pc){
  if(typeof _origRenderCong==='function') await _origRenderCong(pc);
  if(typeof window.navState!=='undefined'&&window.navState.cong?.id&&typeof getRankingNivel==='function'){
    getRankingNivel(window.navState.cong.id).then(nivel=>{
      if(!nivel) return;
      const cor={verde:'#14b8a6',amarelo:'#f59e0b',vermelho:'#f43f5e'}[nivel]||'#64748b';
      const emoji={verde:'🟢',amarelo:'🟡',vermelho:'🔴'}[nivel]||'⚪';
      const badge=document.createElement('span');
      badge.style.cssText=`background:${cor}22;color:${cor};border:1px solid ${cor}44;border-radius:99px;padding:3px 12px;font-size:.75rem;font-weight:700;margin-left:8px`;
      badge.textContent=`${emoji} Ranking: ${nivel.charAt(0).toUpperCase()+nivel.slice(1)}`;
      const h2=pc.querySelector('.sec-hdr h2');
      if(h2) h2.appendChild(badge);
    });
  }
};

/* ── PATCH: renderCongregacao — mostrar eventos pendentes ── */
const _origRenderCongFull=window.renderCongregacao;
window.renderCongregacao = async function(pc){
  if(typeof _origRenderCongFull==='function') await _origRenderCongFull(pc);
  if(typeof navState==='undefined'||!navState.cong?.id) return;
  const client=dp.db(); if(!client) return;
  try{
    const {data:pendentes}=await client.from('eventos').select('*')
      .eq('congregacao_id',navState.cong.id)
      .in('status',['pendente','rascunho'])
      .order('data',{ascending:false});
    if(!pendentes?.length) return;
    const section=document.createElement('div');
    section.innerHTML=`
    <div class="sec-hdr" style="margin-top:20px">
      <h2>⏳ Pendentes de Publicação <span class="count-badge">${pendentes.length}</span></h2>
      <span class="tag tag-gold">Não contam para estatísticas</span>
    </div>
    <div class="act-list" style="margin-bottom:28px">
      ${pendentes.map(e=>{
        const futuro=dp.isFuturo(e.data);
        const statusLabel=futuro?'Rascunho (futuro)':'Pendente de Publicação';
        const statusCor=futuro?'#64748b':'#f59e0b';
        return `<div class="act-item" style="border-left:2px solid ${statusCor}">
          <div class="act-dot" style="background:${statusCor}"></div>
          <div class="f1">
            <div class="fw5">${dpTipoIcon(e.tipo)} ${dp.esc(dpTipoLabel(e.tipo))}</div>
            <div class="fs-xs c3">${dp.esc(e.resumo||'—')} · ${dp.fmtD(e.data)}</div>
          </div>
          <span style="background:${statusCor}22;color:${statusCor};border:1px solid ${statusCor}44;border-radius:99px;padding:2px 8px;font-size:.65rem;font-weight:700">${statusLabel}</span>
          ${!futuro&&(typeof hasPerm!=='function'||hasPerm('registrar_eventos'))?`<button class="btn-publicar" onclick="publicarEvento('${e.id}')">✅ Publicar</button>`:''}
          ${typeof hasPerm==='function'&&hasPerm('excluir_registros')?`<button class="btn btn-danger btn-sm" onclick="delEvento('${e.id}')">🗑</button>`:''}
        </div>`;
      }).join('')}
    </div>`;
    pc.appendChild(section);
  }catch(e){ console.warn('pendentes:',e); }
};

console.log('[dashboard_patch v1.1] carregado ✓');