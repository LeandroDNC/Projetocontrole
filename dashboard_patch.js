/* ═══════════════════════════════════════════════════════════
   EclesiaSync · dashboard_patch.js v2.0
   ═══════════════════════════════════════════════════════════ */

/* ── helpers ─────────────────────────────────────────────── */
const dp = {
  esc: s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  fmtD: d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—',
  fmtM: v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0),
  db: ()=>typeof db!=='undefined'?db:window.db||null,
  hoje: ()=>new Date().toISOString().slice(0,10),
  isFuturo: d=>d>dp.hoje(),
};

function dpLoadingMini(){
  return `<div class="loading-page" style="padding:20px"><div class="spinner"></div></div>`;
}

/* ── Ícones SVG modernos (sem emoji) ─────────────────────── */
const SVG = {
  map:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  church:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M10 4h4"/><path d="M4 22V10l8-6 8 6v12H4z"/><path d="M9 22v-6h6v6"/><path d="M4 10h16"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>`,
  people:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  cross:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M2 12h20"/></svg>`,
  coins:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
  gem:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9"/><polyline points="2 9 12 9 18 3"/><line x1="12" y1="22" x2="12" y2="9"/></svg>`,
  wallet:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h14v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><circle cx="16" cy="12" r="1"/></svg>`,
  chart:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  refresh:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  pin:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  trophy:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 3h12v8a6 6 0 0 1-12 0Z"/></svg>`,
  shield:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  freq:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  cityHall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 2 7h20L12 2z"/></svg>`,
  star:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

function ico(name, size=18, color='currentColor'){
  return `<span style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;color:${color}">${SVG[name]||''}</span>`;
}

/* ════════════════════════════════════════
   CSS INJETADO — cards 4 em linha, financeiro, etc
════════════════════════════════════════ */
(function injectCSS(){
  if(document.getElementById('dp-v2-styles')) return;
  const s=document.createElement('style');
  s.id='dp-v2-styles';
  s.textContent=`
  /* 4 cards em linha única sempre */
  .dash-top-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  @media(max-width:600px){
    .dash-top-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .dash-top-grid .stat-card { padding:12px 8px; gap:6px; flex-direction:column; align-items:flex-start; }
    .dash-top-grid .stat-ico  { width:34px; height:34px; font-size:14px; }
    .dash-top-grid .stat-val  { font-size:1.1rem; }
    .dash-top-grid .stat-lbl  { font-size:.62rem; }
    .dash-top-grid .stat-chg  { display:none; }
    .dash-top-grid .stat-ico svg { width:16px; height:16px; }
  }

  /* Layout financeiro: gauge esquerda, cards direita */
  .fin-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 24px;
  }
  .fin-right {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fin-card {
    background: var(--bg-card, rgba(18,24,48,.85));
    backdrop-filter: blur(16px);
    border: 1px solid rgba(79,142,247,.18);
    border-radius: 16px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    box-shadow: var(--shadow-card, 0 8px 32px rgba(79,142,247,.2));
    transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease;
    position: relative;
    overflow: hidden;
  }
  .fin-card::before {
    content:'';position:absolute;top:0;left:10%;right:10%;height:1px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent);
  }
  .fin-card:hover { transform:translateY(-4px); box-shadow:var(--shadow-hover,0 16px 48px rgba(79,142,247,.3)); }
  .fin-card-ico {
    width:46px;height:46px;border-radius:13px;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;
    box-shadow:0 4px 14px rgba(0,0,0,.2);
  }
  .fin-card-body { flex:1; min-width:0; }
  .fin-card-val  { font-size:1.15rem; font-weight:800; color:var(--txt,#eef2ff); line-height:1; }
  .fin-card-lbl  { font-size:.7rem; color:var(--txt2,#94a3b8); margin-top:3px; }
  .fin-card-sub  { font-size:.62rem; color:var(--txt3,#475569); margin-top:1px; }

  @media(max-width:600px){
    .fin-grid { grid-template-columns:1fr 1fr; }
   
.fin-card{
width:200%;
}
    .gauge-card{
    width:100%;}
     .fin-right{
    width:50%;
    
    }
  }

    @media(max-width:480px){
   .fin-grid{
   width:100%;
   gap:5px;
   }

    .gauge-card{
    width:100%;
    
    }
     .fin-right{
    width:50%;
    
    }
    .fin-card-ico{
    width:20%;
    height:10%;}
    .fin-card-val{
    font-size:80%;
    }

   grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin-bottom: 24px;

  }




   

  /* Resumo do mês (participantes + conversões) */
  .mes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  }
  @media(max-width:480px){
    .mes-grid { grid-template-columns:1fr 1fr; gap:8px; }
  }

  /* Gauge card */
  .gauge-card {
    background: linear-gradient(145deg, #1a3a8a, #2563eb, #4f8ef7);
    border-radius: 18px;
    padding: 22px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(37,99,235,.45), 0 8px 24px rgba(0,0,0,.4);
    transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease;
  }
  .gauge-card:hover { transform:translateY(-6px); box-shadow:0 28px 72px rgba(37,99,235,.58),0 12px 32px rgba(0,0,0,.5); }
  .gauge-card::before {
    content:'';position:absolute;top:-50px;right:-50px;
    width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.07);
  }
  .gauge-card::after {
    content:'';position:absolute;bottom:-40px;left:-40px;
    width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.05);
  }
  .gauge-svg   { width:150px;height:90px;overflow:visible;position:relative;z-index:1; }
  .gauge-track { fill:none;stroke:rgba(255,255,255,.15);stroke-width:9; }
  .gauge-fill  { fill:none;stroke-width:9;stroke-linecap:round;transition:stroke-dashoffset .9s ease; }
  .gauge-pct   { font-size:2.2rem;font-weight:900;color:#fff;line-height:1;position:relative;z-index:1; }
  .gauge-ico   { font-size:18px;position:relative;z-index:1;opacity:.9;width:26px;height:26px;display:flex;align-items:center;justify-content:center; }
  .gauge-label { font-size:.7rem;color:rgba(255,255,255,.65);text-align:center;position:relative;z-index:1; }
  .gauge-value { font-size:1.2rem;font-weight:800;color:#fff;position:relative;z-index:1; }
  .gauge-meta  { font-size:.65rem;color:rgba(255,255,255,.5);position:relative;z-index:1; }

  /* FIX 1: filtros sempre em linha horizontal */
  .dash-setor-selector {
    display: flex !important;
    flex-direction: column !important;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    background: var(--bg-card, rgba(18,24,48,.85));
    backdrop-filter: blur(12px);
    border: 1px solid var(--bdr, rgba(79,142,247,.18));
    border-radius: 12px;
    padding: 7px 13px;
    box-shadow: 0 4px 16px rgba(0,0,0,.15);
    overflow-x: auto;
  }
  .dash-period {
    display:flex;
    flex-direction: column !important;
    align-items: flex-start;
    gap: 8px;
    width: 100%
  }
  /* shortcuts modernos */
  .shortcut-ico svg { width:20px;height:20px; }

  /* stat-card icons svg */
  .stat-ico svg { width:20px;height:20px; }
  .fin-card-ico svg { width:20px;height:20px; }
  `;
  document.head.appendChild(s);
})();

/* ══════════════════════════════════════════════════════════
   RENDER DASHBOARD
══════════════════════════════════════════════════════════ */
window.renderDashboard = async function(){
  if(typeof hasPerm==='function'&&!hasPerm('visualizar_dashboard')&&!(typeof isSuperAdmin==='function'&&isSuperAdmin())){
    document.getElementById('page-content').innerHTML=`<div class="empty"><div class="empty-ico">${ico('shield',40)}</div><p>Sem permissão para acessar o dashboard.</p></div>`;
    return;
  }
  const pc=document.getElementById('page-content');
  pc.innerHTML=`<div class="loading-page"><div class="spinner"></div><span>Carregando...</span></div>`;

  const client=dp.db();
  if(!client){pc.innerHTML=`<div class="empty"><p>Banco não disponível.</p></div>`;return;}

  const now=new Date();
  const mesAtual=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const inicioMes=`${mesAtual}-01`;
  const fimMes=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10);
  const hoje=dp.hoje();
  const em7=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const hora=now.getHours();
  const saudacao=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';

  // FIX 3: setor do usuario sempre como padrao; so muda se ele trocou manualmente
  if(!window.dashSetorFiltroManual){
    window.dashSetorFiltro = window.currentUser?.setor_id || null;
  }
  const sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  const canFin=typeof canSeeFinanceiro==='function'?canSeeFinanceiro():false;
  const podeVerEvSetoriais=(typeof hasPerm==='function'&&hasPerm('visualizar_eventos_setoriais_dash'))||(typeof isSuperAdmin==='function'&&isSuperAdmin());

  const [{data:allSetores}]=await Promise.all([client.from('setores').select('id,nome').order('nome')]);

  let qSet=client.from('setores').select('id',{count:'exact',head:true});
  let qCong=client.from('congregacoes').select('id',{count:'exact',head:true});
  let qMem=client.from('membros').select('id',{count:'exact',head:true});
  let qEv=client.from('eventos').select('*').eq('status','publicado').order('data',{ascending:false});
  // FIX 2: inclui pendente + publicado para financeiro refletir imediatamente
  let qEvM=client.from('eventos').select('*').in('status',['publicado','pendente']).gte('data',inicioMes).lte('data',fimMes);
  let qAg=client.from('agenda_semana').select('*,congregacoes(nome)').gte('data',hoje).lte('data',em7).order('data');

  if(sid){qSet=qSet.eq('id',sid);qCong=qCong.eq('setor_id',sid);qMem=qMem.eq('setor_id',sid);qEv=qEv.eq('setor_id',sid);qEvM=qEvM.eq('setor_id',sid);qAg=qAg.eq('setor_id',sid);}
  if(cid){qCong=qCong.eq('id',cid);qMem=qMem.eq('congregacao_id',cid);qEv=qEv.eq('congregacao_id',cid);qEvM=qEvM.eq('congregacao_id',cid);qAg=qAg.eq('congregacao_id',cid);}

  const canFS=typeof canFilterSetores==='function'?canFilterSetores():false;
  const canFC=typeof canFilterCong==='function'?canFilterCong():false;
  const congsList=sid?(await client.from('congregacoes').select('id,nome').eq('setor_id',sid).order('nome')).data||[]:[];
  const [rSet,rCong,rMem,rEv,rEvM,{data:agItems}]=await Promise.all([qSet,qCong,qMem,qEv,qEvM,qAg.limit(10)]);

  const eventos=rEv.data||[];
  const eventosMes=rEvM.data||[];
  const totalOferMes=eventosMes.reduce((s,e)=>s+(e.ofertas||0),0);
  const totalDizMes=eventosMes.reduce((s,e)=>s+(e.dizimos||0),0);
  const totalConvMes=eventosMes.reduce((s,e)=>s+(e.conversoes||0),0);
  const totalPartMes=eventosMes.reduce((s,e)=>s+(e.participantes||0),0);
  const totalFinMes=totalOferMes+totalDizMes;
  const nomeMes=now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const hojeStr2 = new Date().toISOString().slice(0,10);
  const eventosFuturos = eventos.filter(e => e.data > hojeStr2);
  const eventosPassados = eventos.filter(e => e.data <= hojeStr2);

  // Gauge
  const metaFin=20000;
  const gaugePct=Math.min(100,Math.round(totalFinMes/metaFin*100));
  const gaugeR=56; const gaugeC=Math.PI*gaugeR;
  const gaugeDash=(gaugeC*gaugePct/100).toFixed(1);
  const gaugeGap=(gaugeC-gaugeC*gaugePct/100).toFixed(1);

  const setorSel=canFS?`
  <div class="dash-setor-selector">
    <span class="selector-label">${ico('pin',13)} Setor</span>
    <select class="selector-select" onchange="window.dashSetorFiltroManual=true;window.dashSetorFiltro=this.value||window.currentUser?.setor_id||null;window.dashCongFiltro=null;renderDashboard()">
      ${(allSetores||[]).map(s=>`<option value="${s.id}" ${s.id===sid?'selected':''}>${dp.esc(s.nome)}</option>`).join('')}
    </select>
    ${canFC&&congsList.length?`<select class="selector-select" onchange="window.dashCongFiltro=this.value||null;renderDashboard()">
      <option value="">Todas</option>
      ${congsList.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${dp.esc(c.nome)}</option>`).join('')}
    </select>`:''}
    <span class="selector-badge">visualização</span>
  </div>`:`<div class="dash-setor-locked">${ico('pin',14)} ${dp.esc((allSetores||[]).find(s=>s.id===sid)?.nome||'Meu Setor')}</div>`;

  pc.innerHTML=`
  <!-- HEADER -->
  <div class="dash-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div>
        <h2 class="dash-title">${saudacao}, ${dp.esc((window.currentUser?.nome||'').split(' ')[0])}!</h2>
        <p class="dash-sub">Aqui está o resumo da sua igreja.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="renderDashboard()" title="Atualizar" style="padding:6px 10px">${ico('refresh',15)}</button>
    </div>
    <div class="dash-period">
      ${setorSel}
      <span id="calenda" class="tag tag-primary">${ico('calendar',12)} ${nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)}</span>
    </div>
  </div>

  <!-- 4 CARDS TOPO — sempre em linha única -->
  <div class="dash-top-grid">
    <div class="stat-card stat-clickable" onclick="dpNavSetores()">
      <div class="stat-ico ic-gold">${SVG.map}</div>
      <div>
        <div class="stat-val">${rSet.count||0}</div>
        <div class="stat-lbl">Setores</div>
        <div class="stat-chg">Total</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavCongs()">
      <div class="stat-ico ic-blue">${SVG.church}</div>
      <div>
        <div class="stat-val">${rCong.count||0}</div>
        <div class="stat-lbl">Congregações</div>
        <div class="stat-chg">Total</div>
      </div>
    </div>
    <div class="stat-card stat-clickable" onclick="dpNavMembros()">
      <div class="stat-ico ic-teal">${SVG.users}</div>
      <div>
        <div class="stat-val">${rMem.count||0}</div>
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
    ${((typeof hasPerm==='function'&&(hasPerm('visualizar_ranking')||hasPerm('gerenciar_ranking')))||(typeof isSuperAdmin==='function'&&isSuperAdmin()))?`
    <div class="shortcut-btn" onclick="navigate('ranking')">
      <div class="shortcut-ico ic-gold">${SVG.trophy}</div><small>Ranking Mensal</small>
    </div>`:''}
    <div class="shortcut-btn" onclick="navigate('frequencia')">
      <div class="shortcut-ico ic-blue">${SVG.freq}</div><small>Frequência</small>
    </div>
    ${((typeof hasPerm==='function'&&hasPerm('editar_permissoes'))||(typeof isSuperAdmin==='function'&&isSuperAdmin()))?`
    <div class="shortcut-btn" onclick="navigate('permissoes')">
      <div class="shortcut-ico ic-teal">${SVG.shield}</div><small>Permissões</small>
    </div>`:''}
    ${canFin?`
    <div class="shortcut-btn" onclick="navigate('financeiro')">
      <div class="shortcut-ico ic-violet">${SVG.wallet}</div><small>Financeiro</small>
    </div>`:''}
  </div>
  <!-- RESUMO DO MÊS (participantes + conversões) -->
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

  ${canFin?`
  <!-- FINANCEIRO: gauge esquerda, cards direita -->
  <div class="sec-hdr"><h2>Financeiro do Mês</h2><span class="tag tag-gold">Acumulado</span></div>
  <div class="fin-grid">
    <!-- GAUGE CARD (esquerda, maior) -->
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
      <div class="gauge-ico">${ico('chart',22,'rgba(255,255,255,.8)')}</div>
      <div class="gauge-label">Valor Recebido</div>
      <div class="gauge-value">${dp.fmtM(totalFinMes)}</div>
      <div class="gauge-meta">Meta: ${dp.fmtM(metaFin)}</div>
    </div>
    <!-- OFERTAS + DÍZIMOS (direita, empilhados) -->
    <div class="fin-right">
      <div class="fin-card" onclick="openOfertasModal()" style="cursor:pointer">
        <div class="fin-card-ico ic-gold">${SVG.coins}</div>
        <div class="fin-card-body">
          <div class="fin-card-lbl">Ofertas</div>
          <div class="fin-card-val">${dp.fmtM(totalOferMes)}</div>
          <div class="fin-card-sub">Este mês</div>
        </div>
        <span class="tag tag-gold" style="font-size:.6rem;align-self:flex-start">+5%</span>
      </div>
      <div class="fin-card" onclick="openDizimosModal()" style="cursor:pointer">
        <div class="fin-card-ico ic-violet">${SVG.gem}</div>
        <div class="fin-card-body">
          <div class="fin-card-lbl">Dízimos</div>
          <div class="fin-card-val">${dp.fmtM(totalDizMes)}</div>
          <div class="fin-card-sub">Este mês</div>
        </div>
        <span class="tag tag-violet" style="font-size:.6rem;align-self:flex-start">+5%</span>
      </div>
    </div>
  </div>`:''}

  <!-- GRÁFICO -->
  <div class="charts-grid" style="margin-bottom:24px">
    <div class="chart-card chart-span2">
      <div class="chart-card-header">
        <div><h3>Participantes por Mês</h3><p>Acumulado do ano</p></div>
        <button class="chart-period-btn">${ico('calendar',12)} Este ano</button>
      </div>
      <canvas id="chart-dash-line" height="80"></canvas>
    </div>
    <div class="chart-card">
      <h3>Tipos de Eventos</h3><p>Distribuição</p>
      <canvas id="chart-dash-bar" height="160"></canvas>
    </div>
  </div>

 
  <!-- AGENDA -->

  ${eventosFuturos.length ? `
<div class="sec-hdr"><h2>${ico('calendar', 16)} Próximos Eventos</h2><span class="tag tag-gold">Agendados</span></div>
<div class="act-list" style="margin-bottom:24px">
  ${eventosFuturos.slice(0, 8).map(e => `
  <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer;border-left:3px solid var(--primary-l,#7eb3ff)">
    <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>
    <div class="f1">
      <div class="fw5 fs-sm">${dpTipoLabel(e.tipo)}</div>
      <div class="fs-xs c3">${dp.esc(e.resumo || '')}</div>
    </div>
    <span class="tag tag-primary">Agendado</span>
    <span class="act-time">${dp.fmtD(e.data)}</span>
  </div>`).join('')}
</div>` : ''}

  <div class="sec-hdr"><h2>${ico('calendar',16)} Agenda da Semana</h2><span class="tag">Próximos 7 dias</span></div>
  <div class="agenda-strip" style="margin-bottom:24px">${dpAgendaStrip(agItems||[])}</div>

  <!-- EVENTOS SETORIAIS -->
  ${podeVerEvSetoriais?`
  <div class="sec-hdr"><h2>${ico('cityHall',16)} Eventos Setoriais</h2><span class="tag tag-gold">Inclui futuros</span></div>
  <div id="dash-eventos-setoriais" class="act-list" style="margin-bottom:24px">${dpLoadingMini()}</div>`:''}

  <!-- EVENTOS RECENTES -->
  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="navigate('relatorios')">Ver todos</button>
  </div>
  <div class="act-list">
    ${eventosPassados.slice(0,8).map(e=>`
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer;transition:all .2s">
      <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>
      <div class="f1">
        <div class="fw5 fs-sm">${dpTipoLabel(e.tipo)}</div>
        <div class="fs-xs c3">${dp.esc(e.resumo||'')}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
        <span class="tag">${ico('people',11)} ${e.participantes||0}</span>
        ${e.conversoes?`<span class="tag tag-teal">${ico('cross',10)} ${e.conversoes}</span>`:''}
        ${canFin&&e.ofertas?`<span class="tag tag-gold">${dp.fmtM(e.ofertas)}</span>`:''}
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
    if(lCtx) new Chart(lCtx,{type:'line',data:{labels:meses,datasets:[{label:'Participantes',data:byMonth,borderColor:'#4f8ef7',backgroundColor:'rgba(79,142,247,.1)',tension:.4,fill:true,pointRadius:4,pointBackgroundColor:'#4f8ef7',pointBorderColor:'var(--bg-card,#121830)',pointBorderWidth:2}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#636e72'},grid:{color:'rgba(255,255,255,.03)'}},y:{ticks:{color:'#636e72'},grid:{color:'rgba(255,255,255,.04)'}}}}});
    const cultos=eventos.filter(e=>e.tipo==='culto').length;
    const genEvt=eventos.filter(e=>e.tipo==='evento').length;
    const saidas=eventos.filter(e=>e.tipo==='saida').length;
    const outros=Math.max(0,eventos.length-cultos-genEvt-saidas);
    const bCtx=document.getElementById('chart-dash-bar');
    if(bCtx) new Chart(bCtx,{type:'doughnut',data:{labels:['Cultos','Eventos','Saídas','Outros'],datasets:[{data:[cultos,genEvt,saidas,outros],backgroundColor:['rgba(79,142,247,.85)','rgba(56,217,192,.85)','rgba(167,139,250,.85)','rgba(240,192,96,.85)'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}},position:'bottom'}},cutout:'62%'}});
  }

  // Eventos setoriais async
  if(podeVerEvSetoriais){
    const esC=document.getElementById('dash-eventos-setoriais');
    if(esC){
      try{
        const vetodosSetores=(typeof canSeeAllSetores==='function'&&canSeeAllSetores())||(typeof isSuperAdmin==='function'&&isSuperAdmin());
        let qES=client.from('eventos').select('*').eq('tipo','evento_setorial').order('data',{ascending:true}).limit(15);
        if(!vetodosSetores&&window.currentUser?.setor_id) qES=qES.eq('setor_id',window.currentUser.setor_id);
        const {data:evS}=await qES;
        const {data:setS}=await client.from('setores').select('id,nome');
        const sN=id=>(setS||[]).find(s=>s.id===id)?.nome||'—';
        const hj=new Date().toISOString().slice(0,10);
        esC.innerHTML=(evS||[]).length?(evS||[]).map(e=>{
          const fut=e.data>hj;
          return `<div class="act-item" onclick="openEventoSetorialDetail('${e.id}')" style="cursor:pointer;transition:all .2s">
            <div class="act-dot" style="background:${fut?'var(--primary-l,#7eb3ff)':'var(--gold,#f0c060)'}"></div>
            <div class="f1">
              <div class="fw5 fs-sm">${ico('cityHall',13)} ${dp.esc(e.resumo||'Evento Setorial')}</div>
              <div class="fs-xs c3">${dp.esc(sN(e.setor_id))}${fut?' · <span style="color:var(--primary-l,#7eb3ff);font-weight:600">Agendado</span>':''}</div>
            </div>
            <span class="tag">${e.participantes||0} pess.</span>
            <span class="act-time">${dp.fmtD(e.data)}</span>
          </div>`;
        }).join(''):'<p class="c3" style="padding:16px;text-align:center">Nenhum evento setorial.</p>';
      }catch(err){ esC.innerHTML='<p class="c3" style="padding:16px;text-align:center">Erro ao carregar.</p>'; }
    }
  }
};

/* ── AÇÕES DOS CARDS ────────────────────────────────────── */
window.dpNavSetores=function(){ if(typeof navigate==='function') navigate('setores'); };
window.dpNavCongs=function(){
  const sid=window.currentUser?.setor_id;
  if(!sid){ if(typeof navigate==='function') navigate('setores'); return; }
  if(typeof navState!=='undefined'&&typeof renderSetores==='function'){
    window.navState={view:'congregacoes',setor:window.currentUserSetor||{id:sid,nome:'Meu Setor'},cong:null};
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page==='setores'));
    document.getElementById('page-title').textContent='Setores';
    renderSetores();
  } else if(typeof navigate==='function') navigate('setores');
};
window.dpNavMembros=function(){
  const cong=window.currentUserCong;
  const setor=window.currentUserSetor||{id:window.currentUser?.setor_id,nome:'Meu Setor'};
  if(cong&&typeof navState!=='undefined'&&typeof renderSetores==='function'){
    window.navState={view:'congregacao',setor,cong};
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page==='setores'));
    document.getElementById('page-title').textContent='Setores';
    renderSetores();
  } else if(typeof navigate==='function') navigate('setores');
};
window.dpScrollEventos=function(){
  document.getElementById('dash-eventos-section')?.scrollIntoView({behavior:'smooth'});
};

/* ── HELPERS ────────────────────────────────────────────── */
function dpAgendaStrip(items){
  if(!items.length) return `<div class="agenda-empty">${ico('calendar',28)}<p>Nenhum evento agendado para os próximos 7 dias</p></div>`;
  return items.map(item=>`
  <div class="agenda-item">
    <div class="agenda-date">
      <span class="ag-day">${new Date(item.data+'T00:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span>
      <span class="ag-num">${new Date(item.data+'T00:00:00').getDate()}</span>
    </div>
    <div class="agenda-body">
      <div class="fw5 fs-sm">${dp.esc(item.titulo||'')}</div>
      <div class="fs-xs c3">${dp.esc(item.descricao||'')}${item.congregacoes?' · '+dp.esc(item.congregacoes.nome):''}</div>
    </div>
    ${item.hora?`<span class="tag">${item.hora}</span>`:''}
  </div>`).join('');
}

const TIPO_COLORS={culto:'#4f8ef7',ebd:'#38d9c0',evento:'#a78bfa',evento_setorial:'#f0c060',saida:'#4ade80',culto_ar_livre:'#fb923c',ponto_pregacao:'#a78bfa'};
function dpTipoColor(t){ return TIPO_COLORS[t]||'#64748b'; }
function dpTipoLabel(t){
  if(typeof tipoLabel==='function') return tipoLabel(t);
  const m={culto:'Culto',ebd:'EBD',evento:'Evento',evento_setorial:'Evento Setorial',saida:'Saída Evangelística',visita_enfermos:'Visita a Enfermos',visita_desviados:'Visita a Desviados',culto_ar_livre:'Culto ao Ar Livre',ponto_pregacao:'Ponto de Pregação'};
  return m[t]||t||'—';
}

/* ── SUBMIT EVENTO ──────────────────────────────────────── */
window.submitEvento = async function(tipo){
  if(typeof hasPerm==='function'&&!hasPerm('registrar_eventos')){ if(typeof toast==='function') toast('Sem permissão','error'); return; }
  const dataEv=document.getElementById('ev-data')?.value;
  if(!dataEv){ if(typeof toast==='function') toast('Data é obrigatória','error'); return; }
  const futuro=dp.isFuturo(dataEv);
  const status=futuro?'rascunho':'pendente';
  const canFin=typeof canSeeFinanceiro==='function'?canSeeFinanceiro():false;
  const client=dp.db(); if(!client) return;
  const payload={
    congregacao_id:typeof navState!=='undefined'?navState.cong?.id:null,
    setor_id:typeof navState!=='undefined'?navState.setor?.id:null,
    tipo, data:dataEv, status,
    resumo:(document.getElementById('ev-resumo')?.value||'').trim(),
    participantes:futuro?0:(parseInt(document.getElementById('ev-participantes')?.value)||0),
    hora_inicio:document.getElementById('ev-inicio')?.value||null,
    hora_fim:document.getElementById('ev-fim')?.value||null,
    conversoes:futuro?0:(parseInt(document.getElementById('ev-conversoes')?.value)||0),
    ofertas:futuro?0:(canFin?parseFloat(document.getElementById('ev-ofertas')?.value)||0:0),
    dizimos:futuro?0:(canFin?parseFloat(document.getElementById('ev-dizimos')?.value)||0:0),
    evangelizados:futuro?0:(parseInt(document.getElementById('ev-evangelizados')?.value)||0),
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
  if(typeof toast==='function') toast(futuro?'Evento agendado como rascunho.':'Evento registrado!','info');
  if(typeof closeModal==='function') closeModal();
  if(typeof renderSetores==='function') renderSetores();
};

/* ── PUBLICAR EVENTO ────────────────────────────────────── */
window.publicarEvento=async function(id){
  const client=dp.db(); if(!client) return;
  const {data:ev}=await client.from('eventos').select('data').eq('id',id).single();
  if(dp.isFuturo(ev?.data||'')){
    if(typeof toast==='function') toast('Não é possível publicar um evento futuro','error'); return;
  }
  const {error}=await client.from('eventos').update({status:'publicado'}).eq('id',id);
  if(error){ if(typeof toast==='function') toast(error.message,'error'); return; }
  if(typeof toast==='function') toast('Evento publicado!');
  if(typeof renderSetores==='function') renderSetores();
};

/* ── PATCH: aviso evento futuro no modal ── */
const _origOpenEventModal=window.openEventModal;
window.openEventModal=async function(tipo){
  if(typeof _origOpenEventModal==='function') await _origOpenEventModal(tipo);
  setTimeout(()=>{
    const dataInput=document.getElementById('ev-data');
    if(!dataInput) return;
    const upd=()=>{
      document.getElementById('futuro-notice')?.remove();
      if(dp.isFuturo(dataInput.value)){
        const n=document.createElement('div');
        n.id='futuro-notice'; n.className='futuro-notice';
        n.innerHTML=`${ico('shield',14)} <strong>Evento futuro:</strong> Dados não podem ser preenchidos agora. Publique após a realização.`;
        dataInput.parentElement.insertAdjacentElement('afterend',n);
        document.querySelectorAll('#ev-participantes,#ev-conversoes,#ev-ofertas,#ev-dizimos,#ev-evangelizados,#ev-almas-salvas,#ev-batismo-espirito,#ev-renovo,#ev-bencaos,#ev-desviados,#ev-literaturas').forEach(el=>{if(el){el.disabled=true;el.value=0;}});
      } else {
        document.querySelectorAll('#ev-participantes,#ev-conversoes,#ev-ofertas,#ev-dizimos,#ev-evangelizados,#ev-almas-salvas,#ev-batismo-espirito,#ev-renovo,#ev-bencaos,#ev-desviados,#ev-literaturas').forEach(el=>{if(el) el.disabled=false;});
      }
    };
    dataInput.addEventListener('change',upd); upd();
  },120);
};

/* ── PATCH: badge ranking na congregação ── */
const _origRenderCong=window.renderCongregacao;
window.renderCongregacao=async function(pc){
  if(typeof _origRenderCong==='function') await _origRenderCong(pc);
  if(typeof navState!=='undefined'&&navState.cong?.id&&typeof getRankingNivel==='function'){
    getRankingNivel(navState.cong.id).then(nivel=>{
      if(!nivel) return;
      const cor={verde:'#4ade80',amarelo:'#f0c060',vermelho:'#ff6b9d'}[nivel]||'#64748b';
      const dot={verde:'●',amarelo:'●',vermelho:'●'}[nivel]||'●';
      const badge=document.createElement('span');
      badge.style.cssText=`background:${cor}22;color:${cor};border:1px solid ${cor}44;border-radius:99px;padding:3px 12px;font-size:.72rem;font-weight:700;margin-left:8px`;
      badge.textContent=`${dot} Ranking ${nivel.charAt(0).toUpperCase()+nivel.slice(1)}`;
      pc.querySelector('.sec-hdr h2')?.appendChild(badge);
    });
  }
};

console.log('[dashboard_patch v2.0] carregado ✓');