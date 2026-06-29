/* ═══════════════════════════════════════════════════════════
   EclesiaSync · ranking_module.js v1.1
   Adicione no HTML após script_v5.js:
     <script src="ranking_module.js"></script>
   ═══════════════════════════════════════════════════════════ */

/* ── helpers locais ─────────────────────────────────────── */
function rkEsc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function rkFmtD(d){ return d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—'; }
function rkDb(){ return typeof db!=='undefined'?db:window.db||null; }
function rkToast(m,i='success'){ if(typeof toast==='function') toast(m,i); }
function rkConfirm(t,tx){ return typeof confirmDialog==='function'?confirmDialog(t,tx):Promise.resolve({isConfirmed:true}); }
function rkModal(h){ if(typeof showModal==='function') showModal(h); }
function rkClose(){ if(typeof closeModal==='function') closeModal(); }
function rkBack(){ return typeof backBtn==='function'?backBtn():''; }
function rkLoading(){ return `<div class="loading-page"><div class="spinner"></div><span>Carregando...</span></div>`; }

const NIVEL_COR   = { verde:'#14b8a6', amarelo:'#f59e0b', vermelho:'#f43f5e' };
const NIVEL_EMOJI = { verde:'🟢', amarelo:'🟡', vermelho:'🔴' };
const NIVEL_LABEL = { verde:'Verde', amarelo:'Amarelo', vermelho:'Vermelho' };

function nivelBadge(nivel){
  const cor = NIVEL_COR[nivel]||'#64748b';
  return `<span style="background:${cor}22;color:${cor};border:1px solid ${cor}44;border-radius:99px;padding:2px 10px;font-size:.72rem;font-weight:700">${NIVEL_EMOJI[nivel]||'⚪'} ${NIVEL_LABEL[nivel]||nivel}</span>`;
}

/* ── semana ISO ──────────────────────────────────────────── */
function getISOWeek(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const dayNum=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}

/* ── calcular nível com base na config ───────────────────── */
function calcNivel(totalEventos, config){
  if(!config) return 'vermelho';
  if(totalEventos >= (config.verde_min||5))   return 'verde';
  if(totalEventos >= (config.amarelo_min||3)) return 'amarelo';
  return 'vermelho';
}

/* ── INJETAR MENU ─────────────────────────────────────────  */
// Exposta globalmente para ser chamada após mudanças de permissão
window.injectRankingMenu = async function injectRankingMenu(){
  const nav=document.querySelector('.sidebar-nav');
  if(!nav) return;

  // Sempre remove item anterior para re-avaliar permissão
  const existente=nav.querySelector('[data-page="ranking"]');

  // ── Verifica permissão consultando o banco diretamente ──
  // Isso evita depender do cache permissionsCache que pode estar desatualizado
  let temPerm = (typeof isSuperAdmin==='function' && isSuperAdmin());

  if(!temPerm){
    const client=rkDb();
    const user=window.currentUser;
    if(client && user?.id){
      try{
        // Tenta via RPC primeiro (igual ao loadPermissions do script_v5)
        const {data:rpcData}=await client.rpc('get_user_permissions',{p_user_id:user.id});
        if(rpcData){
          const found=rpcData.find(p=>
            (p.perm_code==='visualizar_ranking'||p.perm_code==='gerenciar_ranking') && p.perm_ativo
          );
          temPerm=!!found;
        }
        // Se RPC não retornou nada, tenta tabela role_permissions pelo role do usuário
        if(!temPerm && user.role){
          const {data:rp}=await client
            .from('role_permissions')
            .select('permission_code,ativo')
            .eq('role',user.role)
            .in('permission_code',['visualizar_ranking','gerenciar_ranking']);
          temPerm=!!(rp||[]).some(p=>p.ativo);
        }
        // Atualiza o cache local também
        if(temPerm){
          if(typeof permissionsCache!=='undefined'){
            permissionsCache['visualizar_ranking']=true;
          }
        }
      }catch(e){
        // Fallback: usa cache local
        temPerm=(typeof hasPerm==='function')&&(hasPerm('gerenciar_ranking')||hasPerm('visualizar_ranking'));
      }
    } else {
      // Sem banco, usa cache
      temPerm=(typeof hasPerm==='function')&&(hasPerm('gerenciar_ranking')||hasPerm('visualizar_ranking'));
    }
  }

  if(!temPerm){
    // Remove o item se existir e usuário perdeu permissão
    if(existente) existente.remove();
    return;
  }

  // Já existe, não duplica
  if(existente) return;

  const div=document.createElement('div');
  div.className='nav-item'; div.dataset.page='ranking';
  div.innerHTML=`<span class="nav-icon">🏆</span><span class="nav-lbl">Ranking Mensal</span>`;
  div.addEventListener('click',()=>{
    navigate('ranking');
    if(typeof toggleMobile==='function') toggleMobile(false);
  });
  const labels=[...nav.querySelectorAll('.nav-label')];
  const analise=labels.find(el=>el.textContent.trim()==='Análise');
  if(analise) nav.insertBefore(div,analise.nextSibling);
  else nav.appendChild(div);
};

/* ── APURAR RANKING (semanal + mensal) ──────────────────── */
window.apurarRanking = async function(silencioso=false){
  const client=rkDb(); if(!client) return;
  try {
    const hoje=new Date();
    const semanaAtual=getISOWeek(hoje);
    const mesAtual=hoje.getMonth()+1;
    const anoAtual=hoje.getFullYear();

    // Busca config
    const {data:cfgArr}=await client.from('ranking_config').select('*').order('created_at',{ascending:false}).limit(1);
    const config=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};

    // Busca todas as congregações
    const {data:congs}=await client.from('congregacoes').select('id,nome,setor_id');

    // Busca eventos publicados até hoje
    const {data:eventos}=await client.from('eventos')
      .select('id,congregacao_id,data,tipo,status')
      .eq('status','publicado')
      .lte('data',hoje.toISOString().slice(0,10));

    if(!congs||!eventos) return;

    // Agrupa eventos por congregação e semana
    const porCong={};
    congs.forEach(c=>{ porCong[c.id]={semanas:{},totalMes:0}; });

    eventos.forEach(ev=>{
      if(!ev.congregacao_id||!porCong[ev.congregacao_id]) return;
      const d=new Date(ev.data+'T00:00:00');
      const semEv=getISOWeek(d);
      const mesEv=d.getMonth()+1;
      const anoEv=d.getFullYear();
      if(anoEv===anoAtual&&mesEv===mesAtual){
        const key=`${semEv}`;
        if(!porCong[ev.congregacao_id].semanas[key]) porCong[ev.congregacao_id].semanas[key]=0;
        porCong[ev.congregacao_id].semanas[key]++;
        porCong[ev.congregacao_id].totalMes++;
      }
    });

    // Salva ranking semanal e mensal
    const upsertsSem=[];
    const upsertsMen=[];

    congs.forEach(c=>{
      const dados=porCong[c.id]||{semanas:{},totalMes:0};
      // Semanal: cada semana do mês atual
      Object.entries(dados.semanas).forEach(([sem,total])=>{
        const nivel=calcNivel(total,config);
        upsertsSem.push({ madalp_id:c.id, semana:parseInt(sem), mes:mesAtual, ano:anoAtual, total_eventos:total, nivel });
      });
      // Se a congregação não tem eventos na semana atual, registra como vermelho
      if(!dados.semanas[String(semanaAtual)]){
        upsertsSem.push({ madalp_id:c.id, semana:semanaAtual, mes:mesAtual, ano:anoAtual, total_eventos:0, nivel:'vermelho' });
      }
      // Mensal
      const nivelMensal=calcNivel(dados.totalMes,config);
      upsertsMen.push({ madalp_id:c.id, mes:mesAtual, ano:anoAtual, total_eventos:dados.totalMes, nivel_final:nivelMensal });
    });

    if(upsertsSem.length){
      await client.from('ranking_semanal').upsert(upsertsSem,{onConflict:'madalp_id,semana,ano',ignoreDuplicates:false});
    }
    if(upsertsMen.length){
      await client.from('ranking_mensal').upsert(upsertsMen,{onConflict:'madalp_id,mes,ano',ignoreDuplicates:false});
    }
    if(!silencioso) rkToast('Ranking apurado com sucesso!');
  } catch(e){
    console.error('apurarRanking:',e);
    if(!silencioso) rkToast('Erro ao apurar ranking: '+e.message,'error');
  }
};

/* ── RENDER RANKING ──────────────────────────────────────── */
window.renderRanking = async function(){
  const pc=document.getElementById('page-content'); if(!pc) return;
const podeGerenciar=(typeof isSuperAdmin==='function'&&isSuperAdmin())||(typeof hasPerm==='function'&&hasPerm('gerenciar_ranking'));
const podeVisualizar=podeGerenciar||(typeof hasPerm==='function'&&hasPerm('visualizar_ranking'));
  pc.innerHTML=rkLoading();
  const client=rkDb();
  if(!client){pc.innerHTML=`<div class="empty"><div class="empty-ico">⚠</div><p>Supabase não disponível.</p></div>`;return;}
  try{
    const hoje=new Date();
    const mesAtual=hoje.getMonth()+1;
    const anoAtual=hoje.getFullYear();
    const semAtual=getISOWeek(hoje);

    // Apura antes de exibir
    await apurarRanking(true);

    const [{data:cfgArr},{data:congs},{data:mensal},{data:semanal},{data:setores}]=await Promise.all([
      client.from('ranking_config').select('*').order('created_at',{ascending:false}).limit(1),
      client.from('congregacoes').select('id,nome,setor_id').order('nome'),
      client.from('ranking_mensal').select('*').eq('mes',mesAtual).eq('ano',anoAtual),
      client.from('ranking_semanal').select('*').eq('semana',semAtual).eq('ano',anoAtual),
      client.from('setores').select('id,nome'),
    ]);

    const config=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};
    const isSA=typeof isSuperAdmin==='function'&&isSuperAdmin();

    // Filtra congregações por setor do usuário (se não admin)
    const currentUser=window.currentUser;
    const congsFiltradas=isSA||!currentUser?.setor_id
      ?(congs||[])
      :(congs||[]).filter(c=>c.setor_id===currentUser.setor_id);

    const getSetorNome=id=>(setores||[]).find(s=>s.id===id)?.nome||'—';
    const getMensal=cid=>(mensal||[]).find(m=>m.madalp_id===cid);
    const getSemanal=cid=>(semanal||[]).find(s=>s.madalp_id===cid);

    const totalVerde   =congsFiltradas.filter(c=>getMensal(c.id)?.nivel_final==='verde').length;
    const totalAmarelo =congsFiltradas.filter(c=>getMensal(c.id)?.nivel_final==='amarelo').length;
    const totalVermelho=congsFiltradas.filter(c=>!getMensal(c.id)||getMensal(c.id)?.nivel_final==='vermelho').length;

    const mesesNome=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    pc.innerHTML=`
    <div class="sec-hdr">
      <h2>🏆 Ranking Mensal — ${mesesNome[mesAtual]} ${anoAtual}</h2>
      <div class="sec-actions">
        ${rkBack()}
        <button class="btn btn-secondary btn-sm" onclick="apurarRanking(false).then(()=>renderRanking())">🔄 Apurar</button>
       ${podeGerenciar?`<button class="btn btn-secondary btn-sm" onclick="openRankingConfig()">⚙️ Configurações</button>`:''}
${podeGerenciar?`<button class="btn btn-primary btn-sm" onclick="exportarRankingPDF()">📄 Relatório PDF</button>`:''}
      </div>
    </div>

    <!-- RESUMO -->
    <div class="stats-grid stats-4" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-ico" style="background:rgba(100,116,139,.15);font-size:20px">⛪</div><div><div class="stat-val">${congsFiltradas.length}</div><div class="stat-lbl">Total MADALPs</div></div></div>
      <div class="stat-card" style="border-left:3px solid #14b8a6"><div class="stat-ico" style="background:rgba(20,184,166,.15);font-size:20px">🟢</div><div><div class="stat-val">${totalVerde}</div><div class="stat-lbl">Verde</div></div></div>
      <div class="stat-card" style="border-left:3px solid #f59e0b"><div class="stat-ico" style="background:rgba(245,158,11,.15);font-size:20px">🟡</div><div><div class="stat-val">${totalAmarelo}</div><div class="stat-lbl">Amarelo</div></div></div>
      <div class="stat-card" style="border-left:3px solid #f43f5e"><div class="stat-ico" style="background:rgba(244,63,94,.15);font-size:20px">🔴</div><div><div class="stat-val">${totalVermelho}</div><div class="stat-lbl">Vermelho</div></div></div>
    </div>

    <!-- METAS CONFIGURADAS -->
    <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:var(--txt2);display:flex;gap:20px;flex-wrap:wrap">
      <span>⚙️ Metas configuradas:</span>
      <span>🔴 Vermelho: &lt; ${config.amarelo_min} eventos/semana</span>
      <span>🟡 Amarelo: ≥ ${config.amarelo_min} eventos/semana</span>
      <span>🟢 Verde: ≥ ${config.verde_min} eventos/semana</span>
    </div>

    <!-- GRÁFICO -->
    <div class="chart-card" style="margin-bottom:24px">
      <h3>Distribuição de Níveis</h3>
      <p>MADALPs por nível no mês atual</p>
      <canvas id="chart-ranking-dist" height="60"></canvas>
    </div>

    <!-- FILTROS -->
    <div class="filter-bar" style="margin-bottom:16px">
      <div class="filter-title">🔍 Filtrar</div>
      <div class="filter-fields">
        <div class="form-group" style="margin:0">
          <label>Nível</label>
          <select id="rank-filter-nivel" onchange="filterRankingTable()" style="min-width:130px">
            <option value="">Todos</option>
            <option value="verde">🟢 Verde</option>
            <option value="amarelo">🟡 Amarelo</option>
            <option value="vermelho">🔴 Vermelho</option>
          </select>
        </div>
        ${isSA?`<div class="form-group" style="margin:0">
          <label>Setor</label>
          <select id="rank-filter-setor" onchange="filterRankingTable()" style="min-width:160px">
            <option value="">Todos</option>
            ${(setores||[]).map(s=>`<option value="${s.id}">${rkEsc(s.nome)}</option>`).join('')}
          </select>
        </div>`:''}
        <div class="form-group" style="margin:0">
          <label>Buscar</label>
          <input id="rank-filter-busca" placeholder="Nome da MADALP..." oninput="filterRankingTable()" style="width:180px"/>
        </div>
      </div>
    </div>

    <!-- LISTAGEM -->
    <div class="sec-hdr"><h2>MADALPs <span class="count-badge">${congsFiltradas.length}</span></h2></div>
    <div id="ranking-lista" style="display:flex;flex-direction:column;gap:8px">
      ${congsFiltradas.map(c=>{
        const m=getMensal(c.id);
        const s=getSemanal(c.id);
        const nivel=m?.nivel_final||'vermelho';
        const cor=NIVEL_COR[nivel];
        const totalMes=m?.total_eventos||0;
        const totalSem=s?.total_eventos||0;
        return `<div class="user-card rank-item"
          data-nivel="${nivel}"
          data-setor="${c.setor_id||''}"
          data-nome="${rkEsc(c.nome).toLowerCase()}"
          style="border-left:3px solid ${cor}">
          <div class="user-card-main">
            <div style="font-size:24px;flex-shrink:0">${NIVEL_EMOJI[nivel]}</div>
            <div class="user-card-info">
              <div class="fw5 fs-sm">${rkEsc(c.nome)}</div>
              <div class="fs-xs c3">${rkEsc(getSetorNome(c.setor_id))}</div>
              <div class="user-card-tags" style="margin-top:6px">
                ${nivelBadge(nivel)}
                <span class="tag">📅 Mês: ${totalMes} eventos</span>
                <span class="tag">📆 Semana: ${totalSem} eventos</span>
              </div>
            </div>
          </div>
          <div class="user-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openRankingDetalhe('${c.id}','${rkEsc(c.nome)}')">Ver →</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

    // Gráfico
    if(typeof Chart!=='undefined'){
      const ctx=document.getElementById('chart-ranking-dist');
      if(ctx) new Chart(ctx,{
        type:'doughnut',
        data:{labels:['🟢 Verde','🟡 Amarelo','🔴 Vermelho'],datasets:[{data:[totalVerde,totalAmarelo,totalVermelho],backgroundColor:['rgba(20,184,166,.8)','rgba(245,158,11,.8)','rgba(244,63,94,.8)'],borderWidth:0,hoverOffset:6}]},
        options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8'},position:'right'}},cutout:'55%'}
      });
    }

  }catch(e){
    console.error('renderRanking:',e);
    pc.innerHTML=`<div class="empty"><div class="empty-ico">⚠</div><p>Erro ao carregar ranking.<br><small>${rkEsc(e.message)}</small></p></div>`;
  }
};

/* ── FILTRO DA TABELA ────────────────────────────────────── */
window.filterRankingTable = function(){
  const nivel=(document.getElementById('rank-filter-nivel')?.value||'').toLowerCase();
  const setor=(document.getElementById('rank-filter-setor')?.value||'').toLowerCase();
  const busca=(document.getElementById('rank-filter-busca')?.value||'').toLowerCase();
  document.querySelectorAll('.rank-item').forEach(el=>{
    const n=el.dataset.nivel||'';
    const s=el.dataset.setor||'';
    const nm=el.dataset.nome||'';
    const ok=((!nivel||n===nivel)&&(!setor||s===setor)&&(!busca||nm.includes(busca)));
    el.style.display=ok?'':'none';
  });
};

/* ── DETALHE DA MADALP ───────────────────────────────────── */
window.openRankingDetalhe = async function(congId, congNome){
  rkModal(`<div class="modal-hdr"><span>🏆</span><h2>${rkEsc(congNome)}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="rank-det-body">${rkLoading()}</div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
  const client=rkDb(); if(!client) return;
  try{
    const hoje=new Date();
    const mesAtual=hoje.getMonth()+1;
    const anoAtual=hoje.getFullYear();
    const [{data:cfgArr},{data:semanal},{data:mensal},{data:eventos}]=await Promise.all([
      client.from('ranking_config').select('*').limit(1),
      client.from('ranking_semanal').select('*').eq('madalp_id',congId).eq('ano',anoAtual).eq('mes',mesAtual).order('semana'),
      client.from('ranking_mensal').select('*').eq('madalp_id',congId).order('ano',{ascending:false}).order('mes',{ascending:false}).limit(6),
      client.from('eventos').select('id,tipo,data,status,participantes,resumo').eq('congregacao_id',congId).eq('status','publicado').lte('data',hoje.toISOString().slice(0,10)).order('data',{ascending:false}).limit(20),
    ]);
    const config=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};
    const nivelAtual=mensal?.[0]?.nivel_final||'vermelho';
    const mesesNome=['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const tipoLabel=typeof window.tipoLabel==='function'?window.tipoLabel:t=>t;
    const tipoIcon=typeof window.tipoIcon==='function'?window.tipoIcon:()=>'📋';
    document.getElementById('rank-det-body').innerHTML=`
    <div style="text-align:center;padding:16px 0 20px">
      <div style="font-size:48px">${NIVEL_EMOJI[nivelAtual]}</div>
      <div style="font-size:1.4rem;font-weight:700;color:${NIVEL_COR[nivelAtual]};margin-top:4px">${NIVEL_LABEL[nivelAtual]}</div>
      <div class="fs-xs c3">Nível atual — ${mesesNome[mesAtual]}/${anoAtual}</div>
    </div>
    <div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Histórico Mensal</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${(mensal||[]).map(m=>`<div style="flex:1;min-width:80px;background:${NIVEL_COR[m.nivel_final]}22;border:1px solid ${NIVEL_COR[m.nivel_final]}44;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:18px">${NIVEL_EMOJI[m.nivel_final]}</div>
        <div class="fs-xs fw5" style="color:${NIVEL_COR[m.nivel_final]}">${mesesNome[m.mes]}/${m.ano}</div>
        <div class="fs-xs c3">${m.total_eventos} eventos</div>
      </div>`).join('')||'<p class="c3 fs-xs">Sem histórico mensal.</p>'}
    </div>
    <div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Semanas do Mês Atual</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${(semanal||[]).map(s=>`<div style="flex:1;min-width:80px;background:${NIVEL_COR[s.nivel]}22;border:1px solid ${NIVEL_COR[s.nivel]}44;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:18px">${NIVEL_EMOJI[s.nivel]}</div>
        <div class="fs-xs fw5" style="color:${NIVEL_COR[s.nivel]}">Sem. ${s.semana}</div>
        <div class="fs-xs c3">${s.total_eventos} eventos</div>
      </div>`).join('')||'<p class="c3 fs-xs">Sem dados semanais.</p>'}
    </div>
    <div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Últimos Eventos Publicados</h2></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${(eventos||[]).length?(eventos||[]).map(e=>`<div class="act-item">
        <div class="act-dot" style="background:var(--gold)"></div>
        <div class="f1"><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${rkEsc(e.resumo||'')}</div></div>
        <span class="tag">${e.participantes||0} pess.</span>
        <span class="act-time">${rkFmtD(e.data)}</span>
      </div>`).join(''):'<p class="c3 fs-xs" style="padding:12px;text-align:center">Nenhum evento publicado.</p>'}
    </div>`;
  }catch(e){
    document.getElementById('rank-det-body').innerHTML=`<p class="c3" style="padding:20px;text-align:center">Erro: ${rkEsc(e.message)}</p>`;
  }
};

/* ── CONFIGURAÇÕES ───────────────────────────────────────── */
window.openRankingConfig = async function(){
  rkModal(`<div class="modal-hdr"><span>⚙️</span><h2>Configurações do Ranking</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="rank-cfg-body">${rkLoading()}</div><div class="modal-foot" id="rank-cfg-foot"></div>`);
  const client=rkDb(); if(!client) return;
  try{
    const {data:cfgArr}=await client.from('ranking_config').select('*').order('created_at',{ascending:false}).limit(1);
    const cfg=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};
    document.getElementById('rank-cfg-body').innerHTML=`
    <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px;margin-bottom:16px;font-size:.82rem;color:var(--txt2)">
      💡 Defina a quantidade mínima de <strong>eventos por semana</strong> para cada nível.
    </div>
    <div class="form-group">
      <label>🔴 Vermelho — mínimo de eventos/semana</label>
      <input id="cfg-verm" type="number" min="0" value="${cfg.vermelho_min||1}"/>
      <small class="c3 fs-xs">MADALPs com menos eventos que este valor ficam em Vermelho</small>
    </div>
    <div class="form-group">
      <label>🟡 Amarelo — mínimo de eventos/semana</label>
      <input id="cfg-amar" type="number" min="0" value="${cfg.amarelo_min||3}"/>
      <small class="c3 fs-xs">Acima de Vermelho e abaixo de Verde</small>
    </div>
    <div class="form-group">
      <label>🟢 Verde — mínimo de eventos/semana</label>
      <input id="cfg-verd" type="number" min="0" value="${cfg.verde_min||5}"/>
      <small class="c3 fs-xs">MADALPs com este valor ou mais ficam em Verde</small>
    </div>
    <div class="form-group">
      <label>Descrição (opcional)</label>
      <input id="cfg-desc" value="${rkEsc(cfg.descricao||'')}" placeholder="Ex: Configuração Março 2025"/>
    </div>`;
    document.getElementById('rank-cfg-foot').innerHTML=`<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveRankingConfig('${cfg.id||''}')">💾 Salvar e Reapurar</button>`;
  }catch(e){
    document.getElementById('rank-cfg-body').innerHTML=`<p class="c3" style="padding:20px">Erro: ${rkEsc(e.message)}</p>`;
    document.getElementById('rank-cfg-foot').innerHTML=`<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
  }
};

window.saveRankingConfig = async function(id){
  const verm=parseInt(document.getElementById('cfg-verm')?.value)||1;
  const amar=parseInt(document.getElementById('cfg-amar')?.value)||3;
  const verd=parseInt(document.getElementById('cfg-verd')?.value)||5;
  const desc=(document.getElementById('cfg-desc')?.value||'').trim();
  if(verm>=amar||amar>=verd){ rkToast('Verde deve ser > Amarelo > Vermelho','error'); return; }
  const client=rkDb(); if(!client) return;
  try{
    const payload={vermelho_min:verm,amarelo_min:amar,verde_min:verd,descricao:desc||null,updated_at:new Date().toISOString()};
    if(id){
      const {error}=await client.from('ranking_config').update(payload).eq('id',id);
      if(error) throw new Error(error.message);
    } else {
      const {error}=await client.from('ranking_config').insert(payload);
      if(error) throw new Error(error.message);
    }
    rkToast('Configuração salva!');
    rkClose();
    await apurarRanking(true);
    if(typeof renderRanking==='function') renderRanking();
  }catch(e){ rkToast('Erro: '+e.message,'error'); }
};

/* ── EXPORTAR PDF ────────────────────────────────────────── */
window.exportarRankingPDF = async function(){
  const {jsPDF}=window.jspdf; if(!jsPDF){rkToast('jsPDF não disponível','error');return;}
  const client=rkDb(); if(!client) return;
  rkToast('Gerando PDF...','info');
  try{
    const hoje=new Date();
    const mes=hoje.getMonth()+1;
    const ano=hoje.getFullYear();
    const mesesNome=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const [{data:congs},{data:mensal},{data:setores}]=await Promise.all([
      client.from('congregacoes').select('id,nome,setor_id').order('nome'),
      client.from('ranking_mensal').select('*').eq('mes',mes).eq('ano',ano),
      client.from('setores').select('id,nome'),
    ]);
    const getSetorNome=id=>(setores||[]).find(s=>s.id===id)?.nome||'—';
    const getMensal=cid=>(mensal||[]).find(m=>m.madalp_id===cid);
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,margin=16; let y=20;
    doc.setFillColor(9,12,24); doc.rect(0,0,W,44,'F');
    doc.setTextColor(201,168,76); doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.text('EclesiaSync',margin,18);
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(148,163,184);
    doc.text('Relatório de Ranking Mensal',margin,25);
    doc.text(`${mesesNome[mes]} / ${ano}`,margin,31);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`,margin,37); y=54;
    const rows=(congs||[]).map(c=>{
      const m=getMensal(c.id);
      const nivel=m?.nivel_final||'vermelho';
      return [c.nome, getSetorNome(c.setor_id), `${NIVEL_EMOJI[nivel]} ${NIVEL_LABEL[nivel]}`, m?.total_eventos||0];
    });
    // Ordena: verde → amarelo → vermelho
    rows.sort((a,b)=>{
      const na=a[2].includes('Verde')?0:a[2].includes('Amarelo')?1:2;
      const nb=b[2].includes('Verde')?0:b[2].includes('Amarelo')?1:2;
      return na-nb;
    });
    doc.autoTable({
      startY:y,margin:{left:margin,right:margin},
      head:[['MADALP','Setor','Nível','Eventos']],
      body:rows,
      theme:'grid',
      headStyles:{fillColor:[9,12,24],textColor:[201,168,76],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[245,245,250]},
      styles:{fontSize:9},
      didParseCell:function(data){
        if(data.section==='body'&&data.column.index===2){
          const txt=data.cell.text[0]||'';
          data.cell.styles.textColor=txt.includes('Verde')?[20,184,166]:txt.includes('Amarelo')?[245,158,11]:[244,63,94];
          data.cell.styles.fontStyle='bold';
        }
      }
    });
    doc.save(`EclesiaSync-Ranking-${mesesNome[mes]}-${ano}.pdf`);
    rkToast('PDF gerado!');
  }catch(e){ rkToast('Erro: '+e.message,'error'); }
};

/* ── BUSCAR NÍVEL DA MADALP (para badge nas congregações) ── */
window.getRankingNivel = async function(congId){
  const client=rkDb(); if(!client) return null;
  try{
    const hoje=new Date();
    const {data}=await client.from('ranking_mensal').select('nivel_final')
      .eq('madalp_id',congId).eq('mes',hoje.getMonth()+1).eq('ano',hoje.getFullYear()).maybeSingle();
    return data?.nivel_final||null;
  }catch(e){ return null; }
};

/* ── PATCH navigate → suporte a 'ranking' ────────────────── */
(function patchNavigate(){
  // Aguarda o navigate do script_v5.js estar disponível
  const apply = () => {
    if(typeof window.navigate !== 'function') return false;
    const _orig = window.navigate;
    window.navigate = function(page){
      if(page === 'ranking'){
        // Marca item ativo na sidebar
        document.querySelectorAll('.nav-item').forEach(el =>
          el.classList.toggle('active', el.dataset.page === 'ranking')
        );
        const titleEl = document.getElementById('page-title');
        if(titleEl) titleEl.textContent = 'Ranking Mensal';
        renderRanking();
        return;
      }
      _orig(page);
    };
    return true;
  };
  if(!apply()){
    // navigate ainda não existe; tenta após o DOM carregar completamente
    window.addEventListener('load', apply);
  }
})();

/* ── INIT ────────────────────────────────────────────────── */
(function(){
  const app=document.getElementById('screen-app');
  if(!app) return;
  const tryInject=()=>{
    if(!app.classList.contains('hidden')){
      setTimeout(()=>window.injectRankingMenu(), 600);
      return true;
    }
    return false;
  };
  if(!tryInject()){
    const obs=new MutationObserver(()=>{ if(tryInject()) obs.disconnect(); });
    obs.observe(app,{attributes:true,attributeFilter:['class']});
  }
})();