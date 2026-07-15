/* ═══════════════════════════════════════════════════════════
   EclesiaSync · script_v5.js
   Novas funcionalidades:
   + Navegação "Minha Congregação" (atalho correto)
   + Campo Congregação = select de congs cadastradas
   + Botão Voltar em todas as telas
   + Permissão "criar_eventos_setorial" + tela setorial
   + Menu Financeiro (controle de licenças/pagamentos)
   + Bloqueio automático por vencimento
   + Refresh no Dashboard
   + Excluir perfil só por admin
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://xmemvwegmzykfdimnqbc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW12d2VnbXp5a2ZkaW1ucWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0Nzc1MzEsImV4cCI6MjA5MjA1MzUzMX0.xL2KwbcFLPm8h8Ew3iTmH5WXTaGm_UYp_XIOd-4NX8Q';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── LUCIDE SVG ICON HELPER ────────────────────────────── */
function lc(name, size = 18, cls = '') {
  return `<i data-lucide="${name}" class="lc-icon ${cls}" style="width:${size}px;height:${size}px"></i>`;
}
let _lucideTimer = null;
function refreshLucide() {
  if (_lucideTimer) clearTimeout(_lucideTimer);
  _lucideTimer = setTimeout(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    _lucideTimer = null;
  }, 50);
}
// Auto-refresh Lucide icons when DOM changes (covers all dynamic renders)
const _lucideObserver = new MutationObserver(() => refreshLucide());
_lucideObserver.observe(document.body, { childList: true, subtree: true });

/* ── HELPERS ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const q = t => db.from(t);
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e', '#f59e0b', '#06b6d4', '#ec4899', '#10b981'];
const avatarColor = n => AVATAR_COLORS[(n || 'A').charCodeAt(0) % AVATAR_COLORS.length];
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const escHtml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const toast = (msg, icon = 'success') => Swal.fire({
  toast: true, position: 'top-end', icon, title: msg,
  showConfirmButton: false, timer: 3000, timerProgressBar: true,
  background: '#111827', color: '#f1f5f9',
  iconColor: icon === 'success' ? '#14b8a6' : icon === 'info' ? '#3b82f6' : '#f43f5e'
});
const confirmDialog = (title, text) => Swal.fire({
  title, text, icon: 'warning', showCancelButton: true,
  confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar'
});
const loadingPage = () => `<div class="loading-page"><div class="spinner"></div><span>Carregando dados...</span></div>`;
const roleCls = r => ({ 'admin': 'role-admin', 'dirigente': 'role-dirigente', 'adjunto': 'role-adjunto', 'usuario': 'role-usuario' }[r] || 'role-usuario');

/* ── ESTADO GLOBAL ───────────────────────────────────────── */
let currentUser = null;
let currentPage = 'dashboard';
let sidebarCollapsed = false;
let mobileOpen = false;
let navState = { view: 'setores', setor: null, cong: null };
let navHistory = []; // stack para botão Voltar
let activeRole = 'admin';
let chartInstances = {};
let userSearch = '';
let setorSearch = '';
let permissionsCache = {};
let currentUserSetor = null;
let currentUserCong = null;
let relFiltroInicio = '';
let relFiltroFim = '';
let freqFiltroInicio = '';
let freqFiltroFim = '';
let freqSetorFiltro = '';
let freqCongFiltro = '';
let dashSetorFiltro = null;
let dashCongFiltro = null;
let relSetorFiltro = null;
let relCongFiltro = null;
let allCongsCache = []; // cache global de congregações

const CARGOS = ['Pastor Local', 'Pastor Adjunto', 'Presbítero', 'Evangelista', 'Diácono', 'Adjunto', 'Dirigente', 'Vice-Dirigente', 'Secretária', 'Auxiliar', 'Membro'];
const REGIOES = ['Abreu e Lima', 'Afogados da Ingazeira', 'Afrânio', 'Agrestina', 'Água Preta', 'Águas Belas', 'Alagoinha', 'Aliança', 'Altinho', 'Amaraji', 'Angelim', 'Araçoiaba', 'Araripina', 'Arcoverde', 'Barra de Guabiraba', 'Barreiros', 'Belém de Maria', 'Belém do São Francisco', 'Belo Jardim', 'Betânia', 'Bezerros', 'Bodocó', 'Bom Conselho', 'Bom Jardim', 'Bonito', 'Brejão', 'Brejinho', 'Brejo da Madre de Deus', 'Buenos Aires', 'Buíque', 'Cabo de Santo Agostinho', 'Cabrobó', 'Cachoeirinha', 'Caetés', 'Calçado', 'Calumbi', 'Camaragibe', 'Camocim de São Félix', 'Camutanga', 'Canhotinho', 'Capoeiras', 'Carnaíba', 'Carnaubeira da Penha', 'Carpina', 'Caruaru', 'Casinhas', 'Catende', 'Cedro', 'Chã de Alegria', 'Chã Grande', 'Condado', 'Correntes', 'Cortês', 'Cumaru', 'Cupira', 'Custódia', 'Dormentes', 'Escada', 'Exu', 'Feira Nova', 'Fernando de Noronha', 'Ferreiros', 'Flores', 'Floresta', 'Frei Miguelinho', 'Gameleira', 'Garanhuns', 'Glória do Goitá', 'Goiana', 'Granito', 'Gravatá', 'Iati', 'Ibimirim', 'Ibirajuba', 'Igarassu', 'Iguaracy', 'Ilha de Itamaracá', 'Inajá', 'Ingazeira', 'Ipojuca', 'Ipubi', 'Itacuruba', 'Itaíba', 'Itambé', 'Itapetim', 'Itapissuma', 'Itaquitinga', 'Jaboatão dos Guararapes', 'Jaqueira', 'Jataúba', 'Jatobá', 'João Alfredo', 'Joaquim Nabuco', 'Jucati', 'Jupi', 'Jurema', 'Lagoa do Carro', 'Lagoa do Itaenga', 'Lagoa do Ouro', 'Lagoa dos Gatos', 'Lagoa Grande', 'Lajedo', 'Limoeiro', 'Macaparana', 'Machados', 'Manari', 'Maraial', 'Mirandiba', 'Moreilândia', 'Moreno', 'Nazaré da Mata', 'Olinda', 'Orobó', 'Orocó', 'Ouricuri', 'Palmares', 'Palmeirina', 'Panelas', 'Paranatama', 'Parnamirim', 'Passira', 'Paudalho', 'Paulista', 'Pedra', 'Pesqueira', 'Petrolândia', 'Petrolina', 'Poção', 'Pombos', 'Primavera', 'Quipapá', 'Quixaba', 'Recife', 'Riacho das Almas', 'Ribeirão', 'Rio Formoso', 'Sairé', 'Salgadinho', 'Salgueiro', 'Saloá', 'Sanharó', 'Santa Cruz', 'Santa Cruz da Baixa Verde', 'Santa Cruz do Capibaribe', 'Santa Filomena', 'Santa Maria da Boa Vista', 'Santa Maria do Cambucá', 'Santa Terezinha', 'São Benedito do Sul', 'São Bento do Una', 'São Caitano', 'São João', 'São Joaquim do Monte', 'São José da Coroa Grande', 'São José do Belmonte', 'São José do Egito', 'São Lourenço da Mata', 'São Vicente Férrer', 'Serra Talhada', 'Serrita', 'Sertânia', 'Sirinhaém', 'Solidão', 'Surubim', 'Tabira', 'Tacaimbó', 'Tacaratu', 'Tamandaré', 'Taquaritinga do Norte', 'Terezinha', 'Terra Nova', 'Timbaúba', 'Toritama', 'Tracunhaém', 'Trindade', 'Triunfo', 'Tupanatinga', 'Tuparetama', 'Venturosa', 'Verdejante', 'Vertente do Lério', 'Vertentes', 'Vicência', 'Vitória de Santo Antão', 'Xexéu'];

const TIPOS_EVENTO = {
  'culto': { label: 'Culto', grupo: 'Principal', icon: 'church', financeiro: true, evangelismo: false },
  'ebd': { label: 'Escola Bíblica Dominical', grupo: 'Principal', icon: 'book-open', financeiro: false, evangelismo: false, ebd: true },
  'evento': { label: 'Evento Genérico', grupo: 'Principal', icon: 'calendar-check', financeiro: false, evangelismo: false },
  'saida': { label: 'Saída Evangelística', grupo: 'Principal', icon: 'footprints', financeiro: false, evangelismo: true },
  'evento_setorial': { label: 'Evento Setorial', grupo: 'Principal', icon: 'building-2', financeiro: false, evangelismo: false, setorial: true },
  'visita_enfermos': { label: 'Visita aos Enfermos', grupo: 'Visitas', icon: 'heart-pulse', financeiro: false, evangelismo: false },
  'visita_desviados': { label: 'Visita aos Desviados', grupo: 'Visitas', icon: 'search', financeiro: false, evangelismo: false },
  'visita_detidos': { label: 'Visita aos Detidos', grupo: 'Visitas', icon: 'lock', financeiro: false, evangelismo: false },
  'visita_convertidos': { label: 'Visita aos Novos Convertidos', grupo: 'Visitas', icon: 'cross', financeiro: false, evangelismo: false },
  'visita_umadalpe': { label: 'Visita a outras UMADALPE', grupo: 'Visitas', icon: 'handshake', financeiro: false, evangelismo: false },
  'visita_recebida_umadalpe': { label: 'Visitas Recebidas de UMADALPE', grupo: 'Visitas', icon: 'home', financeiro: false, evangelismo: false },
  'visita_coordenacao': { label: 'Visita da Coordenação do Setor', grupo: 'Visitas', icon: 'clipboard-list', financeiro: false, evangelismo: false },
  'visita_superintendencia': { label: 'Visita da Superintendência', grupo: 'Visitas', icon: 'briefcase', financeiro: false, evangelismo: false },
  'visita_obreiro': { label: 'Visita do Obreiro da Congregação', grupo: 'Visitas', icon: 'church', financeiro: false, evangelismo: false },
  'visita_ministerio': { label: 'Visitas do Ministério', grupo: 'Visitas', icon: 'book-open', financeiro: false, evangelismo: false },
  'desviados_voltaram': { label: 'Desviados que Voltaram', grupo: 'Espiritual', icon: 'heart-handshake', financeiro: false, evangelismo: false },
  'culto_ar_livre': { label: 'Culto ao Ar Livre', grupo: 'Evangelismo', icon: 'sun', financeiro: false, evangelismo: true },
  'ponto_pregacao': { label: 'Ponto de Pregação', grupo: 'Evangelismo', icon: 'megaphone', financeiro: false, evangelismo: true },
  'pessoas_evangelizadas': { label: 'Pessoas Evangelizadas', grupo: 'Evangelismo', icon: 'user', financeiro: false, evangelismo: false },
  'convocacoes_atendidas': { label: 'Convocações da Superintendência Atendidas', grupo: 'Jovens', icon: 'check-circle', financeiro: false, evangelismo: false },
  'presentes_oracao': { label: 'Presentes na Oração da UMADALPE', grupo: 'Jovens', icon: 'hand', financeiro: false, evangelismo: false },
  'ofertas_umadalpe': { label: 'Ofertas UMADALPE', grupo: 'Jovens', icon: 'coins', financeiro: false, evangelismo: false },
};
const tipoLabel = t => TIPOS_EVENTO[t]?.label || t || '—';
const tipoIcon = t => lc(TIPOS_EVENTO[t]?.icon || 'clipboard', 16);
const tipoFinanceiro = t => !!TIPOS_EVENTO[t]?.financeiro;
const tipoEvangelismo = t => !!TIPOS_EVENTO[t]?.evangelismo;
const tipoColor = t => ({ culto: 'var(--gold)', ebd: '#38bdf8', evento: 'var(--blue)', evento_setorial: '#a78bfa', saida: 'var(--teal)', visita_enfermos: '#f59e0b', visita_desviados: '#ec4899', visita_detidos: '#ef4444', visita_convertidos: '#14b8a6', culto_ar_livre: '#fb923c', ponto_pregacao: '#a78bfa' }[t] || '#64748b');

/* ── PERMISSÕES ──────────────────────────────────────────── */
const PERM_DESC = {
  'visualizar_eventos_setoriais_dash': { label: 'Visualizar Eventos Setoriais', desc: 'Mostra eventos setoriais (inclusive futuros) no Dashboard inicial' },
  'visualizar_dashboard': { label: 'Visualizar Dashboard', desc: 'Acessar o painel principal' },
  'ver_relatorios': { label: 'Ver Relatórios', desc: 'Acessar relatórios e gráficos' },
  'ver_frequencia_usuarios': { label: 'Ver Frequência de Usuários', desc: 'Ver frequência de participação' },
  'exportar_dados': { label: 'Exportar Dados', desc: 'Exportar para PDF/Excel' },
  'ver_financeiro': { label: 'Ver Financeiro (Ofertas/Dízimos)', desc: 'Exibir dados financeiros' },
  'filtrar_setor_dashboard': { label: 'Filtrar Setor no Dashboard', desc: 'Ver dados de outros setores (leitura)' },
  'filtrar_congregacao_dashboard': { label: 'Filtrar Congregação no Dashboard', desc: 'Filtrar por congregação (leitura)' },
  'ver_relatorio_por_congregacao': { label: 'Ver Relatório por Congregação', desc: 'Relatórios filtrados por congregação' },
  'ver_todos_setores': { label: 'Ver Todos os Setores', desc: 'Acessa outros setores' },
  'gerenciar_setores': { label: 'Gerenciar Setores', desc: 'Criar, editar e excluir setores' },
  'gerenciar_congregacoes': { label: 'Gerenciar Congregações', desc: 'Criar, editar e excluir congregações' },
  'gerenciar_membros': { label: 'Gerenciar Membros', desc: 'Adicionar, editar e remover membros' },
  'gerenciar_usuarios': { label: 'Gerenciar Usuários', desc: 'Controlar usuários do sistema' },
  'gerenciar_agenda': { label: 'Gerenciar Agenda', desc: 'Criar e editar agenda da semana' },
  'registrar_eventos': { label: 'Registrar Eventos', desc: 'Criar cultos, eventos e saídas' },
  'criar_eventos_setorial': { label: 'Criar Eventos Setoriais', desc: 'Criar eventos vinculados a um setor e ver participantes do setor' },
  'excluir_registros': { label: 'Excluir Registros', desc: 'Excluir qualquer registro' },
  'editar_permissoes': { label: 'Editar Permissões', desc: 'Alterar permissões de grupos' },
  'gerenciar_financeiro': { label: 'Gerenciar Financeiro', desc: 'Acessar e gerenciar módulo financeiro de licenças' },
  'visualizar_ranking':   { label: 'Visualizar Ranking Mensal', desc: 'Acessar o menu e tela de ranking mensal das MADALPs' },
  'gerenciar_ranking':    { label: 'Gerenciar Ranking Mensal', desc: 'Configurar metas, apurar e exportar PDF do ranking' },
};

const isSuperAdmin = () => currentUser?.role === 'admin';
const hasPerm = p => isSuperAdmin() || !!permissionsCache[p];
const canSeeAllSetores = () => isSuperAdmin() || hasPerm('ver_todos_setores');
const canFilterSetores = () => isSuperAdmin() || hasPerm('filtrar_setor_dashboard');
const canFilterCong = () => isSuperAdmin() || hasPerm('filtrar_congregacao_dashboard');
const canSeeFinanceiro = () => isSuperAdmin() || hasPerm('ver_financeiro');
const canVerRelCong = () => isSuperAdmin() || hasPerm('ver_relatorio_por_congregacao');
const canEventoSetorial = () => isSuperAdmin() || hasPerm('criar_eventos_setorial');
const canGerFinanceiro = () => isSuperAdmin() || hasPerm('gerenciar_financeiro');

async function loadPermissions() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await db.rpc('get_user_permissions', { p_user_id: currentUser.id });
    permissionsCache = {};
    if (data && !error) {
     data.forEach(p => {
  const code = p.perm_code ?? p.codigo ?? p.permission_code;
  const val  = p.perm_ativo ?? p.bool ?? p.ativo ?? false;
  if (code) permissionsCache[code] = val;
});
    } else {
      const { data: legado } = await q('permissoes').select('permissao,ativo').eq('role', currentUser.role);
      const map = { 'Gerenciar Setores': 'gerenciar_setores', 'Gerenciar Congregações': 'gerenciar_congregacoes', 'Gerenciar Membros': 'gerenciar_membros', 'Gerenciar Usuários': 'gerenciar_usuarios', 'Visualizar Dashboard': 'visualizar_dashboard', 'Ver Relatórios': 'ver_relatorios', 'Editar Permissões': 'editar_permissoes', 'Exportar Dados': 'exportar_dados', 'Excluir Registros': 'excluir_registros', 'Registrar Eventos': 'registrar_eventos', 'Ver Todos os Setores': 'ver_todos_setores', 'Gerenciar Agenda': 'gerenciar_agenda', 'Ver Frequência de Usuários': 'ver_frequencia_usuarios', 'Visualizar Resumo Financeiro': 'ver_financeiro', 'Filtrar Setor no Dashboard': 'filtrar_setor_dashboard', 'Filtrar Congregação no Dashboard': 'filtrar_congregacao_dashboard', 'Ver Relatório por Congregação': 'ver_relatorio_por_congregacao', 'Criar Eventos Setoriais': 'criar_eventos_setorial', 'Gerenciar Financeiro': 'gerenciar_financeiro', 'Visualizar Ranking Mensal': 'visualizar_ranking', 'Gerenciar Ranking Mensal': 'gerenciar_ranking','Visualizar Eventos Setoriais': 'visualizar_eventos_setoriais_dash',};
      (legado || []).forEach(p => { permissionsCache[map[p.permissao] || p.permissao] = p.ativo; });
    }
  } catch (e) { console.warn('Permissões indisponíveis', e); } 
}

async function loadUserSetor() {
  if (!currentUser?.setor_id) { currentUserSetor = null; return; }
  const { data } = await q('setores').select('*').eq('id', currentUser.setor_id).single();
  currentUserSetor = data || null;
}

async function loadUserCong() {
  // Busca pelo ID da congregação se existir, ou pelo nome
  if (currentUser?.congregacao_id) {
    const { data } = await q('congregacoes').select('*').eq('id', currentUser.congregacao_id).single();
    currentUserCong = data || null;
  } else if (currentUser?.congregacao) {
    const { data } = await q('congregacoes').select('*').ilike('nome', `%${currentUser.congregacao}%`).limit(1);
    currentUserCong = data?.[0] || null;
  } else {
    currentUserCong = null;
  }
}

async function loadAllCongs() {
  const { data } = await q('congregacoes').select('id,nome,setor_id').order('nome');
  allCongsCache = data || [];
}

/* ── CONTROLE DE SESSÃO ──────────────────────────────────── */
const SESSION_KEY = 'ecclesia_session_token';
function generateSessionToken() { return Math.random().toString(36).substring(2) + Date.now().toString(36); }

async function checkAndSetSession(userId) {
  const newToken = generateSessionToken();
  try {
    await q('sistema_usuarios').update({ session_token: newToken }).eq('id', userId);
    localStorage.setItem(SESSION_KEY, newToken);
    startSessionCheck(userId, newToken);
  } catch (e) { console.warn('Session control indisponível', e); }
}

function startSessionCheck(userId, token) {
  if (window._sessionInterval) clearInterval(window._sessionInterval);
  window._sessionInterval = setInterval(async () => {
    try {
      const { data } = await q('sistema_usuarios').select('session_token').eq('id', userId).single();
      if (data?.session_token && data.session_token !== token) {
        clearInterval(window._sessionInterval);
        Swal.fire({ title: 'Sessão encerrada', text: 'Você já está logado em outro dispositivo.', icon: 'warning', confirmButtonText: 'OK', allowOutsideClick: false, background: '#111827', color: '#f1f5f9' }).then(() => { localStorage.clear(); location.reload(); });
      }
    } catch (e) { }
  }, 30000);
}

/* ── VERIFICAÇÃO DE LICENÇA ──────────────────────────────── */
async function checkLicenca(userId) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await q('financeiro_licencas').select('*').eq('usuario_id', userId).single();
    if (!data) return true; // sem registro = livre
    if (data.ativo === false || (data.data_fim && data.data_fim < hoje)) {
      // Bloqueado por vencimento
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090c18;font-family:'DM Sans',sans-serif;">
          <div style="text-align:center;padding:40px;background:#111827;border:1px solid rgba(244,63,94,.3);border-radius:20px;max-width:420px;width:90%">
            <div style="font-size:48px;margin-bottom:16px">${lc('lock', 48)}</div>
            <h2 style="font-family:'Cinzel',serif;color:#f43f5e;margin-bottom:10px">Acesso Bloqueado</h2>
            <p style="color:#94a3b8;margin-bottom:24px;font-size:.9rem">Realize o pagamento para continuar usando o sistema.</p>
            <a href="https://wa.me/5581999999999?text=Olá,%20preciso%20renovar%20minha%20licença%20EclesiaSync" target="_blank"
               style="display:inline-flex;align-items:center;gap:8px;background:#25d366;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:.9rem">
              ${lc('message-circle', 16)} Falar no WhatsApp
            </a>
            <p style="color:#475569;font-size:.75rem;margin-top:16px">Vencimento: ${fmtDate(data.data_fim)}</p>
          </div>
        </div>`;
      return false;
    }
    return true;
  } catch (e) {
    return true; // tabela não existe ainda, libera
  }
}

/* ── LOGIN ───────────────────────────────────────────────── */
$('btn-login').addEventListener('click', doLogin);
$('inp-pass').addEventListener('keydown', e => e.key === 'Enter' && doLogin());
$('inp-user').addEventListener('keydown', e => e.key === 'Enter' && $('inp-pass').focus());

async function doLogin() {
  const username = $('inp-user').value.trim(), pass = $('inp-pass').value.trim();
  const errEl = $('login-err');
  if (!username || !pass) { errEl.textContent = 'Preencha usuário e senha'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  $('btn-login').disabled = true;
  $('btn-login').innerHTML = '<span class="login-spinner"></span> Entrando...';
  const { data: user, error } = await q('sistema_usuarios').select('*').eq('username', username).eq('senha', pass).eq('ativo', true).single();
  if (error || !user) {
    errEl.textContent = 'Usuário ou senha inválidos'; errEl.classList.remove('hidden');
    $('btn-login').disabled = false; $('btn-login').innerHTML = `${lc('log-in', 18, 'btn-icon')} Entrar no Sistema`; refreshLucide(); return;
  }

  // Verificação de licença antes de entrar
  const licOk = await checkLicenca(user.id);
  if (!licOk) return;

  localStorage.setItem('ecclesia_user', JSON.stringify(user));
  currentUser = user;
  await loadPermissions(); await loadUserSetor(); await loadUserCong(); await loadAllCongs();
  await checkAndSetSession(user.id);
  dashSetorFiltro = currentUser?.setor_id || null;
  dashCongFiltro = null;
  relSetorFiltro = currentUser?.setor_id || null;
  relCongFiltro = null;
  startApp(user);
  setTimeout(() => { if (typeof injectThemePanel === 'function') injectThemePanel(); }, 150);
}

function startApp(user) {
  currentUser = user;
  $('screen-login').classList.add('hidden'); $('screen-app').classList.remove('hidden');
  const av = $('user-av'); av.textContent = initials(user.nome);
  av.style.background = `linear-gradient(135deg,${avatarColor(user.nome)},#8b5cf6)`;
  $('user-name-side').textContent = user.nome.split(' ')[0];
  const rb = $('user-role-side'); rb.textContent = user.role; rb.className = `role-badge ${roleCls(user.role)}`;
  $('topbar-user').textContent = user.nome.split(' ')[0];
  $('topbar-date').textContent = `EclesiaSync · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const ss = $('user-setor-side');
  if (ss) ss.textContent = currentUserSetor ? currentUserSetor.nome : (isSuperAdmin() ? 'Todos os setores' : 'Sem setor');

  // Injeta item Financeiro no menu se tiver permissão
  injectFinanceiroMenu();
  // Injeta item Eventos Setoriais se tiver permissão
  injectEventoSetorialMenu();

  navigate('dashboard');
}

function injectFinanceiroMenu() {
  if (!canGerFinanceiro()) return;
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[data-page="financeiro"]')) return;
  const div = document.createElement('div');
  div.className = 'nav-item';
  div.dataset.page = 'financeiro';
  div.innerHTML = `<span class="nav-icon"><i data-lucide="wallet"></i></span><span class="nav-lbl">Financeiro</span>`;
  div.addEventListener('click', () => { navigate('financeiro'); toggleMobile(false); });
  nav.appendChild(div);
  refreshLucide();
}

function injectEventoSetorialMenu() {
  if (!canEventoSetorial()) return;
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[data-page="eventos_setoriais"]')) return;
  const div = document.createElement('div');
  div.className = 'nav-item';
  div.dataset.page = 'eventos_setoriais';
  div.innerHTML = `<span class="nav-icon"><i data-lucide="building-2"></i></span><span class="nav-lbl">Ev. Setoriais</span>`;
  div.addEventListener('click', () => { navigate('eventos_setoriais'); toggleMobile(false); });
  // Insere depois de "setores"
  const setoresItem = nav.querySelector('[data-page="setores"]');
  if (setoresItem?.nextSibling) nav.insertBefore(div, setoresItem.nextSibling);
  else nav.appendChild(div);
  refreshLucide();
}

/* ── SIDEBAR & NAV ───────────────────────────────────────── */
$('sidebar-toggle').addEventListener('click', () => {
  sidebarCollapsed = !sidebarCollapsed;
  $('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  $('main-wrap').classList.toggle('collapsed', sidebarCollapsed);
  $('sidebar-toggle').innerHTML = sidebarCollapsed ? '<i data-lucide="chevron-right" style="width:14px;height:14px"></i>' : '<i data-lucide="chevron-left" style="width:14px;height:14px"></i>';
  refreshLucide();
});
$('hamburger').addEventListener('click', () => toggleMobile(true));
$('mob-overlay').addEventListener('click', () => toggleMobile(false));
function toggleMobile(o) { mobileOpen = o; $('sidebar').classList.toggle('mob-open', o); $('mob-overlay').classList.toggle('show', o); }

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => { navigate(el.dataset.page); toggleMobile(false); });
});
$('user-pill').addEventListener('click', async () => {
  const r = await confirmDialog('Sair do sistema', 'Deseja encerrar sua sessão?');
  if (r.isConfirmed) {
    try { await q('sistema_usuarios').update({ session_token: null }).eq('id', currentUser.id); } catch (e) { }
    if (window._sessionInterval) clearInterval(window._sessionInterval);
    localStorage.clear(); location.reload();
  }
});

/* ── HISTÓRICO DE NAVEGAÇÃO (Botão Voltar) ───────────────── */
function pushHistory(state) {
  navHistory.push(JSON.parse(JSON.stringify(state)));
}
function goBack() {
  if (!navHistory.length) { navigate('dashboard'); return; }
  const prev = navHistory.pop();
  if (prev.page) {
    // Estado simples de página
    currentPage = prev.page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === prev.page));
    const titles = { dashboard: 'Dashboard', setores: 'Setores', usuarios: 'Usuários', relatorios: 'Relatórios', permissoes: 'Permissões', frequencia: 'Frequência de Usuários', financeiro: 'Financeiro', eventos_setoriais: 'Eventos Setoriais' };
    $('page-title').textContent = titles[prev.page] || prev.page;
    Object.values(chartInstances).forEach(c => c?.destroy?.()); chartInstances = {};
    if (prev.navState) navState = prev.navState;
    switch (prev.page) {
      case 'dashboard': renderDashboard(); break;
      case 'setores': renderSetores(); break;
      case 'usuarios': renderUsuarios(); break;
      case 'relatorios': renderRelatorios(); break;
      case 'permissoes': renderPermissoes(); break;
      case 'frequencia': renderFrequencia(); break;
      case 'financeiro': renderFinanceiro(); break;
      case 'eventos_setoriais': renderEventosSetoriais(); break;
    }
  }
}

function navigate(page) {
  // Salva estado atual antes de navegar
  if (currentPage) {
    pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
  }
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const titles = { dashboard: 'Dashboard', setores: 'Setores', usuarios: 'Usuários', relatorios: 'Relatórios', permissoes: 'Permissões', frequencia: 'Frequência de Usuários', financeiro: 'Financeiro', eventos_setoriais: 'Eventos Setoriais' };
  $('page-title').textContent = titles[page] || page;
  if (page === 'setores') navState = { view: 'setores', setor: null, cong: null };
  Object.values(chartInstances).forEach(c => c?.destroy?.()); chartInstances = {};
  const pc = $('page-content'); pc.style.animation = 'none'; pc.offsetHeight; pc.style.animation = '';
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'setores': renderSetores(); break;
    case 'usuarios': userSearch = ''; renderUsuarios(); break;
    case 'relatorios': renderRelatorios(); break;
    case 'permissoes': renderPermissoes(); break;
    case 'frequencia': renderFrequencia(); break;
    case 'financeiro': renderFinanceiro(); break;
    case 'eventos_setoriais': renderEventosSetoriais(); break;
  }
  refreshLucide();
}

/* ── BOTÃO VOLTAR HTML ───────────────────────────────────── */
function backBtn(label) {
  const txt = label || `${lc('arrow-left', 14)} Voltar`;
  return `<button class="btn btn-secondary btn-sm back-btn" onclick="goBack()">${txt}</button>`;
}

/* ── ATALHOS DASHBOARD ───────────────────────────────────── */
function dashboardAtalhoMembros() { navigate('usuarios'); }

function dashboardAtalhoConfig() {
  if (currentUserCong) {
    // Navega direto para a congregação do usuário
    const setor = currentUserSetor || { id: currentUser.setor_id, nome: 'Setor' };
    navState = { view: 'congregacao', setor, cong: currentUserCong };
    navigate('setores');
  } else {
    toast('Nenhuma congregação vinculada ao seu perfil. Configure no cadastro de usuário.', 'info');
  }
}

function dashboardScrollEventos() {
  const el = document.getElementById('dash-eventos-section');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
async function renderDashboard() {
  if (!hasPerm('visualizar_dashboard')) {
    $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão para acessar o dashboard.</p></div>`; refreshLucide(); return;
  }
  $('page-content').innerHTML = loadingPage();
  const { data: allSetores } = await q('setores').select('id,nome').order('nome');
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inicioMes = `${mesAtual}-01`;
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const sid = dashSetorFiltro || currentUser?.setor_id || null;
  const cid = dashCongFiltro || null;
  const setorSelecionado = (allSetores || []).find(s => s.id === sid);

  let congsList = [];
  if (sid) { const { data: cs } = await q('congregacoes').select('id,nome').eq('setor_id', sid).order('nome'); congsList = cs || []; }

  let qSet = q('setores').select('id', { count: 'exact', head: true });
  let qCong = q('congregacoes').select('id', { count: 'exact', head: true });
  let qMem = q('membros').select('id', { count: 'exact', head: true });
  let qEv = q('eventos').select('*').order('data', { ascending: false });
  let qEvM = q('eventos').select('*').gte('data', inicioMes).lte('data', fimMes);

  if (sid) { qSet = qSet.eq('id', sid); qCong = qCong.eq('setor_id', sid); qMem = qMem.eq('setor_id', sid); qEv = qEv.eq('setor_id', sid); qEvM = qEvM.eq('setor_id', sid); }
  if (cid) { qCong = qCong.eq('id', cid); qMem = qMem.eq('congregacao_id', cid); qEv = qEv.eq('congregacao_id', cid); qEvM = qEvM.eq('congregacao_id', cid); }

  const [rSet, rCong, rMem, rEv, rEvM] = await Promise.all([qSet, qCong, qMem, qEv, qEvM]);
  const eventos = rEv.data || [], eventosMes = rEvM.data || [];
  const totalOferMes = eventosMes.reduce((s, e) => s + (e.ofertas || 0), 0);
  const totalDizMes = eventosMes.reduce((s, e) => s + (e.dizimos || 0), 0);
  const totalConvMes = eventosMes.reduce((s, e) => s + (e.conversoes || 0), 0);
  const totalPartMes = eventosMes.reduce((s, e) => s + (e.participantes || 0), 0);

  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  let qAg = q('agenda_semana').select('*,congregacoes(nome)').gte('data', hoje).lte('data', em7).order('data');
  if (sid) qAg = qAg.eq('setor_id', sid);
  if (cid) qAg = qAg.eq('congregacao_id', cid);
  const { data: agendaItems } = await qAg.limit(10);
  const nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const setorSel = canFilterSetores() ? `
  <div class="dash-setor-selector">
    <label class="selector-label">${lc('map-pin', 14)} Setor</label>
    <select id="dash-setor-sel" onchange="dashSetorFiltro=this.value||currentUser?.setor_id||null;dashCongFiltro=null;renderDashboard()" class="selector-select">
      ${(allSetores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
    </select>
    ${canFilterCong() && congsList.length ? `
    <label class="selector-label" style="margin-left:8px">${lc('church', 14)} Congregação</label>
    <select id="dash-cong-sel" onchange="dashCongFiltro=this.value||null;renderDashboard()" class="selector-select">
      <option value="">Todas</option>
      ${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}
    </select>`: ''}
    <span class="selector-badge">Somente visualização</span>
  </div>`:
    canFilterCong() && congsList.length ? `
  <div class="dash-setor-selector">
    <span style="font-size:.82rem;color:var(--txt2)">SETOR ${escHtml(setorSelecionado?.nome || currentUserSetor?.nome || '—')}</span>
    <label class="selector-label" style="margin-left:8px">${lc('church', 14)} Congregação</label>
    <select id="dash-cong-sel" onchange="dashCongFiltro=this.value||null;renderDashboard()" class="selector-select">
      <option value="">Todas</option>
      ${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}
    </select>
  </div>`:
      `<div class="dash-setor-locked"><span>${lc('map-pin', 14)}</span> ${escHtml(setorSelecionado?.nome || currentUserSetor?.nome || 'Meu Setor')} <span class="tag tag-blue" style="font-size:.65rem">fixo</span></div>`;

  $('page-content').innerHTML = `
  <div class="dash-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div>
        <p class="dash-sub">${escHtml(setorSelecionado?.nome || currentUserSetor?.nome || '—')}${cid && congsList.find(c => c.id === cid) ? ' › ' + escHtml(congsList.find(c => c.id === cid).nome) : ''}</p>
      </div>

    </div>
    <div class="dash-period">
      ${setorSel}
      <span class="tag tag-gold">${lc('calendar', 12)} ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</span>
    </div>
  </div>

  <div class="dash-shortcuts">
    <div class="shortcut-btn" onclick="dashboardAtalhoMembros()"><span>${lc('users', 20)}</span><small>Usuários</small></div>
    <div class="shortcut-btn" onclick="dashboardAtalhoConfig()"><span>${lc('church', 20)}</span><small>Minha Congr.</small></div>
    <div class="shortcut-btn" onclick="dashboardScrollEventos()"><span>${lc('clipboard-list', 20)}</span><small>Eventos</small></div>
    <div class="shortcut-btn" onclick="navigate('relatorios')"><span>${lc('bar-chart-3', 20)}</span><small>Relatórios</small></div>
    <div class="shortcut-btn" onclick="navigate('frequencia')"><span>${lc('trending-up', 20)}</span><small>Frequência</small></div>
    ${canGerFinanceiro() ? `<div class="shortcut-btn" onclick="navigate('financeiro')"><span>${lc('wallet', 20)}</span><small>Financeiro</small></div>` : ''}
    ${canEventoSetorial() ? `<div class="shortcut-btn" onclick="navigate('eventos_setoriais')"><span>${lc('building-2', 20)}</span><small>Ev. Setoriais</small></div>` : ''}
  </div>

  <div class="stats-grid stats-4">
    ${statCard(lc('map-pin', 20), 'ic-gold', rSet.count || 0, 'Setores', 'banco de dados')}
    ${statCard(lc('church', 20), 'ic-blue', rCong.count || 0, 'Congregações', 'cadastradas')}
    ${statCard(lc('users', 20), 'ic-teal', rMem.count || 0, 'Membros', 'cadastrados')}
    ${statCard(lc('calendar-check', 20), 'ic-violet', eventosMes.length, 'Eventos', 'este mês')}
  </div>

  <div class="sec-hdr" style="margin-top:4px"><h2>Resumo do Mês</h2><span class="tag tag-gold">Tempo real</span></div>
  <div class="stats-grid stats-4" style="margin-bottom:28px">
    ${statCard(lc('users', 20), 'ic-blue', totalPartMes, 'Participantes', 'este mês')}
    ${statCard(lc('cross', 20), 'ic-violet', totalConvMes, 'Conversões', 'este mês')}
    ${canSeeFinanceiro() ? statCard(lc('coins', 20), 'ic-teal', fmtMoney(totalOferMes), 'Ofertas', 'este mês') : ''}
    ${canSeeFinanceiro() ? statCard(lc('gem', 20), 'ic-gold', fmtMoney(totalDizMes), 'Dízimos', 'este mês') : ''}
  </div>

  <div class="charts-grid" style="margin-bottom:28px">
    <div class="chart-card chart-span2"><h3>Participantes por Mês</h3><p>Acumulado de todos os eventos</p><canvas id="chart-dash-line" height="100"></canvas></div>
    <div class="chart-card"><h3>Tipos de Eventos</h3><p>Distribuição por categoria</p><canvas id="chart-dash-bar" height="180"></canvas></div>
    ${canSeeFinanceiro() ? `<div class="chart-card"><h3>Financeiro do Mês</h3><p>Ofertas vs Dízimos</p><canvas id="chart-dash-fin" height="180"></canvas></div>` : ''}
  </div>

  <div class="sec-hdr"><h2>${lc('calendar', 18)} Agenda da Semana</h2><span class="tag">Próximos 7 dias</span></div>
  <div class="agenda-strip" style="margin-bottom:28px">${renderAgendaStrip(agendaItems || [])}</div>

  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="navigate('relatorios')">Ver todos ${lc("arrow-right", 14)}</button>
  </div>
  <div class="act-list">
    ${eventos.slice(0, 6).map(e => `
      <div class="act-item">
        <div class="act-dot" style="background:${tipoColor(e.tipo)}"></div>
        <div class="f1"><div class="fw5">${tipoIcon(e.tipo)} ${escHtml(tipoLabel(e.tipo))}</div><div class="fs-xs c3">${escHtml(e.resumo || '')}</div></div>
        <span class="tag">${e.participantes || 0} pessoas</span>
        <span class="act-time">${fmtDate(e.data)}</span>
      </div>`).join('') || '<p class="c3" style="padding:16px">Nenhum evento registrado.</p>'}
  </div>`;

  const byMonth = Array(12).fill(0);
  eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); byMonth[m] += (e.participantes || 0); });
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lCtx = document.getElementById('chart-dash-line');
  if (lCtx) chartInstances.dashLine = new Chart(lCtx, { type: 'line', data: { labels: meses, datasets: [{ label: 'Participantes', data: byMonth, borderColor: 'var(--gold)', backgroundColor: 'rgba(201,168,76,.1)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: 'var(--gold)' }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
  const cultos = eventos.filter(e => e.tipo === 'culto').length, genEvt = eventos.filter(e => e.tipo === 'evento').length, saidas = eventos.filter(e => e.tipo === 'saida').length, outros = eventos.length - cultos - genEvt - saidas;
  const bCtx = document.getElementById('chart-dash-bar');
  if (bCtx) chartInstances.dashBar = new Chart(bCtx, { type: 'doughnut', data: { labels: ['Cultos', 'Eventos', 'Saídas', 'Outros'], datasets: [{ data: [cultos, genEvt, saidas, outros], backgroundColor: ['rgba(201,168,76,.8)', 'rgba(59,130,246,.8)', 'rgba(20,184,166,.8)', 'rgba(139,92,246,.8)'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' } });
  if (canSeeFinanceiro()) {
    const fCtx = document.getElementById('chart-dash-fin');
    if (fCtx) chartInstances.dashFin = new Chart(fCtx, { type: 'bar', data: { labels: ['Ofertas', 'Dízimos', 'Total'], datasets: [{ data: [totalOferMes, totalDizMes, totalOferMes + totalDizMes], backgroundColor: ['rgba(201,168,76,.8)', 'rgba(20,184,166,.7)', 'rgba(139,92,246,.7)'], borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v.toLocaleString() }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
  }
}

function renderAgendaStrip(items) {
  if (!items.length) return `<div class="agenda-empty"><span>${lc('inbox', 32)}</span><p>Nenhum evento agendado para os próximos 7 dias</p></div>`;
  return items.map(item => `
    <div class="agenda-item">
      <div class="agenda-date">
        <span class="ag-day">${new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
        <span class="ag-num">${new Date(item.data + 'T00:00:00').getDate()}</span>
      </div>
      <div class="agenda-body">
        <div class="fw5 fs-sm">${escHtml(item.titulo || '')}</div>
        <div class="fs-xs c3">${escHtml(item.descricao || '')} ${item.congregacoes ? `· ${escHtml(item.congregacoes.nome)}` : ''}</div>
      </div>
      ${item.hora ? `<span class="tag">${item.hora}</span>` : ''}
    </div>`).join('');
}
function statCard(icon, cls, val, label, sub) {
  return `<div class="stat-card"><div class="stat-ico ${cls}">${icon}</div><div><div class="stat-val">${val}</div><div class="stat-lbl">${label}</div><div class="stat-chg">${lc('trending-up', 12)} ${sub}</div></div></div>`;
}

/* ════════════════════════════════════════════════════════════
   MÓDULO FINANCEIRO DE LICENÇAS
════════════════════════════════════════════════════════════ */
async function renderFinanceiro() {
  if (!canGerFinanceiro()) {
    $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão para acessar o módulo financeiro.</p></div>`; refreshLucide(); return;
  }
  $('page-content').innerHTML = loadingPage();

  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [{ data: licencas }, { data: usuarios }] = await Promise.all([
    q('financeiro_licencas').select('*').order('data_fim', { ascending: true }),
    q('sistema_usuarios').select('id,nome,cargo,setor_id,congregacao').order('nome')
  ]);

  const lista = (licencas || []).map(l => {
    const user = (usuarios || []).find(u => u.id === l.usuario_id);
    const vencido = l.data_fim && l.data_fim < hoje;
    const proximo = l.data_fim && l.data_fim >= hoje && l.data_fim <= em7;
    const status = vencido ? 'vencido' : proximo ? 'proximo' : 'ok';
    return { ...l, user, status };
  });

  const totalOk = lista.filter(l => l.status === 'ok').length;
  const totalProximo = lista.filter(l => l.status === 'proximo').length;
  const totalVencido = lista.filter(l => l.status === 'vencido').length;
  const totalValor = lista.reduce((s, l) => s + (l.valor || 0), 0);

  // Chart data
  const porMes = Array(12).fill(0);
  lista.forEach(l => { if (l.data_inicio) { const m = new Date(l.data_inicio + 'T00:00:00').getMonth(); porMes[m] += (l.valor || 0); } });
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>${lc('wallet', 20)} Módulo Financeiro — Licenças</h2>
    <div class="sec-actions">
      ${backBtn()}
      <button class="btn btn-primary btn-sm" onclick="openAddLicenca()">+ Adicionar</button>
    </div>
  </div>

  <div class="stats-grid stats-4" style="margin-bottom:24px">
    ${statCard(lc('check-circle', 20), 'ic-teal', totalOk, 'Em dia', '')}
    ${statCard(lc('alert-triangle', 20), 'ic-gold', totalProximo, 'Vencem em 7 dias', '')}
    ${statCard(lc('x-circle', 20), 'ic-violet', totalVencido, 'Vencidos', '')}
    ${statCard(lc('coins', 20), 'ic-blue', fmtMoney(totalValor), 'Total em licenças', '')}
  </div>

  <div class="charts-grid" style="margin-bottom:24px">
    <div class="chart-card chart-span2"><h3>Receita por Mês</h3><p>Valor de licenças por mês de início</p><canvas id="chart-fin-mes" height="80"></canvas></div>
    <div class="chart-card"><h3>Status das Licenças</h3><p>Distribuição atual</p><canvas id="chart-fin-status" height="180"></canvas></div>
  </div>

  <!-- Legenda -->
  <div class="freq-legend" style="margin-bottom:16px">
    <span class="freq-leg-item"><span class="freq-dot" style="background:#14b8a6"></span>Em dia</span>
    <span class="freq-leg-item"><span class="freq-dot" style="background:#f59e0b"></span>Vence em 7 dias</span>
    <span class="freq-leg-item"><span class="freq-dot" style="background:#f43f5e"></span>Vencido</span>
  </div>

  <div class="sec-hdr"><h2>Licenças Cadastradas <span class="count-badge">${lista.length}</span></h2></div>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${lista.length ? lista.map(l => {
    const cor = l.status === 'ok' ? '#14b8a6' : l.status === 'proximo' ? '#f59e0b' : '#f43f5e';
    const label = l.status === 'ok' ? 'Em dia' : l.status === 'proximo' ? 'Vence em breve' : 'VENCIDO';
    return `<div class="user-card" style="border-left:3px solid ${cor}">
        <div class="user-card-main">
          <div class="av av-sm" style="background:${avatarColor(l.user?.nome || '?')}">${initials(l.user?.nome || '?')}</div>
          <div class="user-card-info">
            <div class="fw5 fs-sm">${escHtml(l.user?.nome || 'Usuário removido')}</div>
            <div class="fs-xs c3">${escHtml(l.user?.cargo || '—')} · ${escHtml(l.user?.congregacao || '—')}</div>
            <div class="user-card-tags">
              <span class="tag" style="background:${cor}22;color:${cor}">${label}</span>
              <span class="tag tag-gold">${fmtMoney(l.valor || 0)}</span>
              <span class="tag">Início: ${fmtDate(l.data_inicio)}</span>
              <span class="tag">Fim: ${fmtDate(l.data_fim)}</span>
            </div>
          </div>
        </div>
        <div class="user-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openEditLicenca('${l.id}')">${lc('pencil', 14)} Editar</button>
          <button class="btn btn-teal btn-sm" onclick="renovarLicenca('${l.id}','${escHtml(l.user?.nome || '')}')">${lc('refresh-cw', 14)} Renovar</button>
          ${isSuperAdmin() ? `<button class="btn btn-danger btn-sm" onclick="delLicenca('${l.id}')">${lc('trash-2', 14)}</button>` : ''}
        </div>
      </div>`;
  }).join('') : `<div class="empty"><div class="empty-ico">${lc('wallet', 44)}</div><p>Nenhuma licença cadastrada.</p></div>`}
  </div>`;

  // Charts
  const lCtx = document.getElementById('chart-fin-mes');
  if (lCtx) chartInstances.finMes = new Chart(lCtx, { type: 'bar', data: { labels: meses, datasets: [{ label: 'Receita (R$)', data: porMes, backgroundColor: 'rgba(20,184,166,.7)', borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
  const sCtx = document.getElementById('chart-fin-status');
  if (sCtx) chartInstances.finStatus = new Chart(sCtx, { type: 'doughnut', data: { labels: ['Em dia', 'Vence em breve', 'Vencido'], datasets: [{ data: [totalOk, totalProximo, totalVencido], backgroundColor: ['rgba(20,184,166,.8)', 'rgba(245,158,11,.8)', 'rgba(244,63,94,.8)'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' } });
  refreshLucide();
}

async function openAddLicenca() {
  const { data: usuarios } = await q('sistema_usuarios').select('id,nome,cargo').order('nome');
  showModal(`
  <div class="modal-hdr"><span>${lc('wallet', 20)}</span><h2>Adicionar Licença</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Usuário *</label>
      <select id="lic-user">
        <option value="">— Selecione —</option>
        ${(usuarios || []).map(u => `<option value="${u.id}">${escHtml(u.nome)} (${escHtml(u.cargo || '—')})</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Valor (R$) *</label><input id="lic-valor" type="number" step="0.01" min="0" placeholder="0,00"/></div>
    <div class="form-row">
      <div class="form-group"><label>Data Inicial *</label><input id="lic-inicio" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
      <div class="form-group"><label>Data Final *</label><input id="lic-fim" type="date"/></div>
    </div>
    <div class="form-group"><label>Observações</label><textarea id="lic-obs" rows="2"></textarea></div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveLicenca(null)">${lc('save', 14)} Salvar</button></div>`);
  refreshLucide();
}

async function openEditLicenca(id) {
  const [{ data: l }, { data: usuarios }] = await Promise.all([
    q('financeiro_licencas').select('*').eq('id', id).single(),
    q('sistema_usuarios').select('id,nome,cargo').order('nome')
  ]);
  if (!l) { toast('Erro ao carregar', 'error'); return; }
  showModal(`
  <div class="modal-hdr"><span>${lc('pencil', 20)}</span><h2>Editar Licença</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Usuário *</label>
      <select id="lic-user">
        ${(usuarios || []).map(u => `<option value="${u.id}" ${u.id === l.usuario_id ? 'selected' : ''}>${escHtml(u.nome)} (${escHtml(u.cargo || '—')})</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Valor (R$) *</label><input id="lic-valor" type="number" step="0.01" value="${l.valor || 0}"/></div>
    <div class="form-row">
      <div class="form-group"><label>Data Inicial *</label><input id="lic-inicio" type="date" value="${l.data_inicio || ''}"/></div>
      <div class="form-group"><label>Data Final *</label><input id="lic-fim" type="date" value="${l.data_fim || ''}"/></div>
    </div>
    <div class="form-group"><label>Observações</label><textarea id="lic-obs" rows="2">${escHtml(l.observacoes || '')}</textarea></div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveLicenca('${id}')">${lc('save', 14)} Salvar</button></div>`);
  refreshLucide();
}

async function saveLicenca(id) {
  const usuario_id = $('lic-user')?.value, valor = parseFloat($('lic-valor')?.value) || 0;
  const data_inicio = $('lic-inicio')?.value, data_fim = $('lic-fim')?.value;
  if (!usuario_id || !data_inicio || !data_fim) { toast('Preencha todos os campos obrigatórios', 'error'); return; }
  const payload = { usuario_id, valor, data_inicio, data_fim, observacoes: ($('lic-obs')?.value || '').trim() || null, ativo: true };
  const { error } = id ? await q('financeiro_licencas').update(payload).eq('id', id) : await q('financeiro_licencas').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast(id ? 'Licença atualizada!' : 'Licença adicionada!'); renderFinanceiro();
}

async function renovarLicenca(id, nome) {
  const r = await confirmDialog('Renovar Licença', `Deseja renovar a licença de "${nome}"?`);
  if (!r.isConfirmed) return;
  const { data: l } = await q('financeiro_licencas').select('*').eq('id', id).single();
  if (!l) { toast('Erro', 'error'); return; }
  // Renova por mais 30 dias a partir de hoje ou do fim atual, o que for maior
  const base = l.data_fim && l.data_fim > new Date().toISOString().slice(0, 10) ? l.data_fim : new Date().toISOString().slice(0, 10);
  const novoFim = new Date(new Date(base).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const { error } = await q('financeiro_licencas').update({ data_fim: novoFim, ativo: true }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Licença renovada por 30 dias!'); renderFinanceiro();
}

async function delLicenca(id) {
  if (!isSuperAdmin()) { toast('Apenas admin pode excluir', 'error'); return; }
  const r = await confirmDialog('Excluir Licença', 'Esta licença será removida permanentemente.');
  if (!r.isConfirmed) return;
  const { error } = await q('financeiro_licencas').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Licença excluída!'); renderFinanceiro();
}

/* ════════════════════════════════════════════════════════════
   EVENTOS SETORIAIS
════════════════════════════════════════════════════════════ */
async function renderEventosSetoriais() {
  if (!canEventoSetorial()) {
    $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão para criar eventos setoriais.</p></div>`; refreshLucide(); return;
  }
  $('page-content').innerHTML = loadingPage();
  const sid = currentUser?.setor_id || null;
  const [{ data: eventos }, { data: usuarios }, { data: setores }] = await Promise.all([
    q('eventos').select('*').eq('tipo', 'evento_setorial').order('data', { ascending: false }).limit(50),
    q('sistema_usuarios').select('id,nome,cargo,congregacao,setor_id').eq('ativo', true).order('nome'),
    q('setores').select('id,nome').order('nome')
  ]);

  const setorNome = id => (setores || []).find(s => s.id === id)?.nome || '—';
  const usuariosSetor = sid ? (usuarios || []).filter(u => u.setor_id === sid) : (usuarios || []);

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>${lc('building-2', 20)} Eventos Setoriais</h2>
    <div class="sec-actions">
      ${backBtn()}
      <button class="btn btn-primary btn-sm" onclick="openEventoSetorialModal()">+ Novo Evento Setorial</button>
    </div>
  </div>

  <div class="stats-grid stats-3" style="margin-bottom:24px">
    ${statCard(lc('building-2', 20), 'ic-gold', (eventos || []).length, 'Eventos Setoriais', '')}
    ${statCard(lc('users', 20), 'ic-blue', usuariosSetor.length, 'Usuários no Setor', '')}
    ${statCard(lc('calendar', 20), 'ic-teal', (eventos || []).filter(e => { const d = new Date(e.data + 'T00:00:00'); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length, 'Eventos este Mês', '')}
  </div>

  <!-- Usuários do Setor -->
  <div class="sec-hdr"><h2>${lc('users', 18)} Usuários do Setor <span class="count-badge">${usuariosSetor.length}</span></h2></div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px">
    ${usuariosSetor.length ? usuariosSetor.map(u => `
      <div class="user-card">
        <div class="user-card-main">
          <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
          <div class="user-card-info">
            <div class="fw5 fs-sm">${escHtml(u.nome)}</div>
            <div class="fs-xs c3">${escHtml(u.cargo || '—')} · ${escHtml(u.congregacao || '—')}</div>
          </div>
        </div>
      </div>`).join('') : `<div class="empty"><div class="empty-ico">${lc('users', 44)}</div><p>Nenhum usuário neste setor.</p></div>`}
  </div>

  <!-- Eventos Setoriais -->
  <div class="sec-hdr"><h2>Eventos Registrados <span class="count-badge">${(eventos || []).length}</span></h2></div>
  <div style="display:flex;flex-direction:column;gap:8px">
    ${(eventos || []).length ? (eventos || []).map(e => `
      <div class="ev-card">
        <div class="ev-card-left">
          <div class="act-dot" style="background:var(--violet)"></div>
          <div>
            <div class="fw5 fs-sm">${lc('building-2', 14)} ${escHtml(e.resumo || tipoLabel(e.tipo))}</div>
            <div class="fs-xs c3">${setorNome(e.setor_id)} · ${fmtDate(e.data)}</div>
          </div>
        </div>
        <div class="ev-card-right">
          <span class="tag">${e.participantes || 0} pessoas</span>
          ${isSuperAdmin() || hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delEvento('${e.id}')">${lc('trash-2', 14)}</button>` : ''}
        </div>
      </div>`).join('') :
      `<div class="empty"><div class="empty-ico">${lc('building-2', 44)}</div><p>Nenhum evento setorial registrado.</p></div>`}
  </div>`;
  refreshLucide();
}

async function openEventoSetorialModal() {
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
    <div class="form-group"><label>Participantes</label><input id="es-participantes" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Conversões</label><input id="es-conversoes" type="number" min="0" placeholder="0"/></div>
    <div class="form-group"><label>Participantes do Setor</label>
      <div class="member-select-list" style="max-height:180px">
        ${usersSetor.map(u => `<label class="check-row"><input type="checkbox" class="es-user-check" value="${u.id}" data-nome="${escHtml(u.nome)}"/>
        <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
        <span>${escHtml(u.nome)} <em class="c3">${escHtml(u.cargo || '—')}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum usuário no setor.</p>'}
      </div>
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEventoSetorial()">${lc('plus-circle', 14)} Registrar</button></div>`);
  refreshLucide();
}

async function submitEventoSetorial() {
  const data = $('es-data')?.value;
  const resumo = ($('es-resumo')?.value || '').trim();
  if (!data || !resumo) { toast('Data e resumo são obrigatórios', 'error'); return; }
  const checks = [...document.querySelectorAll('.es-user-check:checked')].map(c => c.value);
  const payload = {
    tipo: 'evento_setorial',
    setor_id: $('es-setor')?.value || currentUser?.setor_id,
    data, resumo,
    hora_inicio: $('es-inicio')?.value || null,
    hora_fim: $('es-fim')?.value || null,
    participantes: parseInt($('es-participantes')?.value) || checks.length || 0,
    conversoes: parseInt($('es-conversoes')?.value) || 0,
    participante_ids: checks,
    congregacao_id: null,
    ofertas: 0, dizimos: 0, evangelizados: 0
  };
  const { error } = await q('eventos').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento setorial registrado!'); closeModal(); renderEventosSetoriais();
}

/* ════════════════════════════════════════════════════════════
   SETORES / CONGREGAÇÕES
════════════════════════════════════════════════════════════ */
async function renderSetores() {
  const pc = $('page-content');
  if (navState.view === 'setores') await renderSetoresMain(pc);
  else if (navState.view === 'congregacoes') await renderCongregacoes(pc);
  else if (navState.view === 'congregacao') await renderCongregacao(pc);
}
function breadcrumb() {
  let h = `<div class="breadcrumb"><span class="bc-link" onclick="goSetores()">Setores</span>`;
  if (navState.setor) h += `<span class="bc-sep">›</span><span class="bc-link" onclick="goCongs()">${escHtml(navState.setor.nome)}</span>`;
  if (navState.cong) h += `<span class="bc-sep">›</span><span class="bc-cur">${escHtml(navState.cong.nome)}</span>`;
  return h + '</div>';
}
function goSetores() { navState = { view: 'setores', setor: null, cong: null }; renderSetores(); }
function goCongs() { navState.view = 'congregacoes'; navState.cong = null; renderSetores(); }

async function renderSetoresMain(pc) {
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
      : '<div class="empty"><div class="empty-ico">${lc("map-pin",44)}</div><p>Nenhum setor encontrado.</p></div>'}
  </div>`;
}

function openSetor(id, nome, regiao) {
  if (!canSeeAllSetores() && currentUser?.setor_id && id !== currentUser.setor_id) { toast('Acesso negado', 'error'); return; }
  navState.setor = { id, nome, regiao }; navState.view = 'congregacoes'; navState.cong = null; renderSetores();
}
async function delSetor(id, nome) {
  if (!hasPerm('excluir_registros')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir Setor', `"${nome}" e tudo será removido.`);
  if (!r.isConfirmed) return;
  const { error } = await q('setores').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Setor excluído!'); renderSetores();
}

async function renderCongregacoes(pc) {
  pc.innerHTML = loadingPage();
  const { data: congs, error } = await q('congregacoes').select('*').eq('setor_id', navState.setor.id).order('nome');
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc("alert-triangle", 14)}</div><p>${error.message}</p></div>`; return; }
  const rM = await q('membros').select('congregacao_id');
  const memCount = id => (rM.data || []).filter(m => m.congregacao_id === id).length;
  pc.innerHTML = `
  ${breadcrumb()}
  <div class="sec-hdr">
    <div><h2>${escHtml(navState.setor.nome)}</h2><h3>Congregações deste setor</h3></div>
    <div class="sec-actions">
      ${backBtn()}
      ${hasPerm('gerenciar_congregacoes') ? `<button class="btn btn-primary btn-sm" onclick="openAddModal('congregacao')">+ Nova Congregação</button>` : ''}
    </div>
  </div>
  ${(congs || []).length ? `<div class="cards-grid">${(congs || []).map((c, i) => `
    <div class="item-card" style="animation-delay:${i * .05}s" onclick="openCong('${c.id}',${JSON.stringify(c).replace(/"/g, '&quot;')})">
      <div class="card-head"><div class="card-ico">${lc("church", 14)}</div>
        <div><div class="card-name">${escHtml(c.nome)}</div><div class="card-sub">${escHtml(c.endereco || '')}</div></div>
      </div>
      <div style="font-size:.77rem;color:var(--txt2);margin:8px 0">👨‍⚖️ ${escHtml(c.pastor_local || 'A definir')}</div>
      <div class="card-meta"><span class="tag tag-teal">${lc("users", 18)} ${memCount(c.id)} membros</span></div>
      <div class="card-actions" onclick="event.stopPropagation()">
        ${hasPerm('gerenciar_congregacoes') ? `<button class="btn btn-secondary btn-sm" onclick="openEditCongModal('${c.id}')">${lc("pencil", 14)}</button>` : ''}
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delCong('${c.id}','${escHtml(c.nome)}')">${lc("trash-2", 14)}</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openCong('${c.id}',${JSON.stringify(c).replace(/"/g, '&quot;')})">${lc("arrow-right", 14)}</button>
      </div>
    </div>`).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">${lc("church",14)}</div><p>Nenhuma congregação neste setor.</p></div>`}`;
}

function openCong(id, cObj) {
  const c = typeof cObj === 'string' ? JSON.parse(cObj.replace(/&quot;/g, '"')) : cObj;
  navState.cong = c; navState.view = 'congregacao'; renderSetores();
}
async function delCong(id, nome) {
  if (!hasPerm('excluir_registros')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir Congregação', `"${nome}" e seus membros serão removidos.`);
  if (!r.isConfirmed) return;
  const { error } = await q('congregacoes').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Congregação excluída!'); navState.view = 'congregacoes'; navState.cong = null; renderSetores();
}

async function openEditCongModal(id) {
  if (!hasPerm('gerenciar_congregacoes')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Congregação</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-cong-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  const [{ data: c }, { data: usuarios }] = await Promise.all([q('congregacoes').select('*').eq('id', id).single(), q('sistema_usuarios').select('id,nome,cargo').order('nome')]);
  if (!c) { closeModal(); toast('Erro ao carregar', 'error'); return; }
  const uOpts = (usuarios || []).map(u => `<option value="${u.id}">${escHtml(u.nome)} (${escHtml(u.cargo || '—')})</option>`).join('');
  $('edit-cong-body').innerHTML = `
  <div class="form-group"><label>Nome *</label><input id="ec-nome" value="${escHtml(c.nome)}"/></div>
  <div class="form-group"><label>Endereço</label><input id="ec-end" value="${escHtml(c.endereco || '')}"/></div>
  <div class="form-group"><label>Pastor Local</label><input id="ec-pastor" value="${escHtml(c.pastor_local || '')}"/></div>
  <div class="form-row">
    <div class="form-group"><label>Latitude</label><input id="ec-lat" type="number" step="0.0000001" value="${c.latitude || ''}"/></div>
    <div class="form-group"><label>Longitude</label><input id="ec-lng" type="number" step="0.0000001" value="${c.longitude || ''}"/></div>
  </div>
  <div class="form-group"><label>Dirigente(s)</label><select id="ec-dirigente" multiple style="height:80px">${uOpts}</select></div>
  <div class="form-group"><label>Vice-Dirigente(s)</label><select id="ec-vice" multiple style="height:80px">${uOpts}</select></div>
  <div class="form-group"><label>Secretária(s)</label><select id="ec-sec" multiple style="height:80px">${uOpts}</select></div>
  <div class="form-group"><label>Auxiliares</label><select id="ec-aux" multiple style="height:80px">${uOpts}</select></div>`;
  const preSelect = (selId, val) => { if (!val) return; const names = val.split(',').map(s => s.trim()); const sel = $(selId); if (!sel) return;[...sel.options].forEach(o => { if (names.some(n => o.text.startsWith(n))) o.selected = true; }); };
  preSelect('ec-dirigente', c.dirigente); preSelect('ec-vice', c.vice_dirigente); preSelect('ec-sec', c.secretaria); preSelect('ec-aux', c.auxiliares);
  const modal = document.querySelector('.modal');
  if (modal && !modal.querySelector('.modal-foot')) { const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveCong('${id}')">${lc("save", 14)} Salvar</button>`; modal.appendChild(foot); }
}

async function saveCong(id) {
  if (!hasPerm('gerenciar_congregacoes')) { toast('Sem permissão', 'error'); return; }
  const nome = ($('ec-nome')?.value || '').trim(); if (!nome) { toast('Nome obrigatório', 'error'); return; }
  const getSelected = selId => [...($(selId)?.selectedOptions || [])].map(o => o.text.split(' (')[0]).join(', ');
  const payload = { nome, endereco: ($('ec-end')?.value || '').trim() || null, pastor_local: ($('ec-pastor')?.value || '').trim() || null, latitude: parseFloat($('ec-lat')?.value) || null, longitude: parseFloat($('ec-lng')?.value) || null, dirigente: getSelected('ec-dirigente') || null, vice_dirigente: getSelected('ec-vice') || null, secretaria: getSelected('ec-sec') || null, auxiliares: getSelected('ec-aux') || null };
  const { error } = await q('congregacoes').update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast('Congregação atualizada!');
  if (navState.cong?.id === id) navState.cong = { ...navState.cong, ...payload };
  renderSetores();
}

async function renderCongregacao(pc) {
  pc.innerHTML = loadingPage();
  const c = navState.cong;
  const [{ data: mems, error }, { data: eventos }, { data: usuarios }] = await Promise.all([
    q('membros').select('*').eq('congregacao_id', c.id).order('nome'),
    q('eventos').select('*').eq('congregacao_id', c.id).order('data', { ascending: false }),
    q('sistema_usuarios').select('id,nome,cargo,role,setor_id').order('nome')
  ]);
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc("alert-triangle", 14)}</div><p>${error.message}</p></div>`; return; }
  const totalOfertas = (eventos || []).reduce((s, e) => s + (e.ofertas || 0), 0);
  const totalDizimos = (eventos || []).reduce((s, e) => s + (e.dizimos || 0), 0);
  const hoje = new Date(); const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  const fimSemana = new Date(inicioSemana); fimSemana.setDate(inicioSemana.getDate() + 6);
  const { data: agendaSemana } = await q('agenda_semana').select('*').eq('congregacao_id', c.id).gte('data', inicioSemana.toISOString().slice(0, 10)).lte('data', fimSemana.toISOString().slice(0, 10)).order('data');
  const mapLinks = buildMapLinks(c);

  const findUser = (nomeStr) => {
    if (!nomeStr) return null;
    const names = nomeStr.split(',').map(s => s.trim());
    return names.map(n => (usuarios || []).find(u => u.nome.trim().toLowerCase().startsWith(n.toLowerCase()))).filter(Boolean);
  };

  const renderLiderCard = (icon, label, nomeStr) => {
    const users = findUser(nomeStr);
    const hasUsers = users && users.length > 0;
    return `<div class="struct-card lider-card" onclick="toggleLiderExpand(this)">
      <div class="s-icon">${icon}</div>
      <div class="s-label">${label}</div>
      <div class="s-value">${escHtml(nomeStr || 'A definir')}</div>
      ${hasUsers ? `<div class="lider-expand hidden">${users.map(u => `
        <div class="lider-detail" style="border-top:1px solid var(--bdr2);margin-top:8px;padding-top:8px">
          <div class="lider-av" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
          <div>
            <div class="fw5 fs-sm">${escHtml(u.nome)}</div>
            <div class="fs-xs c3">${escHtml(u.cargo || '—')} · <span class="role-badge ${roleCls(u.role)}" style="font-size:.6rem">${u.role}</span></div>
          </div>
        </div>`).join('')}</div>
      <div class="lider-expand-hint fs-xs c3" style="margin-top:6px;text-align:right">👆 clique para expandir</div>`: ''
      }
    </div>`;
  };

  pc.innerHTML = `
  ${breadcrumb()}
  <div class="sec-hdr">
    <div><h2>${escHtml(c.nome)}</h2><h3>${escHtml(c.endereco || '')}${mapLinks}</h3></div>
    <div class="sec-actions">
      ${backBtn()}
      ${hasPerm('gerenciar_congregacoes') ? `<button class="btn btn-secondary btn-sm" onclick="openEditCongModal('${c.id}')">${lc("pencil", 14)} Editar</button>` : ''}
      ${hasPerm('gerenciar_membros') ? `<button class="btn btn-secondary btn-sm" onclick="openAddModal('membro')">+ Membro</button>` : ''}
      ${hasPerm('registrar_eventos') ? `<div class="dropdown-wrap" style="position:relative"><button class="btn btn-primary btn-sm" onclick="toggleEventMenu()">+ Evento ▾</button><div id="event-menu" class="dropdown-menu hidden">${buildEventMenuHtml()}</div></div>` : ''}
    </div>
  </div>

  <div class="struct-grid" style="margin-bottom:26px">
    ${renderLiderCard('👨🏻‍⚖️', 'Pastor Local', c.pastor_local)}
    ${renderLiderCard('👨🏻‍💼', 'Dirigente', c.dirigente)}
    ${renderLiderCard(lc("users",18), 'Vice-Dirigente', c.vice_dirigente)}
    ${renderLiderCard('👩‍💼', 'Secretária', c.secretaria)}
    ${c.auxiliares ? renderLiderCard('🤝', 'Auxiliares', c.auxiliares) : `<div class="struct-card" style="opacity:.5"><div class="s-icon">🤝</div><div class="s-label">Auxiliares</div><div class="s-value">A definir</div></div>`}
  </div>

  <div class="stats-grid stats-3" style="margin-bottom:22px">
    ${statCard(lc("clipboard-list",14), 'ic-gold', (eventos || []).length, 'Eventos registrados', '')}
    ${canSeeFinanceiro() ? statCard(lc("coins",14), 'ic-teal', fmtMoney(totalOfertas), 'Total Ofertas', '') : ''}
    ${canSeeFinanceiro() ? statCard('💵', 'ic-violet', fmtMoney(totalDizimos), 'Total Dízimos', '') : ''}
  </div>

  <div class="sec-hdr"><h2>${lc("calendar", 14)} Agenda da Semana</h2><div class="sec-actions">${hasPerm('gerenciar_agenda') ? `<button class="btn btn-primary btn-sm" onclick="openAgendaModal('${c.id}')">+</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="openAgendaCompleta('${c.id}')">Ver completa ${lc("arrow-right", 14)}</button></div></div>
  <div style="margin-bottom:28px">${renderAgendaSemanaGrid(agendaSemana || [], inicioSemana, c.id)}</div>

  <div class="sec-hdr"><h2>Eventos <span class="count-badge">${(eventos || []).length}</span></h2></div>
  ${(eventos || []).length ? `<div class="act-list" style="margin-bottom:28px">${(eventos || []).map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
      <div class="act-dot" style="background:${tipoColor(e.tipo)}"></div>
      <div class="f1"><div class="fw5">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(e.resumo || '')}</div></div>
      <div style="text-align:right">
        <span class="tag">${e.participantes || 0} pessoas</span>
        ${tipoFinanceiro(e.tipo) && canSeeFinanceiro() ? `<div class="fs-xs c3 mt8">${fmtMoney(e.ofertas || 0)} + ${fmtMoney(e.dizimos || 0)}</div>` : ''}
      </div>
      <span class="act-time">${fmtDate(e.data)}</span>
      ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delEvento('${e.id}')">${lc("trash-2", 14)}</button>` : ''}
    </div>`).join('')}</div>` : `<div class="empty" style="margin-bottom:28px"><div class="empty-ico">${lc("clipboard-list", 14)}</div><p>Nenhum evento registrado.</p></div>`}

  <div class="sec-hdr"><h2>Membros <span class="count-badge">${(mems || []).length}</span></h2></div>
  ${(mems || []).length ? `<div class="member-list">${(mems || []).map((m, i) => `
    <div class="member-row" style="animation-delay:${i * .04}s" onclick="openMemberModal('${m.id}')">
      <div class="av" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
      <div class="f1">
        <div class="mem-name">${escHtml(m.nome)}</div>
        <div class="mem-role">${escHtml(m.cargo)} · ${m.idade || '—'} anos</div>
      </div>
      ${m.frequenta_ebd ? `<span class="tag tag-blue fs-xs">${lc("book-open", 14)} EBD</span>` : ''}
      <div class="mem-actions" onclick="event.stopPropagation()">
        <button class="btn btn-teal btn-sm" onclick="openMemberModal('${m.id}')">Ver</button>
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delMembro('${m.id}','${escHtml(m.nome)}')">${lc("trash-2", 14)}</button>` : ''}
      </div>
    </div>`).join('')}</div>` : `<div class="empty"><div class="empty-ico">${lc("users", 18)}</div><p>Nenhum membro cadastrado.</p></div>`}`;
}

function toggleLiderExpand(card) {
  const expand = card.querySelector('.lider-expand');
  const hint = card.querySelector('.lider-expand-hint');
  if (!expand) return;
  expand.classList.toggle('hidden');
  if (hint) hint.textContent = expand.classList.contains('hidden') ? '👆 clique para expandir' : '👆 clique para recolher';
}

function buildMapLinks(c) {
  if (!c.endereco && !c.latitude) return '';
  const query = c.latitude && c.longitude ? `${c.latitude},${c.longitude}` : encodeURIComponent(c.endereco || c.nome);
  return `<span class="map-links"><a href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" rel="noopener" class="map-btn maps-btn">${lc("map-pin", 14)} Maps</a><a href="${c.latitude && c.longitude ? `https://waze.com/ul?ll=${c.latitude},${c.longitude}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(c.endereco || c.nome)}`}" target="_blank" rel="noopener" class="map-btn waze-btn">${lc("navigation", 14)} Waze</a></span>`;
}

function buildEventMenuHtml() {
  const grupos = {};
  Object.entries(TIPOS_EVENTO).forEach(([tipo, info]) => {
    // Omite evento_setorial do menu da congregação
    if (tipo === 'evento_setorial') return;
    if (!grupos[info.grupo]) grupos[info.grupo] = [];
    grupos[info.grupo].push({ tipo, ...info });
  });
  return Object.entries(grupos).map(([grupo, itens]) => `<div class="dropdown-label">${grupo}</div>${itens.map(({ tipo, label, icon }) => `<div class="dropdown-item" onclick="openEventModal('${tipo}')">${lc(icon, 14)} ${label}</div>`).join('')}`).join('');
}

function renderAgendaSemanaGrid(items, inicioSemana, congId) {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let html = '<div class="agenda-grid-7">';
  for (let d = 0; d < 7; d++) {
    const dia = new Date(inicioSemana); dia.setDate(inicioSemana.getDate() + d);
    const dStr = dia.toISOString().slice(0, 10); const item = items.find(i => i.data === dStr);
    const isToday = dStr === new Date().toISOString().slice(0, 10);
    html += `<div class="agenda-day${isToday ? ' agenda-today' : ''}"><div class="ag-day-head"><span class="ag-day-name">${dias[d]}</span><span class="ag-day-num">${dia.getDate()}</span></div><div class="ag-day-body">${item ? `<div class="ag-event-chip" onclick="openAgendaDetail('${item.id}')">${escHtml(item.titulo || item.descricao || '')}</div>` : ''} ${hasPerm('gerenciar_agenda') ? `<button class="ag-add-btn" onclick="openAgendaModal('${congId}','${dStr}',${item ? `'${item.id}'` : 'null'})">+</button>` : ''}</div></div>`;
  }
  return html + '</div>';
}

async function openAgendaModal(congId, dataPreset = '', editId = null) {
  if (!hasPerm('gerenciar_agenda')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("calendar", 14)}</span><h2>${editId ? 'Editar' : 'Adicionar'} Agenda</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="form-group"><label>Data *</label><input id="ag-data" type="date" value="${dataPreset || new Date().toISOString().slice(0, 10)}"/></div><div class="form-group"><label>Título *</label><input id="ag-titulo" placeholder="Ex: Culto de Domingo"/></div><div class="form-group"><label>Horário</label><input id="ag-hora" type="time"/></div><div class="form-group"><label>Descrição</label><textarea id="ag-desc" rows="3"></textarea></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveAgenda('${congId}','${editId || ''}')">${lc("save", 14)} Salvar</button></div>`);
  if (editId) { const { data: ag } = await q('agenda_semana').select('*').eq('id', editId).single(); if (ag) { $('ag-data').value = ag.data || ''; $('ag-titulo').value = ag.titulo || ''; $('ag-hora').value = ag.hora || ''; $('ag-desc').value = ag.descricao || ''; } }
}
async function saveAgenda(congId, editId) {
  if (!hasPerm('gerenciar_agenda')) { toast('Sem permissão', 'error'); return; }
  const titulo = ($('ag-titulo')?.value || '').trim(), data = $('ag-data')?.value;
  if (!titulo || !data) { toast('Título e data obrigatórios', 'error'); return; }
  const payload = { congregacao_id: congId, setor_id: navState.setor?.id || null, data, titulo, hora: $('ag-hora')?.value || null, descricao: ($('ag-desc')?.value || '').trim() || null };
  let error; if (editId) ({ error } = await q('agenda_semana').update(payload).eq('id', editId)); else ({ error } = await q('agenda_semana').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast(editId ? 'Agenda atualizada!' : 'Evento adicionado!'); closeModal(); renderSetores();
}
async function openAgendaDetail(id) {
  const { data: ag } = await q('agenda_semana').select('*').eq('id', id).single(); if (!ag) return;
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div style="font-size:40px;margin-bottom:8px">${lc("calendar", 14)}</div><div class="mem-modal-name">${escHtml(ag.titulo || '')}</div><span class="tag tag-gold">${fmtDate(ag.data)}${ag.hora ? ' · ' + ag.hora : ''}</span></div><div style="padding:0 30px 16px">${ag.descricao ? `<p style="color:var(--txt2);font-size:.88rem">${escHtml(ag.descricao)}</p>` : '<p class="c3">Sem descrição.</p>'}</div><div class="mem-modal-foot">${hasPerm('gerenciar_agenda') ? `<button class="btn btn-secondary" onclick="openAgendaModal('${ag.congregacao_id}','${ag.data}','${ag.id}');closeModal()">${lc("pencil", 14)}</button>` : ''} ${hasPerm('excluir_registros') ? `<button class="btn btn-danger" onclick="delAgenda('${ag.id}')">${lc("trash-2", 14)}</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
}
async function delAgenda(id) {
  if (!hasPerm('excluir_registros')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir Agenda', 'Este item será removido.');
  if (!r.isConfirmed) return;
  const { error } = await q('agenda_semana').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Removido!'); closeModal(); renderSetores();
}
async function openAgendaCompleta(congId) {
  showModal(`<div class="modal-hdr"><span>${lc("calendar", 14)}</span><h2>Agenda Completa</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="agenda-completa-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  const mesAtual = new Date(); const inicio = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { data: items } = await q('agenda_semana').select('*').eq('congregacao_id', congId).gte('data', inicio).lte('data', fim).order('data');
  $('agenda-completa-body').innerHTML = `<p class="c3 fs-sm" style="margin-bottom:16px">Mês atual</p>${(items || []).length ? (items || []).map(i => `<div class="act-item" onclick="openAgendaDetail('${i.id}');closeModal()" style="cursor:pointer;margin-bottom:8px"><div class="act-dot" style="background:var(--gold)"></div><div class="f1"><div class="fw5">${escHtml(i.titulo || '')}</div><div class="fs-xs c3">${escHtml(i.descricao || '')}</div></div><span class="act-time">${fmtDate(i.data)}</span></div>`).join('') : '<div class="empty"><div class="empty-ico">${lc("calendar",14)}</div><p>Nenhum item.</p></div>'}`;
}

function toggleEventMenu() {
  const m = $('event-menu'); if (m) m.classList.toggle('hidden');
  const handler = e => { if (!e.target.closest('.dropdown-wrap')) { m?.classList.add('hidden'); document.removeEventListener('click', handler); } };
  setTimeout(() => document.addEventListener('click', handler), 0);
}

async function openEventModal(tipo) {
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
    <div class="form-row"><div class="form-group"><label>Participantes</label><input id="ev-participantes" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Conversões</label><input id="ev-conversoes" type="number" min="0" placeholder="0"/></div></div>
    ${canSeeFinanceiro() ? `<div class="form-row"><div class="form-group"><label>Ofertas (R$)</label><input id="ev-ofertas" type="number" step="0.01" min="0" placeholder="0"/></div><div class="form-group"><label>Dízimos (R$)</label><input id="ev-dizimos" type="number" step="0.01" min="0" placeholder="0"/></div></div>` : ''}
    <div class="form-section-title">${lc("book-open", 14)} Campos Espirituais</div>
    <div class="form-row"><div class="form-group"><label>Almas Salvas</label><input id="ev-almas-salvas" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Batismo no Espírito</label><input id="ev-batismo-espirito" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-row"><div class="form-group"><label>Renovo</label><input id="ev-renovo" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Bênçãos Alcançadas</label><input id="ev-bencaos" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-row"><div class="form-group"><label>Desviados que Voltaram</label><input id="ev-desviados" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Literaturas Distribuídas</label><input id="ev-literaturas" type="number" min="0" placeholder="0"/></div></div>`;
  } else if (info.ebd) {
    extraFields = `
    <div class="form-row"><div class="form-group"><label>Horário</label><input id="ev-inicio" type="time"/></div><div class="form-group"><label>Participantes</label><input id="ev-participantes" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-group"><label>Tema da Lição *</label><input id="ev-tema-licao" placeholder="Ex: A fé de Abraão"/></div>
    <div class="form-group"><label>Referência Bíblica</label><input id="ev-referencia" placeholder="Ex: Gênesis 12"/></div>`;
  } else if (info.evangelismo) {
    extraFields = `
    <div class="form-row"><div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time"/></div><div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time"/></div></div>
    <div class="form-row"><div class="form-group"><label>Evangelizados</label><input id="ev-evangelizados" type="number" min="0" placeholder="0"/></div><div class="form-group"><label>Vidas Salvas</label><input id="ev-conversoes" type="number" min="0" placeholder="0"/></div></div>
    <div class="form-group"><label>Participantes (equipe)</label><input id="ev-participantes" type="number" min="0" placeholder="0"/></div>`;
  } else {
    extraFields = `<div class="form-group"><label>Quantidade / Participantes</label><input id="ev-participantes" type="number" min="0" placeholder="0"/></div>`;
  }

  const memsParaEBD = info.ebd ? (mems || []).filter(m => m.frequenta_ebd) : (mems || []);

  showModal(`<div class="modal-hdr"><span>${lc(info.icon, 20)}</span><h2>Registrar: ${info.label}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="ev-data" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
    <div class="form-group"><label>Resumo / Obs.</label><textarea id="ev-resumo" rows="2" style="resize:vertical"></textarea></div>
    ${extraFields}
    <div class="form-group"><label>${info.ebd ? 'Alunos/Professores (EBD)' : 'Participantes da Congregação'}</label>
    ${info.ebd && memsParaEBD.length === 0 ? '<p class="c3 fs-xs" style="padding:10px;background:rgba(59,130,246,.05);border-radius:8px;border:1px solid rgba(59,130,246,.1)">${lc("alert-triangle",14)} Nenhum membro matriculado na EBD.</p>' : ''}
    <div class="member-select-list" id="ev-mems-local">${memsParaEBD.map(m => `<label class="check-row"><input type="checkbox" class="ev-mem-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}${m.papel_ebd ? ' · ' + m.papel_ebd : ''}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum membro.</p>'}</div></div>
    ${!info.ebd ? `<div class="form-group"><label>Externos (mesmo setor)</label><input id="ev-ext-search" placeholder="Buscar..." oninput="filterExtMembers(this.value)" style="margin-bottom:8px"/><div class="member-select-list" id="ev-mems-ext" style="max-height:140px">${(allMems || []).map(m => `<label class="check-row ev-ext-row"><input type="checkbox" class="ev-ext-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}</em></span></label>`).join('') || '<p class="c3 fs-xs">Sem externos.</p>'}</div></div>` : ''}
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEvento('${tipo}')">${lc("plus-circle", 14)} Registrar</button></div>`);
}
function filterExtMembers(q2) { document.querySelectorAll('.ev-ext-row').forEach(row => { row.style.display = (row.querySelector('input')?.dataset.nome || '').toLowerCase().includes(q2.toLowerCase()) ? '' : 'none'; }); }

async function submitEvento(tipo) {
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
  };
  const { error } = await q('eventos').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal(); renderSetores();
}

async function openEventDetail(id) {
  showModal(loadingPage());
  const { data: ev, error } = await q('eventos').select('*').eq('id', id).single();
  if (error || !ev) { closeModal(); toast('Erro', 'error'); return; }
  const info = TIPOS_EVENTO[ev.tipo] || { label: ev.tipo, icon: 'clipboard-list' };
  let participantesHtml = '';
  if (ev.participante_ids?.length > 0) {
    const { data: partics } = await q('membros').select('id,nome,cargo').in('id', ev.participante_ids);
    if ((partics || []).length) participantesHtml = `<div style="padding:0 30px 8px"><div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Participantes (${partics.length})</h2></div><div class="partic-list">${partics.map(p => `<div class="partic-row"><div class="av av-sm" style="background:${avatarColor(p.nome)}">${initials(p.nome)}</div><span class="fs-sm">${escHtml(p.nome)} <em class="c3 fs-xs">${escHtml(p.cargo || '')}</em></span></div>`).join('')}</div></div>`;
  }
  let detalhes = '';
  if (info.financeiro) {
    detalhes = `<div class="mem-info-grid"><div class="inf-item"><label>Horário</label><span>${ev.hora_inicio || '—'} – ${ev.hora_fim || '—'}</span></div><div class="inf-item"><label>Participantes</label><span>${ev.participantes || 0}</span></div><div class="inf-item"><label>Conversões</label><span>${ev.conversoes || 0}</span></div>${canSeeFinanceiro() ? `<div class="inf-item"><label>Ofertas</label><span>${fmtMoney(ev.ofertas)}</span></div><div class="inf-item"><label>Dízimos</label><span>${fmtMoney(ev.dizimos)}</span></div>` : ''} ${ev.almas_salvas ? `<div class="inf-item"><label>Almas Salvas</label><span>${ev.almas_salvas}</span></div>` : ''} ${ev.batismo_espirito ? `<div class="inf-item"><label>Batismo Esp.</label><span>${ev.batismo_espirito}</span></div>` : ''}</div>`;
  } else if (info.ebd) {
    detalhes = `<div class="mem-info-grid"><div class="inf-item"><label>Horário</label><span>${ev.hora_inicio || '—'}</span></div><div class="inf-item"><label>Presentes</label><span>${ev.participantes || 0}</span></div>${ev.tema_licao ? `<div class="inf-item" style="grid-column:span 2"><label>Tema</label><span>${escHtml(ev.tema_licao)}</span></div>` : ''}</div>`;
  } else {
    detalhes = `<div class="mem-info-grid"><div class="inf-item"><label>Participantes</label><span>${ev.participantes || 0}</span></div></div>`;
  }
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div style="font-size:40px;margin-bottom:8px">${lc(info.icon, 40)}</div><div class="mem-modal-name">${info.label}</div><span class="tag tag-gold">${fmtDate(ev.data)}</span></div>${detalhes}${ev.resumo ? `<div style="padding:0 30px 8px"><p style="color:var(--txt2);font-size:.88rem">${escHtml(ev.resumo)}</p></div>` : ''}${participantesHtml}<div class="mem-modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
}

async function openEventoSetorialDetail(id) {
  showModal(loadingPage());
  const { data: ev, error } = await q('eventos').select('*').eq('id', id).single();
  if (error || !ev) { closeModal(); toast('Erro', 'error'); return; }
  const { data: setores } = await q('setores').select('id,nome');
  const setorNome = (setores || []).find(s => s.id === ev.setor_id)?.nome || '—';
  let participantesHtml = '';
  if (ev.participante_ids?.length > 0) {
    const { data: partics } = await q('sistema_usuarios').select('id,nome,cargo').in('id', ev.participante_ids);
    if ((partics || []).length) participantesHtml = `<div style="padding:0 30px 8px"><div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Participantes (${partics.length})</h2></div><div class="partic-list">${partics.map(p => `<div class="partic-row"><div class="av av-sm" style="background:${avatarColor(p.nome)}">${initials(p.nome)}</div><span class="fs-sm">${escHtml(p.nome)} <em class="c3 fs-xs">${escHtml(p.cargo || '')}</em></span></div>`).join('')}</div></div>`;
  }
  const detalhes = `<div class="mem-info-grid"><div class="inf-item"><label>Setor</label><span>${escHtml(setorNome)}</span></div><div class="inf-item"><label>Data</label><span>${fmtDate(ev.data)}</span></div><div class="inf-item"><label>Horário</label><span>${ev.hora_inicio || '—'} ${ev.hora_fim ? '– ' + ev.hora_fim : ''}</span></div><div class="inf-item"><label>Participantes</label><span>${ev.participantes || 0}</span></div>${ev.conversoes ? `<div class="inf-item"><label>Conversões</label><span>${ev.conversoes}</span></div>` : ''}</div>`;
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div style="font-size:40px;margin-bottom:8px">${lc('building-2', 40)}</div><div class="mem-modal-name">${escHtml(ev.resumo || 'Evento Setorial')}</div><span class="tag tag-violet">Evento Setorial</span></div>${detalhes}${ev.descricao ? `<div style="padding:0 30px 8px"><p style="color:var(--txt2);font-size:.88rem">${escHtml(ev.descricao)}</p></div>` : ''}${participantesHtml}<div class="mem-modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
}

async function openOfertasModal() {
  showModal(loadingPage());
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inicioMes = `${mesAtual}-01`;
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  
  let query = q('eventos').select('id,resumo,data,hora_inicio,hora_fim,participantes,ofertas,congregacao_id')
    .gte('data', inicioMes)
    .lte('data', fimMes)
    .gt('ofertas', 0)
    .order('data', { ascending: false });
  
  if (sid) query = query.eq('setor_id', sid);
  if (cid) query = query.eq('congregacao_id', cid);
  
  const { data: eventos = [] } = await query;
  const totalOfertas = eventos.reduce((s, e) => s + (e.ofertas || 0), 0);
  
  const eventosList = eventos.map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--txt)">${escHtml(e.resumo || 'Evento')}</div>
        <div style="font-size:.78rem;color:var(--txt2);margin-top:2px">${fmtDate(e.data)} ${e.hora_inicio ? '· ' + e.hora_inicio : ''}</div>
      </div>
      <span class="tag tag-gold" style="white-space:nowrap">${fmtMoney(e.ofertas || 0)}</span>
    </div>
  `).join('');
  
  const noResults = eventos.length === 0 ? `<div style="padding:30px 20px;text-align:center;color:var(--txt2)"><p>${lc('inbox', 32)}</p><p style="font-size:.88rem;margin-top:8px">Nenhuma oferta registrada este mês</p></div>` : '';
  
  const html = `
    <div class="modal-hdr">
      <span>${lc('coins', 20)}</span>
      <h2>Ofertas</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="max-height:500px;overflow-y:auto">
      <div style="padding:20px 30px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:.88rem;color:var(--txt2);margin-bottom:4px">Total de Ofertas</div>
        <div style="font-size:1.6rem;font-weight:800;color:var(--txt)">${fmtMoney(totalOfertas)}</div>
        <div style="font-size:.72rem;color:var(--txt3);margin-top:2px">${eventos.length} evento(s) este mês</div>
      </div>
      <div style="padding:12px">
        ${noResults || eventosList}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `;
  
  showModal(html);
}

async function openDizimosModal() {
  showModal(loadingPage());
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inicioMes = `${mesAtual}-01`;
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  
  let query = q('eventos').select('id,resumo,data,hora_inicio,hora_fim,participantes,dizimos,congregacao_id')
    .gte('data', inicioMes)
    .lte('data', fimMes)
    .gt('dizimos', 0)
    .order('data', { ascending: false });
  
  if (sid) query = query.eq('setor_id', sid);
  if (cid) query = query.eq('congregacao_id', cid);
  
  const { data: eventos = [] } = await query;
  const totalDizimos = eventos.reduce((s, e) => s + (e.dizimos || 0), 0);
  
  const eventosList = eventos.map(e => `
    <div class="act-item" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--txt)">${escHtml(e.resumo || 'Evento')}</div>
        <div style="font-size:.78rem;color:var(--txt2);margin-top:2px">${fmtDate(e.data)} ${e.hora_inicio ? '· ' + e.hora_inicio : ''}</div>
      </div>
      <span class="tag tag-violet" style="white-space:nowrap">${fmtMoney(e.dizimos || 0)}</span>
    </div>
  `).join('');
  
  const noResults = eventos.length === 0 ? `<div style="padding:30px 20px;text-align:center;color:var(--txt2)"><p>${lc('inbox', 32)}</p><p style="font-size:.88rem;margin-top:8px">Nenhum dízimo registrado este mês</p></div>` : '';
  
  const html = `
    <div class="modal-hdr">
      <span>${lc('gem', 20)}</span>
      <h2>Dízimos</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="max-height:500px;overflow-y:auto">
      <div style="padding:20px 30px;border-bottom:1px solid var(--bdr)">
        <div style="font-size:.88rem;color:var(--txt2);margin-bottom:4px">Total de Dízimos</div>
        <div style="font-size:1.6rem;font-weight:800;color:var(--txt)">${fmtMoney(totalDizimos)}</div>
        <div style="font-size:.72rem;color:var(--txt3);margin-top:2px">${eventos.length} evento(s) este mês</div>
      </div>
      <div style="padding:12px">
        ${noResults || eventosList}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `;
  
  showModal(html);
}

async function delEvento(id) {
  if (!hasPerm('excluir_registros')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir Evento', 'Este evento será removido permanentemente.');
  if (!r.isConfirmed) return;
  const { error } = await q('eventos').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento removido!'); renderSetores();
}

async function openMemberModal(id) {
  showModal(loadingPage());
  const { data: m, error } = await q('membros').select('*').eq('id', id).single();
  if (error || !m) { closeModal(); toast('Erro', 'error'); return; }
  const ebdInfo = m.frequenta_ebd ? `<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:#38bdf8;margin-bottom:4px">${lc("book-open", 14)} Escola Bíblica Dominical</div><div class="c3">Papel: <strong style="color:var(--txt)">${escHtml(m.papel_ebd || 'Aluno')}</strong></div></div>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${hasPerm('gerenciar_membros') ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
}

function openEditMembro(id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" value="${escHtml(m.telefone || '')}"/></div>
    <div class="form-group"><label>Email</label><input id="em-email" value="${escHtml(m.email || '')}"/></div>
    <div class="form-section-title">${lc("book-open", 14)} Escola Bíblica Dominical</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="em-ebd"><option value="false" ${!m.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${m.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
      <div class="form-group"><label>Papel</label><select id="em-papel-ebd"><option value="" ${!m.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${m.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${m.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${m.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
    </div>`;
    const modal = document.querySelector('.modal');
    if (modal && !modal.querySelector('.modal-foot')) { const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveMembro('${id}')">${lc("save", 14)} Salvar</button>`; modal.appendChild(foot); }
  });
}
async function saveMembro(id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  const payload = { nome: ($('em-nome')?.value || '').trim(), cargo: $('em-cargo')?.value, idade: parseInt($('em-idade')?.value) || null, telefone: ($('em-tel')?.value || '').trim(), email: ($('em-email')?.value || '').trim(), frequenta_ebd: $('em-ebd')?.value === 'true', papel_ebd: $('em-papel-ebd')?.value || null };
  if (!payload.nome) { toast('Nome obrigatório', 'error'); return; }
  const { error } = await q('membros').update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast('Membro atualizado!'); if (currentPage === 'setores') renderSetores();
}
async function delMembro(id, nome) {
  if (!hasPerm('excluir_registros')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Remover Membro', `"${nome}" será removido.`);
  if (!r.isConfirmed) return;
  const { error } = await q('membros').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Membro removido!'); renderSetores();
}

function openAddModal(type) {
  const labels = { setor: 'Novo Setor', congregacao: 'Nova Congregação', membro: 'Novo Membro' };
  let body = '';
  if (type === 'setor') body = `<div class="form-group"><label>Nome do Setor *</label><input id="add-nome" placeholder="Ex: Setor Alpha"/></div><div class="form-group"><label>Região</label><select id="add-reg">${REGIOES.map(r => `<option>${r}</option>`).join('')}</select></div>`;
  else if (type === 'congregacao') body = `<div class="form-group"><label>Nome *</label><input id="add-nome"/></div><div class="form-group"><label>Endereço</label><input id="add-end"/></div><div class="form-group"><label>Pastor Local</label><input id="add-past"/></div><div class="form-row"><div class="form-group"><label>Latitude</label><input id="add-lat" type="number" step="0.0000001"/></div><div class="form-group"><label>Longitude</label><input id="add-lng" type="number" step="0.0000001"/></div></div>`;
  else body = `
    <div class="form-group"><label>Nome Completo *</label><input id="add-nome"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="add-cargo">${CARGOS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="add-idade" type="number"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="add-tel"/></div>
    <div class="form-group"><label>Email</label><input id="add-email" type="email"/></div>
    <div class="form-section-title">${lc("book-open", 14)} EBD</div>
    <div class="form-row"><div class="form-group"><label>Frequenta EBD?</label><select id="add-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-group"><label>Papel</label><select id="add-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div></div>`;
  showModal(`<div class="modal-hdr"><span>${lc("plus-circle", 14)}</span><h2>${labels[type]}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAdd('${type}')">${lc("plus-circle", 14)} Criar</button></div>`);
  setTimeout(() => { const n = $('add-nome'); if (n) n.focus(); }, 100);
}
async function submitAdd(type) {
  const nome = ($('add-nome')?.value || '').trim(); if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  let error;
  if (type === 'setor') { if (!hasPerm('gerenciar_setores')) { toast('Sem permissão', 'error'); return; } ({ error } = await q('setores').insert({ nome, regiao: $('add-reg').value })); }
  else if (type === 'congregacao') { if (!hasPerm('gerenciar_congregacoes')) { toast('Sem permissão', 'error'); return; } ({ error } = await q('congregacoes').insert({ nome, setor_id: navState.setor.id, endereco: $('add-end')?.value || null, pastor_local: $('add-past')?.value || null, latitude: parseFloat($('add-lat')?.value) || null, longitude: parseFloat($('add-lng')?.value) || null })); }
  else { if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; } ({ error } = await q('membros').insert({ nome, congregacao_id: navState.cong.id, setor_id: navState.setor.id, cargo: $('add-cargo').value, idade: parseInt($('add-idade')?.value) || null, telefone: $('add-tel')?.value || null, email: $('add-email')?.value || null, frequenta_ebd: $('add-ebd')?.value === 'true', papel_ebd: $('add-papel-ebd')?.value || null })); }
  if (error) { toast(error.message, 'error'); return; }
  toast({ setor: 'Setor criado!', congregacao: 'Congregação criada!', membro: 'Membro adicionado!' }[type]);
  closeModal(); renderSetores();
  if (type === 'congregacao') await loadAllCongs(); // atualiza cache
}

/* ════════════════════════════════════════════════════════════
   USUÁRIOS — Campo Congregação como select
════════════════════════════════════════════════════════════ */
async function renderUsuarios() {
  if (!hasPerm('gerenciar_usuarios')) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("shield-off", 14)}</div><p>Sem permissão.</p></div>`; return; }
  $('page-content').innerHTML = loadingPage();
  let qU = q('sistema_usuarios').select('*').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qU = qU.eq('setor_id', currentUser.setor_id);
  const { data, error } = await qU;
  if (error) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("alert-triangle", 14)}</div><p>${error.message}</p></div>`; return; }
  const { data: setores } = await q('setores').select('id,nome').order('nome');
  const usuarios = (data || []).filter(u => u.nome.toLowerCase().includes(userSearch.toLowerCase()));
  const setorNome = id => (setores || []).find(s => s.id === id)?.nome || '—';
  const congNome = id => allCongsCache.find(c => c.id === id)?.nome || '—';
  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Usuários do Sistema ${!canSeeAllSetores() ? '<span class="tag tag-blue fs-xs" style="vertical-align:middle">Filtrado por setor</span>' : ''}</h2>
    <div class="sec-actions">
      ${backBtn()}
      <div class="search-wrap form-group" style="margin:0"><span class="search-ico">${lc("search", 14)}</span><input value="${escHtml(userSearch)}" placeholder="Buscar..." oninput="userSearch=this.value;renderUsuarios()" style="width:180px"/></div>
      <button class="btn btn-primary btn-sm" onclick="openUserModal(null)">+ Novo</button>
    </div>
  </div>
  <div class="responsive-table-wrap">
    ${usuarios.map(u => `
    <div class="user-card">
      <div class="user-card-main">
        <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
        <div class="user-card-info">
          <div class="fw5 fs-sm">${escHtml(u.nome)}</div>
          <div class="fs-xs c3">${escHtml(u.username || '—')} · ${escHtml(u.cargo || '—')}</div>
          <div class="user-card-tags">
            <span class="role-badge ${roleCls(u.role)}">${u.role}</span>
            <span class="tag ${u.ativo ? 'tag-teal' : 'tag-rose'}">${u.ativo ? 'Ativo' : 'Inativo'}</span>
            ${u.setor_id ? `<span class="tag tag-blue fs-xs">${setorNome(u.setor_id)}</span>` : '<span class="tag tag-rose fs-xs">Sem setor</span>'}
            ${u.congregacao_id ? `<span class="tag tag-gold fs-xs">${lc("church", 14)} ${congNome(u.congregacao_id)}</span>` : ''}
            ${u.frequenta_ebd ? `<span class="tag tag-blue fs-xs">${lc("book-open", 14)} EBD</span>` : ''}
          </div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.id}')">${lc("pencil", 14)}</button>
        ${isSuperAdmin() ? `<button class="btn btn-secondary btn-sm" onclick="openUserPermModal('${u.id}','${escHtml(u.nome)}')">${lc("shield-off", 14)}</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="delUser('${u.id}','${escHtml(u.nome)}')">${lc("trash-2", 14)}</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function openUserModal(id) {
  const ROLES = ['admin', 'dirigente', 'adjunto', 'usuario'];
  showModal(`<div class="modal-hdr"><span>👤</span><h2>${id ? 'Editar Usuário' : 'Novo Usuário'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="user-modal-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot" id="user-modal-foot"></div>`);
  Promise.all([
    id ? q('sistema_usuarios').select('*').eq('id', id).single() : { data: null },
    q('setores').select('id,nome').order('nome'),
    q('congregacoes').select('id,nome,setor_id').order('nome')
  ]).then(([{ data: u }, { data: setores }, { data: congs }]) => {
    $('user-modal-body').innerHTML = userFormHtml(u, ROLES, setores || [], congs || []);
    $('user-modal-foot').innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveUser('${id || ''}')">${lc("save", 14)} Salvar</button>`;
    // Listener para filtrar congregações por setor
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
}

function userFormHtml(u, ROLES, setores = [], congs = []) {
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
  <div class="form-group"><label>Cargo</label><select id="um-cargo">${CARGOS.map(c => `<option ${c === (u?.cargo || 'Membro') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
  <div class="form-group"><label>Status</label><select id="um-ativo"><option value="true" ${u?.ativo !== false ? 'selected' : ''}>Ativo</option><option value="false" ${u?.ativo === false ? 'selected' : ''}>Inativo</option></select></div>
  <div class="form-section-title">${lc("book-open", 14)} EBD</div>
  <div class="form-row">
    <div class="form-group"><label>Frequenta EBD?</label><select id="um-ebd"><option value="false" ${!u?.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${u?.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
    <div class="form-group"><label>Papel na EBD</label><select id="um-papel-ebd"><option value="" ${!u?.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${u?.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${u?.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${u?.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
  </div>`;
}

async function saveUser(id) {
  const nome = ($('um-name')?.value || '').trim(), username = ($('um-username')?.value || '').trim(), senha = ($('um-pass')?.value || '').trim();
  if (!nome || !username) { toast('Nome e username obrigatórios', 'error'); return; }
  if (!id && !senha) { toast('Senha obrigatória', 'error'); return; }
  const congId = $('um-cong-sel')?.value || null;
  const congNomeVal = allCongsCache.find(c => c.id === congId)?.nome || '';
  const payload = { nome, username, role: $('um-role').value, cargo: $('um-cargo').value, congregacao: congNomeVal, congregacao_id: congId, idade: parseInt($('um-age')?.value) || null, ativo: $('um-ativo').value === 'true', setor_id: $('um-setor')?.value || null, frequenta_ebd: $('um-ebd')?.value === 'true', papel_ebd: $('um-papel-ebd')?.value || null };
  if (senha) payload.senha = senha;
  const { error } = id ? await q('sistema_usuarios').update(payload).eq('id', id) : await q('sistema_usuarios').insert(payload);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast(id ? 'Usuário atualizado!' : 'Usuário criado!'); renderUsuarios();
}
async function delUser(id, nome) {
  if (!isSuperAdmin() && !hasPerm('gerenciar_usuarios')) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Remover Usuário', `"${nome}" será removido.`); if (!r.isConfirmed) return;
  const { error } = await q('sistema_usuarios').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Usuário removido!'); renderUsuarios();
}
async function openUserPermModal(userId, userName) {
  if (!isSuperAdmin()) { toast('Apenas admin pode alterar', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("shield-off", 14)}</span><h2>Permissões — ${escHtml(userName)}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="uperm-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  const [{ data: rp }, { data: up }, { data: userRow }] = await Promise.all([q('role_permissions').select('permission_code,ativo'), q('user_permissions').select('permission_code,ativo').eq('user_id', userId), q('sistema_usuarios').select('role').eq('id', userId).single()]);
  const role = userRow?.role || 'usuario'; const rolePerms = {}, userOverrides = {}, resolved = {};
  (rp || []).forEach(p => { rolePerms[p.permission_code] = p.ativo; });
  (up || []).forEach(p => { userOverrides[p.permission_code] = p.ativo; });
  Object.keys(PERM_DESC).forEach(code => { resolved[code] = userOverrides.hasOwnProperty(code) ? userOverrides[code] : (rolePerms[code] || false); });
  $('uperm-body').innerHTML = `<p class="c3 fs-sm" style="margin-bottom:14px">Grupo: <span class="role-badge ${roleCls(role)}">${role}</span></p>${Object.entries(PERM_DESC).map(([code, { label, desc }]) => { const on = !!resolved[code], isOverride = userOverrides.hasOwnProperty(code); return `<div class="perm-row"><div class="perm-lbl"><strong>${label} ${isOverride ? '<span class="tag tag-gold" style="font-size:.6rem">override</span>' : ''}</strong><span>${desc}</span></div><div class="toggle-sw${on ? ' on' : ''}" onclick="toggleUserPerm('${userId}','${code}',${on})"></div></div>`; }).join('')}`;
}
async function toggleUserPerm(userId, perm, current) {
  if (!isSuperAdmin()) { toast('Sem permissão', 'error'); return; }
  const novoValor = !current;
  try { const { error } = await db.rpc('toggle_user_permission', { p_target_user: userId, p_perm: perm, p_ativo: novoValor }); if (error) throw error; }
  catch (e) { const { error } = await q('user_permissions').upsert({ user_id: userId, permission_code: perm, ativo: novoValor }, { onConflict: 'user_id,permission_code' }); if (error) { toast(error.message, 'error'); return; } }
  toast(`Permissão ${novoValor ? 'concedida' : 'removida'}`);
  const uName = document.querySelector('#modal-container .modal-hdr h2')?.textContent.replace('Permissões — ', '') || '';
  if(perm === 'visualizar_ranking' || perm === 'gerenciar_ranking'){
  if(typeof window.injectRankingMenu === 'function') window.injectRankingMenu();
}
  openUserPermModal(userId, uName);
}

/* ════════════════════════════════════════════════════════════
   RELATÓRIOS
════════════════════════════════════════════════════════════ */
async function renderRelatorios() {
  if (!hasPerm('ver_relatorios')) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("shield-off", 14)}</div><p>Sem permissão.</p></div>`; return; }
  $('page-content').innerHTML = loadingPage();
  const now = new Date();
  if (!relFiltroInicio) relFiltroInicio = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (!relFiltroFim) relFiltroFim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  if (!relSetorFiltro) relSetorFiltro = currentUser?.setor_id || null;
  const { data: allSetores } = await q('setores').select('id,nome').order('nome');
  const sid = relSetorFiltro || currentUser?.setor_id || null;
  const cid = relCongFiltro || null;
  let congsList = [];
  if (sid) { const { data: cs } = await q('congregacoes').select('id,nome').eq('setor_id', sid).order('nome'); congsList = cs || []; }
  let qEv = q('eventos').select('*').order('data', { ascending: false }).gte('data', relFiltroInicio).lte('data', relFiltroFim);
  let qCong = q('congregacoes').select('id,nome,setor_id');
  let qSet = q('setores').select('id,nome');
  let qMem = q('membros').select('congregacao_id,setor_id');
  if (sid) { qEv = qEv.eq('setor_id', sid); qCong = qCong.eq('setor_id', sid); qSet = qSet.eq('id', sid); qMem = qMem.eq('setor_id', sid); }
  if (cid) { qEv = qEv.eq('congregacao_id', cid); qCong = qCong.eq('id', cid); qMem = qMem.eq('congregacao_id', cid); }
  const [rEv, rCong, rSet, rMem] = await Promise.all([qEv, qCong, qSet, qMem]);
  const eventos = rEv.data || [], congs = rCong.data || [], setores = rSet.data || [];
  const memCount = id => (rMem.data || []).filter(m => m.congregacao_id === id).length;
  const cultos = eventos.filter(e => e.tipo === 'culto').length, genEvt = eventos.filter(e => e.tipo === 'evento').length, saidas = eventos.filter(e => e.tipo === 'saida').length;
  const totalPart = eventos.reduce((s, e) => s + (e.participantes || 0), 0), totalOfer = eventos.reduce((s, e) => s + (e.ofertas || 0), 0), totalDiz = eventos.reduce((s, e) => s + (e.dizimos || 0), 0), totalConv = eventos.reduce((s, e) => s + (e.conversoes || 0), 0);

  const setorSel = canFilterSetores() ? `<div class="form-group" style="margin:0"><label>Setor</label><select id="rel-setor" onchange="relSetorFiltro=this.value||currentUser?.setor_id||null;relCongFiltro=null" style="min-width:160px">${(allSetores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}</select></div>` : `<div style="font-size:.82rem;color:var(--txt2)">${lc("map-pin", 14)} ${escHtml((allSetores || []).find(s => s.id === sid)?.nome || '—')}</div>`;
  const congSel = canVerRelCong() && congsList.length ? `<div class="form-group" style="margin:0"><label>Congregação</label><select id="rel-cong" onchange="relCongFiltro=this.value||null" style="min-width:160px"><option value="">Todas</option>${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}</select></div>` : '';

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Relatórios e Estatísticas</h2>
    <div class="sec-actions">
      ${backBtn()}
      ${hasPerm('exportar_dados') ? `<button class="btn btn-primary btn-sm" onclick="exportarPDF()">📄 PDF</button>` : ''}
    </div>
  </div>
  <div class="filter-bar">
    <div class="filter-title">${lc("calendar", 14)} Filtro</div>
    <div class="filter-fields">
      ${setorSel}${congSel}
      <div class="form-group" style="margin:0"><label>Início</label><input type="date" id="rel-inicio" value="${relFiltroInicio}" onchange="relFiltroInicio=this.value"/></div>
      <div class="form-group" style="margin:0"><label>Fim</label><input type="date" id="rel-fim" value="${relFiltroFim}" onchange="relFiltroFim=this.value"/></div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="${canFilterSetores() ? "relSetorFiltro=$('rel-setor')?.value||currentUser?.setor_id||null;" : ''} ${canVerRelCong() ? "relCongFiltro=$('rel-cong')?.value||null;" : ''} renderRelatorios()">${lc("search", 14)} Filtrar</button>
        <button class="btn btn-secondary btn-sm" onclick="relFiltroInicio='';relFiltroFim='';relSetorFiltro=currentUser?.setor_id||null;relCongFiltro=null;renderRelatorios()">↺</button>
      </div>
    </div>
    <div class="filter-presets">
      <button class="btn btn-secondary btn-sm" onclick="setRelFiltro('mes')">Este mês</button>
      <button class="btn btn-secondary btn-sm" onclick="setRelFiltro('quinzena1')">1ª quinzena</button>
      <button class="btn btn-secondary btn-sm" onclick="setRelFiltro('quinzena2')">2ª quinzena</button>
      <button class="btn btn-secondary btn-sm" onclick="setRelFiltro('semana')">Esta semana</button>
      <button class="btn btn-secondary btn-sm" onclick="setRelFiltro('ano')">Este ano</button>
    </div>
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:26px">
    ${statCard(lc("church",14), 'ic-gold', cultos, 'Cultos', '')}${statCard('🎉', 'ic-blue', genEvt, 'Eventos', '')}${statCard('🚶', 'ic-teal', saidas, 'Saídas Evang.', '')}${statCard('✝', 'ic-violet', totalConv, 'Conversões', '')}
  </div>
  <div class="stats-grid stats-4" style="margin-bottom:26px">
    ${statCard(lc("users",18), 'ic-blue', totalPart, 'Participantes', '')}
    ${canSeeFinanceiro() ? statCard(lc("coins",14), 'ic-teal', fmtMoney(totalOfer), 'Total Ofertas', '') : ''}
    ${canSeeFinanceiro() ? statCard('💎', 'ic-violet', fmtMoney(totalDiz), 'Total Dízimos', '') : ''}
    ${canSeeFinanceiro() ? statCard('💵', 'ic-gold', fmtMoney(totalOfer + totalDiz), 'Total Arrecadado', '') : ''}
  </div>
  <div class="charts-grid" style="margin-bottom:26px">
    <div class="chart-card chart-span2"><h3>Participantes por Mês</h3><p>Acumulado</p><canvas id="chart-line" height="100"></canvas></div>
    <div class="chart-card"><h3>Membros por Congregação</h3><canvas id="chart-pie" height="200"></canvas></div>
    ${canSeeFinanceiro() ? `<div class="chart-card"><h3>Financeiro Mensal</h3><canvas id="chart-fin" height="200"></canvas></div>` : ''}
  </div>
  <div class="sec-hdr"><h2>Resumo por Setor</h2></div>
  <div class="tbl-wrap" style="margin-bottom:28px">
    <div class="rtable-header"><div>Setor</div><div>Cong.</div><div>Membros</div><div>Eventos</div><div>Conv.</div>${canSeeFinanceiro() ? '<div>Ofertas</div><div>Dízimos</div>' : ''}</div>
    ${setores.map(s => { const sCongs = congs.filter(c => c.setor_id === s.id), sEvs = eventos.filter(e => e.setor_id === s.id); const sMems = (rMem.data || []).filter(m => sCongs.some(c => c.id === m.congregacao_id)).length, sOfer = sEvs.reduce((x, e) => x + (e.ofertas || 0), 0), sDiz = sEvs.reduce((x, e) => x + (e.dizimos || 0), 0), sConv = sEvs.reduce((x, e) => x + (e.conversoes || 0), 0); return `<div class="rtable-row"><div class="fw5">${escHtml(s.nome)}</div><div>${sCongs.length}</div><div>${sMems}</div><div>${sEvs.length}</div><div>${sConv}</div>${canSeeFinanceiro() ? `<div>${fmtMoney(sOfer)}</div><div>${fmtMoney(sDiz)}</div>` : ''}</div>`; }).join('')}
    <div class="rtable-row rtable-total"><div class="fw5">TOTAL</div><div>${congs.length}</div><div>${(rMem.data || []).length}</div><div>${eventos.length}</div><div>${totalConv}</div>${canSeeFinanceiro() ? `<div>${fmtMoney(totalOfer)}</div><div>${fmtMoney(totalDiz)}</div>` : ''}</div>
  </div>
  <div class="sec-hdr"><h2>Todos os Eventos <span class="count-badge">${eventos.length}</span></h2></div>
  <div style="display:flex;flex-direction:column;gap:8px">
    ${eventos.map(e => { const cong = congs.find(c => c.id === e.congregacao_id); return `<div class="ev-card"><div class="ev-card-left"><div class="act-dot" style="background:${tipoColor(e.tipo)}"></div><div><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(cong?.nome || '—')} · ${escHtml(e.resumo || '—')}</div></div></div><div class="ev-card-right"><span class="act-time">${fmtDate(e.data)}</span><span class="tag">${e.participantes || 0} pess.</span>${canSeeFinanceiro() && tipoFinanceiro(e.tipo) ? `<span class="tag tag-gold">${fmtMoney(e.ofertas || 0)}</span>` : ''}</div></div>`; }).join('') || '<p class="c3" style="padding:20px;text-align:center">Nenhum evento no período.</p>'}
  </div>`;

  const byMonth = Array(12).fill(0); eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); byMonth[m] += (e.participantes || 0); });
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lCtx = document.getElementById('chart-line'); if (lCtx) chartInstances.line = new Chart(lCtx, { type: 'line', data: { labels: meses, datasets: [{ label: 'Participantes', data: byMonth, borderColor: 'var(--gold)', backgroundColor: 'rgba(201,168,76,.1)', tension: .4, fill: true, pointRadius: 3 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
  const top6 = congs.slice(0, 6); const pCtx = document.getElementById('chart-pie'); if (pCtx) chartInstances.pie = new Chart(pCtx, { type: 'doughnut', data: { labels: top6.map(c => c.nome.split('—')[0].trim()), datasets: [{ data: top6.map(c => memCount(c.id)), backgroundColor: ['rgba(201,168,76,.8)', 'rgba(59,130,246,.8)', 'rgba(20,184,166,.8)', 'rgba(244,63,94,.8)', 'rgba(139,92,246,.8)', 'rgba(249,115,22,.8)'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' } });
  if (canSeeFinanceiro()) { const oferMes = Array(12).fill(0), dizMes = Array(12).fill(0); eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); oferMes[m] += (e.ofertas || 0); dizMes[m] += (e.dizimos || 0); }); const fCtx = document.getElementById('chart-fin'); if (fCtx) chartInstances.fin = new Chart(fCtx, { type: 'bar', data: { labels: meses, datasets: [{ label: 'Ofertas', data: oferMes, backgroundColor: 'rgba(201,168,76,.75)', borderRadius: 6 }, { label: 'Dízimos', data: dizMes, backgroundColor: 'rgba(20,184,166,.55)', borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,.05)' } } } } }); }
}

function setRelFiltro(tipo) {
  const now = new Date(), ano = now.getFullYear(), mes = now.getMonth() + 1;
  const mesStr = String(mes).padStart(2, '0'), ultimoDia = new Date(ano, mes, 0).getDate();
  switch (tipo) {
    case 'mes': relFiltroInicio = `${ano}-${mesStr}-01`; relFiltroFim = `${ano}-${mesStr}-${ultimoDia}`; break;
    case 'quinzena1': relFiltroInicio = `${ano}-${mesStr}-01`; relFiltroFim = `${ano}-${mesStr}-15`; break;
    case 'quinzena2': relFiltroInicio = `${ano}-${mesStr}-16`; relFiltroFim = `${ano}-${mesStr}-${ultimoDia}`; break;
    case 'semana': { const d = new Date(); d.setDate(d.getDate() - d.getDay()); const f = new Date(d); f.setDate(d.getDate() + 6); relFiltroInicio = d.toISOString().slice(0, 10); relFiltroFim = f.toISOString().slice(0, 10); break; }
    case 'ano': relFiltroInicio = `${ano}-01-01`; relFiltroFim = `${ano}-12-31`; break;
  }
  renderRelatorios();
}

async function exportarPDF() {
  if (!hasPerm('exportar_dados')) { toast('Sem permissão', 'error'); return; }
  const { jsPDF } = window.jspdf; if (!jsPDF) { toast('Biblioteca não carregada', 'error'); return; }
  toast('Gerando PDF...', 'info');
  const sid = relSetorFiltro || currentUser?.setor_id || null; const cid = relCongFiltro || null;
  let qEv = q('eventos').select('*').order('data', { ascending: false }).gte('data', relFiltroInicio).lte('data', relFiltroFim);
  let qCong = q('congregacoes').select('*').order('nome'), qSet = q('setores').select('*').order('nome'), qMem = q('membros').select('congregacao_id');
  if (sid) { qEv = qEv.eq('setor_id', sid); qCong = qCong.eq('setor_id', sid); qSet = qSet.eq('id', sid); qMem = qMem.eq('setor_id', sid); }
  if (cid) { qEv = qEv.eq('congregacao_id', cid); qCong = qCong.eq('id', cid); qMem = qMem.eq('congregacao_id', cid); }
  const [rEv, rCong, rSet, rMem] = await Promise.all([qEv, qCong, qSet, qMem]);
  const eventos = rEv.data || [], congs = rCong.data || [], setores = rSet.data || [];
  const memCount = id => (rMem.data || []).filter(m => m.congregacao_id === id).length;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const W = 210, margin = 16; let y = 20;
  doc.setFillColor(9, 12, 24); doc.rect(0, 0, W, 44, 'F'); doc.setTextColor(201, 168, 76); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text('EclesiaSync', margin, 18);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184); doc.text('Sistema de Gestão Eclesiástica', margin, 25); doc.text(`Período: ${fmtDate(relFiltroInicio)} a ${fmtDate(relFiltroFim)}`, margin, 31); doc.text(`Gerado por: ${currentUser?.nome || '—'} · ${new Date().toLocaleDateString('pt-BR')}`, margin, 37); y = 54;
  const totalOfer = eventos.reduce((s, e) => s + (e.ofertas || 0), 0), totalDiz = eventos.reduce((s, e) => s + (e.dizimos || 0), 0), totalConv = eventos.reduce((s, e) => s + (e.conversoes || 0), 0), totalPart = eventos.reduce((s, e) => s + (e.participantes || 0), 0);
  doc.setFontSize(13); doc.setTextColor(201, 168, 76); doc.setFont('helvetica', 'bold'); doc.text('Resumo Geral', margin, y); y += 8;
  const summaryBody = [['Total de Setores', setores.length], ['Total de Congregações', congs.length], ['Total de Membros', (rMem.data || []).length], ['Total de Eventos', eventos.length], ['Cultos', eventos.filter(e => e.tipo === 'culto').length], ['EBDs', eventos.filter(e => e.tipo === 'ebd').length], ['Saídas Evang.', eventos.filter(e => e.tipo === 'saida').length], ['Eventos Setoriais', eventos.filter(e => e.tipo === 'evento_setorial').length], ['Participantes', totalPart], ['Conversões', totalConv]];
  if (canSeeFinanceiro()) summaryBody.push(['Total Ofertas', fmtMoney(totalOfer)], ['Total Dízimos', fmtMoney(totalDiz)], ['Total Arrecadado', fmtMoney(totalOfer + totalDiz)]);
  doc.autoTable({ startY: y, margin: { left: margin, right: margin }, head: [['Indicador', 'Valor']], body: summaryBody, theme: 'grid', headStyles: { fillColor: [9, 12, 24], textColor: [201, 168, 76], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 250] }, styles: { fontSize: 9 } });
  y = doc.lastAutoTable.finalY + 12;
  for (const s of setores) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setFillColor(240, 238, 230); doc.rect(margin, y - 5, W - margin * 2, 10, 'F'); doc.setTextColor(100, 80, 10); doc.text(`Setor: ${s.nome}`, margin + 2, y + 2); y += 12;
    const sCongs = congs.filter(c => c.setor_id === s.id); if (!sCongs.length) { doc.setFontSize(9); doc.setTextColor(150, 150, 150); doc.text('Nenhuma congregação.', margin + 4, y); y += 8; continue; }
    for (const c of sCongs) {
      if (y > 255) { doc.addPage(); y = 20; }
      const cEvs = eventos.filter(e => e.congregacao_id === c.id), cPart = cEvs.reduce((x, e) => x + (e.participantes || 0), 0), cConv = cEvs.reduce((x, e) => x + (e.conversoes || 0), 0), cOfer = cEvs.reduce((x, e) => x + (e.ofertas || 0), 0), cDiz = cEvs.reduce((x, e) => x + (e.dizimos || 0), 0);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50); doc.text(`  ${c.nome}`, margin + 2, y);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`Membros:${memCount(c.id)} | Ev:${cEvs.length} | Part:${cPart} | Conv:${cConv}${canSeeFinanceiro() ? ` | Of:${fmtMoney(cOfer)} | Díz:${fmtMoney(cDiz)}` : ''}`, margin + 4, y + 5); y += 12;
      if (cEvs.length) { const cols = ['Data', 'Tipo', 'Resumo', 'Part.', 'Conv.']; const colW = [20, 30, 44, 12, 12]; if (canSeeFinanceiro()) { cols.push('Ofertas', 'Dízimos'); colW.push(24, 24); } doc.autoTable({ startY: y, margin: { left: margin + 6, right: margin }, head: [cols], body: cEvs.map(e => { const row = [fmtDate(e.data), tipoLabel(e.tipo), (e.resumo || '').slice(0, 40), e.participantes || 0, e.conversoes || 0]; if (canSeeFinanceiro()) { row.push(fmtMoney(e.ofertas), fmtMoney(e.dizimos)); } return row; }), theme: 'striped', headStyles: { fillColor: [30, 30, 50], textColor: [201, 168, 76], fontSize: 7, fontStyle: 'bold' }, styles: { fontSize: 7.5 }, columnStyles: Object.fromEntries(colW.map((w, i) => [i, { cellWidth: w }])) }); y = doc.lastAutoTable.finalY + 6; }
    }
    y += 4;
  }
  doc.save(`EclesiaSync-Relatorio-${relFiltroInicio}-${relFiltroFim}.pdf`);
  toast('PDF gerado!');
}

/* ════════════════════════════════════════════════════════════
   FREQUÊNCIA
════════════════════════════════════════════════════════════ */
async function renderFrequencia() {
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
  let qUsuarios = q('sistema_usuarios').select('id,nome,role,cargo,setor_id,congregacao,ativo,frequenta_ebd,papel_ebd').eq('ativo', true).order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qUsuarios = qUsuarios.eq('setor_id', currentUser.setor_id);
  else if (sid) qUsuarios = qUsuarios.eq('setor_id', sid);
  const qEventos = q('eventos').select('id,tipo,data,participante_ids,setor_id,congregacao_id,resumo').gte('data', freqFiltroInicio).lte('data', freqFiltroFim);
  const [{ data: usuarios }, { data: eventos }] = await Promise.all([qUsuarios, qEventos]);
  const usuariosList = usuarios || [], eventosList = eventos || [];
  const eventosSetor = sid ? eventosList.filter(e => e.setor_id === sid) : eventosList;
  const eventosBase = cid ? eventosSetor.filter(e => e.congregacao_id === cid) : eventosSetor;
  const totalEventos = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;
  const freqData = usuariosList.map(u => {
    const evParticipou = eventosBase.filter(e => (e.participante_ids || []).includes(u.id));
    const cultosParticipou = evParticipou.filter(e => e.tipo === 'culto').length;
    const pctTotal = totalEventos > 0 ? Math.round((evParticipou.length / totalEventos) * 100) : 0;
    const pctCultos = totalCultos > 0 ? Math.round((cultosParticipou / totalCultos) * 100) : 0;
    const setorNome = (setores || []).find(s => s.id === u.setor_id)?.nome || '—';
    return { ...u, evParticipou, cultosParticipou, totalParticipou: evParticipou.length, pctTotal, pctCultos, setorNome };
  }).sort((a, b) => b.pctTotal - a.pctTotal);

  const canFilterS = canFilterSetores() && canSeeAllSetores();
  const setorSelect = canFilterS ? `<div class="form-group" style="margin:0"><label>Setor</label><select id="freq-setor" style="min-width:160px">${(setores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}</select></div>` : `<div style="font-size:.82rem;color:var(--txt2)">${lc("map-pin", 14)} <strong>${escHtml((setores || []).find(s => s.id === sid)?.nome || '—')}</strong></div>`;
  const congSelect = canFilterCong() && congsList.length ? `<div class="form-group" style="margin:0"><label>Congregação</label><select id="freq-cong" style="min-width:160px"><option value="">Todas</option>${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}</select></div>` : '';

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Frequência <span class="count-badge">${usuariosList.length} usuários</span></h2>
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
    ${statCard(lc("clipboard-list",14), 'ic-gold', totalEventos, 'Eventos', '')}${statCard(lc("church",14), 'ic-blue', totalCultos, 'Cultos', '')}${statCard(lc("users",18), 'ic-teal', usuariosList.length, 'Usuários', '')}${statCard(lc("trending-up",14), 'ic-violet', freqData.length > 0 ? `${freqData[0]?.pctTotal || 0}%` : '—', 'Maior Freq.', freqData[0]?.nome?.split(' ')[0] || '')}
  </div>
  <div class="freq-legend"><span class="freq-leg-item"><span class="freq-dot" style="background:#14b8a6"></span>≥75%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f59e0b"></span>50–74%</span><span class="freq-leg-item"><span class="freq-dot" style="background:#f43f5e"></span>&lt;50%</span></div>
  <div class="freq-list">
    ${freqData.length ? freqData.map(u => {
    const corG = u.pctTotal >= 75 ? '#14b8a6' : u.pctTotal >= 50 ? '#f59e0b' : '#f43f5e';
    const corC = u.pctCultos >= 75 ? '#14b8a6' : u.pctCultos >= 50 ? '#f59e0b' : '#f43f5e';
    return `<div class="freq-item">
        <div class="freq-item-user"><div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div><div><div class="fw5 fs-sm">${escHtml(u.nome)}</div><div class="fs-xs c3">${escHtml(u.cargo || '—')} · ${escHtml(u.congregacao || '—')}</div>${u.frequenta_ebd ? `<span class="tag tag-blue" style="font-size:.6rem">${lc("book-open", 14)} EBD ${u.papel_ebd ? '· ' + u.papel_ebd : ''}</span>` : ''}</div></div>
        <div class="freq-item-bars">
          <div class="freq-bar-row"><span class="freq-bar-label">Geral</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${u.pctTotal}%;background:${corG}"></div></div><span class="freq-pct" style="color:${corG}">${u.pctTotal}%</span></div>
          <div class="freq-bar-row"><span class="freq-bar-label">Cultos</span><div class="freq-bar-wrap"><div class="freq-bar" style="width:${u.pctCultos}%;background:${corC}"></div></div><span class="freq-pct" style="color:${corC}">${u.pctCultos}%</span></div>
        </div>
        <div class="freq-item-info"><span class="tag fs-xs">${u.totalParticipou}/${totalEventos} ev.</span><span class="tag fs-xs">${u.cultosParticipou}/${totalCultos} cul.</span></div>
        <button class="btn btn-secondary btn-sm" onclick="openFreqDetalhe('${u.id}','${escHtml(u.nome)}')">Ver ${lc("arrow-right", 14)}</button>
      </div>`;
  }).join('') : `<div class="empty"><div class="empty-ico">${lc("trending-up", 14)}</div><p>Nenhum dado encontrado.</p></div>`}
  </div>
  <div class="chart-card" style="margin-bottom:28px"><h3>Top Usuários por Frequência</h3><canvas id="chart-freq" height="80"></canvas></div>`;

  const top10 = freqData.slice(0, 10);
  const fCtx = document.getElementById('chart-freq');
  if (fCtx && top10.length) chartInstances.freq = new Chart(fCtx, { type: 'bar', data: { labels: top10.map(u => u.nome.split(' ')[0]), datasets: [{ label: 'Freq. Geral (%)', data: top10.map(u => u.pctTotal), backgroundColor: top10.map(u => u.pctTotal >= 75 ? 'rgba(20,184,166,.8)' : u.pctTotal >= 50 ? 'rgba(245,158,11,.8)' : 'rgba(244,63,94,.8)'), borderRadius: 8 }, { label: 'Freq. Cultos (%)', data: top10.map(u => u.pctCultos), backgroundColor: 'rgba(201,168,76,.4)', borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.05)' } } } } });
}

function setFreqFiltro(tipo) {
  const now = new Date(), ano = now.getFullYear(), mes = now.getMonth() + 1;
  const mesStr = String(mes).padStart(2, '0'), ultimoDia = new Date(ano, mes, 0).getDate();
  switch (tipo) {
    case 'mes': freqFiltroInicio = `${ano}-${mesStr}-01`; freqFiltroFim = `${ano}-${mesStr}-${ultimoDia}`; break;
    case 'quinzena1': freqFiltroInicio = `${ano}-${mesStr}-01`; freqFiltroFim = `${ano}-${mesStr}-15`; break;
    case 'quinzena2': freqFiltroInicio = `${ano}-${mesStr}-16`; freqFiltroFim = `${ano}-${mesStr}-${ultimoDia}`; break;
    case 'semana': { const d = new Date(); d.setDate(d.getDate() - d.getDay()); const f = new Date(d); f.setDate(d.getDate() + 6); freqFiltroInicio = d.toISOString().slice(0, 10); freqFiltroFim = f.toISOString().slice(0, 10); break; }
    case 'ano': freqFiltroInicio = `${ano}-01-01`; freqFiltroFim = `${ano}-12-31`; break;
  }
  renderFrequencia();
}

async function openFreqDetalhe(userId, userName) {
  showModal(`<div class="modal-hdr"><span>${lc("trending-up", 14)}</span><h2>Frequência — ${escHtml(userName)}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="freq-detalhe-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  const sid = freqSetorFiltro || currentUser?.setor_id || null; const cid = freqCongFiltro || null;
  const { data: eventos } = await q('eventos').select('id,tipo,data,resumo,congregacao_id,setor_id,participante_ids').gte('data', freqFiltroInicio).lte('data', freqFiltroFim);
  const eventosBase = (sid ? (eventos || []).filter(e => e.setor_id === sid) : (eventos || []));
  const eventosFiltered = cid ? eventosBase.filter(e => e.congregacao_id === cid) : eventosBase;
  const eventosDoUsuario = eventosFiltered.filter(e => (e.participante_ids || []).includes(userId));
  const congIds = [...new Set(eventosFiltered.map(e => e.congregacao_id).filter(Boolean))];
  const { data: congs } = congIds.length ? await q('congregacoes').select('id,nome').in('id', congIds) : { data: [] };
  const congNome = id => (congs || []).find(c => c.id === id)?.nome || '—';
  const totalEv = eventosFiltered.length, partEv = eventosDoUsuario.length;
  const pct = totalEv > 0 ? Math.round((partEv / totalEv) * 100) : 0;
  $('freq-detalhe-body').innerHTML = `
  <div style="text-align:center;margin-bottom:20px">
    <div class="stat-val" style="font-size:2.5rem;color:${pct >= 75 ? 'var(--teal)' : pct >= 50 ? '#f59e0b' : 'var(--rose)'}">${pct}%</div>
    <div class="fs-sm c2">Frequência geral</div><div class="fs-xs c3">${partEv} de ${totalEv} eventos</div>
  </div>
  <div style="border-bottom:1px solid var(--bdr2);margin-bottom:14px;padding-bottom:10px">
    <div class="fs-xs c3 fw6" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Participou de:</div>
    ${eventosDoUsuario.length ? eventosDoUsuario.map(e => `<div class="act-item" style="margin-bottom:6px"><div class="act-dot" style="background:${tipoColor(e.tipo)}"></div><div class="f1"><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(congNome(e.congregacao_id))}</div></div><span class="act-time">${fmtDate(e.data)}</span></div>`).join('') : '<p class="c3 fs-sm" style="text-align:center;padding:12px">Nenhuma participação.</p>'}
  </div>
  <div class="fs-xs c3 fw6" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Ausências:</div>
  ${eventosFiltered.filter(e => !(e.participante_ids || []).includes(userId)).map(e => `<div class="act-item" style="margin-bottom:6px;opacity:.45"><div class="act-dot" style="background:#475569"></div><div class="f1"><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(congNome(e.congregacao_id))}</div></div><span class="act-time">${fmtDate(e.data)}</span></div>`).join('') || '<p class="c3 fs-sm">Sem ausências.</p>'}`;
}

async function exportarFrequenciaPDF() {
  if (!hasPerm('exportar_dados')) { toast('Sem permissão', 'error'); return; }
  const { jsPDF } = window.jspdf; if (!jsPDF) { toast('Biblioteca não carregada', 'error'); return; }
  toast('Gerando PDF...', 'info');
  const sid = freqSetorFiltro || currentUser?.setor_id || null;
  let qU = q('sistema_usuarios').select('id,nome,role,cargo,setor_id,congregacao,ativo').eq('ativo', true).order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qU = qU.eq('setor_id', currentUser.setor_id);
  else if (sid) qU = qU.eq('setor_id', sid);
  const [{ data: usuarios }, { data: eventos }, { data: setores }] = await Promise.all([qU, q('eventos').select('id,tipo,data,participante_ids,setor_id').gte('data', freqFiltroInicio).lte('data', freqFiltroFim), q('setores').select('id,nome')]);
  const eventosBase = sid ? (eventos || []).filter(e => e.setor_id === sid) : (eventos || []);
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;
  const freqData = (usuarios || []).map(u => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(u.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => e.tipo === 'culto').length / totalCultos) * 100) : 0; return { nome: u.nome, cargo: u.cargo || '—', setorNome: (setores || []).find(s => s.id === u.setor_id)?.nome || '—', congregacao: u.congregacao || '—', partTotal: evP.length, cultosPart: evP.filter(e => e.tipo === 'culto').length, pctTotal, pctCultos }; }).sort((a, b) => b.pctTotal - a.pctTotal);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const W = 210, margin = 16; let y = 20;
  doc.setFillColor(9, 12, 24); doc.rect(0, 0, W, 44, 'F'); doc.setTextColor(201, 168, 76); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text('EclesiaSync', margin, 18); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184); doc.text('Relatório de Frequência', margin, 25); doc.text(`Período: ${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}`, margin, 31); doc.text(`Gerado por: ${currentUser?.nome || '—'} · ${new Date().toLocaleDateString('pt-BR')}`, margin, 37); y = 54;
  doc.setFontSize(13); doc.setTextColor(201, 168, 76); doc.setFont('helvetica', 'bold'); doc.text('Frequência por Usuário', margin, y); y += 8;
  doc.autoTable({ startY: y, margin: { left: margin, right: margin }, head: [['Usuário', 'Cargo', 'Setor', 'Freq. Geral', 'Freq. Cultos', 'Part./Total', 'Cultos/Total']], body: freqData.map(u => [u.nome, u.cargo, u.setorNome, `${u.pctTotal}%`, `${u.pctCultos}%`, `${u.partTotal}/${totalEv}`, `${u.cultosPart}/${totalCultos}`]), theme: 'grid', headStyles: { fillColor: [9, 12, 24], textColor: [201, 168, 76], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 250] }, styles: { fontSize: 8.5 }, didParseCell: function (data) { if (data.section === 'body' && data.column.index === 3) { const p = parseInt(data.cell.text[0]); data.cell.styles.textColor = p >= 75 ? [20, 184, 166] : p >= 50 ? [245, 158, 11] : [244, 63, 94]; } } });
  doc.save(`EclesiaSync-Frequencia-${freqFiltroInicio}-${freqFiltroFim}.pdf`); toast('PDF gerado!');
}

async function exportarFrequenciaExcel() {
  if (!hasPerm('exportar_dados')) { toast('Sem permissão', 'error'); return; }
  toast('Gerando Excel...', 'info');
  const sid = freqSetorFiltro || currentUser?.setor_id || null;
  let qU = q('sistema_usuarios').select('id,nome,role,cargo,setor_id,congregacao,ativo').eq('ativo', true).order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qU = qU.eq('setor_id', currentUser.setor_id);
  else if (sid) qU = qU.eq('setor_id', sid);
  const [{ data: usuarios }, { data: eventos }, { data: setores }] = await Promise.all([qU, q('eventos').select('id,tipo,data,participante_ids,setor_id,resumo').gte('data', freqFiltroInicio).lte('data', freqFiltroFim), q('setores').select('id,nome')]);
  const eventosBase = sid ? (eventos || []).filter(e => e.setor_id === sid) : (eventos || []);
  const totalEv = eventosBase.length, totalCultos = eventosBase.filter(e => e.tipo === 'culto').length;
  const rows = [['EclesiaSync — Frequência'], ['Período:', `${fmtDate(freqFiltroInicio)} a ${fmtDate(freqFiltroFim)}`], ['Gerado em:', new Date().toLocaleString('pt-BR')], [], ['Usuário', 'Cargo', 'Setor', 'Congregação', 'Freq. Geral (%)', 'Freq. Cultos (%)', 'Participações', 'Cultos', 'Total Eventos', 'Total Cultos']];
  (usuarios || []).forEach(u => { const evP = eventosBase.filter(e => (e.participante_ids || []).includes(u.id)); const pctTotal = totalEv > 0 ? Math.round((evP.length / totalEv) * 100) : 0; const pctCultos = totalCultos > 0 ? Math.round((evP.filter(e => e.tipo === 'culto').length / totalCultos) * 100) : 0; rows.push([u.nome, u.cargo || '—', (setores || []).find(s => s.id === u.setor_id)?.nome || '—', u.congregacao || '—', pctTotal, pctCultos, evP.length, evP.filter(e => e.tipo === 'culto').length, totalEv, totalCultos]); });
  rows.push([]); rows.push(['Data', 'Tipo', 'Resumo', 'Participantes']);
  eventosBase.forEach(e => { const nomes = (e.participante_ids || []).map(uid => { const u = (usuarios || []).find(x => x.id === uid); return u ? u.nome : '(ext)'; }).join('; '); rows.push([fmtDate(e.data), tipoLabel(e.tipo), e.resumo || '—', nomes || 'Nenhum']); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `EclesiaSync-Frequencia-${freqFiltroInicio}-${freqFiltroFim}.csv`; a.click(); URL.revokeObjectURL(url); toast('Excel gerado!');
}

/* ════════════════════════════════════════════════════════════
   PERMISSÕES
════════════════════════════════════════════════════════════ */
async function renderPermissoes() {
  if (!isSuperAdmin() && !hasPerm('editar_permissoes')) { $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc("shield-off", 14)}</div><p>Sem permissão.</p></div>`; return; }
  $('page-content').innerHTML = loadingPage();
  const { data: rolesDB } = await q('roles').select('*').order('nome');
  const ROLES_SISTEMA = ['admin', 'dirigente', 'adjunto', 'usuario'];
  const rolesCustom = (rolesDB || []).filter(r => !ROLES_SISTEMA.includes(r.nome));
  const todasRoles = [...ROLES_SISTEMA, ...rolesCustom.map(r => r.nome)];
  if (!todasRoles.includes(activeRole)) activeRole = 'admin';
  let { data, error } = await q('role_permissions').select('*').eq('role', activeRole);
  if (error || !data?.length) {
    const legacy = await q('permissoes').select('*').eq('role', activeRole);
    const map = { 'Gerenciar Setores': 'gerenciar_setores', 'Gerenciar Congregações': 'gerenciar_congregacoes', 'Gerenciar Membros': 'gerenciar_membros', 'Gerenciar Usuários': 'gerenciar_usuarios', 'Visualizar Dashboard': 'visualizar_dashboard', 'Ver Relatórios': 'ver_relatorios', 'Editar Permissões': 'editar_permissoes', 'Exportar Dados': 'exportar_dados', 'Excluir Registros': 'excluir_registros', 'Registrar Eventos': 'registrar_eventos', 'Ver Todos os Setores': 'ver_todos_setores', 'Gerenciar Agenda': 'gerenciar_agenda', 'Ver Frequência de Usuários': 'ver_frequencia_usuarios', 'Visualizar Resumo Financeiro': 'ver_financeiro', 'Filtrar Setor no Dashboard': 'filtrar_setor_dashboard', 'Filtrar Congregação no Dashboard': 'filtrar_congregacao_dashboard', 'Ver Relatório por Congregação': 'ver_relatorio_por_congregacao', 'Criar Eventos Setoriais': 'criar_eventos_setorial', 'Gerenciar Financeiro': 'gerenciar_financeiro', 'Visualizar Ranking Mensal': 'visualizar_ranking',
    'Gerenciar Ranking Mensal':  'gerenciar_ranking' };
    data = (legacy.data || []).map(p => ({ role: p.role, permission_code: map[p.permissao] || p.permissao, ativo: p.ativo }));
  }
  const perms = {}; (data || []).forEach(p => { perms[p.permission_code] = p.ativo; });
  const displayPerms = activeRole === 'admin' ? Object.fromEntries(Object.keys(PERM_DESC).map(k => [k, true])) : perms;
  const activeCount = Object.values(displayPerms).filter(Boolean).length;
    const grupos = {
    'Acesso e Visualização': ['visualizar_dashboard', 'ver_relatorios', 'ver_frequencia_usuarios', 'exportar_dados'],
    'Financeiro': ['ver_financeiro', 'gerenciar_financeiro'],
    'Ranking e Eventos Setoriais': ['visualizar_ranking', 'gerenciar_ranking', 'visualizar_eventos_setoriais_dash'],
    'Filtros e Visibilidade': ['filtrar_setor_dashboard', 'filtrar_congregacao_dashboard', 'ver_relatorio_por_congregacao', 'ver_todos_setores'],
    'Gestão': ['gerenciar_setores', 'gerenciar_congregacoes', 'gerenciar_membros', 'gerenciar_usuarios', 'gerenciar_agenda'],
    'Operações': ['registrar_eventos', 'criar_eventos_setorial', 'excluir_registros'],
    'Sistema': ['editar_permissoes']
  };
  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Controle de Permissões</h2>
    ${backBtn()}
    ${isSuperAdmin() ? `<button class="btn btn-primary btn-sm" onclick="openNewRoleModal()">+ Novo Perfil</button>` : ''}
  </div>
  <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:var(--txt2)">
    ⭐ <strong>admin</strong> = superusuário.<br>${lc("coins", 14)} <strong>Ver Financeiro</strong>: oculta ofertas/dízimos.<br>${lc("lock", 14)} <strong>Filtrar Setor</strong> = somente leitura.<br>${lc("wallet", 14)} <strong>Gerenciar Financeiro</strong>: acesso ao módulo de licenças.<br>${lc("building-2", 14)} <strong>Criar Eventos Setoriais</strong>: cria eventos e vê usuários do setor.
  </div>
  <div class="role-tabs">
    ${todasRoles.map(r => `<button class="btn ${r === activeRole ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setActiveRole('${r}')"><span class="role-badge ${roleCls(r)}">${r}</span></button>`).join('')}
    ${rolesCustom.map(r => `<button class="btn btn-danger btn-sm" onclick="delRole('${r.nome}')" title="Excluir perfil (somente admin)">${lc("trash-2", 14)}</button>`).join('')}
  </div>
  <div class="tbl-wrap" style="max-width:680px">
    <div style="padding:15px 18px;border-bottom:1px solid var(--bdr2)">
      <div style="font-family:'Cinzel',serif;font-size:.88rem">Perfil: <span class="role-badge ${roleCls(activeRole)}">${activeRole}</span>${activeRole === 'admin' ? '<span class="tag tag-gold" style="margin-left:8px">⭐ Superusuário</span>' : ''}${rolesCustom.some(r => r.nome === activeRole) ? `<span class="tag tag-blue" style="margin-left:8px">Customizado</span>` : ''}</div>
      <div class="fs-xs c3 mt8">${activeCount} permissões ativas</div>
    </div>
    <div style="padding:6px 18px">
      ${Object.entries(grupos).map(([grupo, codes]) => `<div class="perm-group-title">${grupo}</div>${codes.map(perm => { const info = PERM_DESC[perm]; if (!info) return ''; const on = !!displayPerms[perm]; const isAdminRole = activeRole === 'admin'; return `<div class="perm-row"><div class="perm-lbl"><strong>${info.label}</strong><span>${info.desc}</span></div><div class="toggle-sw${on ? ' on' : ''}" onclick="${isAdminRole ? "toast('Admin sempre tem acesso total','info')" : `toggleRolePerm('${perm}',${on})`}" style="${isAdminRole ? 'opacity:.6;cursor:default' : ''}"></div></div>`; }).join('')}`).join('')}
    </div>
  </div>`;
}

function setActiveRole(r) { activeRole = r; renderPermissoes(); }
async function toggleRolePerm(perm, current) {
  if (!isSuperAdmin()) { toast('Sem permissão', 'error'); return; }
  const novoValor = !current;
  try { const { error } = await db.rpc('toggle_role_permission', { p_role: activeRole, p_perm: perm, p_ativo: novoValor }); if (error) throw error; }
  catch (e) { await Promise.all([q('role_permissions').upsert({ role: activeRole, permission_code: perm, ativo: novoValor }, { onConflict: 'role,permission_code' }), q('permissoes').upsert({ role: activeRole, permissao: perm, ativo: novoValor }, { onConflict: 'role,permissao' })]); }
 permissionsCache[perm] = novoValor;
toast(`Permissão ${novoValor ? 'concedida' : 'removida'}`);
renderPermissoes();
// Re-injeta menu de ranking se a permissão mudou
if(perm === 'visualizar_ranking' || perm === 'gerenciar_ranking'){
  if(typeof window.injectRankingMenu === 'function') window.injectRankingMenu();
}
}

function openNewRoleModal() {
  if (!isSuperAdmin()) { toast('Apenas admin', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>🎭</span><h2>Novo Perfil de Acesso</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="form-group"><label>Nome do Perfil *</label><input id="role-nome" placeholder="Ex: secretaria"/><small class="c3 fs-xs">Use letras minúsculas e underscores</small></div><div class="form-group"><label>Descrição</label><input id="role-desc"/></div><div style="border-top:1px solid var(--bdr2);margin:12px 0;padding-top:14px"><div class="fs-xs c3 fw6" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Permissões Iniciais</div>${Object.entries(PERM_DESC).map(([code, { label, desc }]) => `<div class="perm-row" style="padding:8px 0"><div class="perm-lbl"><strong>${label}</strong><span>${desc}</span></div><input type="checkbox" class="new-role-perm" value="${code}" style="accent-color:var(--gold);width:18px;height:18px"/></div>`).join('')}</div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveNewRole()">🎭 Criar</button></div>`);
}

async function saveNewRole() {
  if (!isSuperAdmin()) { toast('Sem permissão', 'error'); return; }
  const nome = ($('role-nome')?.value || '').trim().toLowerCase().replace(/\s+/g, '_'); const desc = ($('role-desc')?.value || '').trim();
  if (!nome) { toast('Nome obrigatório', 'error'); return; }
  if (['admin', 'dirigente', 'adjunto', 'usuario'].includes(nome)) { toast('Nome reservado', 'error'); return; }
  const permsChecked = [...document.querySelectorAll('.new-role-perm:checked')].map(c => c.value);
  const { error: roleError } = await q('roles').insert({ nome, descricao: desc });
  if (roleError) { toast(roleError.message, 'error'); return; }
  if (permsChecked.length) await q('role_permissions').insert(permsChecked.map(p => ({ role: nome, permission_code: p, ativo: true })));
  toast(`Perfil "${nome}" criado!`); closeModal(); activeRole = nome; renderPermissoes();
}

async function delRole(roleName) {
  // Apenas admin pode excluir perfis
  if (!isSuperAdmin()) { toast('Apenas administradores podem excluir perfis', 'error'); return; }
  const r = await confirmDialog('Excluir Perfil', `O perfil "${roleName}" será removido permanentemente.`);
  if (!r.isConfirmed) return;
  await Promise.all([q('roles').delete().eq('nome', roleName), q('role_permissions').delete().eq('role', roleName)]);
  toast(`Perfil "${roleName}" removido!`); activeRole = 'admin'; renderPermissoes();
}

/* ════════════════════════════════════════════════════════════
   MODAL ENGINE
════════════════════════════════════════════════════════════ */
function showModal(html) { const mc = $('modal-container'); mc.innerHTML = `<div class="overlay" id="modal-overlay" onclick="handleOverlayClick(event)"><div class="modal" onclick="event.stopPropagation()">${html}</div></div>`; }
function handleOverlayClick(e) { if (e.target.id === 'modal-overlay') closeModal(); }
function closeModal() { const mc = $('modal-container'); const ov = mc.querySelector('.overlay'); if (ov) { ov.style.opacity = '0'; ov.style.transition = 'opacity .15s'; setTimeout(() => mc.innerHTML = '', 150); } }

/* ── INIT ────────────────────────────────────────────────── */
(async function () {
  try {
    const saved = JSON.parse(localStorage.getItem('ecclesia_user'));
    if (saved) {
      currentUser = saved;
      await loadPermissions(); await loadUserSetor(); await loadUserCong(); await loadAllCongs();
      dashSetorFiltro = currentUser?.setor_id || null; dashCongFiltro = null;
      relSetorFiltro = currentUser?.setor_id || null; relCongFiltro = null;
      const savedToken = localStorage.getItem(SESSION_KEY);
      if (savedToken) startSessionCheck(saved.id, savedToken);

      // Verificação de licença no reload
      const licOk = await checkLicenca(saved.id);
      if (!licOk) return;

      startApp(saved);
      setTimeout(() => { if (typeof injectThemePanel === 'function') injectThemePanel(); }, 200);
    }
  } catch (e) { }
  $('inp-user')?.focus();
})();

// tema branoc e preto 

(function () {
  'use strict';
  var THEME_KEY = 'ecclesia_theme';
  var currentTheme = localStorage.getItem(THEME_KEY) || 'dark';

  function applyTheme(theme) {
    currentTheme = theme || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem(THEME_KEY, currentTheme);
    updateButtons();
  }

  function updateButtons() {
    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.themeBtn === currentTheme);
    });
  }

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.className = 'theme-card';
    wrap.id = 'theme-card';

    ['dark', 'light'].forEach(function (t) {
      var btn = document.createElement('button');
      btn.id = 'btn-' + t;
      btn.dataset.themeBtn = t;
      btn.title = t === 'dark' ? 'Tema Escuro' : 'Tema Claro';
      btn.textContent = t === 'dark' ? '🌙' : '☀️';
      btn.onclick = function () { applyTheme(t); };
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function injectThemePanel() {
    var container = document.getElementById('theme-panel-container');
    if (!container) return;
    if (document.getElementById('theme-card')) { updateButtons(); return; }
    container.appendChild(buildPanel());
    updateButtons();
  }

  window.applyTheme = applyTheme;
  window.injectThemePanel = injectThemePanel;

  // Aplica tema antes do DOM estar pronto (evita flash)
  applyTheme(currentTheme);

  document.addEventListener('DOMContentLoaded', function () {
    injectThemePanel();
    var observer = new MutationObserver(function () {
      var app = document.getElementById('screen-app');
      if (app && !app.classList.contains('hidden') && !document.getElementById('theme-card')) {
        injectThemePanel();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
