/* ═══════════════════════════════════════════════════════════
   EclesiaSync · app.js — consolidação dos scripts do sistema
   Ordem preservada exatamente como antes (cada bloco pode
   sobrescrever funções do bloco anterior — não reordenar).
   ═══════════════════════════════════════════════════════════ */

/* ───────── script_v5.js — lógica principal ───────── */
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

/* ── FIX: gráficos "em branco" ao entrar numa tela ────────────────────
   Ao navegar no app (SPA), o <canvas> do gráfico é criado dentro do
   #page-content enquanto ele ainda está com a animação de entrada
   (transform/opacity da classe .page, keyframe fadeUp). Em navegadores
   baseados no Chromium o canvas às vezes fica "congelado" em branco nesse
   cenário e só repinta quando ocorre um resize da janela — por isso hoje
   o gráfico só aparece depois de recarregar a página (F5).
   Solução: logo após criar QUALQUER gráfico, agenda-se um resize() nos
   próximos frames. O resize força o Chart.js a re-medir o container e a
   repintar o canvas — exatamente o efeito que o reload provoca, mas sem
   precisar recarregar. Não altera dados, escalas nem animação. */
/* Força o gráfico a repintar assim que o container tiver um tamanho real.
   Por que a versão anterior (só timers fixos) ainda falhava às vezes: ela
   chamava resize()/draw() em momentos fixos independentemente de o canvas já
   ter largura > 0. Se naquele instante o container ainda estava em 0px (tela
   ainda não totalmente montada / animação de entrada em curso / aba do
   gráfico ainda não visível), não adiantava — e o gráfico nascia em branco.
   Agora: só repinta quando o container tem largura válida, tenta em vários
   momentos ao longo de ~1s, E observa o container ganhando tamanho
   (ResizeObserver) e a tela ficando visível (IntersectionObserver). */
function pfGarantirRenderGrafico(chart) {
  const cv = chart && chart.canvas;
  if (!cv) return;
  let feito = false, ro = null, io = null;
  const timers = [];

  const vivo = () => chart.canvas && chart.ctx; // ctx vira null ao destruir
  const largura = () => (cv.parentElement ? cv.parentElement.clientWidth : cv.clientWidth) || 0;

  const limpar = () => { timers.forEach(clearTimeout); if (ro) ro.disconnect(); if (io) io.disconnect(); };

  const tentar = () => {
    if (feito) return;
    if (!vivo()) { feito = true; limpar(); return; }
    if (largura() > 0) {
      try {
        chart.resize();  // corrige as dimensões dentro do container
        chart.draw();    // pintura SÍNCRONA — o Chromium às vezes descarta a
                         // pintura assíncrona do canvas quando ele nasce dentro
                         // de um elemento em animação (fadeUp cria camada de
                         // composição). draw() força o blit na hora.
      } catch (_) {}
      feito = true; limpar();  // repintou com tamanho válido — encerra
    }
  };

  requestAnimationFrame(() => requestAnimationFrame(tentar));
  [60, 160, 320, 640, 1000].forEach(t => timers.push(setTimeout(tentar, t)));

  if (window.ResizeObserver && cv.parentElement) {
    ro = new ResizeObserver(tentar);
    ro.observe(cv.parentElement);
  }
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) tentar(); });
    io.observe(cv);
  }
  timers.push(setTimeout(() => { feito = true; limpar(); }, 2500)); // rede de segurança
}

if (typeof Chart !== 'undefined' && !Chart.__blankFixApplied) {
  const _OrigChart = Chart;
  class ChartAutoResize extends _OrigChart {
    constructor() {
      super(...arguments);
      try { pfGarantirRenderGrafico(this); } catch (_) {}
    }
  }
  ChartAutoResize.__blankFixApplied = true;
  // Reatribui o global para que todo `new Chart(...)` do app use a subclasse.
  // As propriedades estáticas (defaults, overrides, getChart, register…) são
  // herdadas da classe original pela cadeia de protótipo — nada se perde.
  window.Chart = ChartAutoResize;
}

/* ── ANIMAÇÃO PADRÃO DOS GRÁFICOS (Chart.js) ──────────────────────────
   Config única, global, aplicada a todo gráfico criado no app (relatórios,
   frequência, financeiro, dashboard, ranking) — entrada escalonada ponto a
   ponto/barra a barra em vez de tudo aparecer de uma vez, easing mais macio,
   e as fatias de doughnut "crescendo" a partir do centro. Só estilo/anima-
   ção — nenhum dado, escala ou interação muda. */
if (typeof Chart !== 'undefined') {
  const CHART_DELAY_STEP = 22, CHART_DATASET_STEP = 110;
  Chart.defaults.animation = {
    duration: 850,
    easing: 'easeOutQuart',
    delay(ctx) {
      if (ctx.type === 'data' && ctx.mode === 'default' && !ctx.dropped) {
        ctx.dropped = true;
        return ctx.dataIndex * CHART_DELAY_STEP + ctx.datasetIndex * CHART_DATASET_STEP;
      }
      return 0;
    }
  };
  Chart.defaults.animations.numbers = { duration: 850, easing: 'easeOutQuart' };
  Chart.defaults.transitions.active.animation.duration = 300;
  if (Chart.overrides?.doughnut) {
    Chart.overrides.doughnut.animation = { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' };
  }
  if (Chart.overrides?.pie) {
    Chart.overrides.pie.animation = { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' };
  }
  Chart.defaults.plugins.tooltip.animation = { duration: 200, easing: 'easeOutQuad' };
}

/* Reforço determinístico do fix acima: no exato momento em que a animação de
   entrada do #page-content termina, repinta todos os gráficos vivos. Cobre o
   caso em que os timeouts do construtor caem fora de sincronia com a animação
   (dados que chegam do banco em tempos variáveis ao navegar entre telas). */
document.addEventListener('animationend', e => {
  if (!e.target || e.target.id !== 'page-content') return;
  try {
    if (typeof chartInstances !== 'undefined') {
      Object.values(chartInstances).forEach(c => { try { c?.resize?.(); c?.draw?.(); } catch (_) {} });
    }
  } catch (_) {}
});

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
const escHtml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/* Escape para valores que vão DENTRO de um atributo onclick="...('AQUI')".
   O escHtml sozinho não basta nesse contexto: o navegador desfaz as entidades
   HTML antes de o JS ser avaliado, então aspas/barras precisam ser escapadas
   em nível de string JS também. Usar sempre que um dado vindo do banco for
   interpolado dentro de um handler inline. */
const escAttr = s => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\r?\n/g, ' ');
const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
/* Máscara de telefone: o usuário digita manualmente o código do país
   (opcional), o DDD e o número; o campo formata sozinho para
   +55 (81) 99999-9999 conforme digita. Usada nos cadastros de membro. */
function pfMascaraTel(el) {
  if (!el) return;
  const d = (el.value || '').replace(/\D/g, '');
  // Acima de 11 dígitos, o excedente à esquerda é tratado como código do país.
  let pais = '', resto = d;
  if (d.length > 11) { pais = d.slice(0, d.length - 11); resto = d.slice(d.length - 11); }
  resto = resto.slice(0, 11);
  const ddd = resto.slice(0, 2);
  const cel = resto.length > 10; // 11 dígitos = celular (9 no começo)
  const p1 = resto.slice(2, cel ? 7 : 6);
  const p2 = resto.slice(cel ? 7 : 6, 11);
  let out = '';
  if (pais) out += '+' + pais + ' ';
  if (ddd) out += '(' + ddd + ')';
  if (p1) out += ' ' + p1;
  if (p2) out += '-' + p2;
  el.value = out;
}
window.pfMascaraTel = pfMascaraTel;
const toast = (msg, icon = 'success') => {
  // Som de ação: toda confirmação de sucesso (criar/editar/excluir/salvar
  // qualquer coisa no sistema) dispara o "tri-tom", desde que o sino de
  // notificações esteja ativo (ele é o interruptor mestre do som). Ver
  // pfSomAcao() — gated por pfNotifAtivo().
  if (icon === 'success' && typeof pfSomAcao === 'function') pfSomAcao();
  return Swal.fire({
    toast: true, position: 'top-end', icon, title: msg,
    showConfirmButton: false, timer: 3000, timerProgressBar: true,
    background: '#111827', color: '#f1f5f9',
    iconColor: icon === 'success' ? '#14b8a6' : icon === 'info' ? '#3b82f6' : '#f43f5e'
  });
};
const confirmDialog = (title, text) => Swal.fire({
  title, text, icon: 'warning', showCancelButton: true,
  confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar'
});
const loadingPage = () => `<div class="loading-page"><div class="spinner"></div><span>Carregando dados...</span></div>`;
const roleCls = r => ({ 'admin': 'role-admin', 'dirigente': 'role-dirigente', 'adjunto': 'role-adjunto', 'usuario': 'role-usuario' }[r] || 'role-usuario');

/* ── ESTADO GLOBAL ───────────────────────────────────────── */
// currentUser/currentUserSetor/currentUserCong precisam ser "var" (não
// "let"): várias partes do sistema (dashboard, navegação por menu) leem
// window.currentUser em vez do identificador solto — com "let" essas
// duas coisas eram variáveis diferentes e window.currentUser nunca era
// preenchido, então o dashboard nunca sabia o setor de quem logou.
var currentUser = null;
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
var currentUserSetor = null;
var currentUserCong = null;
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
  'saida': { label: 'Saída Evangelística', grupo: 'Principal', icon: 'footprints', financeiro: false, evangelismo: true },
  'evento_setorial': { label: 'Evento Setorial', grupo: 'Principal', icon: 'building-2', financeiro: false, evangelismo: false, setorial: true },
  'visita_enfermos': { label: 'Visita aos Enfermos', grupo: 'Visitas', icon: 'heart-pulse', financeiro: false, evangelismo: false },
  'visita_desviados': { label: 'Visita aos Desviados', grupo: 'Visitas', icon: 'search', financeiro: false, evangelismo: false },
  'visita_detidos': { label: 'Visita aos Detidos', grupo: 'Visitas', icon: 'lock', financeiro: false, evangelismo: false },
  'visita_convertidos': { label: 'Visita aos Novos Convertidos', grupo: 'Visitas', icon: 'cross', financeiro: false, evangelismo: false },
  'visita_umadalpe': { label: 'Visita a outras UMADALPE', grupo: 'Visitas', icon: 'handshake', financeiro: false, evangelismo: false },
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

/* Ordena uma lista de eventos deixando os FUTUROS (data > hoje, ou status
   'rascunho') sempre acima dos demais. Entre os futuros: data crescente (o
   próximo primeiro); entre os já realizados: data decrescente (mais recente
   primeiro). Usado em todas as listagens de evento para cumprir a regra
   "todo evento futuro fica sempre em cima dos demais". */
function pfOrdenarEventosFuturosTopo(lista) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ehFuturo = e => (e?.data || '') > hoje || e?.status === 'rascunho';
  const arr = Array.isArray(lista) ? lista.slice() : [];
  return arr.sort((a, b) => {
    const fa = ehFuturo(a), fb = ehFuturo(b);
    if (fa !== fb) return fa ? -1 : 1;
    if (fa) return (a.data < b.data ? -1 : a.data > b.data ? 1 : 0); // futuros: crescente
    return (a.data > b.data ? -1 : a.data < b.data ? 1 : 0);         // resto: decrescente
  });
}
window.pfOrdenarEventosFuturosTopo = pfOrdenarEventosFuturosTopo;

/* Popup com a lista de eventos que compõem uma categoria/cor. Usado ao clicar
   numa fatia do gráfico "Tipos de Eventos" (Dashboard) e nos cards de tipo da
   tela de Relatórios. Cada linha abre o detalhe do respectivo evento. */
function pfPopupEventosPorTipo(titulo, lista) {
  const evs = pfOrdenarEventosFuturosTopo(lista || []);
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = evs.map(e => {
    const abrir = e.tipo === 'evento_setorial' ? 'openEventoSetorialDetail' : 'openEventDetail';
    const futuro = (e.data || '') > hoje || e.status === 'rascunho';
    return `<div class="act-item" onclick="closeModal();${abrir}('${e.id}')" style="cursor:pointer">
      <div class="act-dot" style="background:${tipoColor(e.tipo)}"></div>
      <div class="f1"><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)} ${futuro ? '<span class="tag tag-primary" style="font-size:.55rem">Agendado</span>' : ''}</div><div class="fs-xs c3">${escHtml(e.resumo || '')}</div></div>
      <span class="tag">${e.participantes || 0}</span>
      <span class="act-time">${fmtDate(e.data)}</span>
    </div>`;
  }).join('');
  showModal(`<div class="modal-hdr"><span>${lc('clipboard-list', 18)}</span><h2>${escHtml(titulo)} <span class="count-badge">${evs.length}</span></h2><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><div class="act-list" style="display:flex;flex-direction:column;gap:8px">${linhas || '<p class="c3" style="padding:16px;text-align:center">Nenhum evento nesta categoria.</p>'}</div></div>
    <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
  if (typeof refreshLucide === 'function') refreshLucide();
}
window.pfPopupEventosPorTipo = pfPopupEventosPorTipo;

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
  'ver_agenda_semanal_outros_setores': { label: 'Ver agenda semanal de outros setores', desc: 'Na tela "Agendas Semanais", permite filtrar e ver as agendas de congregações de outros setores — mesmo sem ter "Ver Todos os Setores".' },
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

/* Token de sessão emitido pelo BANCO no login (ver security_hardening.sql).
   É a credencial que prova ao servidor quem é o usuário — as operações
   sensíveis (permissões, dados de menores) exigem este token e o próprio
   banco confere o papel do usuário, em vez de confiar no isSuperAdmin()
   que roda aqui no navegador e pode ser burlado pelo console. */
function getSessionToken() {
  try { return localStorage.getItem(SESSION_KEY) || null; } catch (_) { return null; }
}

/* Chama uma função segura do banco; se ela ainda NÃO existir no projeto
   (security_hardening.sql não rodado), executa o caminho antigo.

   O detalhe importante: só caímos no caminho antigo quando a função está
   AUSENTE. Se ela existe e respondeu "acesso negado", a negação é
   respeitada e propagada — senão a checagem de segurança do servidor
   seria contornável simplesmente falhando de propósito. */
async function rpcSeguro(fnName, args, fallback) {
  const { data, error } = await db.rpc(fnName, args);
  if (!error) return { data, ok: true };

  // PGRST202 = função não encontrada no cache do PostgREST.
  // 42883 = undefined_function no Postgres.
  const ausente = error.code === 'PGRST202' || error.code === '42883' ||
    /could not find the function|does not exist/i.test(error.message || '');

  if (ausente && typeof fallback === 'function') {
    console.warn(`[seguranca] ${fnName} ainda não existe no banco — usando caminho antigo. ` +
      `Rode security_hardening.sql para ativar a verificação no servidor.`);
    return await fallback();
  }
  return { error, ok: false };
}
/* SEGURANÇA: token de sessão precisa ser imprevisível. Math.random() NÃO é
   um gerador criptográfico — sua saída é derivável a partir de poucas amostras,
   o que permitiria a um atacante prever/forjar o token de sessão de outro
   usuário. crypto.getRandomValues() é o gerador seguro do navegador (padrão
   Web Crypto, disponível em todos os navegadores atuais). 32 bytes = 256 bits
   de entropia, em hex. */
function generateSessionToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

/* Recebe o token emitido pelo banco no login (rpc_login). Se o projeto
   ainda não rodou o security_hardening.sql, o rpc_login antigo não
   devolve token — nesse caso mantemos o comportamento anterior para não
   quebrar o sistema, apenas com token gerado de forma criptográfica. */
async function checkAndSetSession(userId, tokenDoBanco) {
  try {
    if (tokenDoBanco) {
      localStorage.setItem(SESSION_KEY, tokenDoBanco);
      startSessionCheck(userId, tokenDoBanco);
      return;
    }
    // Caminho antigo (banco ainda sem o endurecimento aplicado)
    const newToken = generateSessionToken();
    await q('sistema_usuarios').update({ session_token: newToken }).eq('id', userId);
    localStorage.setItem(SESSION_KEY, newToken);
    startSessionCheck(userId, newToken);
  } catch (e) { console.warn('Session control indisponível', e); }
}

/* Limpa os dados de sessão no logout, MAS preserva as preferências que são
   do APARELHO (não do usuário): o liga/desliga das notificações e o tema.
   Sem isto, o localStorage.clear() apagava o estado do sino, e ele voltava
   "desativado" depois de sair e entrar de novo. */
function pfLimparSessaoPreservandoPrefs() {
  const preservar = ['ecclesia_notif_on', 'ecclesia_theme'];
  const salvos = {};
  preservar.forEach(k => { const v = localStorage.getItem(k); if (v !== null) salvos[k] = v; });
  localStorage.clear();
  Object.entries(salvos).forEach(([k, v]) => localStorage.setItem(k, v));
}

function encerrarSessaoLocal(texto) {
  if (window._sessionInterval) clearInterval(window._sessionInterval);
  Swal.fire({
    title: 'Sessão encerrada', text: texto, icon: 'warning',
    confirmButtonText: 'OK', allowOutsideClick: false,
    background: '#111827', color: '#f1f5f9'
  }).then(() => { pfLimparSessaoPreservandoPrefs(); location.reload(); });
}

function startSessionCheck(userId, token) {
  if (window._sessionInterval) clearInterval(window._sessionInterval);
  window._sessionInterval = setInterval(async () => {
    try {
      // Caminho novo: o banco diz se a sessão ainda vale (sem expor o
      // token de ninguém). Caminho antigo: compara a coluna session_token.
      const { data, error } = await db.rpc('rpc_sessao_valida', { p_token: token });
      if (!error) {
        if (data === false) {
          encerrarSessaoLocal('Sua sessão expirou ou você entrou em outro dispositivo.');
        }
        return;
      }
      const { data: row } = await q('sistema_usuarios').select('session_token').eq('id', userId).single();
      if (row?.session_token && row.session_token !== token) {
        encerrarSessaoLocal('Você já está logado em outro dispositivo.');
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
            <a href="https://wa.me/5581999999999?text=Olá,%20preciso%20renovar%20minha%20licença%20EclesiaSync" target="_blank" rel="noopener noreferrer"
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
  // SEGURANÇA: a verificação da senha acontece inteiramente dentro do banco,
  // via a função rpc_login (ver security_migration.sql) — ela compara a senha
  // contra o hash bcrypt armazenado e só devolve os campos seguros do usuário.
  // A senha digitada nunca é lida de volta, nem em texto puro nem como hash.
  // Requer que security_migration.sql já tenha sido rodado no Supabase.
  const { data: rows, error } = await db.rpc('rpc_login', { p_username: username, p_password: pass });
  const user = Array.isArray(rows) ? rows[0] : rows;
  if (error) {
    // Bloqueio por excesso de tentativas (força bruta) vem do banco como
    // uma exceção com texto pronto para o usuário — mostramos ele direto,
    // sem o prefixo de "erro técnico", que confundiria quem só errou a senha.
    if (/muitas tentativas/i.test(error.message || '')) {
      errEl.textContent = 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.';
      errEl.classList.remove('hidden');
      $('btn-login').disabled = false; $('btn-login').innerHTML = `${lc('log-in', 18, 'btn-icon')} Entrar no Sistema`; refreshLucide(); return;
    }
    // Erro técnico (função ainda não existe, cache do PostgREST desatualizado,
    // permissão faltando etc.) — mostramos o motivo real em vez de mascarar
    // como "senha errada", para dar pra diagnosticar. Detalhe completo no console.
    console.error('[rpc_login] erro técnico:', error);
    errEl.textContent = `Não foi possível entrar (erro técnico: ${error.message || 'ver console'}). Confirme se o security_migration.sql já foi rodado no Supabase.`;
    errEl.classList.remove('hidden');
    $('btn-login').disabled = false; $('btn-login').innerHTML = `${lc('log-in', 18, 'btn-icon')} Entrar no Sistema`; refreshLucide(); return;
  }
  if (!user) {
    errEl.textContent = 'Usuário ou senha inválidos'; errEl.classList.remove('hidden');
    $('btn-login').disabled = false; $('btn-login').innerHTML = `${lc('log-in', 18, 'btn-icon')} Entrar no Sistema`; refreshLucide(); return;
  }

  // Verificação de licença antes de entrar
  const licOk = await checkLicenca(user.id);
  if (!licOk) return;

  // O token de sessão não faz parte do "perfil" do usuário: guardamos ele
  // separado (SESSION_KEY) e fora do objeto salvo, para não sair espalhado
  // em cache/telas que serializam currentUser.
  const sessionToken = user.session_token || null;
  delete user.session_token;

  localStorage.setItem('ecclesia_user', JSON.stringify(user));
  currentUser = user;
  await loadPermissions(); await loadUserSetor(); await loadUserCong(); await loadAllCongs();
  await checkAndSetSession(user.id, sessionToken);
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
  const topAv = $('topbar-user-av');
  if (topAv) { topAv.textContent = initials(user.nome); topAv.style.background = `linear-gradient(135deg,${avatarColor(user.nome)},#8b5cf6)`; }
  $('topbar-date').textContent = `EclesiaSync · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const ss = $('user-setor-side');
  if (ss) ss.textContent = currentUserSetor ? currentUserSetor.nome : (isSuperAdmin() ? 'Todos os setores' : 'Sem setor');

  // Injeta item Financeiro no menu se tiver permissão
  injectFinanceiroMenu();
  // Injeta item Eventos Setoriais se tiver permissão
  injectEventoSetorialMenu();
  // Injeta itens "Membros" e "Jovens (Fora UMADALPE)" — preso ao evento real
  // de login concluído (não a um setTimeout de tempo fixo) para garantir que
  // currentUser e permissionsCache já estejam carregados nesse momento.
  setTimeout(pfInjetarMenusExtras, 50);

  // Sino de notificações no topbar + consumo de deep-link (clique em
  // notificação abriu o app com ?goto=...).
  if (typeof pfInjetarSinoNotif === 'function') setTimeout(pfInjetarSinoNotif, 60);
  if (typeof pfConsumirGoto === 'function') setTimeout(pfConsumirGoto, 300);
  // Realtime: notifica este aparelho quando qualquer evento é criado (por
  // este usuário ou por outro) enquanto o app está aberto.
  if (typeof pfIniciarRealtimeEventos === 'function') setTimeout(pfIniciarRealtimeEventos, 80);

  navigate('dashboard');
}

function pfInjetarMenusExtras() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  if (!nav.querySelector('[data-page="todos_membros"]') && typeof canVerMembros === 'function' && canVerMembros()) {
    const div = document.createElement('div');
    div.className = 'nav-item'; div.dataset.page = 'todos_membros';
    div.innerHTML = `<span class="nav-icon"><i data-lucide="users-round"></i></span><span class="nav-lbl">Membros</span>`;
    div.addEventListener('click', () => { navigate('todos_membros'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const usersItem = nav.querySelector('[data-page="usuarios"]');
    if (usersItem) nav.insertBefore(div, usersItem.nextSibling); else nav.appendChild(div);
  }

  if (!nav.querySelector('[data-page="jovens_fora_umadalpe"]') && typeof canVerJovensFU === 'function' && canVerJovensFU()) {
    const div2 = document.createElement('div');
    div2.className = 'nav-item'; div2.dataset.page = 'jovens_fora_umadalpe';
    div2.innerHTML = `<span class="nav-icon"><i data-lucide="user-round-search"></i></span><span class="nav-lbl">Jovens (Fora UMADALPE)</span>`;
    div2.addEventListener('click', () => { navigate('jovens_fora_umadalpe'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const membrosItem = nav.querySelector('[data-page="todos_membros"]');
    if (membrosItem) nav.insertBefore(div2, membrosItem.nextSibling); else nav.appendChild(div2);
  }

  if (typeof refreshLucide === 'function') refreshLucide();
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
  el.addEventListener('click', () => {
    navigate(el.dataset.page); toggleMobile(false);
  });
});
$('user-pill').addEventListener('click', async () => {
  const r = await confirmDialog('Sair do sistema', 'Deseja encerrar sua sessão?');
  if (r.isConfirmed) {
    // Revoga a sessão NO SERVIDOR — sem isso, o token continuaria válido
    // mesmo depois de "sair", e quem tivesse uma cópia dele seguiria dentro.
    await rpcSeguro('rpc_logout', { p_token: getSessionToken() },
      async () => {
        try { await q('sistema_usuarios').update({ session_token: null }).eq('id', currentUser.id); } catch (e) { }
        return { ok: true };
      });
    if (window._sessionInterval) clearInterval(window._sessionInterval);
    pfLimparSessaoPreservandoPrefs(); location.reload();
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

/* Card compacto p/ Relatórios — sem a seta de tendência falsa do
   statCard() normal (aqui são contagens do período, não comparativos) */
function relStatCard(icon, cls, val, label) {
  return `<div class="rel-stat"><div class="rel-stat-ico ${cls}">${icon}</div><div><div class="rel-stat-val">${val}</div><div class="rel-stat-lbl">${label}</div></div></div>`;
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
          <button class="btn btn-teal btn-sm" onclick="renovarLicenca('${l.id}','${escAttr(l.user?.nome || '')}')">${lc('refresh-cw', 14)} Renovar</button>
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
  const podeVer = canEventoSetorial() || hasPerm('visualizar_eventos_setoriais_dash') || isSuperAdmin();
  if (!podeVer) {
    $('page-content').innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão para ver eventos setoriais.</p></div>`; refreshLucide(); return;
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
      ${canEventoSetorial() ? `<button class="btn btn-primary btn-sm" onclick="openEventoSetorialModal()">+ Novo Evento Setorial</button>` : ''}
    </div>
  </div>

  <div class="stats-grid stats-3" style="margin-bottom:24px">
    ${statCard(lc('building-2', 20), 'ic-gold', (eventos || []).length, 'Eventos Setoriais', '')}
    ${statCard(lc('users', 20), 'ic-blue', usuariosSetor.length, 'Usuários no Setor', '')}
    ${statCard(lc('calendar', 20), 'ic-teal', (eventos || []).filter(e => { const d = new Date(e.data + 'T00:00:00'); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length, 'Eventos este Mês', '')}
  </div>

  <!-- Usuários do Setor -->
  <div class="sec-hdr"><h2>${lc('users', 18)} Usuários do Setor <span class="count-badge">${usuariosSetor.length}</span></h2></div>
  ${usuariosSetor.length ? `
  <div class="form-group" style="margin-bottom:10px">
    <div class="input-wrapper">
      <i data-lucide="search" class="input-icon" style="width:16px;height:16px"></i>
      <input id="es-setor-user-filter" placeholder="Buscar usuário por nome..." oninput="filterEsSetorUsers(this.value)" style="padding-left:38px"/>
    </div>
  </div>` : ''}
  <div class="es-user-scroll" id="es-setor-user-list" style="margin-bottom:28px">
    ${usuariosSetor.length ? usuariosSetor.map(u => `
      <div class="user-card es-setor-user-row" data-nome="${escAttr(u.nome)}">
        <div class="user-card-main">
          <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
          <div class="user-card-info">
            <div class="fw5 fs-sm">${escHtml(u.nome)}</div>
            <div class="fs-xs c3">${escHtml(u.cargo || '—')} · ${escHtml(u.congregacao || '—')}</div>
          </div>
        </div>
      </div>`).join('') : `<div class="empty"><div class="empty-ico">${lc('users', 44)}</div><p>Nenhum usuário neste setor.</p></div>`}
    <div class="empty es-user-empty hidden" id="es-setor-user-empty" style="padding:16px"><p class="c3 fs-xs">Nenhum usuário com esse nome.</p></div>
  </div>

  <!-- Eventos Setoriais -->
  <div class="sec-hdr"><h2>Eventos Registrados <span class="count-badge">${(eventos || []).length}</span></h2></div>
  <div style="display:flex;flex-direction:column;gap:8px">
    ${(eventos || []).length ? pfOrdenarEventosFuturosTopo(eventos || []).map(e => {
      const futuro = e.data > new Date().toISOString().slice(0, 10);
      const rascunho = e.status === 'rascunho'; // "Agendado" depende só do status; após Finalizar (status != rascunho) some, mesmo se a data ainda for futura.
      return `
      <div class="ev-card ev-card-click" onclick="openEventoSetorialDetail('${e.id}')" style="cursor:pointer">
        <div class="ev-card-left">
          <div class="act-dot" style="background:${rascunho ? 'var(--txt3)' : 'var(--violet)'}"></div>
          <div>
            <div class="fw5 fs-sm">${lc('building-2', 14)} ${escHtml(e.resumo || tipoLabel(e.tipo))} ${rascunho ? '<span class="tag tag-secondary" style="font-size:.58rem">Agendado</span>' : ''}</div>
            <div class="fs-xs c3">${setorNome(e.setor_id)} · ${fmtDate(e.data)}</div>
          </div>
        </div>
        <div class="ev-card-right" onclick="event.stopPropagation()">
          <span class="tag">${e.participantes || 0} pessoas</span>
          ${rascunho && canEventoSetorial() ? `<button class="btn btn-primary btn-sm" onclick="openFinalizarEventoSetorial('${e.id}')" title="Preencher os dados após a realização">${lc('check-circle', 14)} Finalizar</button>` : ''}
          ${isSuperAdmin() || hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delEvento('${e.id}')">${lc('trash-2', 14)}</button>` : ''}
        </div>
      </div>`;
    }).join('') :
      `<div class="empty"><div class="empty-ico">${lc('building-2', 44)}</div><p>Nenhum evento setorial registrado.</p></div>`}
  </div>`;
  refreshLucide();
}

/* Filtro por nome da lista "Usuários do Setor" (Eventos Setoriais). */
window.filterEsSetorUsers = function (val) {
  const t = (val || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#es-setor-user-list .es-setor-user-row');
  let visiveis = 0;
  rows.forEach(row => {
    const ok = (row.dataset.nome || '').toLowerCase().includes(t);
    row.style.display = ok ? '' : 'none';
    if (ok) visiveis++;
  });
  const vazio = document.getElementById('es-setor-user-empty');
  if (vazio) vazio.classList.toggle('hidden', visiveis > 0);
};

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
      <div class="item-card" style="animation-delay:${i * .05}s" onclick="openSetor('${s.id}','${escAttr(s.nome)}','${escAttr(s.regiao || '')}')">
        <div class="card-head"><div class="card-ico">${lc('map-pin', 17)}</div>
          <div><div class="card-name">${escHtml(s.nome)}</div><div class="card-sub">Região ${s.regiao || '—'}</div></div>
        </div>
        <div class="card-meta"><span class="tag tag-gold">${lc('church', 12)} ${congCount(s.id)} Cong.</span><span class="tag tag-blue">${lc('users', 12)} ${memCount(s.id)} Membros</span></div>
        <div class="card-actions" onclick="event.stopPropagation()">
          ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delSetor('${s.id}','${escAttr(s.nome)}')">${lc('trash-2', 14)}</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="openSetor('${s.id}','${escAttr(s.nome)}','${escAttr(s.regiao || '')}')">${lc('arrow-right', 14)} Abrir</button>
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
      <div style="font-size:.77rem;color:var(--txt2);margin:8px 0">${lc("user-round", 13)} ${escHtml(c.pastor_local || 'A definir')}</div>
      <div class="card-meta"><span class="tag tag-teal">${lc("users", 18)} ${memCount(c.id)} membros</span></div>
      <div class="card-actions" onclick="event.stopPropagation()">
        ${hasPerm('gerenciar_congregacoes') ? `<button class="btn btn-secondary btn-sm" onclick="openEditCongModal('${c.id}')">${lc("pencil", 14)}</button>` : ''}
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delCong('${c.id}','${escAttr(c.nome)}')">${lc("trash-2", 14)}</button>` : ''}
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
  const [{ data: c }, { data: usuariosAll }] = await Promise.all([q('congregacoes').select('*').eq('id', id).single(), q('sistema_usuarios').select('id,nome,cargo,congregacao_id,congregacao').order('nome')]);
  if (!c) { closeModal(); toast('Erro ao carregar', 'error'); return; }
  // Dirigente/Vice/Secretária/Auxiliares só podem ser escolhidos entre os
  // usuários cadastrados NESTA congregação (por id ou, na falta dele, pelo
  // nome da congregação) — antes o select puxava todos os usuários do sistema.
  const nomeCong = (c.nome || '').trim().toLowerCase();
  const usuarios = (usuariosAll || []).filter(u =>
    u.congregacao_id === id || (nomeCong && (u.congregacao || '').trim().toLowerCase() === nomeCong)
  );
  const uOpts = usuarios.map(u => `<option value="${u.id}">${escHtml(u.nome)} (${escHtml(u.cargo || '—')})</option>`).join('') || '<option value="" disabled>Nenhum usuário cadastrado nesta congregação</option>';
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

/* ════════════════════════════════════════════════════════════
   AGENDAS SEMANAIS (menu "Agendas semanais")
   Tela de consulta: filtra um setor, lista as congregações dele e,
   ao tocar numa congregação, abre um popup somente-leitura com a
   agenda da semana. Serve para usuários verem os dias de culto/evento
   de congregações de OUTROS setores. O acesso a outros setores é
   controlado pela permissão 'ver_agenda_semanal_outros_setores' —
   independente de "Ver Todos os Setores".
════════════════════════════════════════════════════════════ */
const canVerAgendaOutrosSetores = () =>
  isSuperAdmin() || canSeeAllSetores() || (typeof hasPerm === 'function' && hasPerm('ver_agenda_semanal_outros_setores'));

window._asSetorFiltro = window._asSetorFiltro || '';

window.renderAgendasSemanais = async function () {
  const pc = $('page-content'); if (!pc) return;
  pc.innerHTML = loadingPage();
  const podeOutros = canVerAgendaOutrosSetores();
  const meuSetor = currentUser?.setor_id || null;
  const { data: setores } = await q('setores').select('id,nome').order('nome');
  // Setor selecionado: quem pode ver outros respeita o filtro (padrão = seu
  // setor, ou o primeiro); quem não pode fica travado no próprio setor.
  let sid = podeOutros ? (window._asSetorFiltro || meuSetor || '') : (meuSetor || '');
  if (podeOutros && !sid && (setores || []).length) sid = setores[0].id;

  let congs = [];
  if (sid) { const { data } = await q('congregacoes').select('id,nome,setor_id,endereco,pastor_local').eq('setor_id', sid).order('nome'); congs = data || []; }
  const setorNome = id => (setores || []).find(s => s.id === id)?.nome || '—';

  const filtro = podeOutros
    ? `<div class="form-group" style="margin:0"><label>Setor</label>
        <select id="as-setor" onchange="window._asSetorFiltro=this.value; renderAgendasSemanais()" style="min-width:180px">
          ${(setores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
        </select></div>`
    : `<div style="font-size:.82rem;color:var(--txt2)">${lc('map-pin', 14)} ${escHtml(setorNome(sid))}</div>`;

  pc.innerHTML = `
  <div class="sec-hdr">
    <div><h2>${lc('calendar-days', 20)} Agendas Semanais</h2></div>
    <div class="sec-actions">${backBtn()}</div>
  </div>
  <p class="c3 fs-sm" style="margin:-6px 0 16px">Consulte os dias de culto e eventos registrados nas agendas semanais das congregações${podeOutros ? ' — filtre por setor para acompanhar outras regiões.' : ' do seu setor.'}</p>
  <div class="filter-bar" style="margin-bottom:20px"><div class="filter-fields">${filtro}</div></div>
  <div class="sec-hdr"><h2>${lc('church', 18)} Congregações <span class="count-badge">${congs.length}</span></h2></div>
  ${congs.length ? `<div class="cards-grid">${congs.map((c, i) => `
    <div class="item-card" style="animation-delay:${i * .05}s;cursor:pointer" onclick="openAgendaSemanalPopup('${c.id}','${escAttr(c.nome)}')">
      <div class="card-head"><div class="card-ico">${lc('church', 14)}</div>
        <div><div class="card-name">${escHtml(c.nome)}</div><div class="card-sub">${escHtml(c.endereco || setorNome(c.setor_id))}</div></div>
      </div>
      <div style="font-size:.77rem;color:var(--txt2);margin:8px 0">${lc('user-round', 13)} ${escHtml(c.pastor_local || 'A definir')}</div>
      <div class="card-meta"><span class="tag tag-teal">${lc('calendar', 14)} Ver agenda da semana</span></div>
    </div>`).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">${lc('church', 44)}</div><p>Nenhuma congregação neste setor.</p></div>`}`;
  refreshLucide();
};

/* Popup somente-leitura com a agenda da SEMANA atual de uma congregação. Não
   expõe nada além da agenda (sem editar/excluir/adicionar). */
window.openAgendaSemanalPopup = async function (congId, congNome) {
  showModal(`<div class="modal-hdr"><span>${lc('calendar-days', 18)}</span><h2>Agenda — ${escHtml(congNome || '')}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="as-popup-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
  const hoje = new Date();
  const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  const fimSemana = new Date(inicioSemana); fimSemana.setDate(inicioSemana.getDate() + 6);
  const { data: items } = await q('agenda_semana').select('*').eq('congregacao_id', congId)
    .gte('data', inicioSemana.toISOString().slice(0, 10)).lte('data', fimSemana.toISOString().slice(0, 10)).order('data');
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hojeStr = new Date().toISOString().slice(0, 10);
  let grid = '<div class="agenda-grid-7">';
  for (let d = 0; d < 7; d++) {
    const dia = new Date(inicioSemana); dia.setDate(inicioSemana.getDate() + d);
    const dStr = dia.toISOString().slice(0, 10);
    const item = (items || []).find(i => i.data === dStr);
    const isToday = dStr === hojeStr;
    grid += `<div class="agenda-day${isToday ? ' agenda-today' : ''}"><div class="ag-day-head"><span class="ag-day-name">${dias[d]}</span><span class="ag-day-num">${dia.getDate()}</span></div><div class="ag-day-body">${item ? `<div class="ag-event-chip" style="cursor:default">${escHtml(item.titulo || item.descricao || '')}${item.hora ? ` <span class="c3">${escHtml(item.hora)}</span>` : ''}</div>` : `<span class="c3 fs-xs" style="opacity:.45">—</span>`}</div></div>`;
  }
  grid += '</div>';
  const body = $('as-popup-body');
  if (body) body.innerHTML = `<p class="c3 fs-sm" style="margin-bottom:12px">Semana atual — somente leitura.</p><div style="overflow-x:auto">${grid}</div>`;
  refreshLucide();
};

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
      <div class="lider-expand-hint fs-xs c3" style="margin-top:6px;text-align:right">${lc("chevron-down", 12)} clique para expandir</div>`: ''
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
    ${renderLiderCard(lc("user-round", 18), 'Pastor Local', c.pastor_local)}
    ${renderLiderCard(lc("briefcase", 18), 'Dirigente', c.dirigente)}
    ${renderLiderCard(lc("users",18), 'Vice-Dirigente', c.vice_dirigente)}
    ${renderLiderCard(lc("user-round", 18), 'Secretária', c.secretaria)}
    ${c.auxiliares ? renderLiderCard(lc("handshake", 18), 'Auxiliares', c.auxiliares) : `<div class="struct-card" style="opacity:.5"><div class="s-icon">${lc("handshake", 18)}</div><div class="s-label">Auxiliares</div><div class="s-value">A definir</div></div>`}
  </div>

  <div class="stats-grid stats-3" style="margin-bottom:22px">
    ${statCard(lc("clipboard-list",14), 'ic-gold', (eventos || []).length, 'Eventos registrados', '')}
    ${canSeeFinanceiro() ? statCard(lc("coins",14), 'ic-teal', fmtMoney(totalOfertas), 'Total Ofertas', '') : ''}
    ${canSeeFinanceiro() ? statCard(lc("wallet", 14), 'ic-violet', fmtMoney(totalDizimos), 'Total Dízimos', '') : ''}
  </div>

  <div class="sec-hdr"><h2>${lc("calendar", 14)} Agenda da Semana</h2><div class="sec-actions">${hasPerm('gerenciar_agenda') ? `<button class="btn btn-primary btn-sm" onclick="openAgendaModal('${c.id}')">+</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="openAgendaCompleta('${c.id}')">Ver completa ${lc("arrow-right", 14)}</button></div></div>
  <div style="margin-bottom:28px">${renderAgendaSemanaGrid(agendaSemana || [], inicioSemana, c.id)}</div>

  <div class="sec-hdr"><h2>Eventos <span class="count-badge">${(eventos || []).length}</span></h2></div>
  ${(eventos || []).length ? `<div class="act-list" style="margin-bottom:28px">${pfOrdenarEventosFuturosTopo(eventos || []).map(e => {
      const futuro = (e.data || '') > new Date().toISOString().slice(0, 10);
      const rascunho = e.status === 'rascunho'; // "Agendado" depende só do status; após Finalizar (status != rascunho) some, mesmo se a data ainda for futura.
      return `
    <div class="act-item${rascunho ? ' evento-futuro' : ''}" onclick="openEventDetail('${e.id}')" style="cursor:pointer">
      <div class="act-dot" style="background:${rascunho ? 'var(--txt3)' : tipoColor(e.tipo)}"></div>
      <div class="f1"><div class="fw5">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)} ${rascunho ? '<span class="tag tag-primary" style="font-size:.58rem">Agendado</span>' : ''}</div><div class="fs-xs c3">${escHtml(e.resumo || '')}</div></div>
      <div style="text-align:right">
        <span class="tag">${e.participantes || 0} pessoas</span>
        ${tipoFinanceiro(e.tipo) && canSeeFinanceiro() ? `<div class="fs-xs c3 mt8">${fmtMoney(e.ofertas || 0)} + ${fmtMoney(e.dizimos || 0)}</div>` : ''}
      </div>
      <span class="act-time">${fmtDate(e.data)}</span>
      <div onclick="event.stopPropagation()" style="display:flex;gap:6px;align-items:center">
        ${rascunho && hasPerm('registrar_eventos') ? `<button class="btn btn-primary btn-sm" onclick="openFinalizarEvento('${e.id}')" title="Preencher os dados após a realização">${lc("check-circle", 14)} Finalizar</button>` : ''}
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delEvento('${e.id}')">${lc("trash-2", 14)}</button>` : ''}
      </div>
    </div>`;
    }).join('')}</div>` : `<div class="empty" style="margin-bottom:28px"><div class="empty-ico">${lc("clipboard-list", 14)}</div><p>Nenhum evento registrado.</p></div>`}

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
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delMembro('${m.id}','${escAttr(m.nome)}')">${lc("trash-2", 14)}</button>` : ''}
      </div>
    </div>`).join('')}</div>` : `<div class="empty"><div class="empty-ico">${lc("users", 18)}</div><p>Nenhum membro cadastrado.</p></div>`}`;
}

function toggleLiderExpand(card) {
  const expand = card.querySelector('.lider-expand');
  const hint = card.querySelector('.lider-expand-hint');
  if (!expand) return;
  expand.classList.toggle('hidden');
  if (hint) hint.innerHTML = expand.classList.contains('hidden') ? `${lc('chevron-down', 12)} clique para expandir` : `${lc('chevron-up', 12)} clique para recolher`;
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
  showModal(`<div class="modal-hdr"><span>${lc("calendar", 14)}</span><h2>${editId ? 'Editar' : 'Adicionar'} Agenda</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="form-group"><label>Data *</label><input id="ag-data" type="date" value="${dataPreset || new Date().toISOString().slice(0, 10)}" ${editId ? '' : `min="${new Date().toISOString().slice(0, 10)}"`}/></div><div class="form-group"><label>Título *</label><input id="ag-titulo" placeholder="Ex: Culto de Domingo"/></div><div class="form-group"><label>Horário</label><input id="ag-hora" type="time"/></div><div class="form-group"><label>Descrição</label><textarea id="ag-desc" rows="3"></textarea></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveAgenda('${congId}','${editId || ''}')">${lc("save", 14)} Salvar</button></div>`);
  if (editId) { const { data: ag } = await q('agenda_semana').select('*').eq('id', editId).single(); if (ag) { $('ag-data').value = ag.data || ''; $('ag-titulo').value = ag.titulo || ''; $('ag-hora').value = ag.hora || ''; $('ag-desc').value = ag.descricao || ''; } }
}
async function saveAgenda(congId, editId) {
  if (!hasPerm('gerenciar_agenda')) { toast('Sem permissão', 'error'); return; }
  const titulo = ($('ag-titulo')?.value || '').trim(), data = $('ag-data')?.value;
  if (!titulo || !data) { toast('Título e data obrigatórios', 'error'); return; }
  // Não permite agendar (nem mover) para uma data anterior a hoje. Exceção:
  // ao editar um item que JÁ estava no passado, mantendo a mesma data (assim
  // ainda dá para corrigir o título/descrição de um compromisso antigo).
  const hojeStr = new Date().toISOString().slice(0, 10);
  if (data < hojeStr) {
    let permitido = false;
    if (editId) {
      const { data: orig } = await q('agenda_semana').select('data').eq('id', editId).single();
      if (orig && orig.data === data) permitido = true;
    }
    if (!permitido) { toast('A data não pode ser anterior a hoje.', 'error'); return; }
  }
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
    // Participantes podem ser usuários do sistema (setor / de fora) OU membros
    // (obreiros adicionados no "Finalizar"). Busca nas duas tabelas e junta —
    // os UUIDs são únicos, sem risco de misturar registros errados.
    const [{ data: pu }, { data: pm }] = await Promise.all([
      q('sistema_usuarios').select('id,nome,cargo').in('id', ev.participante_ids),
      q('membros').select('id,nome,cargo').in('id', ev.participante_ids)
    ]);
    const partics = [...(pu || []), ...(pm || [])];
    if (partics.length) participantesHtml = `<div style="padding:0 30px 8px"><div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Participantes (${partics.length})</h2></div><div class="partic-list">${partics.map(p => `<div class="partic-row"><div class="av av-sm" style="background:${avatarColor(p.nome)}">${initials(p.nome)}</div><span class="fs-sm">${escHtml(p.nome)} <em class="c3 fs-xs">${escHtml(p.cargo || '')}</em></span></div>`).join('')}</div></div>`;
  }
  const rascunho = ev.status === 'rascunho'; // situação depende do status, não da data
  const detalhes = `<div class="mem-info-grid"><div class="inf-item"><label>Setor</label><span>${escHtml(setorNome)}</span></div><div class="inf-item"><label>Data</label><span>${fmtDate(ev.data)}</span></div><div class="inf-item"><label>Horário</label><span>${ev.hora_inicio || '—'} ${ev.hora_fim ? '– ' + ev.hora_fim : ''}</span></div><div class="inf-item"><label>Situação</label><span>${rascunho ? 'Agendado' : 'Publicado'}</span></div><div class="inf-item"><label>Participantes</label><span>${ev.participantes || 0}</span></div>${ev.conversoes ? `<div class="inf-item"><label>Conversões</label><span>${ev.conversoes}</span></div>` : ''}</div>`;
  const btnFinalizar = (rascunho && canEventoSetorial()) ? `<button class="btn btn-primary" onclick="closeModal();openFinalizarEventoSetorial('${ev.id}')">${lc('check-circle', 14)} Finalizar</button>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div style="font-size:40px;margin-bottom:8px">${lc('building-2', 40)}</div><div class="mem-modal-name">${escHtml(ev.resumo || 'Evento Setorial')}</div><span class="tag ${rascunho ? 'tag-secondary' : 'tag-violet'}">${rascunho ? 'Agendado' : 'Evento Setorial'}</span></div>${detalhes}${ev.descricao ? `<div style="padding:0 30px 8px"><p style="color:var(--txt2);font-size:.88rem">${escHtml(ev.descricao)}</p></div>` : ''}${participantesHtml}<div class="mem-modal-foot">${btnFinalizar}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
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
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${hasPerm('gerenciar_membros') ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
}

function openEditMembro(id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)" value="${escHtml(m.telefone || '')}"/></div>
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
    <div class="form-group"><label>Telefone</label><input id="add-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)"/></div>
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
  let qU = q('sistema_usuarios').select('id,nome,username,role,cargo,congregacao,idade,ativo,setor_id,congregacao_id,frequenta_ebd,papel_ebd,vocacao,created_at').order('nome');
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
            ${u.vocacao ? `<span class="tag tag-gold fs-xs">${lc("sparkles", 14)} ${escHtml(u.vocacao)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.id}')">${lc("pencil", 14)}</button>
        ${isSuperAdmin() ? `<button class="btn btn-secondary btn-sm" onclick="openUserPermModal('${u.id}','${escAttr(u.nome)}')">${lc("shield-off", 14)}</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="delUser('${u.id}','${escAttr(u.nome)}')">${lc("trash-2", 14)}</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function openUserModal(id) {
  const ROLES = ['admin', 'dirigente', 'adjunto', 'usuario'];
  showModal(`<div class="modal-hdr"><span>${lc('user', 20)}</span><h2>${id ? 'Editar Usuário' : 'Novo Usuário'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="user-modal-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot" id="user-modal-foot"></div>`);
  Promise.all([
    id ? q('sistema_usuarios').select('id,nome,username,role,cargo,congregacao,idade,ativo,setor_id,congregacao_id,frequenta_ebd,papel_ebd,vocacao,created_at').eq('id', id).single() : { data: null },
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
  const payload = { nome, username, role: $('um-role').value, cargo: $('um-cargo').value, congregacao: congNomeVal, congregacao_id: congId, idade: parseInt($('um-age')?.value) || null, ativo: $('um-ativo').value === 'true', setor_id: $('um-setor')?.value || null, frequenta_ebd: $('um-ebd')?.value === 'true', papel_ebd: $('um-papel-ebd')?.value || null, vocacao: ($('um-vocacao')?.value || '').trim() || null } ;
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
  // A autorização de verdade acontece no banco (rpc_set_user_permission
  // confere que o usuário da sessão é admin). O isSuperAdmin() acima é só
  // para não mostrar o controle a quem não deve — não é a barreira.
  const r = await rpcSeguro('rpc_set_user_permission',
    { p_token: getSessionToken(), p_target_user: userId, p_perm: perm, p_ativo: novoValor },
    async () => {
      const { error } = await db.rpc('toggle_user_permission', { p_target_user: userId, p_perm: perm, p_ativo: novoValor });
      if (!error) return { ok: true };
      const { error: e2 } = await q('user_permissions').upsert({ user_id: userId, permission_code: perm, ativo: novoValor }, { onConflict: 'user_id,permission_code' });
      return e2 ? { error: e2, ok: false } : { ok: true };
    });
  if (!r.ok) { toast(r.error?.message || 'Não foi possível alterar a permissão', 'error'); return; }
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
  // Guarda os eventos do período para os popups de tipo (clique nos cards
  // Cultos/Eventos/Saídas) — ver relPopupTipo().
  window._relEventosCache = eventos;
  const memCount = id => (rMem.data || []).filter(m => m.congregacao_id === id).length;
  const cultos = eventos.filter(e => e.tipo === 'culto').length, genEvt = eventos.filter(e => e.tipo === 'evento').length, saidas = eventos.filter(e => e.tipo === 'saida').length;
  const totalPart = eventos.reduce((s, e) => s + (e.participantes || 0), 0), totalOfer = eventos.reduce((s, e) => s + (e.ofertas || 0), 0), totalDiz = eventos.reduce((s, e) => s + (e.dizimos || 0), 0), totalConv = eventos.reduce((s, e) => s + (e.conversoes || 0), 0);

  const setorSel = canFilterSetores() ? `<div class="form-group" style="margin:0"><label>Setor</label><select id="rel-setor" onchange="relSetorFiltro=this.value||currentUser?.setor_id||null;relCongFiltro=null" style="min-width:160px">${(allSetores || []).map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}</select></div>` : `<div style="font-size:.82rem;color:var(--txt2)">${lc("map-pin", 14)} ${escHtml((allSetores || []).find(s => s.id === sid)?.nome || '—')}</div>`;
  const congSel = canVerRelCong() && congsList.length ? `<div class="form-group" style="margin:0"><label>Congregação</label><select id="rel-cong" onchange="relCongFiltro=this.value||null" style="min-width:160px"><option value="">Todas</option>${congsList.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('')}</select></div>` : '';

  const evCard = e => { const cong = congs.find(c => c.id === e.congregacao_id); const abrir = e.tipo === 'evento_setorial' ? 'openEventoSetorialDetail' : 'openEventDetail'; return `<div class="ev-card" onclick="${abrir}('${e.id}')" style="cursor:pointer"><div class="ev-card-left"><div class="act-dot" style="background:${tipoColor(e.tipo)}"></div><div><div class="fw5 fs-sm">${tipoIcon(e.tipo)} ${tipoLabel(e.tipo)}</div><div class="fs-xs c3">${escHtml(cong?.nome || '—')} · ${escHtml(e.resumo || '—')}</div></div></div><div class="ev-card-right"><span class="act-time">${fmtDate(e.data)}</span><span class="tag">${e.participantes || 0} pess.</span>${canSeeFinanceiro() && tipoFinanceiro(e.tipo) ? `<span class="tag tag-gold">${fmtMoney(e.ofertas || 0)}</span>` : ''}</div></div>`; };
  const EV_VISIVEIS = 8;
  const eventosIniciais = eventos.slice(0, EV_VISIVEIS);
  const eventosResto = eventos.slice(EV_VISIVEIS);

  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Relatórios e Estatísticas</h2>
    <div class="sec-actions">
      ${backBtn()}
      ${hasPerm('exportar_dados') ? `<button class="btn btn-primary btn-sm" onclick="exportarPDF()">${lc("file-text", 14)} PDF</button>` : ''}
    </div>
  </div>
  <div class="filter-bar rel-filter-bar">
    <div class="filter-fields">
      ${setorSel}${congSel}
      <div class="form-group" style="margin:0"><label>Início</label><input type="date" id="rel-inicio" value="${relFiltroInicio}" onchange="relFiltroInicio=this.value"/></div>
      <div class="form-group" style="margin:0"><label>Fim</label><input type="date" id="rel-fim" value="${relFiltroFim}" onchange="relFiltroFim=this.value"/></div>
      <button class="btn btn-primary btn-sm" onclick="${canFilterSetores() ? "relSetorFiltro=$('rel-setor')?.value||currentUser?.setor_id||null;" : ''} ${canVerRelCong() ? "relCongFiltro=$('rel-cong')?.value||null;" : ''} renderRelatorios()">${lc("search", 14)} Filtrar</button>
      <button class="btn btn-secondary btn-sm" onclick="relFiltroInicio='';relFiltroFim='';relSetorFiltro=currentUser?.setor_id||null;relCongFiltro=null;renderRelatorios()" title="Limpar filtros">${lc("rotate-ccw", 14)}</button>
    </div>
    <div class="filter-presets">
      <button class="chip-btn" onclick="setRelFiltro('semana')">Esta semana</button>
      <button class="chip-btn" onclick="setRelFiltro('quinzena1')">1ª quinzena</button>
      <button class="chip-btn" onclick="setRelFiltro('quinzena2')">2ª quinzena</button>
      <button class="chip-btn" onclick="setRelFiltro('mes')">Este mês</button>
      <button class="chip-btn" onclick="setRelFiltro('ano')">Este ano</button>
    </div>
  </div>

  <div class="rel-stats-row">
    <div onclick="relPopupTipo('culto')" style="cursor:pointer" title="Ver os eventos">${relStatCard(lc("church",16), 'ic-gold', cultos, 'Cultos')}</div>
    <div onclick="relPopupTipo('evento')" style="cursor:pointer" title="Ver os eventos">${relStatCard(lc("calendar-days",16), 'ic-blue', genEvt, 'Eventos')}</div>
    <div onclick="relPopupTipo('saida')" style="cursor:pointer" title="Ver os eventos">${relStatCard(lc("footprints",16), 'ic-teal', saidas, 'Saídas Evang.')}</div>
    ${relStatCard(lc("cross",16), 'ic-violet', totalConv, 'Conversões')}
    ${relStatCard(lc("users",16), 'ic-blue', totalPart, 'Participantes')}
  </div>

  ${canSeeFinanceiro() ? `
  <div class="rel-fin-strip">
    <div class="rel-fin-item"><span class="rel-fin-lbl">${lc("coins",14)} Ofertas</span><span class="rel-fin-val">${fmtMoney(totalOfer)}</span></div>
    <div class="rel-fin-sep"></div>
    <div class="rel-fin-item"><span class="rel-fin-lbl">${lc("wallet",14)} Dízimos</span><span class="rel-fin-val">${fmtMoney(totalDiz)}</span></div>
    <div class="rel-fin-sep"></div>
    <div class="rel-fin-item rel-fin-total"><span class="rel-fin-lbl">${lc("banknote",14)} Total arrecadado</span><span class="rel-fin-val">${fmtMoney(totalOfer + totalDiz)}</span></div>
  </div>` : ''}

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
    ${eventosIniciais.map(evCard).join('') || '<p class="c3" style="padding:20px;text-align:center">Nenhum evento no período.</p>'}
    ${eventosResto.length ? `
    <div id="rel-eventos-resto" class="hidden" style="display:flex;flex-direction:column;gap:8px">
      ${eventosResto.map(evCard).join('')}
    </div>
    <div class="eventos-toggle">
      <button class="btn-expand-eventos" id="rel-eventos-toggle" onclick="relToggleEventos()">
        Ver mais ${eventosResto.length} eventos ${lc('chevrons-down',15)}
      </button>
    </div>` : ''}
  </div>`;

  const byMonth = Array(12).fill(0); eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); byMonth[m] += (e.participantes || 0); });
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  chartInstances.line?.destroy?.();
  const lCtx = document.getElementById('chart-line');
  if (lCtx) {
    // Mesma animação (bolinhas fluindo + ponto pulsante no mês atual) do
    // gráfico "Participantes por Mês" do Dashboard — qualquer tela com
    // esse tipo de gráfico deve usar o mesmo plugin dpFlowDots/dpPulseDot
    const curMonthIdx = new Date().getMonth();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const lineGrad = lCtx.getContext('2d').createLinearGradient(0, 0, 0, 220);
    if (isLight) { lineGrad.addColorStop(0, 'rgba(79,125,251,.28)'); lineGrad.addColorStop(1, 'rgba(79,125,251,0)'); }
    else { lineGrad.addColorStop(0, 'rgba(56,189,248,.45)'); lineGrad.addColorStop(1, 'rgba(56,189,248,0)'); }
    const lineColor = isLight ? '#4f7dfb' : '#38bdf8';
    const mutedSegment = isLight ? 'rgba(100,116,139,.35)' : 'rgba(148,163,184,.4)';
    const tickColor = isLight ? '#64748b' : 'rgba(238,240,246,.5)';
    const gridColor = isLight ? 'rgba(30,41,59,.08)' : 'rgba(255,255,255,.07)';
    const relLineChart = new Chart(lCtx, {
      type: 'line',
      data: {
        labels: meses, datasets: [{
          label: 'Participantes',
          data: byMonth,
          borderColor: lineColor,
          backgroundColor: lineGrad,
          tension: .45,
          fill: true,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: lineColor,
          pointBorderColor: isLight ? '#ffffff' : '#0e1119',
          pointBorderWidth: 1.5,
          segment: { borderColor: ctx => ctx.p1DataIndex === curMonthIdx ? lineColor : mutedSegment }
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          dpFlowDots: { period: 7000, count: 3, color: lineColor },
          dpPulseDot: { index: curMonthIdx, color: '#a3e635', radius: 1.6 }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display: false } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor } }
        }
      },
      plugins: [dpFlowDotsPlugin, dpPulseDotPlugin]
    });
    chartInstances.line = relLineChart;
    setTimeout(() => dpStartFlowLoop(relLineChart), 950);
  }
  const top6 = congs.slice(0, 6); const pCtx = document.getElementById('chart-pie'); if (pCtx) chartInstances.pie = new Chart(pCtx, { type: 'doughnut', data: { labels: top6.map(c => c.nome.split('—')[0].trim()), datasets: [{ data: top6.map(c => memCount(c.id)), backgroundColor: ['rgba(201,168,76,.8)', 'rgba(59,130,246,.8)', 'rgba(20,184,166,.8)', 'rgba(244,63,94,.8)', 'rgba(139,92,246,.8)', 'rgba(249,115,22,.8)'], borderWidth: 0, hoverOffset: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' } });
  if (canSeeFinanceiro()) { const oferMes = Array(12).fill(0), dizMes = Array(12).fill(0); eventos.forEach(e => { const m = new Date(e.data + 'T00:00:00').getMonth(); oferMes[m] += (e.ofertas || 0); dizMes[m] += (e.dizimos || 0); }); const fCtx = document.getElementById('chart-fin'); if (fCtx) chartInstances.fin = new Chart(fCtx, { type: 'bar', data: { labels: meses, datasets: [{ label: 'Ofertas', data: oferMes, backgroundColor: 'rgba(201,168,76,.75)', borderRadius: 6 }, { label: 'Dízimos', data: dizMes, backgroundColor: 'rgba(20,184,166,.55)', borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,.05)' } } } } }); }
}

/* Clique num card de tipo (Cultos/Eventos/Saídas) na tela de Relatórios →
   popup com todos os eventos daquele tipo no período filtrado. */
window.relPopupTipo = function (tipo) {
  const lista = (window._relEventosCache || []).filter(e => e.tipo === tipo);
  const nomes = { culto: 'Cultos', evento: 'Eventos', saida: 'Saídas Evangelísticas' };
  if (typeof pfPopupEventosPorTipo === 'function') pfPopupEventosPorTipo(nomes[tipo] || (typeof tipoLabel === 'function' ? tipoLabel(tipo) : tipo), lista);
};

window.relToggleEventos = function () {
  const resto = $('rel-eventos-resto'), btn = $('rel-eventos-toggle');
  if (!resto || !btn) return;
  const abrindo = resto.classList.contains('hidden');
  resto.classList.toggle('hidden', !abrindo);
  btn.innerHTML = abrindo ? `Ver menos ${lc('chevrons-up', 15)}` : `Ver mais ${resto.children.length} eventos ${lc('chevrons-down', 15)}`;
  refreshLucide();
};

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
/* ═══════════════════════════════════════════════════════════
   Frequência — base: tabela `membros` (não sistema_usuarios).
   Consolidado a partir de patch_frequencia_membros.js, que era
   carregado por último e por isso já era a versão realmente
   ativa no sistema; nenhuma lógica foi alterada aqui.
   ═══════════════════════════════════════════════════════════ */
async function renderFrequencia() {
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
      ${hasPerm('exportar_dados') ? `<button class="btn btn-primary btn-sm" onclick="exportarFrequenciaPDF()">${lc("file-text", 14)} PDF</button><button class="btn btn-secondary btn-sm" onclick="exportarFrequenciaExcel()">${lc("bar-chart-3", 14)} Excel</button>` : ''}
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
        <button class="btn btn-secondary btn-sm" onclick="openFreqDetalhe('${m.id}','${escAttr(m.nome)}')">Ver ${lc("arrow-right", 14)}</button>
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
async function openFreqDetalhe(membroId, nome) {
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
async function exportarFrequenciaPDF() {
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

async function exportarFrequenciaExcel() {
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
    'Filtros e Visibilidade': ['filtrar_setor_dashboard', 'filtrar_congregacao_dashboard', 'ver_relatorio_por_congregacao', 'ver_todos_setores', 'ver_agenda_semanal_outros_setores'],
    'Gestão': ['gerenciar_setores', 'gerenciar_congregacoes', 'gerenciar_membros', 'gerenciar_usuarios', 'gerenciar_agenda'],
    'Operações': ['registrar_eventos', 'criar_eventos_setorial', 'excluir_registros'],
    'Sistema': ['editar_permissoes', 'gerenciar_usuarios_bloqueados']
  };
  $('page-content').innerHTML = `
  <div class="sec-hdr">
    <h2>Controle de Permissões</h2>
    ${backBtn()}
    ${isSuperAdmin() ? `<button class="btn btn-primary btn-sm" onclick="openNewRoleModal()">+ Novo Perfil</button>` : ''}
  </div>
  <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:var(--txt2)">
    ${lc("star", 14)} <strong>admin</strong> = superusuário.<br>${lc("coins", 14)} <strong>Ver Financeiro</strong>: oculta ofertas/dízimos.<br>${lc("lock", 14)} <strong>Filtrar Setor</strong> = somente leitura.<br>${lc("wallet", 14)} <strong>Gerenciar Financeiro</strong>: acesso ao módulo de licenças.<br>${lc("building-2", 14)} <strong>Criar Eventos Setoriais</strong>: cria eventos e vê usuários do setor.
  </div>
  <div class="role-tabs">
    ${todasRoles.map(r => `<button class="btn ${r === activeRole ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setActiveRole('${escAttr(r)}')"><span class="role-badge ${roleCls(r)}">${escHtml(r)}</span></button>`).join('')}
    ${rolesCustom.map(r => `<button class="btn btn-danger btn-sm" onclick="delRole('${escAttr(r.nome)}')" title="Excluir perfil (somente admin)">${lc("trash-2", 14)}</button>`).join('')}
  </div>
  <div class="tbl-wrap" style="max-width:680px">
    <div style="padding:15px 18px;border-bottom:1px solid var(--bdr2)">
      <div style="font-family:'Cinzel',serif;font-size:.88rem">Perfil: <span class="role-badge ${roleCls(activeRole)}">${activeRole}</span>${activeRole === 'admin' ? `<span class="tag tag-gold" style="margin-left:8px">${lc("star", 12)} Superusuário</span>` : ''}${rolesCustom.some(r => r.nome === activeRole) ? `<span class="tag tag-blue" style="margin-left:8px">Customizado</span>` : ''}</div>
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
  const r = await rpcSeguro('rpc_set_role_permission',
    { p_token: getSessionToken(), p_role: activeRole, p_perm: perm, p_ativo: novoValor },
    async () => {
      const { error } = await db.rpc('toggle_role_permission', { p_role: activeRole, p_perm: perm, p_ativo: novoValor });
      if (!error) return { ok: true };
      await Promise.all([
        q('role_permissions').upsert({ role: activeRole, permission_code: perm, ativo: novoValor }, { onConflict: 'role,permission_code' }),
        q('permissoes').upsert({ role: activeRole, permissao: perm, ativo: novoValor }, { onConflict: 'role,permissao' })
      ]);
      return { ok: true };
    });
  if (!r.ok) { toast(r.error?.message || 'Não foi possível alterar a permissão', 'error'); return; }
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
  showModal(`<div class="modal-hdr"><span>${lc('shield-check', 20)}</span><h2>Novo Perfil de Acesso</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><div class="form-group"><label>Nome do Perfil *</label><input id="role-nome" placeholder="Ex: secretaria"/><small class="c3 fs-xs">Use letras minúsculas e underscores</small></div><div class="form-group"><label>Descrição</label><input id="role-desc"/></div><div style="border-top:1px solid var(--bdr2);margin:12px 0;padding-top:14px"><div class="fs-xs c3 fw6" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Permissões Iniciais</div>${Object.entries(PERM_DESC).map(([code, { label, desc }]) => `<div class="perm-row" style="padding:8px 0"><div class="perm-lbl"><strong>${label}</strong><span>${desc}</span></div><input type="checkbox" class="new-role-perm" value="${code}" style="accent-color:var(--gold);width:18px;height:18px"/></div>`).join('')}</div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveNewRole()">${lc('plus-circle', 14)} Criar</button></div>`);
}

async function saveNewRole() {
  if (!isSuperAdmin()) { toast('Sem permissão', 'error'); return; }
  const nome = ($('role-nome')?.value || '').trim().toLowerCase().replace(/\s+/g, '_'); const desc = ($('role-desc')?.value || '').trim();
  if (!nome) { toast('Nome obrigatório', 'error'); return; }
  if (['admin', 'dirigente', 'adjunto', 'usuario'].includes(nome)) { toast('Nome reservado', 'error'); return; }
  const permsChecked = [...document.querySelectorAll('.new-role-perm:checked')].map(c => c.value);
  const r = await rpcSeguro('rpc_criar_role',
    { p_token: getSessionToken(), p_nome: nome, p_descricao: desc, p_perms: permsChecked },
    async () => {
      const { error: roleError } = await q('roles').insert({ nome, descricao: desc });
      if (roleError) return { error: roleError, ok: false };
      if (permsChecked.length) await q('role_permissions').insert(permsChecked.map(p => ({ role: nome, permission_code: p, ativo: true })));
      return { ok: true };
    });
  if (!r.ok) { toast(r.error?.message || 'Não foi possível criar o perfil', 'error'); return; }
  toast(`Perfil "${nome}" criado!`); closeModal(); activeRole = nome; renderPermissoes();
}

async function delRole(roleName) {
  // Apenas admin pode excluir perfis
  if (!isSuperAdmin()) { toast('Apenas administradores podem excluir perfis', 'error'); return; }
  const r = await confirmDialog('Excluir Perfil', `O perfil "${roleName}" será removido permanentemente.`);
  if (!r.isConfirmed) return;
  const rDel = await rpcSeguro('rpc_excluir_role',
    { p_token: getSessionToken(), p_nome: roleName },
    async () => {
      await Promise.all([q('roles').delete().eq('nome', roleName), q('role_permissions').delete().eq('role', roleName)]);
      return { ok: true };
    });
  if (!rDel.ok) { toast(rDel.error?.message || 'Não foi possível excluir o perfil', 'error'); return; }
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

/* ═══════════════════════════════════════════════════════════
   NOTIFICAÇÕES — sino no topbar (liga/desliga), notificação ao
   publicar um evento, e deep-link ao clicar na notificação.
   ───────────────────────────────────────────────────────────
   • App aberto: a notificação é mostrada localmente pelo Service
     Worker (nível do SO, mesmo com a aba em segundo plano).
   • App fechado / usuário deslogado: depende de um servidor de push
     (VAPID) enviando a mensagem — ver push_notifications.sql. O
     cliente aqui já registra o SW e (se houver chave VAPID) assina o
     push, deixando tudo pronto para quando esse servidor existir.
   ═══════════════════════════════════════════════════════════ */
const NOTIF_KEY = 'ecclesia_notif_on';
window._pfPendingGoto = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  navigator.serviceWorker.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'eclesiasync-goto') { window._pfPendingGoto = { goto: m.goto, ev: m.ev }; pfConsumirGoto(); }
  });
}

// Clique numa notificação abre o app com ?goto=&ev= — lê isso já no carregar.
(function pfLerGotoDaUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const goto = p.get('goto');
    if (goto) {
      window._pfPendingGoto = { goto, ev: p.get('ev') };
      history.replaceState(null, '', location.pathname); // não repete no refresh
    }
  } catch (_) {}
})();

function pfConsumirGoto() {
  const alvo = window._pfPendingGoto;
  if (!alvo) return;
  // Só navega se estiver logado (app visível). Deslogado, fica pendente e é
  // consumido quando o usuário entrar (startApp chama isto).
  const logado = !document.getElementById('screen-app')?.classList.contains('hidden');
  if (!logado) return;
  window._pfPendingGoto = null;
  try {
    if (typeof navigate === 'function' && alvo.goto) navigate(alvo.goto);
    if (alvo.ev && alvo.goto === 'eventos_setoriais' && typeof openEventoSetorialDetail === 'function') {
      setTimeout(() => openEventoSetorialDetail(alvo.ev), 400);
    }
  } catch (_) {}
}

function pfNotifSuportado() { return ('Notification' in window); }
function pfNotifAtivo() {
  return pfNotifSuportado() && Notification.permission === 'granted' && localStorage.getItem(NOTIF_KEY) === '1';
}

function pfInjetarSinoNotif() {
  const container = document.getElementById('theme-panel-container');
  if (!container || document.getElementById('notif-bell')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'notif-bell';
  btn.className = 'notif-bell';
  btn.innerHTML = lc('bell', 18);
  btn.onclick = pfToggleNotif;
  container.parentElement.insertBefore(btn, container); // à esquerda do tema
  pfAtualizarSino();
  if (typeof refreshLucide === 'function') refreshLucide();
}

function pfAtualizarSino() {
  const btn = document.getElementById('notif-bell');
  if (!btn) return;
  const on = pfNotifAtivo();
  btn.classList.toggle('notif-on', on);
  btn.classList.toggle('notif-off', !on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Notificações ativadas — toque para desativar' : 'Notificações desativadas — toque para ativar';
}

async function pfToggleNotif() {
  if (!pfNotifSuportado()) { toast('Este navegador não suporta notificações.', 'error'); return; }
  if (pfNotifAtivo()) {
    localStorage.setItem(NOTIF_KEY, '0');
    pfAtualizarSino();
    toast('Notificações desativadas.');
    return;
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch (_) { perm = Notification.permission; }
  }
  if (perm !== 'granted') {
    toast('Permissão negada. Libere as notificações nas configurações do navegador.', 'error');
    return;
  }
  localStorage.setItem(NOTIF_KEY, '1');
  pfAtualizarSino();
  pfAssinarPush(); // best-effort (push do servidor, se configurado)
  toast('Notificações ativadas!');
}

async function pfAssinarPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const chave = window.VAPID_PUBLIC_KEY;
    if (!chave) return; // sem servidor de push configurado ainda
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pfB64ToUint8(chave) });
    try {
      await db.from('push_subscriptions').upsert(
        { usuario_id: currentUser?.id || null, endpoint: sub.endpoint, subscription: sub.toJSON() },
        { onConflict: 'endpoint' }
      );
    } catch (_) {}
  } catch (_) {}
}

function pfB64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Mostra a notificação quando um evento é publicado (chamada no "Finalizar").
/* ── SOM "Tri-tom" (Web Audio) ────────────────────────────────────────
   Três notas curtas ascendentes sintetizadas na hora — sem arquivo de áudio
   e sem usar o som proprietário de nenhum sistema. Toca junto do popup
   quando as notificações estão ativas. */
let _pfAudioCtx = null;
function pfDesbloquearAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_pfAudioCtx) _pfAudioCtx = new AC();
    if (_pfAudioCtx.state === 'suspended') _pfAudioCtx.resume();
  } catch (_) {}
}
function pfTocarSomNotificacao() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_pfAudioCtx) _pfAudioCtx = new AC();
    const ctx = _pfAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const notas = [{ f: 784, t: 0 }, { f: 1047, t: 0.14 }, { f: 1319, t: 0.28 }]; // Sol5 · Dó6 · Mi6
    const dur = 0.13;
    notas.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.f;
      const t0 = ctx.currentTime + n.t;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    });
  } catch (_) {}
}
// O áudio do navegador precisa de um gesto do usuário para "acordar". Assim
// que ele clicar/tocar em qualquer coisa uma vez, deixamos o contexto pronto.
['click', 'keydown', 'touchstart'].forEach(evt =>
  window.addEventListener(evt, pfDesbloquearAudio, { once: true, passive: true }));

/* ── SOM DE AÇÃO ──────────────────────────────────────────────────────
   Toca o "tri-tom" como feedback de qualquer ação relevante do sistema:
   criação de usuário/membro/evento/qualquer coisa, exclusões, mudança de
   tema e ativação do sino. É disparado centralmente pelo toast() de sucesso
   e por hooks específicos (tema/sino). O sino de notificações é o
   interruptor mestre: com ele desligado, nenhum som é emitido. */
function pfSomAcao() {
  try { if (pfNotifAtivo()) pfTocarSomNotificacao(); } catch (_) {}
}
window.pfSomAcao = pfSomAcao;

/* ── Notificação unificada de evento (popup + som) ────────────────────
   Usada tanto pelo aparelho de quem cria (hook nos submits) quanto pelos
   demais usuários (via Realtime). O dedup por id garante UMA notificação
   por evento em cada aparelho, mesmo que o criador receba pelo hook local
   e pelo Realtime. */
window._pfEventosNotificados = window._pfEventosNotificados || new Set();
function pfNotificarEvento(evento, titulo, corpo) {
  if (!pfNotifAtivo()) return;
  const id = evento && evento.id ? evento.id : null;
  if (id) {
    if (window._pfEventosNotificados.has(id)) return;
    window._pfEventosNotificados.add(id);
  }
  const setorial = evento && evento.tipo === 'evento_setorial';
  const opts = {
    body: corpo,
    goto: setorial ? 'eventos_setoriais' : 'dashboard',
    ev: setorial ? id : null,
    tag: 'evento-' + (id || Date.now())
  };
  pfTocarSomNotificacao();
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'eclesiasync-notify', title: titulo, options: opts });
    } else if ('Notification' in window) {
      const n = new Notification(titulo, { body: corpo, icon: 'assets/icon.png' });
      n.onclick = () => { window.focus(); if (typeof navigate === 'function') navigate(opts.goto); };
    }
  } catch (_) {}
}

// Notifica quando um evento é CRIADO (chamado nos submits, no aparelho de
// quem cria) — o Realtime cuida dos demais usuários.
function pfNotificarEventoCriado(evento) {
  const label = (typeof tipoLabel === 'function' && evento && evento.tipo) ? tipoLabel(evento.tipo) : 'Evento';
  const corpo = evento && evento.resumo ? `${label}: ${evento.resumo}` : `${label} registrado.`;
  pfNotificarEvento(evento, 'Novo evento', corpo);
}

// Mantido para o fluxo de "Finalizar/publicar" evento setorial.
function pfNotificarEventoPublicado(evento) {
  const corpo = evento && evento.resumo ? `"${evento.resumo}" já está disponível.` : 'Um evento setorial foi publicado.';
  pfNotificarEvento({ ...(evento || {}), tipo: 'evento_setorial' }, 'Novo evento publicado', corpo);
}

/* ── Realtime: avisa TODOS os aparelhos conectados quando um evento é
   inserido (criador + demais usuários com o app aberto). Requer o Realtime
   habilitado na tabela `eventos` no Supabase (ver push_notifications.sql). */
function pfIniciarRealtimeEventos() {
  try {
    if (!db || typeof db.channel !== 'function' || window._pfCanalEventos) return;
    window._pfCanalEventos = db.channel('eventos-novos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, payload => {
        const ev = payload && payload.new;
        if (ev) pfNotificarEventoCriado(ev);
      })
      .subscribe();
  } catch (_) {}
}

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
    var el = document.getElementById('theme-card');
    if (el) {
      el.classList.toggle('is-light', currentTheme === 'light');
      el.setAttribute('aria-checked', currentTheme === 'light' ? 'true' : 'false');
    }
  }

  // Um único switch deslizante no lugar dos dois botões separados
  // (lua/sol lado a lado) — mesma função applyTheme(), só a apresentação
  // muda: um clique alterna entre os dois temas.
  function buildPanel() {
    var wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'theme-switch';
    wrap.id = 'theme-card';
    wrap.title = 'Alternar tema claro/escuro';
    wrap.setAttribute('role', 'switch');
    wrap.setAttribute('aria-checked', currentTheme === 'light' ? 'true' : 'false');
    wrap.innerHTML =
      '<span class="theme-switch-ico theme-switch-ico-moon">' + lc('moon', 12) + '</span>' +
      '<span class="theme-switch-ico theme-switch-ico-sun">' + lc('sun', 12) + '</span>' +
      '<span class="theme-switch-thumb"></span>';
    wrap.onclick = function () {
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
      // Som na mudança de tema (respeita o sino como interruptor mestre).
      if (typeof window.pfSomAcao === 'function') window.pfSomAcao();
    };
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


/* ══════════════ patch_jovens_fora_umadalpe (consolidado) ══════════════ */

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

  // Dados de menores: a listagem passa pela função verificada do banco, que
  // confere permissão e limita ao setor do usuário no próprio servidor.
  const rJ = await rpcSeguro('rpc_jfu_listar',
    { p_token: getSessionToken(), p_setor_id: sidFiltro || null },
    async () => {
      let qJ = q('jovens_fora_umadalpe').select('*, congregacoes(nome), setores(nome)').order('nome');
      if (sidFiltro) qJ = qJ.eq('setor_id', sidFiltro);
      else if (!podeTodosSetores && currentUser?.setor_id) qJ = qJ.eq('setor_id', currentUser.setor_id);
      const { data, error } = await qJ;
      return { data, error, ok: !error };
    });
  const jovens = rJ.data, error = rJ.ok ? null : rJ.error;
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
        ${canManage ? `<button class="btn btn-danger btn-sm" onclick="delJovemFU('${escAttr(j.id)}','${escAttr(j.nome)}')">${lc('trash-2', 14)}</button>` : ''}
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
  const rIns = await rpcSeguro('rpc_jfu_salvar',
    { p_token: getSessionToken(), p_dados: payload },
    async () => { const { error } = await q('jovens_fora_umadalpe').insert(payload); return { error, ok: !error }; });
  if (!rIns.ok) return toast(rIns.error?.message || 'Não foi possível salvar', 'error');
  toast('Jovem cadastrado!'); closeModal(); renderJovensForaUmadalpe();
};

window.openEditJovemFU = async function (id) {
  if (!canGerJovensFU()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc('pencil', 14)}</span><h2>Editar Jovem</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="jfu-edit-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEditJovemFU('${id}')">${lc('save', 14)} Salvar</button></div>`);
  const [rObt, { data: setores }, { data: congs }] = await Promise.all([
    rpcSeguro('rpc_jfu_obter', { p_token: getSessionToken(), p_id: id },
      async () => { const { data, error } = await q('jovens_fora_umadalpe').select('*').eq('id', id).single(); return { data, error, ok: !error }; }),
    q('setores').select('id,nome').order('nome'),
    q('congregacoes').select('id,nome,setor_id').order('nome'),
  ]);
  if (!rObt.ok) { toast(rObt.error?.message || 'Não foi possível carregar', 'error'); return; }
  const j = rObt.data;
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
  const rUpd = await rpcSeguro('rpc_jfu_salvar',
    { p_token: getSessionToken(), p_dados: { ...payload, id } },
    async () => { const { error } = await q('jovens_fora_umadalpe').update(payload).eq('id', id); return { error, ok: !error }; });
  if (!rUpd.ok) return toast(rUpd.error?.message || 'Não foi possível salvar', 'error');
  toast('Jovem atualizado!'); closeModal(); renderJovensForaUmadalpe();
};

window.openViewJovemFU = async function (id) {
  showModal(loadingPage());
  const rView = await rpcSeguro('rpc_jfu_obter', { p_token: getSessionToken(), p_id: id },
    async () => { const { data, error } = await q('jovens_fora_umadalpe').select('*, congregacoes(nome), setores(nome)').eq('id', id).single(); return { data, error, ok: !error }; });
  const j = rView.data;
  if (!rView.ok || !j) { closeModal(); toast(rView.error?.message || 'Erro', 'error'); return; }
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
  <div class="mem-modal-foot">${j.telefone ? `<a href="https://wa.me/${j.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${canGerJovensFU() ? `<button class="btn btn-secondary" onclick="openEditJovemFU('${j.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};

window.delJovemFU = async function (id, nome) {
  if (!canGerJovensFU()) { toast('Sem permissão', 'error'); return; }
  const r = await confirmDialog('Excluir jovem?', `Isso removerá "${nome}" permanentemente.`);
  if (!r.isConfirmed) return;
  const rDelJ = await rpcSeguro('rpc_jfu_excluir', { p_token: getSessionToken(), p_id: id },
    async () => { const { error } = await q('jovens_fora_umadalpe').delete().eq('id', id); return { error, ok: !error }; });
  if (!rDelJ.ok) return toast(rDelJ.error?.message || 'Não foi possível excluir', 'error');
  toast('Jovem excluído!'); renderJovensForaUmadalpe();
};

console.log('[patch_jovens_fora_umadalpe] carregado ✓');
/* ───────── financeiro_module.js — módulo financeiro ───────── */
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
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
            target="_blank" rel="noopener noreferrer"
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
      // Evita gráficos órfãos acumulando a cada visita à página (mesmo bug
      // corrigido no dashboard: sem destruir o gráfico antigo, o canvas
      // novo cria uma instância a mais que nunca é limpa)
      if (typeof chartInstances !== 'undefined') {
        chartInstances.finStatus?.destroy?.();
        chartInstances.finMes?.destroy?.();
      }
      const sCtx = document.getElementById('chart-fin-status');
      if (sCtx) {
        const finStatusChart = new Chart(sCtx, {
          type: 'doughnut',
          data: { labels: ['Em dia','Vence em breve','Vencido'], datasets: [{ data: [totalOk, totalProximo, totalVencido], backgroundColor: ['rgba(20,184,166,.8)','rgba(245,158,11,.8)','rgba(244,63,94,.8)'], borderWidth: 0, hoverOffset: 6 }] },
          options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' }, position: 'bottom' } }, cutout: '60%' }
        });
        if (typeof chartInstances !== 'undefined') chartInstances.finStatus = finStatusChart;
      }
      const mCtx = document.getElementById('chart-fin-mes');
      if (mCtx) {
        const finMesChart = new Chart(mCtx, {
          type: 'bar',
          data: { labels: meses, datasets: [{ label: 'R$', data: porMes, backgroundColor: 'rgba(20,184,166,.7)', borderRadius: 8 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,.03)' } }, y: { ticks: { color: '#94a3b8', callback: v => 'R$' + v }, grid: { color: 'rgba(255,255,255,.05)' } } } }
        });
        if (typeof chartInstances !== 'undefined') chartInstances.finMes = finMesChart;
      }
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



/* ───────── ranking_module.js — módulo ranking ───────── */
/* ═══════════════════════════════════════════════════════════
   EclesiaSync · ranking_module.js v1.1
   Adicione no HTML após script_v5.js:
     <script src="ranking_module.js"></script>
   ═══════════════════════════════════════════════════════════ */

/* ── helpers locais ─────────────────────────────────────── */
function rkEsc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function rkFmtD(d){ return d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—'; }
function rkDb(){ return typeof db!=='undefined'?db:window.db||null; }
function rkToast(m,i='success'){ if(typeof toast==='function') toast(m,i); }
function rkConfirm(t,tx){ return typeof confirmDialog==='function'?confirmDialog(t,tx):Promise.resolve({isConfirmed:true}); }
function rkModal(h){ if(typeof showModal==='function') showModal(h); }
function rkClose(){ if(typeof closeModal==='function') closeModal(); }
function rkBack(){ return typeof backBtn==='function'?backBtn():''; }
function rkLoading(){ return `<div class="loading-page"><div class="spinner"></div><span>Carregando...</span></div>`; }

const NIVEL_COR   = { verde:'#14b8a6', amarelo:'#f59e0b', vermelho:'#f43f5e' };
const NIVEL_LABEL = { verde:'Verde', amarelo:'Amarelo', vermelho:'Vermelho' };

function nivelDot(nivel, size = 10){
  const cor = NIVEL_COR[nivel] || '#64748b';
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${cor};vertical-align:middle"></span>`;
}

function nivelBadge(nivel){
  const cor = NIVEL_COR[nivel]||'#64748b';
  return `<span style="background:${cor}22;color:${cor};border:1px solid ${cor}44;border-radius:99px;padding:2px 10px;font-size:.72rem;font-weight:700;display:inline-flex;align-items:center;gap:5px">${nivelDot(nivel)} ${NIVEL_LABEL[nivel]||nivel}</span>`;
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
  div.innerHTML=`<span class="nav-icon">${lc('trophy',18)}</span><span class="nav-lbl">Ranking Mensal</span>`;
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
// Estado do filtro de mês/ano do ranking (mantido entre re-renders)
window._rkMesFiltro = window._rkMesFiltro || (new Date().getMonth()+1);
window._rkAnoFiltro = window._rkAnoFiltro || (new Date().getFullYear());
window._rkSetorFiltro = window._rkSetorFiltro || '';

window.renderRanking = async function(){
  const pc=document.getElementById('page-content'); if(!pc) return;
  const podeGerenciar=(typeof isSuperAdmin==='function'&&isSuperAdmin())||(typeof hasPerm==='function'&&hasPerm('gerenciar_ranking'));
  pc.innerHTML=rkLoading();
  const client=rkDb();
  if(!client){pc.innerHTML=`<div class="empty"><div class="empty-ico">${lc('alert-triangle',44)}</div><p>Supabase não disponível.</p></div>`;return;}
  try{
    const hoje=new Date();
    const mesFiltro=window._rkMesFiltro;
    const anoFiltro=window._rkAnoFiltro;
    const ehMesAtual=(mesFiltro===hoje.getMonth()+1 && anoFiltro===hoje.getFullYear());
    const semAtual=getISOWeek(hoje);

    // Apura antes de exibir (apenas se for o mês/ano atual — não faz sentido apurar mês passado)
    if(ehMesAtual) await apurarRanking(true);

    // ▸ Permissão "ver todos os setores": controla se pode ver MADALPs de outros setores
    const vetodosSetores=(typeof isSuperAdmin==='function'&&isSuperAdmin())||(typeof canSeeAllSetores==='function'&&canSeeAllSetores())||(typeof hasPerm==='function'&&hasPerm('ver_todos_setores'));
    const currentUser=window.currentUser;

    const [{data:cfgArr},{data:congsRaw},{data:mensal},{data:semanal},{data:setores}]=await Promise.all([
      client.from('ranking_config').select('*').order('created_at',{ascending:false}).limit(1),
      client.from('congregacoes').select('id,nome,setor_id').order('nome'),
      client.from('ranking_mensal').select('*').eq('mes',mesFiltro).eq('ano',anoFiltro),
      ehMesAtual?client.from('ranking_semanal').select('*').eq('semana',semAtual).eq('ano',anoFiltro):Promise.resolve({data:[]}),
      client.from('setores').select('id,nome').order('nome'),
    ]);

    const config=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};

    console.log('==========================');
console.log('vetodosSetores:', vetodosSetores);
console.log('currentUser:', currentUser);
console.log('setor usuário:', currentUser?.setor_id);

(congsRaw || []).forEach(c => {
    console.log(
        c.nome,
        'setor congregação:', c.setor_id,
        '==',
        currentUser?.setor_id,
        '=>',
        c.setor_id === currentUser?.setor_id
    );
});

    // Base: respeita a permissão de ver todos os setores
    const congsBase=vetodosSetores||!currentUser?.setor_id
      ?(congsRaw||[])
      :(congsRaw||[]).filter(c=>c.setor_id===currentUser.setor_id);

      console.log('Total congregações:', congsRaw.length);
console.log('Após filtro:', congsBase.length);
console.log(congsBase);

    // Filtro adicional de setor escolhido na tela (só disponível se vetodosSetores)
    const setorFiltroAtivo=vetodosSetores?window._rkSetorFiltro:'';
    const congsFiltradas=setorFiltroAtivo
      ?congsBase.filter(c=>c.setor_id===setorFiltroAtivo)
      :congsBase;

    const getSetorNome=id=>(setores||[]).find(s=>s.id===id)?.nome||'—';
    const getMensal=cid=>(mensal||[]).find(m=>m.madalp_id===cid);
    const getSemanal=cid=>(semanal||[]).find(s=>s.madalp_id===cid);

    const totalVerde   =congsFiltradas.filter(c=>getMensal(c.id)?.nivel_final==='verde').length;
    const totalAmarelo =congsFiltradas.filter(c=>getMensal(c.id)?.nivel_final==='amarelo').length;
    const totalVermelho=congsFiltradas.filter(c=>!getMensal(c.id)||getMensal(c.id)?.nivel_final==='vermelho').length;

    const mesesNome=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    // Lista de anos para o seletor (do ano atual até 2 anos atrás)
    const anoAtualReal=new Date().getFullYear();
    const anosDisponiveis=[anoAtualReal,anoAtualReal-1,anoAtualReal-2];

    pc.innerHTML=`
    <div class="sec-hdr">
      <h2>${lc('trophy',18)} Ranking Mensal — ${mesesNome[mesFiltro]} ${anoFiltro}${!ehMesAtual?' <span class="tag" style="font-size:.65rem;vertical-align:middle">histórico</span>':''}</h2>
      <div class="sec-actions">
        ${rkBack()}
        ${ehMesAtual?`<button class="btn btn-secondary btn-sm" onclick="apurarRanking(false).then(()=>renderRanking())">${lc('refresh-cw',14)} Apurar</button>`:''}
        ${podeGerenciar?`<button class="btn btn-secondary btn-sm" onclick="openRankingConfig()">${lc('settings',14)} Configurações</button>`:''}
        ${podeGerenciar?`<button class="btn btn-primary btn-sm" onclick="exportarRankingPDF()">${lc('file-text',14)} Relatório PDF</button>`:''}
      </div>
    </div>

    <!-- RESUMO -->
    <div class="stats-grid stats-4" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-ico" style="background:rgba(100,116,139,.15)">${lc('church',20)}</div><div><div class="stat-val">${congsFiltradas.length}</div><div class="stat-lbl">Total MADALPs</div></div></div>
      <div class="stat-card" style="border-left:3px solid #14b8a6"><div class="stat-ico" style="background:rgba(20,184,166,.15)">${nivelDot('verde',16)}</div><div><div class="stat-val">${totalVerde}</div><div class="stat-lbl">Verde</div></div></div>
      <div class="stat-card" style="border-left:3px solid #f59e0b"><div class="stat-ico" style="background:rgba(245,158,11,.15)">${nivelDot('amarelo',16)}</div><div><div class="stat-val">${totalAmarelo}</div><div class="stat-lbl">Amarelo</div></div></div>
      <div class="stat-card" style="border-left:3px solid #f43f5e"><div class="stat-ico" style="background:rgba(244,63,94,.15)">${nivelDot('vermelho',16)}</div><div><div class="stat-val">${totalVermelho}</div><div class="stat-lbl">Vermelho</div></div></div>
    </div>

    <!-- METAS CONFIGURADAS -->
    <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:var(--txt2);display:flex;gap:20px;flex-wrap:wrap">
      <span>${lc('settings',13)} Metas configuradas:</span>
      <span>${nivelDot('vermelho',9)} Vermelho: &lt; ${config.amarelo_min} eventos/semana</span>
      <span>${nivelDot('amarelo',9)} Amarelo: ≥ ${config.amarelo_min} eventos/semana</span>
      <span>${nivelDot('verde',9)} Verde: ≥ ${config.verde_min} eventos/semana</span>
    </div>

    <!-- GRÁFICO -->
    <div class="chart-card" style="margin-bottom:24px">
      <h3>Distribuição de Níveis</h3>
      <p>MADALPs por nível em ${mesesNome[mesFiltro]}/${anoFiltro}</p>
      <canvas id="chart-ranking-dist" height="60"></canvas>
    </div>

    <!-- FILTROS -->
    <div class="filter-bar" style="margin-bottom:16px">
      <div class="filter-title">${lc('search',13)} Filtrar</div>
      <div class="filter-fields">
        <div class="form-group" style="margin:0">
          <label>Mês</label>
          <select id="rank-filter-mes" onchange="rkAplicarFiltroPeriodo()" style="min-width:120px">
            ${mesesNome.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===mesFiltro?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Ano</label>
          <select id="rank-filter-ano" onchange="rkAplicarFiltroPeriodo()" style="min-width:90px">
            ${anosDisponiveis.map(a=>`<option value="${a}" ${a===anoFiltro?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Nível</label>
          <select id="rank-filter-nivel" onchange="filterRankingTable()" style="min-width:130px">
            <option value="">Todos</option>
            <option value="verde">Verde</option>
            <option value="amarelo">Amarelo</option>
            <option value="vermelho">Vermelho</option>
          </select>
        </div>
        ${vetodosSetores?`<div class="form-group" style="margin:0">
          <label>Setor</label>
          <select id="rank-filter-setor" onchange="rkAplicarFiltroSetor()" style="min-width:160px">
            <option value="">Todos os setores</option>
            ${(setores||[]).map(s=>`<option value="${s.id}" ${s.id===setorFiltroAtivo?'selected':''}>${rkEsc(s.nome)}</option>`).join('')}
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
    ${!congsFiltradas.length?`<div class="empty"><div class="empty-ico">${lc('church',44)}</div><p>Nenhuma MADALP encontrada${setorFiltroAtivo?' neste setor':''}.</p></div>`:`
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
            <div style="flex-shrink:0">${nivelDot(nivel, 20)}</div>
            <div class="user-card-info">
              <div class="fw5 fs-sm">${rkEsc(c.nome)}</div>
              <div class="fs-xs c3">${rkEsc(getSetorNome(c.setor_id))}</div>
              <div class="user-card-tags" style="margin-top:6px">
                ${nivelBadge(nivel)}
                <span class="tag">${lc('calendar',12)} Mês: ${totalMes} eventos</span>
                ${ehMesAtual?`<span class="tag">${lc('calendar-days',12)} Semana: ${totalSem} eventos</span>`:''}
              </div>
            </div>
          </div>
          <div class="user-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="openRankingDetalhe('${c.id}','${rkEsc(c.nome)}')">Ver →</button>
          </div>
        </div>`;
      }).join('')}
    </div>`}`;

    // Gráfico
    if(typeof Chart!=='undefined'){
      // Evita gráficos órfãos: os filtros de período/setor chamam
      // renderRanking() direto, sem passar por navigate() (que destruiria
      // o gráfico antigo) — sem isso, cada filtro deixava uma instância
      // presa num canvas já removido do DOM
      if(typeof chartInstances!=='undefined') chartInstances.rankingDist?.destroy?.();
      const ctx=document.getElementById('chart-ranking-dist');
      if(ctx){
        const rankingChart=new Chart(ctx,{
          type:'doughnut',
          data:{labels:['Verde','Amarelo','Vermelho'],datasets:[{data:[totalVerde,totalAmarelo,totalVermelho],backgroundColor:['rgba(20,184,166,.8)','rgba(245,158,11,.8)','rgba(244,63,94,.8)'],borderWidth:0,hoverOffset:6}]},
          options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8'},position:'right'}},cutout:'55%'}
        });
        if(typeof chartInstances!=='undefined') chartInstances.rankingDist=rankingChart;
      }
    }

  }catch(e){
    console.error('renderRanking:',e);
    pc.innerHTML=`<div class="empty"><div class="empty-ico">${lc('alert-triangle',44)}</div><p>Erro ao carregar ranking.<br><small>${rkEsc(e.message)}</small></p></div>`;
  }
};

/* ── Handlers dos filtros de período/setor ───────────────── */
window.rkAplicarFiltroPeriodo = function(){
  const mesEl=document.getElementById('rank-filter-mes');
  const anoEl=document.getElementById('rank-filter-ano');
  window._rkMesFiltro=parseInt(mesEl?.value)||(new Date().getMonth()+1);
  window._rkAnoFiltro=parseInt(anoEl?.value)||(new Date().getFullYear());
  renderRanking();
};
window.rkAplicarFiltroSetor = function(){
  const setorEl=document.getElementById('rank-filter-setor');
  window._rkSetorFiltro=setorEl?.value||'';
  renderRanking();
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
  rkModal(`<div class="modal-hdr"><span>${lc('trophy',20)}</span><h2>${rkEsc(congNome)}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="rank-det-body">${rkLoading()}</div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
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
    const tipoIcon=typeof window.tipoIcon==='function'?window.tipoIcon:()=>lc('clipboard',16);
    document.getElementById('rank-det-body').innerHTML=`
    <div style="text-align:center;padding:16px 0 20px">
      <div>${nivelDot(nivelAtual, 40)}</div>
      <div style="font-size:1.4rem;font-weight:700;color:${NIVEL_COR[nivelAtual]};margin-top:4px">${NIVEL_LABEL[nivelAtual]}</div>
      <div class="fs-xs c3">Nível atual — ${mesesNome[mesAtual]}/${anoAtual}</div>
    </div>
    <div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Histórico Mensal</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${(mensal||[]).map(m=>`<div style="flex:1;min-width:80px;background:${NIVEL_COR[m.nivel_final]}22;border:1px solid ${NIVEL_COR[m.nivel_final]}44;border-radius:10px;padding:10px;text-align:center">
        <div>${nivelDot(m.nivel_final, 16)}</div>
        <div class="fs-xs fw5" style="color:${NIVEL_COR[m.nivel_final]}">${mesesNome[m.mes]}/${m.ano}</div>
        <div class="fs-xs c3">${m.total_eventos} eventos</div>
      </div>`).join('')||'<p class="c3 fs-xs">Sem histórico mensal.</p>'}
    </div>
    <div class="sec-hdr" style="margin-bottom:10px"><h2 style="font-size:.9rem">Semanas do Mês Atual</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${(semanal||[]).map(s=>`<div style="flex:1;min-width:80px;background:${NIVEL_COR[s.nivel]}22;border:1px solid ${NIVEL_COR[s.nivel]}44;border-radius:10px;padding:10px;text-align:center">
        <div>${nivelDot(s.nivel, 16)}</div>
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
  rkModal(`<div class="modal-hdr"><span>${lc('settings',20)}</span><h2>Configurações do Ranking</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="rank-cfg-body">${rkLoading()}</div><div class="modal-foot" id="rank-cfg-foot"></div>`);
  const client=rkDb(); if(!client) return;
  try{
    const {data:cfgArr}=await client.from('ranking_config').select('*').order('created_at',{ascending:false}).limit(1);
    const cfg=cfgArr?.[0]||{vermelho_min:1,amarelo_min:3,verde_min:5};
    document.getElementById('rank-cfg-body').innerHTML=`
    <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px;margin-bottom:16px;font-size:.82rem;color:var(--txt2)">
      ${lc('lightbulb',13)} Defina a quantidade mínima de <strong>eventos por semana</strong> para cada nível.
    </div>
    <div class="form-group">
      <label>${nivelDot('vermelho',9)} Vermelho — mínimo de eventos/semana</label>
      <input id="cfg-verm" type="number" min="0" value="${cfg.vermelho_min||1}"/>
      <small class="c3 fs-xs">MADALPs com menos eventos que este valor ficam em Vermelho</small>
    </div>
    <div class="form-group">
      <label>${nivelDot('amarelo',9)} Amarelo — mínimo de eventos/semana</label>
      <input id="cfg-amar" type="number" min="0" value="${cfg.amarelo_min||3}"/>
      <small class="c3 fs-xs">Acima de Vermelho e abaixo de Verde</small>
    </div>
    <div class="form-group">
      <label>${nivelDot('verde',9)} Verde — mínimo de eventos/semana</label>
      <input id="cfg-verd" type="number" min="0" value="${cfg.verde_min||5}"/>
      <small class="c3 fs-xs">MADALPs com este valor ou mais ficam em Verde</small>
    </div>
    <div class="form-group">
      <label>Descrição (opcional)</label>
      <input id="cfg-desc" value="${rkEsc(cfg.descricao||'')}" placeholder="Ex: Configuração Março 2025"/>
    </div>`;
    document.getElementById('rank-cfg-foot').innerHTML=`<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveRankingConfig('${cfg.id||''}')">${lc('save',14)} Salvar e Reapurar</button>`;
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
      return [c.nome, getSetorNome(c.setor_id), NIVEL_LABEL[nivel], m?.total_eventos||0];
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
/* ───────── dashboard_patch.js — dashboard ───────── */
/* ═══════════════════════════════════════════════════════════
   EclesiaSync · dashboard_patch.js v2.0
   ═══════════════════════════════════════════════════════════ */

/* ── helpers ─────────────────────────────────────────────── */
const dp = {
  esc: s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  fmtD: d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—',
  fmtM: v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0),
  db: ()=>typeof db!=='undefined'?db:window.db||null,
  hoje: ()=>new Date().toISOString().slice(0,10),
  isFuturo: d=>d>dp.hoje(),
};

function dpLoadingMini(){
  return `<div class="loading-page" style="padding:20px"><div class="spinner"></div></div>`;
}

/* ── Plugin Chart.js: bolinhas de luz fluindo ao longo da linha ── */
const dpFlowDotsPlugin = {
  id: 'dpFlowDots',
  afterDraw(chart, args, opts) {
    const meta = chart.getDatasetMeta(0);
    const pts = meta && meta.data;
    if (!pts || pts.length < 2) return;
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy) || .0001;
      segs.push({ len, x0: pts[i].x, y0: pts[i].y, x1: pts[i + 1].x, y1: pts[i + 1].y });
      total += len;
    }
    const ctx = chart.ctx;
    const now = performance.now();
    const period = opts.period || 3200;
    const count = opts.count || 2;
    const color = opts.color || '#a3e635';
    ctx.save();
    for (let k = 0; k < count; k++) {
      const phase = ((now / period) + k / count) % 1;
      let target = phase * total, acc = 0, seg = segs[segs.length - 1];
      for (const s of segs) { if (acc + s.len >= target) { seg = s; break; } acc += s.len; }
      const local = (target - acc) / seg.len;
      const x = seg.x0 + (seg.x1 - seg.x0) * local;
      const y = seg.y0 + (seg.y1 - seg.y0) * local;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 3.5);
      grad.addColorStop(0, 'rgba(255,255,255,.95)');
      grad.addColorStop(.45, color + 'cc');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};

/* ── Plugin Chart.js: pontinho de luz pulsante no mês atual ── */
const dpPulseDotPlugin = {
  id: 'dpPulseDot',
  afterDraw(chart, args, opts) {
    const idx = opts.index;
    if (idx == null) return;
    const meta = chart.getDatasetMeta(0);
    const pt = meta && meta.data && meta.data[idx];
    if (!pt) return;
    const ctx = chart.ctx;
    const now = performance.now();
    const pulse = (Math.sin(now / 600) + 1) / 2;
    const color = opts.color || '#a3e635';
    const r = (opts.radius || 1.6) + pulse * .8;
    const glowR = r * 3.6;
    ctx.save();
    const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, glowR);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(.35, color + 'ee');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(pt.x, pt.y, r * .6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

function dpStartFlowLoop(chart) {
  if (window._dpFlowRAF) cancelAnimationFrame(window._dpFlowRAF);
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  (function frame() {
    if (!chart.canvas || !chart.canvas.isConnected) { window._dpFlowRAF = null; return; }
    chart.draw();
    window._dpFlowRAF = requestAnimationFrame(frame);
  })();
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
      gap: 6px;
    }
    .dash-top-grid .stat-card { padding:10px 6px; gap:5px; flex-direction:column; align-items:flex-start; }
    .dash-top-grid .stat-ico  { width:28px; height:28px; font-size:12px; }
    .dash-top-grid .stat-val  { font-size:.92rem; }
    .dash-top-grid .stat-lbl  { font-size:.56rem; line-height:1.2; }
    .dash-top-grid .stat-chg  { display:none; }
    .dash-top-grid .stat-ico svg { width:14px; height:14px; }
  }
  @media(max-width:360px){
    .dash-top-grid { gap: 5px; }
    .dash-top-grid .stat-card { padding:8px 5px; }
    .dash-top-grid .stat-lbl  { font-size:.52rem; }
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
    .fin-grid { grid-template-columns: 1fr; }
    .gauge-card,
    .fin-right { width: 100%; }
    .fin-right {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .fin-card {
      flex-direction: column;
      align-items: flex-start;
      position: relative;
      padding: 14px;
      gap: 8px;
    }
    .fin-card > .tag {
      position: absolute;
      top: 12px;
      right: 12px;
      margin: 0 !important;
    }
    .fin-card-body { width: 100%; }
  }

  @media(max-width:480px){
    .fin-grid { gap: 10px; }
    .fin-card { padding: 12px; gap: 8px; }
    .fin-card-ico { width: 36px; height: 36px; }
    .fin-card-val { font-size: .95rem; }
    .fin-card-lbl { font-size: .66rem; }
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

  /* Entrada do card financeiro + "desenho" do arco do gauge */
  .gauge-card { animation: dpFadeUp .5s cubic-bezier(.4,0,.2,1) both; }
  @keyframes dpFadeUp {
    from { opacity:0; transform:translateY(14px) scale(.98); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .gauge-card { animation: none; }
    .gauge-fill { transition: none !important; }
  }

  /* Cabeçalho dos cards de gráfico + botão de período */
  .chart-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .chart-period-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(var(--gold-rgb),.08);
    border: 1px solid rgba(var(--gold-rgb),.25);
    border-radius: 99px;
    color: var(--gold);
    font-size: .74rem;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    white-space: nowrap;
    transition: var(--ease);
  }
  .chart-period-btn:hover {
    background: rgba(var(--gold-rgb),.16);
    border-color: var(--gold);
  }
  .chart-period-btn .lc-icon,
  .chart-period-btn span[data-lucide],
  .chart-period-btn > span:first-child {
    color: var(--gold);
  }

  /* Card "Participantes por Mês" — escuro no tema escuro (contraste
     pro gráfico brilhar); no tema claro segue o branco normal dos
     outros cards, como pedido */
  .chart-card-dark {
    background: linear-gradient(180deg, #161a24, #0e1119);
    border: 1px solid rgba(255,255,255,.06);
  }
  .chart-card-dark h3 { color: #eef0f6; }
  .chart-card-dark p  { color: rgba(238,240,246,.5); }
  .chart-period-btn-dark {
    background: rgba(56,189,248,.12);
    border-color: rgba(56,189,248,.3);
    color: #7dd3fc;
  }
  .chart-period-btn-dark:hover {
    background: rgba(56,189,248,.2);
    border-color: #38bdf8;
  }
  .chart-period-btn-dark .lc-icon,
  .chart-period-btn-dark > span:first-child {
    color: #7dd3fc;
  }

  [data-theme="light"] .chart-card-dark {
    background: var(--bg-card);
    border: 1px solid var(--bdr2);
  }
  [data-theme="light"] .chart-card-dark h3 { color: var(--txt); }
  [data-theme="light"] .chart-card-dark p  { color: var(--txt3); }
  [data-theme="light"] .chart-period-btn-dark {
    background: rgba(var(--gold-rgb),.08);
    border-color: rgba(var(--gold-rgb),.25);
    color: var(--gold);
  }
  [data-theme="light"] .chart-period-btn-dark:hover {
    background: rgba(var(--gold-rgb),.16);
    border-color: var(--gold);
  }
  [data-theme="light"] .chart-period-btn-dark .lc-icon,
  [data-theme="light"] .chart-period-btn-dark > span:first-child {
    color: var(--gold);
  }

  /* shortcuts modernos */
  .shortcut-ico svg { width:20px;height:20px; }

  /* stat-card icons svg */
  .stat-ico svg { width:20px;height:20px; }
  .fin-card-ico svg { width:20px;height:20px; }

  /* ── CARDS "SELO" (badge sobrepondo o topo do card) ─────────────────
     Componente próprio (.bcard), usado só nos 4 cards do topo do
     dashboard e na linha de atalhos (Ranking/Frequência/Permissões/
     Financeiro) — referência enviada pelo usuário. Não reaproveita
     .stat-card/.shortcut-btn de propósito: essas classes são genéricas
     e usadas em Financeiro/Setores/Relatórios, que continuam como
     estavam. */
  .bcard {
    position: relative;
    flex: 1;
    min-width: 0;
    background: var(--bg-card);
    border: 1px solid var(--bdr2);
    border-radius: 5px;
    padding: 28px 6px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 4px 16px rgba(0,0,0,.06);
    transition: var(--ease), transform .25s cubic-bezier(.34,1.56,.64,1);
  }
  .bcard-clickable { cursor: pointer; }
  .bcard-clickable:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 28px rgba(0,0,0,.12);
  }
  .bcard-badge {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    width: 56px;
    height: 56px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    color: #fff;
    box-shadow: 0 10px 22px -6px rgba(0,0,0,.4);
  }
  .bcard-shortcut .bcard-badge { gap: 0; }
  .bcard-ico { display: flex; }
  .bcard-ico svg { width: 18px; height: 18px; }
  .bcard-num { font-size: .9rem; font-weight: 800; line-height: 1; }
  .bcard-lbl {
    margin-top: 24px;
    font-size: .74rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .bcard-badge.bc-gold   { background: linear-gradient(150deg, var(--gold-l), var(--gold)); }
  .bcard-badge.bc-blue   { background: linear-gradient(150deg, #6ea1ff, var(--blue)); }
  .bcard-badge.bc-teal   { background: linear-gradient(150deg, #3ee2cd, var(--teal)); }
  .bcard-badge.bc-violet { background: linear-gradient(150deg, #ab94fb, var(--violet)); }
  .bcard-lbl.bc-gold   { color: var(--gold); }
  .bcard-lbl.bc-blue   { color: var(--blue); }
  .bcard-lbl.bc-teal   { color: var(--teal); }
  .bcard-lbl.bc-violet { color: var(--violet); }

  @media (max-width:600px){
    .bcard { padding: 24px 4px 12px; }
    .bcard-badge { width: 46px; height: 46px; top: -16px; border-radius: 5px;margin:5px 0px 5px 0px; }
    .bcard-ico svg { width: 15px; height: 15px; }
    .bcard-num { font-size: .74rem; }
    .bcard-lbl { font-size: .58rem; margin-top: 18px; line-height: 1.15; }
  }
  @media (max-width:360px){
    .bcard { padding: 20px 3px 10px; }
    .bcard-badge { width: 40px; height: 40px; top: -14px; }
    .bcard-lbl { font-size: .54rem; margin-top: 16px; }
  }

  /* Lista de "Usuários do Setor" (Eventos Setoriais) — rola a partir de ~5
     itens em vez de esticar a página. O max-height só entra em ação quando o
     conteúdo passa dele; com poucos usuários, não rola. */
  .es-user-scroll {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 340px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .es-user-scroll::-webkit-scrollbar { width: 8px; }
  .es-user-scroll::-webkit-scrollbar-thumb { background: var(--bdr2); border-radius: 8px; }

  /* Sino de notificações no topbar. Cor viva = ativado; apagado = desativado. */
  .notif-bell {
    display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 12px; cursor: pointer;
    border: 1px solid var(--bdr2); background: var(--bg-card);
    color: var(--txt3); margin-right: 8px;
    transition: var(--ease), transform .18s ease;
  }
  .notif-bell:hover { transform: translateY(-1px); }
  .notif-bell svg { width: 18px; height: 18px; }
  .notif-bell.notif-on {
    color: #fff;
    background: linear-gradient(135deg, var(--gold-l), var(--gold));
    border-color: transparent;
    box-shadow: 0 4px 14px rgba(var(--gold-rgb), .40);
  }
  .notif-bell.notif-off { color: var(--txt3); opacity: .6; }
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
  let sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  const canFin=typeof canSeeFinanceiro==='function'?canSeeFinanceiro():false;
  const podeVerEvSetoriais=(typeof hasPerm==='function'&&hasPerm('visualizar_eventos_setoriais_dash'))||(typeof isSuperAdmin==='function'&&isSuperAdmin());

  const [{data:allSetores}]=await Promise.all([client.from('setores').select('id,nome').order('nome')]);

  // Corrige mismatch: sem setor definido (ex.: admin sem setor_id fixo), o
  // <select> mostraria o 1º item como selecionado por padrão do navegador
  // enquanto o filtro real ficava sem setor — sincroniza os dois
  const canFSCheck=typeof canFilterSetores==='function'?canFilterSetores():false;
  if(!sid&&canFSCheck&&(allSetores||[]).length){
    sid=allSetores[0].id;
    window.dashSetorFiltro=sid;
  }

  let qSet=client.from('setores').select('id',{count:'exact',head:true});
  let qCong=client.from('congregacoes').select('id',{count:'exact',head:true});
  let qMem=client.from('membros').select('id',{count:'exact',head:true});
  // FIX (consolidação): antes filtrava só status='publicado', mas a maioria dos
  // eventos registrados pelas congregações fica como 'pendente' até alguém
  // publicar manualmente — na prática a lista "Eventos Recentes" quase nunca
  // mostrava nada. Passa a contar qualquer evento registrado, como já fazia
  // o restante do dashboard (qEvM) e como o restante do app já espera.
  let qEv=client.from('eventos').select('*').order('data',{ascending:false});
  let qEvM=client.from('eventos').select('*').gte('data',inicioMes).lte('data',fimMes);
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

  const nomeUsuario=dp.esc((window.currentUser?.nome||'').split(' ')[0]);
  const setorSel=canFS?`
  <div class="dash-filter-card">
    <div class="dash-filter-fields">
      <div class="dash-filter-field">
        <label>${ico('pin',12)} Setor</label>
        <select class="dash-filter-select" onchange="window.dashSetorFiltroManual=true;window.dashSetorFiltro=this.value||window.currentUser?.setor_id||null;window.dashCongFiltro=null;renderDashboard()">
          ${(allSetores||[]).map(s=>`<option value="${s.id}" ${s.id===sid?'selected':''}>${dp.esc(s.nome)}</option>`).join('')}
        </select>
      </div>
      ${canFC&&congsList.length?`<div class="dash-filter-field">
        <label>${ico('church',12)} Congregação</label>
        <select class="dash-filter-select" onchange="window.dashCongFiltro=this.value||null;renderDashboard()">
          <option value="">Todas</option>
          ${congsList.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${dp.esc(c.nome)}</option>`).join('')}
        </select>
      </div>`:''}
    </div>
    <div class="dash-filter-foot">Modo visualização</div>
  </div>`:`<div class="dash-setor-locked">${ico('pin',14)} ${dp.esc((allSetores||[]).find(s=>s.id===sid)?.nome||'Meu Setor')}</div>`;

  pc.innerHTML=`
  <!-- HEADER -->
  <div class="dash-header">
    <div class="dash-header-top">
      <div>
        <h2 class="dash-title">${saudacao}${nomeUsuario?`, ${nomeUsuario}`:''}!</h2>
        <p class="dash-sub">Aqui está o resumo da sua igreja.</p>
      </div>
      <div class="dash-header-actions">
        <span class="dash-month-tag">${ico('calendar',12)} ${nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)}</span>
        <button class="dash-refresh-btn" onclick="renderDashboard()" title="Atualizar">${ico('refresh',15)}</button>
      </div>
    </div>
    <div class="dash-period">
      ${setorSel}
    </div>
  </div>

  <!-- 4 CARDS TOPO — sempre em linha única -->
  <div class="dash-top-grid">
    <div class="bcard bcard-clickable" onclick="dpNavSetores()">
      <div class="bcard-badge bc-gold"><span class="bcard-ico">${SVG.map}</span><span class="bcard-num">${rSet.count||0}</span></div>
      <div class="bcard-lbl bc-gold">Setores</div>
    </div>
    <div class="bcard bcard-clickable" onclick="dpNavCongs()">
      <div class="bcard-badge bc-blue"><span class="bcard-ico">${SVG.church}</span><span class="bcard-num">${rCong.count||0}</span></div>
      <div class="bcard-lbl bc-blue">Congregações</div>
    </div>
    <div class="bcard bcard-clickable" onclick="dpNavMembros()">
      <div class="bcard-badge bc-teal"><span class="bcard-ico">${SVG.users}</span><span class="bcard-num">${rMem.count||0}</span></div>
      <div class="bcard-lbl bc-teal">Membros</div>
    </div>
    <div class="bcard bcard-clickable" onclick="dpScrollEventos()">
      <div class="bcard-badge bc-violet"><span class="bcard-ico">${SVG.calendar}</span><span class="bcard-num">${eventosMes.length}</span></div>
      <div class="bcard-lbl bc-violet">Eventos</div>
    </div>
  </div>
   <div class="dash-shortcuts" style="margin-bottom:24px">
    ${((typeof hasPerm==='function'&&(hasPerm('visualizar_ranking')||hasPerm('gerenciar_ranking')))||(typeof isSuperAdmin==='function'&&isSuperAdmin()))?`
    <div class="bcard bcard-clickable bcard-shortcut" onclick="navigate('ranking')">
      <div class="bcard-badge bc-gold"><span class="bcard-ico">${SVG.trophy}</span></div>
      <div class="bcard-lbl bc-gold">Ranking Mensal</div>
    </div>`:''}
    <div class="bcard bcard-clickable bcard-shortcut" onclick="navigate('frequencia')">
      <div class="bcard-badge bc-blue"><span class="bcard-ico">${SVG.freq}</span></div>
      <div class="bcard-lbl bc-blue">Frequência</div>
    </div>
    ${((typeof hasPerm==='function'&&hasPerm('editar_permissoes'))||(typeof isSuperAdmin==='function'&&isSuperAdmin()))?`
    <div class="bcard bcard-clickable bcard-shortcut" onclick="navigate('permissoes')">
      <div class="bcard-badge bc-teal"><span class="bcard-ico">${SVG.shield}</span></div>
      <div class="bcard-lbl bc-teal">Permissões</div>
    </div>`:''}
    ${canFin?`
    <div class="bcard bcard-clickable bcard-shortcut" onclick="navigate('financeiro')">
      <div class="bcard-badge bc-violet"><span class="bcard-ico">${SVG.wallet}</span></div>
      <div class="bcard-lbl bc-violet">Financeiro</div>
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
          stroke-dasharray="${gaugeC.toFixed(1)}"
          stroke-dashoffset="${gaugeC.toFixed(1)}"
          data-gauge-offset="${gaugeGap}"/>
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
    <div class="chart-card chart-span2 chart-card-dark">
      <div class="chart-card-header">
        <div><h3>Participantes por Mês</h3><p>Acumulado do ano</p></div>
        <button class="chart-period-btn chart-period-btn-dark">${ico('calendar',14)} Este ano</button>
      </div>
      <canvas id="chart-dash-line" height="110"></canvas>
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
  ${eventosFuturos.slice(0, 8).map(e => {
    // 'fut' precisa ser definido por evento aqui dentro — antes era uma
    // variável solta (ReferenceError) que travava o dashboard inteiro no
    // spinner assim que existia qualquer evento futuro.
    const fut = e.data > hojeStr2;
    const abrir = e.tipo === 'evento_setorial' ? 'openEventoSetorialDetail' : 'openEventDetail';
    return `
 <div class="act-item ${fut?'evento-futuro':''}" onclick="${abrir}('${e.id}')" style="cursor:pointer;border-left:3px solid var(--primary-l,#7eb3ff)">
    <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>
    <div class="f1">
      <div class="fw5 fs-sm">${dpTipoLabel(e.tipo)}</div>
      <div class="fs-xs c3">${dp.esc(e.resumo || '')}</div>
    </div>
    <span class="tag tag-primary">Agendado</span>
    <span class="act-time">${dp.fmtD(e.data)}</span>
  </div>`;
  }).join('')}
</div>` : ''}

  <div class="sec-hdr"><h2>${ico('calendar',16)} Agenda da Semana</h2><span class="tag">Próximos 7 dias</span></div>
  <div class="agenda-strip" style="margin-bottom:24px">${dpAgendaStrip(agItems||[])}</div>

<!-- EVENTOS SETORIAIS -->
${podeVerEvSetoriais?`
<div class="sec-hdr">
  <h2>${ico('cityHall',16)} Eventos Setoriais</h2>
  <span class="tag tag-gold">Inclui futuros</span>
</div>

<div class="eventos-wrapper">

  <div id="dash-eventos-setoriais" class="act-list eventos-lista">
    ${dpLoadingMini()}
  </div>

  <div class="eventos-toggle">
    <button class="btn-expand-eventos" onclick="toggleEventosSetoriais()">
      Ver todos os eventos
      <i data-lucide="chevrons-down"></i>
    </button>
  </div>

</div>
` : ''}

  <!-- EVENTOS RECENTES -->
  <div class="sec-hdr" id="dash-eventos-section">
    <h2>Eventos Recentes</h2>
    <button class="btn btn-secondary btn-sm" onclick="navigate('relatorios')">Ver todos</button>
  </div>
  <div class="eventos-wrapper recentes">

  <div id="dash-eventos-recentes" class="act-list eventos-limitados">
    ${eventosPassados.slice(0,5).map(e=>`
    
    <div class="act-item evento-card" onclick="openEventDetail('${e.id}')">

      <div class="act-dot" style="background:${dpTipoColor(e.tipo)}"></div>

      <div class="f1">
        <div class="fw5 fs-sm">
          ${dpTipoLabel(e.tipo)}
        </div>

        <div class="fs-xs c3">
          ${dp.esc(e.resumo||'')}
        </div>
      </div>


      <div class="evento-info">
        <span class="tag">
          ${ico('people',11)} ${e.participantes||0}
        </span>

        ${e.conversoes?
        `<span class="tag tag-teal">
          ${ico('cross',10)} ${e.conversoes}
        </span>`:''}

        ${canFin&&e.ofertas?
        `<span class="tag tag-gold">
          ${dp.fmtM(e.ofertas)}
        </span>`:''}
      </div>


      <span class="act-time">
        ${dp.fmtD(e.data)}
      </span>

    </div>

    `).join('') || 
    '<p class="c3" style="padding:16px">Nenhum evento publicado.</p>'}
  </div>


  ${eventosPassados.length > 5 ? `
  <div class="eventos-toggle">
      <button 
        class="btn-expand-eventos"
        onclick="expandEventosRecentes(this)">
        Ver todos os eventos
        ${ico('chevrons-down',15)}
      </button>
  </div>
  `:''}

</div>`;

  // Charts
  if(typeof Chart!=='undefined'){
    // Evita gráficos órfãos: se o usuário troca o filtro de setor, esta
    // função roda de novo direto (sem passar por navigate(), que é quem
    // normalmente destrói os gráficos antigos) — sem isso, cada troca de
    // filtro deixava um gráfico "fantasma" rodando atrás da tela branca
    if(typeof chartInstances!=='undefined'){
      chartInstances.dashLine?.destroy?.();
      chartInstances.dashBar?.destroy?.();
    }
    const byMonth=Array(12).fill(0);
    eventos.forEach(e=>{const m=new Date(e.data+'T00:00:00').getMonth();byMonth[m]+=(e.participantes||0);});
    const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const curMonthIdx=new Date().getMonth();
    const lCtx=document.getElementById('chart-dash-line');
    if(lCtx){
      const isLight=document.documentElement.getAttribute('data-theme')==='light';
      const lineGrad=lCtx.getContext('2d').createLinearGradient(0,0,0,220);
      if(isLight){
        lineGrad.addColorStop(0,'rgba(79,125,251,.28)');
        lineGrad.addColorStop(1,'rgba(79,125,251,0)');
      }else{
        lineGrad.addColorStop(0,'rgba(56,189,248,.45)');
        lineGrad.addColorStop(1,'rgba(56,189,248,0)');
      }
      const lineColor=isLight?'#4f7dfb':'#38bdf8';
      const mutedSegment=isLight?'rgba(100,116,139,.35)':'rgba(148,163,184,.4)';
      const pointBg=isLight?'#4f7dfb':'#38bdf8';
      const pointBorder=isLight?'#ffffff':'#0e1119';
      const tickColor=isLight?'#64748b':'rgba(238,240,246,.5)';
      const gridColor=isLight?'rgba(30,41,59,.08)':'rgba(255,255,255,.07)';
      const lineChart=new Chart(lCtx,{type:'line',data:{labels:meses,datasets:[{
        label:'Participantes',
        data:byMonth,
        borderColor:lineColor,
        backgroundColor:lineGrad,
        tension:.45,
        fill:true,
        borderWidth:3,
        pointRadius:0,
        pointHoverRadius:4,
        pointBackgroundColor:pointBg,
        pointBorderColor:pointBorder,
        pointBorderWidth:1.5,
        segment:{
          borderColor:ctx=>ctx.p1DataIndex===curMonthIdx?lineColor:mutedSegment
        }
      }]},options:{
        responsive:true,
        animation:{duration:900,easing:'easeOutQuart'},
        plugins:{
          legend:{display:false},
          dpFlowDots:{period:7000,count:3,color:lineColor},
          dpPulseDot:{index:curMonthIdx,color:'#a3e635',radius:1.6}
        },
        scales:{
          x:{ticks:{color:tickColor},grid:{display:false}},
          y:{ticks:{color:tickColor},grid:{color:gridColor}}
        }
      },plugins:[dpFlowDotsPlugin,dpPulseDotPlugin]});
      if(typeof chartInstances!=='undefined') chartInstances.dashLine=lineChart;
      setTimeout(()=>dpStartFlowLoop(lineChart),950);
    }
    const cultos=eventos.filter(e=>e.tipo==='culto').length;
    const genEvt=eventos.filter(e=>e.tipo==='evento').length;
    const saidas=eventos.filter(e=>e.tipo==='saida').length;
    const outros=Math.max(0,eventos.length-cultos-genEvt-saidas);
    const bCtx=document.getElementById('chart-dash-bar');
    if(bCtx){
      // Filtros de cada fatia, na mesma ordem dos labels/data acima.
      const dashBarCats = [
        { t: 'Cultos', f: e => e.tipo === 'culto' },
        { t: 'Eventos', f: e => e.tipo === 'evento' },
        { t: 'Saídas', f: e => e.tipo === 'saida' },
        { t: 'Outros', f: e => !['culto', 'evento', 'saida'].includes(e.tipo) },
      ];
      const barChart=new Chart(bCtx,{type:'doughnut',data:{labels:['Cultos','Eventos','Saídas','Outros'],datasets:[{
        data:[cultos,genEvt,saidas,outros],
        backgroundColor:['rgba(79,142,247,.9)','rgba(56,217,192,.9)','rgba(167,139,250,.9)','rgba(240,192,96,.9)'],
        borderWidth:0,
        borderRadius:6,
        spacing:3,
        hoverOffset:12
      }]},options:{
        responsive:true,
        cutout:'62%',
        animation:{animateRotate:true,animateScale:true,duration:1000,easing:'easeOutCirc'},
        plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}},position:'bottom'}},
        // Clique numa cor → popup com todos os eventos daquela categoria.
        onHover:(evt,els)=>{ if(evt?.native?.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick:(evt,els,chart)=>{
          const pts = chart.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
          if(!pts.length) return;
          const cat = dashBarCats[pts[0].index];
          if(cat && typeof pfPopupEventosPorTipo==='function') pfPopupEventosPorTipo('Tipos de Eventos · '+cat.t, eventos.filter(cat.f));
        }
      }});
      if(typeof chartInstances!=='undefined') chartInstances.dashBar=barChart;
    }

    // Desenha o arco do gauge financeiro (0 → valor real) em vez de já nascer preenchido
    const gaugePathEl=document.querySelector('.gauge-fill');
    if(gaugePathEl){
      const targetOffset=gaugePathEl.getAttribute('data-gauge-offset');
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        gaugePathEl.style.strokeDashoffset=targetOffset;
      }));
    }
  }

  // Eventos setoriais async
  if(podeVerEvSetoriais){
    const esC=document.getElementById('dash-eventos-setoriais');
    if(esC){
      try{
        const vetodosSetores=(typeof canSeeAllSetores==='function'&&canSeeAllSetores())||(typeof isSuperAdmin==='function'&&isSuperAdmin());
        let qES=client.from('eventos').select('*').eq('tipo','evento_setorial').order('data',{ascending:true}).limit(5);
        if(!vetodosSetores&&window.currentUser?.setor_id) qES=qES.eq('setor_id',window.currentUser.setor_id);
        const {data:evS}=await qES;
        const {data:setS}=await client.from('setores').select('id,nome');
        const sN=id=>(setS||[]).find(s=>s.id===id)?.nome||'—';
        const hj=new Date().toISOString().slice(0,10);
       const eventosSetoriaisHtml=(evS||[]).length?(evS||[]).map(e=>{
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
     }).join(''):'<p class="c3">Nenhum evento setorial.</p>';

esC.innerHTML = eventosSetoriaisHtml;
      }catch(err){ esC.innerHTML='<p class="c3">Erro ao carregar.</p>'; }
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
  if(typeof navigate==='function') navigate('todos_membros');
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

window.toggleEventosSetoriais=function(){

  const lista=document.getElementById('dash-eventos-setoriais');
  const btn=document.querySelector('.btn-expand-eventos');

  if(!lista || !btn) return;

  lista.classList.toggle('expandido');

  if(lista.classList.contains('expandido')){
      btn.innerHTML=`Recolher eventos <i data-lucide="chevrons-up"></i>`;
  }else{
      btn.innerHTML=`Ver todos os eventos <i data-lucide="chevrons-down"></i>`;
  }

  if(typeof refreshLucide==='function')
      refreshLucide();
};

window.expandEventosRecentes=function(btn){

 const box=document.getElementById('dash-eventos-recentes');

 if(!box)return;


 if(box.classList.contains('expandido')){

    box.classList.remove('expandido');

    btn.innerHTML=
    'Ver todos os eventos '+
    ico('chevrons-down',15);

 }
 else{

    box.classList.add('expandido');

    btn.innerHTML=
    'Mostrar menos '+
    ico('chevrons-up',15);

 }

 refreshLucide();

}
/* ───────── adicao.js ───────── */
/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_atuacao_visitas.js
   Carregar por ÚLTIMO no HTML, depois de patch_ajustes.js:
     <script src="patch_atuacao_visitas.js"></script>

   O QUE ESTE ARQUIVO FAZ:
   1. Adiciona o campo "Atuação" (Superintendência / Coordenação /
      Liderança) + "Específico" no cadastro de Membro (novo, editar
      e no menu global de Membros).
   2. Adiciona a seção "Visitas de Obreiros" nos formulários de
      evento (congregação e setorial): permite adicionar VÁRIOS
      filtros (ex: Obreiro Local + Superintendência, e também
      UMADALPE + Liderança ao mesmo tempo), buscar os membros que
      batem com cada filtro (sempre excluindo cargo = "Membro") e
      marcá-los para entrar em participante_ids.
   3. Cria as permissões "alterar_membros" e "visualizar_membros" e
      o menu lateral "Membros", reaproveitando a permissão já
      existente "ver_todos_setores" como a alavanca de "ver todos os
      setores nesta tela" (mesma regra usada no Dashboard).
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────
   0) DADOS DE ATUAÇÃO
   ─────────────────────────────────────────────────────────── */
const ATUACAO_OPCOES = ['Superintendência', 'Coordenação', 'Liderança'];
const ATUACAO_ESPECIFICO = {
  'Superintendência': ['Superintendente', 'Secretário(a)', 'Adjunto'],
  'Coordenação': ['Secretário(a) do Setor'],
  'Liderança': ['Dirigente', 'Vice-Dirigente', 'Secretário(a)', 'Auxiliar', 'Mídia'],
};

function pfAtuacaoSelectHtml(idPrefix, atuacaoAtual, especificoAtual) {
  return `
  <div class="form-row">
    <div class="form-group">
      <label>Atuação</label>
      <select id="${idPrefix}-atuacao" onchange="pfAtualizarEspecifico('${idPrefix}')">
        <option value="">— Nenhuma —</option>
        ${ATUACAO_OPCOES.map(a => `<option value="${a}" ${a === atuacaoAtual ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Específico</label>
      <select id="${idPrefix}-especifico"></select>
    </div>
  </div>`;
}

window.pfAtualizarEspecifico = function (idPrefix, manter) {
  const atuacao = document.getElementById(`${idPrefix}-atuacao`)?.value || '';
  const espSel = document.getElementById(`${idPrefix}-especifico`);
  if (!espSel) return;
  const opts = ATUACAO_ESPECIFICO[atuacao] || [];
  espSel.innerHTML = `<option value="">— Nenhum —</option>${opts.map(o => `<option value="${o}" ${o === manter ? 'selected' : ''}>${o}</option>`).join('')}`;
  espSel.disabled = !atuacao;
};

/* ───────────────────────────────────────────────────────────
   1) PERMISSÕES NOVAS
   ─────────────────────────────────────────────────────────── */
if (typeof PERM_DESC !== 'undefined') {
  PERM_DESC['alterar_membros'] = { label: 'Alterar Membros', desc: 'Editar dados dos membros do próprio setor. A permissão "Ver Todos os Setores" libera também um filtro de setor nesta tela.' };
  PERM_DESC['visualizar_membros'] = { label: 'Visualizar Membros', desc: 'Ver a lista de membros do próprio setor. A permissão "Ver Todos os Setores" libera também um filtro de setor nesta tela.' };
}

const canVerMembros = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && (hasPerm('visualizar_membros') || hasPerm('gerenciar_membros')));
const canAlterarMembros = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || (typeof hasPerm === 'function' && (hasPerm('alterar_membros') || hasPerm('gerenciar_membros')));

/* ───────────────────────────────────────────────────────────
   2) CADASTRO DE MEMBRO — campo Atuação
   ─────────────────────────────────────────────────────────── */
window.openEditMembro = function (id) {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)" value="${escHtml(m.telefone || '')}"/></div>
    <div class="form-group"><label>Email</label><input id="em-email" value="${escHtml(m.email || '')}"/></div>
    <div class="form-group"><label>Vocação</label><textarea id="em-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia...">${escHtml(m.vocacao || '')}</textarea></div>
    <div class="form-section-title">${lc("shield", 14)} Atuação</div>
    ${pfAtuacaoSelectHtml('em', m.atuacao, m.atuacao_especifico)}
    <div class="form-section-title">${lc("book-open", 14)} Escola Bíblica Dominical</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="em-ebd"><option value="false" ${!m.frequenta_ebd ? 'selected' : ''}>Não</option><option value="true" ${m.frequenta_ebd ? 'selected' : ''}>Sim</option></select></div>
      <div class="form-group"><label>Papel</label><select id="em-papel-ebd"><option value="" ${!m.papel_ebd ? 'selected' : ''}>—</option><option value="Aluno" ${m.papel_ebd === 'Aluno' ? 'selected' : ''}>Aluno</option><option value="Professor" ${m.papel_ebd === 'Professor' ? 'selected' : ''}>Professor</option><option value="Superintendente" ${m.papel_ebd === 'Superintendente' ? 'selected' : ''}>Superintendente</option></select></div>
    </div>`;
    pfAtualizarEspecifico('em', m.atuacao_especifico);
    const modal = document.querySelector('.modal');
    if (modal && !modal.querySelector('.modal-foot')) { const foot = document.createElement('div'); foot.className = 'modal-foot'; foot.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveMembro('${id}')">${lc("save", 14)} Salvar</button>`; modal.appendChild(foot); }
  });
};

window.saveMembro = async function (id) {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  const payload = {
    nome: ($('em-nome')?.value || '').trim(),
    cargo: $('em-cargo')?.value,
    idade: parseInt($('em-idade')?.value) || null,
    telefone: ($('em-tel')?.value || '').trim(),
    email: ($('em-email')?.value || '').trim(),
    vocacao: ($('em-vocacao')?.value || '').trim() || null,
    atuacao: $('em-atuacao')?.value || null,
    atuacao_especifico: $('em-especifico')?.value || null,
    frequenta_ebd: $('em-ebd')?.value === 'true',
    papel_ebd: $('em-papel-ebd')?.value || null
  };
  if (!payload.nome) { toast('Nome obrigatório', 'error'); return; }
  const { error } = await q('membros').update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  closeModal(); toast('Membro atualizado!');
  if (currentPage === 'setores') renderSetores();
  if (currentPage === 'todos_membros' && typeof renderTodosMembros === 'function') renderTodosMembros();
};

window.openMemberModal = async function (id) {
  showModal(loadingPage());
  const { data: m, error } = await q('membros').select('*').eq('id', id).single();
  if (error || !m) { closeModal(); toast('Erro', 'error'); return; }
  const ebdInfo = m.frequenta_ebd ? `<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:#38bdf8;margin-bottom:4px">${lc("book-open", 14)} Escola Bíblica Dominical</div><div class="c3">Papel: <strong style="color:var(--txt)">${escHtml(m.papel_ebd || 'Aluno')}</strong></div></div>` : '';
  const vocacaoInfo = m.vocacao ? `<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--gold);margin-bottom:4px">${lc("sparkles", 14)} Vocação</div><div class="c2">${escHtml(m.vocacao)}</div></div>` : '';
  const atuacaoInfo = m.atuacao ? `<div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--violet);margin-bottom:4px">${lc("shield", 14)} Atuação</div><div class="c2">${escHtml(m.atuacao)}${m.atuacao_especifico ? ' · ' + escHtml(m.atuacao_especifico) : ''}</div></div>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${atuacaoInfo}${vocacaoInfo}${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${canAlterarMembros() ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};

/* Formulário de "Novo Membro" na tela de congregação */
const _origOpenAddModal = window.openAddModal;
window.openAddModal = function (type) {
  if (type !== 'membro') { if (typeof _origOpenAddModal === 'function') _origOpenAddModal(type); return; }
  showModal(`<div class="modal-hdr"><span>${lc("plus-circle", 14)}</span><h2>Novo Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Nome Completo *</label><input id="add-nome"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="add-cargo">${CARGOS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="add-idade" type="number"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="add-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)"/></div>
    <div class="form-group"><label>Email</label><input id="add-email" type="email"/></div>
    <div class="form-section-title">${lc("shield", 14)} Atuação</div>
    ${pfAtuacaoSelectHtml('add', '', '')}
    <div class="form-section-title">${lc("book-open", 14)} EBD</div>
    <div class="form-row"><div class="form-group"><label>Frequenta EBD?</label><select id="add-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-group"><label>Papel</label><select id="add-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div></div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAdd('membro')">${lc("plus-circle", 14)} Criar</button></div>`);
  pfAtualizarEspecifico('add');
  setTimeout(() => { const n = $('add-nome'); if (n) n.focus(); }, 100);
};

const _origSubmitAdd = window.submitAdd;
window.submitAdd = async function (type) {
  if (type !== 'membro') { if (typeof _origSubmitAdd === 'function') return _origSubmitAdd(type); return; }
  const nome = ($('add-nome')?.value || '').trim(); if (!nome) { toast('Nome é obrigatório', 'error'); return; }
  if (!hasPerm('gerenciar_membros') && !canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  const { error } = await q('membros').insert({
    nome, congregacao_id: navState.cong.id, setor_id: navState.setor.id,
    cargo: $('add-cargo').value, idade: parseInt($('add-idade')?.value) || null,
    telefone: $('add-tel')?.value || null, email: $('add-email')?.value || null,
    atuacao: $('add-atuacao')?.value || null, atuacao_especifico: $('add-especifico')?.value || null,
    frequenta_ebd: $('add-ebd')?.value === 'true', papel_ebd: $('add-papel-ebd')?.value || null
  });
  if (error) { toast(error.message, 'error'); return; }
  toast('Membro adicionado!'); closeModal(); renderSetores();
};

/* ───────────────────────────────────────────────────────────
   3) MENU "MEMBROS" — lista global com permissões próprias
   ─────────────────────────────────────────────────────────── */
setTimeout(() => {
  const nav = document.querySelector('.sidebar-nav');
  if (nav && !nav.querySelector('[data-page="todos_membros"]') && canVerMembros()) {
    const div = document.createElement('div');
    div.className = 'nav-item'; div.dataset.page = 'todos_membros';
    div.innerHTML = `<span class="nav-icon"><i data-lucide="users-round"></i></span><span class="nav-lbl">Membros</span>`;
    div.addEventListener('click', () => { navigate('todos_membros'); if (typeof toggleMobile === 'function') toggleMobile(false); });
    const usersItem = nav.querySelector('[data-page="usuarios"]');
    if (usersItem) nav.insertBefore(div, usersItem.nextSibling); else nav.appendChild(div);
    if (typeof refreshLucide === 'function') refreshLucide();
  }
}, 700);

const _origNavigate2 = window.navigate;
if (typeof _origNavigate2 === 'function' && !window._navPatchedMembros2) {
  window._navPatchedMembros2 = true;
  window.navigate = function (page) {
    if (page === 'todos_membros') {
      if (currentPage) pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
      currentPage = 'todos_membros';
      document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === 'todos_membros'));
      $('page-title').textContent = 'Membros';
      renderTodosMembros();
      return;
    }
    _origNavigate2(page);
  };
}

window._membrosSetorFiltro = window._membrosSetorFiltro || '';

window.renderTodosMembros = async function () {
  const pc = $('page-content'); if (!pc) return;
  if (!canVerMembros()) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão.</p></div>`; return; }
  pc.innerHTML = loadingPage();

  const podeTodosSetores = canSeeAllSetores();
  const sidFiltro = podeTodosSetores ? (window._membrosSetorFiltro || '') : (currentUser?.setor_id || '');

  const { data: setoresAll } = podeTodosSetores ? await q('setores').select('id,nome').order('nome') : { data: [] };

  let qMems = q('membros').select('*, congregacoes(nome), setores(nome)').order('nome');
  if (sidFiltro) qMems = qMems.eq('setor_id', sidFiltro);
  else if (!podeTodosSetores && currentUser?.setor_id) qMems = qMems.eq('setor_id', currentUser.setor_id);

  const { data: mems, error } = await qMems;
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${error.message}</p></div>`; return; }

  window._allMembrosCache = mems || [];
  const canManage = canAlterarMembros();

  const filtroSetorHtml = podeTodosSetores ? `
  <div class="form-group" style="margin:0">
    <label>Setor</label>
    <select id="membros-setor-filtro" onchange="window._membrosSetorFiltro=this.value;renderTodosMembros()" style="min-width:180px">
      <option value="">Todos os setores</option>
      ${(setoresAll || []).map(s => `<option value="${s.id}" ${s.id === sidFiltro ? 'selected' : ''}>${escHtml(s.nome)}</option>`).join('')}
    </select>
  </div>` : '';

  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Membros <span class="count-badge">${(mems || []).length}</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      ${canManage ? `<button class="btn btn-secondary btn-sm" onclick="openAddMembroGlobal(true)" title="Registra o membro e também conta como Jovem Matriculado no relatório">${lc('graduation-cap', 14)} Matricular Membro</button>` : ''}
      ${canManage ? `<button class="btn btn-primary btn-sm" onclick="openAddMembroGlobal()">+ Novo Membro</button>` : ''}
    </div>
  </div>
  ${podeTodosSetores ? `<div class="filter-bar"><div class="filter-title">${lc('map-pin', 14)} Filtro</div><div class="filter-fields">${filtroSetorHtml}</div></div>` : ''}
  <div class="responsive-table-wrap">
    <div class="search-wrap" style="margin-bottom:14px;max-width:320px">
      ${lc('search', 15, 'search-ico')}
      <input type="text" id="membros-global-search" placeholder="Buscar por nome..." oninput="filterTodosMembros(this.value)" style="width:100%"/>
    </div>
    <div id="membros-global-list">${renderMembrosGlobalCards(window._allMembrosCache)}</div>
  </div>`;
  refreshLucide();
};

function renderMembrosGlobalCards(membros) {
  if (!membros || !membros.length) return `<div class="empty"><div class="empty-ico">${lc('users', 44)}</div><p>Nenhum membro encontrado.</p></div>`;
  const canManage = canAlterarMembros();
  return `<div style="display:flex;flex-direction:column;gap:8px">${membros.map(m => `
    <div class="user-card">
      <div class="user-card-main">
        <div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
        <div class="user-card-info">
          <div class="fw5 fs-sm">${escHtml(m.nome)}</div>
          <div class="fs-xs c3">${escHtml(m.cargo || '—')} · ${m.congregacoes ? escHtml(m.congregacoes.nome) : '—'}${m.setores ? ' · ' + escHtml(m.setores.nome) : ''}</div>
    <div class="user-card-tags">
  ${m.cargo ? `<span class="role-badge">${escHtml(m.cargo)}</span>` : ''}
  ${m.setores ? `<span class="tag tag-blue fs-xs">${escHtml(m.setores.nome)}</span>` : '<span class="tag tag-rose fs-xs">Sem setor</span>'}
  ${m.congregacoes ? `<span class="tag tag-gold fs-xs">${lc("church",14)} ${escHtml(m.congregacoes.nome)}</span>` : ''}
  ${m.atuacao ? `<span class="tag tag-violet fs-xs">${lc("shield",14)} ${escHtml(m.atuacao)}${m.atuacao_especifico ? ' · ' + escHtml(m.atuacao_especifico) : ''}</span>` : ''}
  ${m.frequenta_ebd ? `<span class="tag tag-blue fs-xs">${lc("book-open",14)} EBD</span>` : ''}
  ${m.vocacao ? `<span class="tag tag-gold fs-xs">${lc("sparkles",14)} ${escHtml(m.vocacao)}</span>` : ''}
</div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openMemberModal('${m.id}')">${lc('eye', 14)}</button>
        ${canManage ? `<button class="btn btn-secondary btn-sm" onclick="openEditMembro('${m.id}')">${lc('pencil', 14)}</button>` : ''}
        ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delMembro('${m.id}','${escAttr(m.nome)}')">${lc('trash-2', 14)}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

window.filterTodosMembros = function (qStr) {
  const t = (qStr || '').toLowerCase();
  const arr = (window._allMembrosCache || []).filter(m => m.nome.toLowerCase().includes(t));
  const list = document.getElementById('membros-global-list');
  if (list) list.innerHTML = renderMembrosGlobalCards(arr);
};

window.openAddMembroGlobal = async function (matricula) {
  if (!canAlterarMembros()) { toast('Sem permissão', 'error'); return; }
  window._amgMatricula = !!matricula;
  const titulo = window._amgMatricula ? 'Matricular Membro' : 'Novo Membro';
  const aviso = window._amgMatricula ? `<p class="fs-xs c3" style="margin:-8px 0 14px">${lc('info', 12)} Este cadastro também vai contar como <b>Jovem Matriculado</b> no relatório.</p>` : '';
  showModal(`<div class="modal-hdr"><span>${lc(window._amgMatricula ? 'graduation-cap' : 'plus-circle', 14)}</span><h2>${titulo}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="amg-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAddMembroGlobal()">${lc('save', 14)} Salvar</button></div>`);
  let qSetores = q('setores').select('id,nome').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) qSetores = qSetores.eq('id', currentUser.setor_id);
  const [{ data: setores }, { data: congs }] = await Promise.all([qSetores, q('congregacoes').select('id,nome,setor_id').order('nome')]);
  window._cacheCongsGlobal = congs || [];
  $('amg-body').innerHTML = `
  ${aviso}
  <div class="form-group"><label>Nome Completo *</label><input id="amg-nome"/></div>
  <div class="form-row">
    <div class="form-group"><label>Setor *</label><select id="amg-setor" onchange="updateCongsGlobal()"><option value="">— Selecione —</option>${(setores || []).map(s => `<option value="${s.id}">${escHtml(s.nome)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Congregação *</label><select id="amg-cong"><option value="">— Selecione Setor —</option></select></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Cargo</label><select id="amg-cargo">${CARGOS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label>Idade</label><input id="amg-idade" type="number"/></div>
  </div>
  <div class="form-group"><label>Telefone</label><input id="amg-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)"/></div>
  <div class="form-group"><label>Email</label><input id="amg-email" type="email"/></div>
  <div class="form-section-title">${lc('shield', 14)} Atuação</div>
  ${pfAtuacaoSelectHtml('amg', '', '')}
  <div class="form-section-title">${lc('book-open', 14)} EBD</div>
  <div class="form-row"><div class="form-group"><label>Frequenta EBD?</label><select id="amg-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="form-group"><label>Papel na EBD</label><select id="amg-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div></div>`;
  pfAtualizarEspecifico('amg');
  setTimeout(() => window.updateCongsGlobal(), 50);
};

window.updateCongsGlobal = function () {
  const sid = document.getElementById('amg-setor')?.value;
  const cSel = document.getElementById('amg-cong');
  if (!cSel) return;
  if (!sid) { cSel.innerHTML = '<option value="">— Selecione Setor —</option>'; return; }
  const cgs = (window._cacheCongsGlobal || []).filter(c => c.setor_id === sid);
  cSel.innerHTML = cgs.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('') || '<option value="">Nenhuma congregação</option>';
};

window.submitAddMembroGlobal = async function () {
  const nome = (document.getElementById('amg-nome')?.value || '').trim();
  const setor_id = document.getElementById('amg-setor')?.value;
  const congregacao_id = document.getElementById('amg-cong')?.value;
  if (!nome || !setor_id || !congregacao_id) return toast('Preencha Nome, Setor e Congregação', 'error');
  const payload = {
    nome, setor_id, congregacao_id,
    cargo: document.getElementById('amg-cargo')?.value,
    idade: parseInt(document.getElementById('amg-idade')?.value) || null,
    telefone: (document.getElementById('amg-tel')?.value || '').trim() || null,
    email: (document.getElementById('amg-email')?.value || '').trim() || null,
    atuacao: document.getElementById('amg-atuacao')?.value || null,
    atuacao_especifico: document.getElementById('amg-especifico')?.value || null,
    frequenta_ebd: document.getElementById('amg-ebd')?.value === 'true',
    papel_ebd: document.getElementById('amg-papel-ebd')?.value || null
  };
  const { error } = await q('membros').insert(payload);
  if (error) return toast(error.message, 'error');
  const foiMatricula = window._amgMatricula;
  if (foiMatricula) {
    // Registra também um evento tipo "jovens_matriculados" — é assim que
    // esse cadastro passa a contar no relatório (Totalizadores UMADALPE),
    // sem precisar de nenhuma coluna nova na tabela de membros
    const { error: evErr } = await q('eventos').insert({
      tipo: 'jovens_matriculados', setor_id, congregacao_id,
      data: dp.hoje(), participantes: 1, resumo: `Matrícula: ${nome}`, status: 'publicado'
    });
    if (evErr) console.error('Falha ao registrar matrícula no relatório:', evErr.message);
  }
  window._amgMatricula = false;
  toast(foiMatricula ? 'Membro matriculado!' : 'Membro adicionado!'); closeModal(); renderTodosMembros();
};

/* ───────────────────────────────────────────────────────────
   4) VISITAS DE OBREIROS — nos formulários de evento
   ─────────────────────────────────────────────────────────── */
window._pfVisitaRowSeq = 0;
window._pfVisitaEncontrados = {}; // id -> {nome, cargo, origem, atuacao}

function pfVisitasSectionHtml() {
  return `
  <div class="form-section-title">${lc('handshake', 14)} Visitas de Obreiros</div>
  <p class="fs-xs c3" style="margin-bottom:8px">Adicione um ou mais filtros (ex: Obreiro Local + Superintendência, e também UMADALPE + Liderança) e clique em Buscar. Os encontrados aparecem na lista abaixo para você marcar quem esteve presente.</p>
  <div id="pf-visita-rows"></div>
  <button type="button" class="btn btn-secondary btn-sm" style="margin:6px 0 12px" onclick="pfAddVisitaRow()">${lc('plus-circle', 14)} Adicionar filtro</button>
  <div class="member-select-list" id="pf-visita-resultados" style="max-height:180px">
    <p class="c3 fs-xs">Nenhum resultado ainda.</p>
  </div>`;
}

window.pfAddVisitaRow = function () {
  const rid = 'pfv' + (++window._pfVisitaRowSeq);
  const container = document.getElementById('pf-visita-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'filter-bar';
  row.style.marginBottom = '10px';
  row.id = `row-${rid}`;
  row.innerHTML = `
    <div class="filter-fields">
      <div class="form-group" style="margin:0"><label>Origem</label>
        <select id="${rid}-origem"><option value="local">Obreiro Local</option><option value="umadalpe">UMADALPE</option></select>
      </div>
      <div class="form-group" style="margin:0"><label>Atuação</label>
        <select id="${rid}-atuacao" onchange="pfAtualizarEspecifico('${rid}')">
          <option value="">Todas</option>
          ${ATUACAO_OPCOES.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0"><label>Específico</label><select id="${rid}-especifico"><option value="">Todos</option></select></div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <button type="button" class="btn btn-primary btn-sm" onclick="pfBuscarVisita('${rid}')">${lc('search', 14)} Buscar</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('row-${rid}').remove()">${lc('trash-2', 14)}</button>
      </div>
    </div>`;
  container.appendChild(row);
}

window.pfBuscarVisita = async function (rid) {
  const origem = document.getElementById(`${rid}-origem`)?.value;
  const atuacao = document.getElementById(`${rid}-atuacao`)?.value;
  const especifico = document.getElementById(`${rid}-especifico`)?.value;

  let qMem = q('membros').select('id,nome,cargo,congregacao_id,setor_id,atuacao,atuacao_especifico').neq('cargo', 'Membro');
  if (atuacao) qMem = qMem.eq('atuacao', atuacao);
  if (especifico) qMem = qMem.eq('atuacao_especifico', especifico);

  const congId = typeof navState !== 'undefined' ? navState.cong?.id : null;
  const setorId = (typeof navState !== 'undefined' && navState.setor?.id) ? navState.setor.id : currentUser?.setor_id;

  if (origem === 'local') {
    if (congId) qMem = qMem.eq('congregacao_id', congId);
    else if (setorId) qMem = qMem.eq('setor_id', setorId);
  } else {
    // UMADALPE: obreiros de outras congregações, mesmo setor (a menos que o usuário veja todos os setores)
    if (congId) qMem = qMem.neq('congregacao_id', congId);
    if (!canSeeAllSetores() && setorId) qMem = qMem.eq('setor_id', setorId);
  }

  const { data, error } = await qMem.order('nome').limit(200);
  if (error) { toast(error.message, 'error'); return; }

  (data || []).forEach(m => {
    window._pfVisitaEncontrados[m.id] = { nome: m.nome, cargo: m.cargo, origem: origem === 'local' ? 'Local' : 'UMADALPE', atuacao: m.atuacao, especifico: m.atuacao_especifico };
  });
  pfRenderVisitaResultados();
};

function pfRenderVisitaResultados() {
  const box = document.getElementById('pf-visita-resultados');
  if (!box) return;
  const entries = Object.entries(window._pfVisitaEncontrados);
  if (!entries.length) { box.innerHTML = '<p class="c3 fs-xs">Nenhum resultado ainda.</p>'; return; }
  box.innerHTML = entries.map(([id, m]) => `
    <label class="check-row">
      <input type="checkbox" class="pf-visita-check" value="${id}" checked/>
      <div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div>
      <span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo || '')} · <span class="tag tag-violet fs-xs">${escHtml(m.origem)}</span>${m.atuacao ? ' · ' + escHtml(m.atuacao) : ''}${m.especifico ? ' (' + escHtml(m.especifico) + ')' : ''}</em></span>
    </label>`).join('');
}

function pfColetarVisitantesSelecionados() {
  return [...document.querySelectorAll('.pf-visita-check:checked')].map(c => c.value);
}

function pfResetVisitas() {
  window._pfVisitaEncontrados = {};
}

/* Injeta a seção de Visitas no modal de evento de congregação */
const _origOpenEventModal2 = window.openEventModal;
window.openEventModal = async function (tipo) {
  pfResetVisitas();
  if (typeof _origOpenEventModal2 === 'function') await _origOpenEventModal2(tipo);
  const body = document.querySelector('.modal .modal-body');
  if (body) {
    const div = document.createElement('div');
    div.innerHTML = pfVisitasSectionHtml();
    body.appendChild(div);
  }
};

/* Injeta a seção de Visitas no modal de evento setorial */
const _origOpenEventoSetorialModal2 = window.openEventoSetorialModal;
window.openEventoSetorialModal = async function () {
  pfResetVisitas();
  if (typeof _origOpenEventoSetorialModal2 === 'function') await _origOpenEventoSetorialModal2();
  const body = document.querySelector('.modal .modal-body');
  if (body) {
    const div = document.createElement('div');
    div.innerHTML = pfVisitasSectionHtml();
    body.appendChild(div);
  }
};

/* Garante que os visitantes marcados entrem em participante_ids ao registrar */
const _origSubmitEvento2 = window.submitEvento;
window.submitEvento = async function (tipo) {
  const visitantes = pfColetarVisitantesSelecionados();
  if (!visitantes.length) { if (typeof _origSubmitEvento2 === 'function') return _origSubmitEvento2(tipo); return; }
  // injeta checkboxes "fantasma" para o submitEvento original computar o total certo
  const hidden = document.createElement('div'); hidden.style.display = 'none';
  visitantes.forEach(id => { hidden.innerHTML += `<input type="checkbox" class="ev-ext-check" value="${id}" checked>`; });
  document.querySelector('.modal .modal-body')?.appendChild(hidden);
  if (typeof _origSubmitEvento2 === 'function') return _origSubmitEvento2(tipo);
};

const _origSubmitEventoSetorial2 = window.submitEventoSetorial;
window.submitEventoSetorial = async function () {
  const visitantes = pfColetarVisitantesSelecionados();
  if (visitantes.length) {
    const hidden = document.createElement('div'); hidden.style.display = 'none';
    visitantes.forEach(id => { hidden.innerHTML += `<input type="checkbox" class="es-user-check" value="${id}" checked>`; });
    document.querySelector('.modal .modal-body')?.appendChild(hidden);
  }
  if (typeof _origSubmitEventoSetorial2 === 'function') return _origSubmitEventoSetorial2();
};

console.log('[patch_atuacao_visitas] carregado ✓');

/* ═══════════════════════════════════════════════════════════
   EclesiaSync · patch_umadalpe_eventos.js
   Carregar por ÚLTIMO no HTML, depois de patch_atuacao_visitas.js:
     <script src="patch_umadalpe_eventos.js"></script>

   O QUE ESTE ARQUIVO FAZ:
   1. Reorganiza o menu "+ Evento" da tela de congregação:
      - Remove das OPÇÕES NOVAS: Culto, Desviados que Voltaram,
        Pessoas Evangelizadas, Presentes na Oração, Ofertas
        (eventos ANTIGOS desses tipos continuam existindo e
        aparecendo normalmente em todo o sistema — só não dá mais
        pra criar um novo evento desses tipos).
      - Garante que existam: Evangelismo, Saída de Campo, Ponto de
        Pregação, Culto ao Ar Livre, Visita aos Enfermos, Visita
        aos Desviados/Detidos, Visita aos Novos Convertidos, Visita
        a outra UMADALPE, Convocação da Superintendência, Oração.
   2. Adiciona os campos comuns a TODO evento (visitas recebidas da
      UMADALPE, visita da coordenação, visita da superintendência,
      visita do obreiro da congregação, visitas do ministério,
      desviados que voltaram, almas salvas, batismo no Espírito,
      renovo, ofertas) e os campos exclusivos de evento
      evangelístico (pessoas evangelizadas, literaturas
      distribuídas, presentes no evangelismo) — e oculta "Bênçãos
      Agradecidas" nesses últimos.
   3. Mantém intacta a seção "Visitas de Obreiros" (do arquivo
      patch_atuacao_visitas.js).
   4. Adiciona ao Relatório uma seção "Totalizadores UMADALPE" 100%
      automática, calculada a partir dos eventos do período — nada
      é digitado manualmente.
   ═══════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────
   1) TIPOS DE EVENTO — quais aparecem no menu "+ Evento"
   ─────────────────────────────────────────────────────────── */

// tipos que NÃO devem mais aparecer como opção de criação
// (registros antigos desses tipos continuam funcionando normalmente)
const UMADALPE_TIPOS_OCULTOS = ['culto', 'desviados_voltaram', 'pessoas_evangelizadas', 'presentes_oracao', 'ofertas_umadalpe'];

// tipos evangelísticos (ganham os 3 campos exclusivos e perdem "Bênçãos Agradecidas")
const UMADALPE_TIPOS_EVANGELISTICOS = ['evangelismo', 'saida', 'culto_ar_livre', 'ponto_pregacao'];

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
  TIPOS_EVENTO['convocacao_superintendencia'] = { label: 'Convocação da Superintendência', grupo: 'Eventos', icon: 'megaphone' };
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
/* Esconde TODO o bloco de realização (participantes, visitas, resultados,
   ofertas) quando a data escolhida é futura, mostrando um aviso — igual ao
   evento setorial. O evento é salvo como rascunho e os dados são preenchidos
   depois, no "Finalizar". Volta a mostrar tudo se a data for hoje/passada. */
function pfCongFuturoToggle() {
  const di = document.getElementById('ev-data');
  if (!di) return;
  const upd = () => {
    const futuro = di.value > new Date().toISOString().slice(0, 10);
    const bloco = document.getElementById('ev-dados-realizacao');
    document.getElementById('ev-futuro-notice')?.remove();
    if (bloco) bloco.style.display = futuro ? 'none' : '';
    if (futuro) {
      const n = document.createElement('div');
      n.id = 'ev-futuro-notice'; n.className = 'futuro-notice';
      n.innerHTML = `${lc('shield', 14)} <strong>Evento futuro:</strong> agende agora só com data, horário e resumo. Os participantes e os demais dados você preenche depois, tocando em <strong>Finalizar</strong> após a realização.`;
      di.parentElement.insertAdjacentElement('afterend', n);
    }
  };
  di.addEventListener('change', upd);
  upd();
}

/* Reabre o modal de evento em modo "Finalizar" para um rascunho agendado. */
window.openFinalizarEvento = function (id) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  return window.openEventModal(null, id);
};

window.openEventModal = async function (tipo, finalizeId = null) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  $('event-menu')?.classList.add('hidden');
  if (typeof pfResetVisitas === 'function') pfResetVisitas();

  // Modo "Finalizar": carrega o rascunho para preencher os dados reais e
  // publicar. Data e tipo vêm do evento agendado.
  let evFin = null;
  if (finalizeId) {
    const { data: evLoad } = await q('eventos').select('*').eq('id', finalizeId).single();
    if (!evLoad) { toast('Evento não encontrado', 'error'); return; }
    evFin = evLoad;
    tipo = evLoad.tipo;
  }

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
  const dataInicial = evFin ? (evFin.data || '') : new Date().toISOString().slice(0, 10);

  showModal(`<div class="modal-hdr"><span>${lc(info.icon, 20)}</span><h2>${evFin ? 'Finalizar' : 'Registrar'}: ${info.label}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="ev-data" type="date" value="${dataInicial}" ${evFin ? 'disabled' : ''}/></div>
    <div class="form-row">
      <div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time" value="${evFin?.hora_inicio || ''}"/></div>
      <div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time" value="${evFin?.hora_fim || ''}"/></div>
    </div>
    <div class="form-group"><label>Resumo / Obs.</label><textarea id="ev-resumo" rows="2" style="resize:vertical">${escHtml(evFin?.resumo || '')}</textarea></div>
    <div id="ev-dados-realizacao">
    ${camposEspecificos}
    ${pfCamposComunsHtml()}
    ${ehEvangelistico ? pfCamposEvangelisticosHtml() : pfCampoBencaosHtml()}
    ${tipo === 'evangelismo' ? '' : pfCampoOfertasHtml()}
    <div class="form-group"><label>${ehEBD ? 'Alunos/Professores (EBD)' : 'Participantes da Congregação'}</label>
    <p class="fs-xs c3" style="margin-bottom:6px">Marque os presentes — o total será calculado automaticamente.</p>
    <div class="member-select-list" id="ev-mems-local">${memsParaLista.map(m => `<label class="check-row"><input type="checkbox" class="ev-mem-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}${m.papel_ebd ? ' · ' + m.papel_ebd : ''}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum membro cadastrado.</p>'}</div></div>
    ${!ehEBD ? `<div class="form-group"><label>Externos (mesmo setor)</label><input id="ev-ext-search" placeholder="Buscar..." oninput="filterExtMembers(this.value)" style="margin-bottom:8px"/><div class="member-select-list" id="ev-mems-ext" style="max-height:140px">${(allMems || []).map(m => `<label class="check-row ev-ext-row"><input type="checkbox" class="ev-ext-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}</em></span></label>`).join('') || '<p class="c3 fs-xs">Sem externos.</p>'}</div></div>` : ''}
    ${typeof pfVisitasSectionHtml === 'function' ? pfVisitasSectionHtml() : ''}
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEvento('${tipo}'${evFin ? `,'${finalizeId}'` : ''})">${lc(evFin ? "check-circle" : "plus-circle", 14)} ${evFin ? 'Finalizar' : 'Registrar'}</button></div>`);

  // Só na criação: se a data for futura, esconde o bloco de realização e o
  // evento é salvo como rascunho. No modo Finalizar mostramos tudo.
  if (!evFin) setTimeout(() => pfCongFuturoToggle(), 60);
};

/* ───────────────────────────────────────────────────────────
   4) SUBMIT — salva os campos novos + mantém visitas de obreiros
   ─────────────────────────────────────────────────────────── */
window.submitEvento = async function (tipo, finalizeId = null) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  const data = $('ev-data')?.value; if (!data) { toast('Data é obrigatória', 'error'); return; }
  const hoje = new Date().toISOString().slice(0, 10);
  // Na criação (sem finalizeId) uma data futura é agendada como rascunho; ao
  // finalizar já é a realização, então nunca é tratada como futura.
  const futuro = !finalizeId && data > hoje;
  const resumo = ($('ev-resumo')?.value || '').trim();

  // ── Criação de evento FUTURO → agenda como rascunho (igual ao setorial):
  //    só data/horário/resumo; participantes e demais dados ficam para o
  //    "Finalizar" depois da realização.
  if (futuro) {
    const payload = {
      congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data, resumo,
      hora_inicio: $('ev-inicio')?.value || null, hora_fim: $('ev-fim')?.value || null,
      participantes: 0, participante_ids: [],
      status: 'rascunho',
    };
    const { data: novo, error } = await q('eventos').insert(payload).select().single();
    if (error) { toast(error.message, 'error'); return; }
    toast('Evento agendado como rascunho.'); closeModal();
    if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo, resumo }); } catch (_) {} }
    renderSetores();
    return;
  }

  const localChecked = [...document.querySelectorAll('.ev-mem-check:checked')].map(c => c.value);
  const extChecked = [...document.querySelectorAll('.ev-ext-check:checked')].map(c => c.value);
  const visitantesObreiros = typeof pfColetarVisitantesSelecionados === 'function' ? pfColetarVisitantesSelecionados() : [];
  const participanteIds = [...new Set([...localChecked, ...extChecked, ...visitantesObreiros])];

  const num = id => parseInt($(id)?.value) || 0;
  const money = id => canSeeFinanceiro() ? (parseFloat($(id)?.value) || 0) : 0;

  const payload = {
    congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data,
    resumo,
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

  // ── Finalizar um rascunho → atualiza o evento existente e publica.
  if (finalizeId) {
    const { data: novo, error } = await q('eventos').update(payload).eq('id', finalizeId).select().single();
    if (error) { toast(error.message, 'error'); return; }
    toast('Evento finalizado!'); closeModal();
    if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: finalizeId, tipo, resumo }); } catch (_) {} }
    renderSetores();
    return;
  }

  const { data: novo, error } = await q('eventos').insert(payload).select().single();
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal();
  // Notifica este aparelho (o Realtime cuida dos demais usuários) com o som.
  if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo, resumo }); } catch (_) {} }
  renderSetores();
};

/* O bloco "5) RELATÓRIO — totalizadores 100% automáticos" que existia
   aqui era uma cópia idêntica do que patch_umadalpe_eventos.js (carregado
   depois deste arquivo) já faz — as duas versões declaravam a mesma
   variável top-level (_origRenderRelatorios), o que gerava
   "SyntaxError: Identifier already declared" e travava o carregamento
   de patch_umadalpe_eventos.js inteiro. Além do erro, se as duas
   rodassem (com a variável renomeada) o card "Totalizadores UMADALPE"
   apareceria duplicado na tela de Relatórios. Removida a cópia daqui;
   a versão de patch_umadalpe_eventos.js é a que roda. */








/* ───────── ajuste.js ───────── */
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
      <div class="item-card" style="animation-delay:${i * .05}s" onclick="openSetor('${s.id}','${escAttr(s.nome)}','${escAttr(s.regiao || '')}')">
        <div class="card-head"><div class="card-ico">${lc('map-pin', 17)}</div>
          <div><div class="card-name">${escHtml(s.nome)}</div><div class="card-sub">Região ${s.regiao || '—'}</div></div>
        </div>
        <div class="card-meta"><span class="tag tag-gold">${lc('church', 12)} ${congCount(s.id)} Cong.</span><span class="tag tag-blue">${lc('users', 12)} ${memCount(s.id)} Membros</span></div>
        <div class="card-actions" onclick="event.stopPropagation()">
          ${hasPerm('excluir_registros') ? `<button class="btn btn-danger btn-sm" onclick="delSetor('${s.id}','${escAttr(s.nome)}')">${lc('trash-2', 14)}</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="openSetor('${s.id}','${escAttr(s.nome)}','${escAttr(s.regiao || '')}')">${lc('arrow-right', 14)} Abrir</button>
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
/* CONSOLIDAÇÃO: esta redefinição de renderDashboard foi desativada — ela
   sobrescrevia (por ordem de carregamento) a versão mais completa definida
   em dashboard_patch.js, que já recebeu a mesma correção de status que esta
   versão trazia (contar eventos além de só 'publicado'). Função preservada
   abaixo, só não é mais atribuída a window.renderDashboard. */
window._renderDashboardDesativado_ajuste = async function () {
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
  let sid = window.dashSetorFiltro || null;
  const cid = window.dashCongFiltro || null;
  const canFin = typeof canSeeFinanceiro === 'function' ? canSeeFinanceiro() : false;
  const podeVerEvSetoriais = (typeof hasPerm === 'function' && hasPerm('visualizar_eventos_setoriais_dash')) || (typeof isSuperAdmin === 'function' && isSuperAdmin());

 const [{ data: allSetores }] = await Promise.all([client.from('setores').select('id,nome').order('nome')]);

  const canFS = typeof canFilterSetores === 'function' ? canFilterSetores() : false;
  const canFC = typeof canFilterCong === 'function' ? canFilterCong() : false;

// Corrige mismatch: se não há setor definido mas o <select> vai exibir o
// primeiro item da lista como selecionado (comportamento padrão do navegador),
// sincroniza sid com esse mesmo primeiro setor para que filtro e exibição batam.
if (!sid && canFS && (allSetores || []).length) {
  sid = allSetores[0].id;
  window.dashSetorFiltro = sid;
}
  let qSet = client.from('setores').select('id', { count: 'exact', head: true });
  let qCong = client.from('congregacoes').select('id', { count: 'exact', head: true });
  let qMem = client.from('membros').select('id', { count: 'exact', head: true });
  let qEv = client.from('eventos').select('*').order('data', { ascending: false });
  let qEvM = client.from('eventos').select('*').gte('data', inicioMes).lte('data', fimMes);
  let qAg = client.from('agenda_semana').select('*,congregacoes(nome)').gte('data', hoje).lte('data', em7).order('data');

  if (sid) { qSet = qSet.eq('id', sid); qCong = qCong.eq('setor_id', sid); qMem = qMem.eq('setor_id', sid); qEv = qEv.eq('setor_id', sid); qEvM = qEvM.eq('setor_id', sid); qAg = qAg.eq('setor_id', sid); }
  if (cid) { qCong = qCong.eq('id', cid); qMem = qMem.eq('congregacao_id', cid); qEv = qEv.eq('congregacao_id', cid); qEvM = qEvM.eq('congregacao_id', cid); qAg = qAg.eq('congregacao_id', cid); }
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
  const { data: novo, error } = await q('eventos').insert(payload).select().single();
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal();
  // Notifica este aparelho (o Realtime cuida dos demais usuários) com o som.
  if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo, resumo: payload.resumo }); } catch (_) {} }
  renderSetores();
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
      ${hasPerm('exportar_dados') ? `<button class="btn btn-primary btn-sm" onclick="exportarFrequenciaPDF()">${lc("file-text", 14)} PDF</button><button class="btn btn-secondary btn-sm" onclick="exportarFrequenciaExcel()">${lc("bar-chart-3", 14)} Excel</button>` : ''}
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
        <button class="btn btn-secondary btn-sm" onclick="openFreqDetalhe('${m.id}','${escAttr(m.nome)}')">Ver ${lc("arrow-right", 14)}</button>
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
  showModal(`<div class="modal-hdr"><span>${lc('user', 20)}</span><h2>${id ? 'Editar Usuário' : 'Novo Usuário'}</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="user-modal-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot" id="user-modal-foot"></div>`);
  Promise.all([
    id ? q('sistema_usuarios').select('id,nome,username,role,cargo,congregacao,idade,ativo,setor_id,congregacao_id,frequenta_ebd,papel_ebd,vocacao,created_at').eq('id', id).single() : { data: null },
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
    <div id="es-dados-realizacao">
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
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEventoSetorial()">${lc('plus-circle', 14)} Registrar</button></div>`);

  // Evento futuro só pode ser agendado (data/horário/título). Conversões e
  // participantes ficam para a etapa de "Finalizar", depois da realização.
  setTimeout(() => pfSetorialFuturoToggle(), 60);
};

/* Esconde o bloco de conversões + participantes quando a data escolhida é
   futura, mostrando um aviso; volta a mostrar se a data for hoje/passada. */
function pfSetorialFuturoToggle() {
  const di = document.getElementById('es-data');
  if (!di) return;
  const upd = () => {
    const futuro = di.value > new Date().toISOString().slice(0, 10);
    const bloco = document.getElementById('es-dados-realizacao');
    document.getElementById('es-futuro-notice')?.remove();
    if (bloco) bloco.style.display = futuro ? 'none' : '';
    if (futuro) {
      const n = document.createElement('div');
      n.id = 'es-futuro-notice'; n.className = 'futuro-notice';
      n.innerHTML = `${lc('shield', 14)} <strong>Evento futuro:</strong> agende agora só com data e horário. Os participantes e as conversões você preenche depois, tocando em <strong>Finalizar</strong> após a realização.`;
      di.parentElement.insertAdjacentElement('afterend', n);
    }
  };
  di.addEventListener('change', upd);
  upd();
}

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
  const { data: novo, error } = await q('eventos').insert(payload).select().single();
  if (error) { toast(error.message, 'error'); return; }
  toast(futuro ? 'Evento setorial agendado como rascunho.' : 'Evento setorial registrado!');
  closeModal();
  // Notifica este aparelho com o som (o Realtime cuida dos demais usuários).
  if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo: 'evento_setorial', resumo }); } catch (_) {} }
  renderEventosSetoriais();
};

/* ── FINALIZAR um evento setorial agendado ────────────────────────────
   Chamado no botão "Finalizar" dos eventos em rascunho. Aqui se preenche o
   que aconteceu de fato: conversões, participantes do setor, pessoas de
   fora do setor e obreiros. Ao salvar, o evento sai de "rascunho" para
   "pendente" (publicado) e dispara a notificação. */
window.openFinalizarEventoSetorial = async function (id) {
  if (!canEventoSetorial()) { toast('Sem permissão', 'error'); return; }
  showModal(loadingPage());
  const [{ data: ev }, { data: usuarios }, { data: membros }] = await Promise.all([
    q('eventos').select('*').eq('id', id).single(),
    q('sistema_usuarios').select('id,nome,cargo,setor_id').eq('ativo', true).order('nome'),
    q('membros').select('id,nome,cargo').order('nome')
  ]);
  if (!ev) { closeModal(); toast('Evento não encontrado', 'error'); return; }

  const doSetor = (usuarios || []).filter(u => u.setor_id === ev.setor_id);
  const foraSetor = (usuarios || []).filter(u => u.setor_id !== ev.setor_id);
  const obreiros = membros || [];

  const linhaUser = (u, cls) => `<label class="check-row ${cls}-row" data-nome="${escAttr(u.nome)}"><input type="checkbox" class="${cls}" value="${u.id}"/>
    <div class="av av-sm" style="background:${avatarColor(u.nome)}">${initials(u.nome)}</div>
    <span>${escHtml(u.nome)} <em class="c3">${escHtml(u.cargo || '—')}</em></span></label>`;

  showModal(`
  <div class="modal-hdr"><span>${lc('check-circle', 20)}</span><h2>Finalizar Evento Setorial</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="futuro-notice" style="margin-bottom:14px">${lc('info', 14)} <strong>${escHtml(ev.resumo || 'Evento')}</strong> · ${fmtDate(ev.data)}. Preencha o que aconteceu na realização.</div>
    <div class="form-group"><label>Conversões</label><input id="fin-conversoes" type="number" min="0" value="${ev.conversoes || 0}"/></div>

    <div class="form-group"><label>Participantes do Setor</label>
      <div class="member-select-list es-user-scroll" style="max-height:200px">
        ${doSetor.map(u => linhaUser(u, 'fin-setor-check')).join('') || '<p class="c3 fs-xs">Nenhum usuário no setor.</p>'}
      </div>
    </div>

    <div class="form-group"><label>Pessoas Fora do Setor</label>
      <input placeholder="Buscar por nome..." oninput="pfFinFiltrar('fin-fora-check-row', this.value)" style="margin-bottom:8px"/>
      <div class="member-select-list es-user-scroll" style="max-height:180px">
        ${foraSetor.map(u => linhaUser(u, 'fin-fora-check')).join('') || '<p class="c3 fs-xs">Ninguém em outros setores.</p>'}
      </div>
    </div>

    <div class="form-group"><label>Obreiros</label>
      <input placeholder="Buscar por nome..." oninput="pfFinFiltrar('fin-obreiro-check-row', this.value)" style="margin-bottom:8px"/>
      <div class="member-select-list es-user-scroll" style="max-height:180px">
        ${obreiros.map(u => linhaUser(u, 'fin-obreiro-check')).join('') || '<p class="c3 fs-xs">Nenhum obreiro cadastrado.</p>'}
      </div>
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitFinalizarEventoSetorial('${id}')">${lc('check-circle', 14)} Publicar Evento</button></div>`);
  refreshLucide();
};

/* Filtro por nome genérico das listas do modal de finalizar. */
window.pfFinFiltrar = function (rowClass, val) {
  const t = (val || '').trim().toLowerCase();
  document.querySelectorAll('.' + rowClass).forEach(row => {
    row.style.display = (row.dataset.nome || '').toLowerCase().includes(t) ? '' : 'none';
  });
};

window.submitFinalizarEventoSetorial = async function (id) {
  if (!canEventoSetorial()) { toast('Sem permissão', 'error'); return; }
  const ids = [
    ...document.querySelectorAll('.fin-setor-check:checked'),
    ...document.querySelectorAll('.fin-fora-check:checked'),
    ...document.querySelectorAll('.fin-obreiro-check:checked'),
  ].map(c => c.value);
  const participante_ids = [...new Set(ids)];
  const payload = {
    conversoes: parseInt($('fin-conversoes')?.value) || 0,
    participante_ids,
    participantes: participante_ids.length,
    status: 'pendente',
  };
  const { data: evAtualizado, error } = await q('eventos').update(payload).eq('id', id).select().single();
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento publicado!');
  closeModal();
  // Dispara a notificação de "evento publicado" (se o usuário permitiu).
  if (typeof pfNotificarEventoPublicado === 'function') {
    try { pfNotificarEventoPublicado(evAtualizado || { id, ...payload }); } catch (_) {}
  }
  renderEventosSetoriais();
};

window._openEditMembroDesativado_ajuste = function (id) {
  if (!hasPerm('gerenciar_membros')) { toast('Sem permissão', 'error'); return; }
  showModal(`<div class="modal-hdr"><span>${lc("pencil", 14)}</span><h2>Editar Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="edit-mem-body"><div class="loading-page"><div class="spinner"></div></div></div>`);
  q('membros').select('*').eq('id', id).single().then(({ data: m }) => {
    if (!m) return;
    $('edit-mem-body').innerHTML = `
    <div class="form-group"><label>Nome</label><input id="em-nome" value="${escHtml(m.nome)}"/></div>
    <div class="form-row"><div class="form-group"><label>Cargo</label><select id="em-cargo">${CARGOS.map(c => `<option${c === m.cargo ? ' selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Idade</label><input id="em-idade" type="number" value="${m.idade || ''}"/></div></div>
    <div class="form-group"><label>Telefone</label><input id="em-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)" value="${escHtml(m.telefone || '')}"/></div>
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

window._saveMembroDesativado_ajuste = async function (id) {
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

window._openMemberModalDesativado_ajuste = async function (id) {
  showModal(loadingPage());
  const { data: m, error } = await q('membros').select('*').eq('id', id).single();
  if (error || !m) { closeModal(); toast('Erro', 'error'); return; }
  const ebdInfo = m.frequenta_ebd ? `<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:#38bdf8;margin-bottom:4px">${lc("book-open", 14)} Escola Bíblica Dominical</div><div class="c3">Papel: <strong style="color:var(--txt)">${escHtml(m.papel_ebd || 'Aluno')}</strong></div></div>` : '';
  const vocacaoInfo = m.vocacao ? `<div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:10px;padding:12px 16px;margin:0 30px 12px;font-size:.82rem"><div class="fw5" style="color:var(--gold);margin-bottom:4px">${lc("sparkles", 14)} Vocação</div><div class="c2">${escHtml(m.vocacao)}</div></div>` : '';
  showModal(`<div class="mem-profile"><button class="modal-close" style="position:absolute;top:14px;right:14px" onclick="closeModal()">✕</button><div class="mem-av-lg" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><div class="mem-modal-name">${escHtml(m.nome)}</div><span class="tag tag-gold">${escHtml(m.cargo)}</span>${m.frequenta_ebd ? `<span class="tag tag-blue" style="margin-left:6px">${lc("book-open", 14)} EBD</span>` : ''}</div><div class="mem-info-grid"><div class="inf-item"><label>Idade</label><span>${m.idade || '—'} anos</span></div><div class="inf-item"><label>Telefone</label><span>${escHtml(m.telefone || '—')}</span></div><div class="inf-item"><label>Email</label><span style="font-size:.78rem">${escHtml(m.email || '—')}</span></div><div class="inf-item"><label>Batismo</label><span>${m.data_batismo ? fmtDate(m.data_batismo) : '—'}</span></div></div>${vocacaoInfo}${ebdInfo}<div class="mem-modal-foot">${m.telefone ? `<a href="https://wa.me/${m.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn btn-teal">${lc("message-circle", 14)} WhatsApp</a>` : ''} ${hasPerm('gerenciar_membros') ? `<button class="btn btn-secondary" onclick="openEditMembro('${m.id}')">${lc("pencil", 14)} Editar</button>` : ''}<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>`);
};
/* ──────────────────────────────────────────────────────────
   FIX 6 — Menu Global de Membros
   ──────────────────────────────────────────────────────────
   Adiciona a permissão, o item na sidebar e as telas de gestão
   globais de Membros.

   CONSOLIDAÇÃO: as funções de RENDERIZAÇÃO desta seção (tabela
   simples) foram desativadas abaixo — elas sobrescreviam (por
   ordem de carregamento) a versão em cards, mais completa, que
   já existe em adicao.js (mesma filtragem por setor, e ainda
   com um filtro extra de setor para quem vê todos). O restante
   deste bloco (menu lateral, wrapper de navigate, permissão
   'visualizar_membros') continua ativo normalmente.
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
      div.innerHTML = `<span class="nav-icon">${typeof lc === 'function' ? lc('users-2', 20) : ''}</span><span class="nav-lbl">Membros</span>`;
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

window._renderTodosMembrosDesativado_ajuste = async function() {
  const pc = document.getElementById('page-content');
  if (!pc) return;
  if (!hasPerm('visualizar_membros')) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc === 'function' ? lc('shield-off', 44) : ''}</div><p>Sem permissão.</p></div>`;
    return;
  }
  
  pc.innerHTML = loadingPage();
  
  let qMems = q('membros').select('*, congregacoes(nome), setores(nome)').order('nome');
  if (!canSeeAllSetores() && currentUser?.setor_id) {
    qMems = qMems.eq('setor_id', currentUser.setor_id);
  }
  
  const { data: mems, error } = await qMems;
  if (error) {
    pc.innerHTML = `<div class="empty"><div class="empty-ico">${typeof lc === 'function' ? lc('alert-triangle', 44) : ''}</div><p>${error.message}</p></div>`;
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
        ${typeof lc === 'function' ? lc('search', 16) : ''}
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

window._renderMembrosGlobalRowsDesativado_ajuste = function(membros) {
  if (!membros || !membros.length) return '<tr><td colspan="5" style="text-align:center;color:var(--c3);padding:24px">Nenhum membro encontrado.</td></tr>';
  return membros.map(m => {
    const act = `<button class="action-btn" title="Ver Perfil" onclick="openMemberModal('${m.id}')">${typeof lc === 'function' ? lc('eye', 14) : ''}</button> ${hasPerm('gerenciar_membros') ? `<button class="action-btn" title="Editar" onclick="openEditMembro('${m.id}')">${typeof lc === 'function' ? lc('pencil', 14) : ''}</button> <button class="action-btn" style="color:var(--red)" title="Excluir" onclick="delMembro('${m.id}')">${typeof lc === 'function' ? lc('trash', 14) : ''}</button>` : ''}`;
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

window._filterTodosMembrosDesativado_ajuste = function(qStr) {
  const t = qStr.toLowerCase();
  const arr = (window._allMembrosCache || []).filter(m => m.nome.toLowerCase().includes(t));
  const tb = document.querySelector('#membros-global-table tbody');
  if (tb) {
    tb.innerHTML = renderMembrosGlobalRows(arr);
    refreshLucide();
  }
};

window._openAddMembroGlobalDesativado_ajuste = async function() {
  if (!hasPerm('gerenciar_membros')) return toast('Sem permissão', 'error');
  
  showModal(`<div class="modal-hdr"><span>+</span><h2>Novo Membro</h2><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body" id="add-membro-global-body"><div class="loading-page"><div class="spinner"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitAddMembroGlobal()">${typeof lc === 'function' ? lc('save', 14) : ''} Salvar</button></div>`);
  
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
    <div class="form-group"><label>Telefone</label><input id="amg-tel" type="tel" inputmode="tel" placeholder="+55 (81) 99999-9999" oninput="pfMascaraTel(this)"/></div>
    <div class="form-group"><label>Email</label><input id="amg-email" type="email"/></div>
   <div class="form-group">
  <label>Vocação</label>
  <textarea id="amg-vocacao" rows="2" placeholder="Ex: Evangelismo, Misericórdia..."></textarea>
</div>

<div class="form-section-title">
  ${typeof lc === 'function' ? lc('shield', 14) : ''} Atuação
</div>

${pfAtuacaoSelectHtml('amg', '', '')}

<div class="form-section-title">
  ${typeof lc === 'function' ? lc('book-open', 14) : ''} EBD
</div>
    <div class="form-row">
      <div class="form-group"><label>Frequenta EBD?</label><select id="amg-ebd"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="form-group"><label>Papel na EBD</label><select id="amg-papel-ebd"><option value="">—</option><option value="Aluno">Aluno</option><option value="Professor">Professor</option><option value="Superintendente">Superintendente</option></select></div>
    </div>
  `;
  setTimeout(() => {
    window.updateCongsGlobal();
    pfAtualizarEspecifico('amg');
}, 50);
};

window._updateCongsGlobalDesativado_ajuste = function() {
  const sid = document.getElementById('amg-setor')?.value;
  const cSel = document.getElementById('amg-cong');
  if (!cSel) return;
  if (!sid) { cSel.innerHTML = '<option value="">— Selecione Setor —</option>'; return; }
  const cgs = (window._cacheCongsGlobal || []).filter(c => c.setor_id === sid);
  cSel.innerHTML = cgs.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('') || '<option value="">Nenhuma congregação</option>';
};

window._submitAddMembroGlobalDesativado_ajuste = async function() {
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

    atuacao: document.getElementById('amg-atuacao')?.value || null,
    atuacao_especifico: document.getElementById('amg-especifico')?.value || null,

    frequenta_ebd: document.getElementById('amg-ebd')?.value === 'true',
    papel_ebd: document.getElementById('amg-papel-ebd')?.value || null
};

  const { error } = await q('membros').insert(payload);
  if (error) return toast(error.message, 'error');
  toast('Membro adicionado!'); closeModal(); renderTodosMembros();
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

/* ───────── patch_umadalpe_eventos.js ───────── */
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
/* Esconde TODO o bloco de realização (participantes, visitas, resultados,
   ofertas) quando a data escolhida é futura, mostrando um aviso — igual ao
   evento setorial. O evento é salvo como rascunho e os dados são preenchidos
   depois, no "Finalizar". Volta a mostrar tudo se a data for hoje/passada. */
function pfCongFuturoToggle() {
  const di = document.getElementById('ev-data');
  if (!di) return;
  const upd = () => {
    const futuro = di.value > new Date().toISOString().slice(0, 10);
    const bloco = document.getElementById('ev-dados-realizacao');
    document.getElementById('ev-futuro-notice')?.remove();
    if (bloco) bloco.style.display = futuro ? 'none' : '';
    if (futuro) {
      const n = document.createElement('div');
      n.id = 'ev-futuro-notice'; n.className = 'futuro-notice';
      n.innerHTML = `${lc('shield', 14)} <strong>Evento futuro:</strong> agende agora só com data, horário e resumo. Os participantes e os demais dados você preenche depois, tocando em <strong>Finalizar</strong> após a realização.`;
      di.parentElement.insertAdjacentElement('afterend', n);
    }
  };
  di.addEventListener('change', upd);
  upd();
}

/* Reabre o modal de evento em modo "Finalizar" para um rascunho agendado. */
window.openFinalizarEvento = function (id) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  return window.openEventModal(null, id);
};

window.openEventModal = async function (tipo, finalizeId = null) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  $('event-menu')?.classList.add('hidden');
  if (typeof pfResetVisitas === 'function') pfResetVisitas();

  // Modo "Finalizar": carrega o rascunho para preencher os dados reais e
  // publicar. Data e tipo vêm do evento agendado.
  let evFin = null;
  if (finalizeId) {
    const { data: evLoad } = await q('eventos').select('*').eq('id', finalizeId).single();
    if (!evLoad) { toast('Evento não encontrado', 'error'); return; }
    evFin = evLoad;
    tipo = evLoad.tipo;
  }

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
  const dataInicial = evFin ? (evFin.data || '') : new Date().toISOString().slice(0, 10);

  showModal(`<div class="modal-hdr"><span>${lc(info.icon, 20)}</span><h2>${evFin ? 'Finalizar' : 'Registrar'}: ${info.label}</h2><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Data *</label><input id="ev-data" type="date" value="${dataInicial}" ${evFin ? 'disabled' : ''}/></div>
    <div class="form-row">
      <div class="form-group"><label>Horário Início</label><input id="ev-inicio" type="time" value="${evFin?.hora_inicio || ''}"/></div>
      <div class="form-group"><label>Horário Fim</label><input id="ev-fim" type="time" value="${evFin?.hora_fim || ''}"/></div>
    </div>
    <div class="form-group"><label>Resumo / Obs.</label><textarea id="ev-resumo" rows="2" style="resize:vertical">${escHtml(evFin?.resumo || '')}</textarea></div>
    <div id="ev-dados-realizacao">
    ${camposEspecificos}
    ${pfCamposComunsHtml()}
    ${ehEvangelistico ? pfCamposEvangelisticosHtml() : pfCampoBencaosHtml()}
    ${tipo === 'evangelismo' ? '' : pfCampoOfertasHtml()}
    <div class="form-group"><label>${ehEBD ? 'Alunos/Professores (EBD)' : 'Participantes da Congregação'}</label>
    <p class="fs-xs c3" style="margin-bottom:6px">Marque os presentes — o total será calculado automaticamente.</p>
    <div class="member-select-list" id="ev-mems-local">${memsParaLista.map(m => `<label class="check-row"><input type="checkbox" class="ev-mem-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}${m.papel_ebd ? ' · ' + m.papel_ebd : ''}</em></span></label>`).join('') || '<p class="c3 fs-xs">Nenhum membro cadastrado.</p>'}</div></div>
    ${!ehEBD ? `<div class="form-group"><label>Externos (mesmo setor)</label><input id="ev-ext-search" placeholder="Buscar..." oninput="filterExtMembers(this.value)" style="margin-bottom:8px"/><div class="member-select-list" id="ev-mems-ext" style="max-height:140px">${(allMems || []).map(m => `<label class="check-row ev-ext-row"><input type="checkbox" class="ev-ext-check" value="${m.id}" data-nome="${escHtml(m.nome)}"/><div class="av av-sm" style="background:${avatarColor(m.nome)}">${initials(m.nome)}</div><span>${escHtml(m.nome)} <em class="c3">${escHtml(m.cargo)}</em></span></label>`).join('') || '<p class="c3 fs-xs">Sem externos.</p>'}</div></div>` : ''}
    ${typeof pfVisitasSectionHtml === 'function' ? pfVisitasSectionHtml() : ''}
    </div>
  </div>
  <div class="modal-foot"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="submitEvento('${tipo}'${evFin ? `,'${finalizeId}'` : ''})">${lc(evFin ? "check-circle" : "plus-circle", 14)} ${evFin ? 'Finalizar' : 'Registrar'}</button></div>`);

  // Só na criação: se a data for futura, esconde o bloco de realização e o
  // evento é salvo como rascunho. No modo Finalizar mostramos tudo.
  if (!evFin) setTimeout(() => pfCongFuturoToggle(), 60);
};

/* ───────────────────────────────────────────────────────────
   4) SUBMIT — salva os campos novos + mantém visitas de obreiros
   ─────────────────────────────────────────────────────────── */
window.submitEvento = async function (tipo, finalizeId = null) {
  if (!hasPerm('registrar_eventos')) { toast('Sem permissão', 'error'); return; }
  const data = $('ev-data')?.value; if (!data) { toast('Data é obrigatória', 'error'); return; }
  const hoje = new Date().toISOString().slice(0, 10);
  // Na criação (sem finalizeId) uma data futura é agendada como rascunho; ao
  // finalizar já é a realização, então nunca é tratada como futura.
  const futuro = !finalizeId && data > hoje;
  const resumo = ($('ev-resumo')?.value || '').trim();

  // ── Criação de evento FUTURO → agenda como rascunho (igual ao setorial):
  //    só data/horário/resumo; participantes e demais dados ficam para o
  //    "Finalizar" depois da realização.
  if (futuro) {
    const payload = {
      congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data, resumo,
      hora_inicio: $('ev-inicio')?.value || null, hora_fim: $('ev-fim')?.value || null,
      participantes: 0, participante_ids: [],
      status: 'rascunho',
    };
    const { data: novo, error } = await q('eventos').insert(payload).select().single();
    if (error) { toast(error.message, 'error'); return; }
    toast('Evento agendado como rascunho.'); closeModal();
    if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo, resumo }); } catch (_) {} }
    renderSetores();
    return;
  }

  const localChecked = [...document.querySelectorAll('.ev-mem-check:checked')].map(c => c.value);
  const extChecked = [...document.querySelectorAll('.ev-ext-check:checked')].map(c => c.value);
  const visitantesObreiros = typeof pfColetarVisitantesSelecionados === 'function' ? pfColetarVisitantesSelecionados() : [];
  const participanteIds = [...new Set([...localChecked, ...extChecked, ...visitantesObreiros])];

  const num = id => parseInt($(id)?.value) || 0;
  const money = id => canSeeFinanceiro() ? (parseFloat($(id)?.value) || 0) : 0;

  const payload = {
    congregacao_id: navState.cong.id, setor_id: navState.setor.id, tipo, data,
    resumo,
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

  // ── Finalizar um rascunho → atualiza o evento existente e publica.
  if (finalizeId) {
    const { data: novo, error } = await q('eventos').update(payload).eq('id', finalizeId).select().single();
    if (error) { toast(error.message, 'error'); return; }
    toast('Evento finalizado!'); closeModal();
    if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: finalizeId, tipo, resumo }); } catch (_) {} }
    renderSetores();
    return;
  }

  const { data: novo, error } = await q('eventos').insert(payload).select().single();
  if (error) { toast(error.message, 'error'); return; }
  toast('Evento registrado!'); closeModal();
  // Notifica este aparelho (o Realtime cuida dos demais usuários) com o som.
  if (typeof pfNotificarEventoCriado === 'function') { try { pfNotificarEventoCriado(novo || { id: null, tipo, resumo }); } catch (_) {} }
  renderSetores();
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
  const jovensMatriculados = eventos.filter(e => e.tipo === 'jovens_matriculados').length;

  // Lista compacta em vez de 16 stat-cards grandes (era a tela mais
  // poluída do sistema — aqui é só contagem, não precisa do peso visual
  // de um card cheio por item)
  const row = (icon, val, label) => `<div class="rel-total-row"><span class="rel-total-ico">${icon}</span><span class="rel-total-lbl">${label}</span><span class="rel-total-val">${val}</span></div>`;
  const groupLbl = txt => `<div class="rel-total-group-lbl">${txt}</div>`;

  const bloco = document.createElement('div');
  bloco.innerHTML = `
  <div class="sec-hdr" style="margin-top:8px"><h2>${lc('shield', 18)} Totalizadores UMADALPE</h2><span class="tag tag-primary">100% automático — calculado dos eventos</span></div>
  <div class="rel-total-list">
    ${groupLbl('Espiritual')}
    ${row(lc('cross', 16), somar('almas_salvas'), 'Almas Salvas')}
    ${row(lc('heart-handshake', 16), somar('desviados_voltaram_campo'), 'Desviados que Voltaram')}
    ${row(lc('sparkles', 16), somar('batismo_espirito'), 'Batismo no Espírito')}
    ${row(lc('sparkles', 16), somar('renovo'), 'Renovo')}

    ${groupLbl('Evangelismo')}
    ${canSeeFinanceiro() ? row(lc('coins', 16), fmtMoney(somar('ofertas')), 'Ofertas') : ''}
    ${row(lc('user', 16), somar('evangelizados'), 'Pessoas Evangelizadas')}
    ${row(lc('book-open', 16), somar('literaturas_distribuidas'), 'Literaturas Distribuídas')}
    ${row(lc('sun', 16), presentesEvangelismo, 'Presentes no Evangelismo')}

    ${groupLbl('Visitas')}
    ${row(lc('handshake', 16), somar('visitas_recebidas_umadalpe'), 'Visitas Recebidas UMADALPE')}
    ${row(lc('briefcase', 16), somar('visita_coordenacao_setor'), 'Visita da Coordenação')}
    ${row(lc('shield-check', 16), somar('visita_superintendencia'), 'Visita da Superintendência')}
    ${row(lc('church', 16), somar('visita_obreiro_congregacao'), 'Visita do Obreiro')}
    ${row(lc('users', 16), somar('visitas_ministerio'), 'Visitas do Ministério')}

    ${groupLbl('Outros')}
    ${row(lc('gift', 16), somar('bencaos_alcancadas'), 'Bênçãos Agradecidas')}
    ${row(lc('check-circle', 16), convocacoesAtendidas, 'Convocações Atendidas')}
    ${row(lc('hand', 16), presentesOracao, 'Presentes na Oração')}
    ${row(lc('graduation-cap', 16), jovensMatriculados, 'Jovens Matriculados')}
  </div>`;

  const chartsGrid = pc.querySelector('.charts-grid');
  if (chartsGrid && chartsGrid.parentElement === pc) {
    pc.insertBefore(bloco, chartsGrid.nextSibling);
  } else {
    pc.appendChild(bloco);
  }
  refreshLucide();
};

console.log('[patch_umadalpe_eventos] carregado ✓');

/* ══════════════════════════════════════════════════════════
   CENTRAL DE AJUDA
   Painel próprio (não usa showModal) porque precisa de navegação
   interna (coleções → artigo) e ocupar a tela toda no celular.
══════════════════════════════════════════════════════════ */
const HELP_DATA = [
  {
    id: 'inicio', icon: 'log-in', title: 'Primeiros passos', desc: 'Login, navegação e preferências',
    articles: [
      {
        id: 'entrar', title: 'Como entrar no sistema', desc: 'Usuário, senha e o que fazer se esquecer.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['A tela de login pede o usuário e a senha cadastrados por um administrador ou dirigente do seu setor. Não existe cadastro próprio dentro do sistema — quem cria seu acesso é sempre alguém com permissão de gerenciar usuários.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Digite seu usuário no primeiro campo.', 'Digite sua senha e pressione Enter, ou toque em "Entrar no Sistema".', 'No campo de senha, toque no ícone de olho para conferir o que digitou antes de enviar.'] },
          { icon: '🔒', h: 'Bloqueio por senha errada', p: ['Por segurança, errar a senha muitas vezes seguidas (10 vezes em 15 minutos) trava o acesso daquele usuário temporariamente. Basta esperar 15 minutos e tentar de novo — ou pedir a um administrador para liberar na hora, pela tela "Usuários Bloqueados".'] },
          { icon: '❓', h: 'Esqueci minha senha', p: ['Fale com um administrador ou dirigente do seu setor — só quem tem permissão de gerenciar usuários pode cadastrar uma senha nova para você.'] }
        ]
      },
      {
        id: 'navegar', title: 'Navegando pelo menu', desc: 'Menu lateral, atalhos e o menu no celular.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O menu lateral (à esquerda no computador) reúne todas as telas que você tem permissão de acessar. No celular ele fica escondido — toque no ícone ☰ no canto superior esquerdo para abrir.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['No computador, toque na seta ao lado do logo para recolher o menu e ganhar mais espaço de tela.', 'No celular, toque em qualquer item do menu para navegar — ele fecha sozinho depois.', 'O nome da tela atual sempre aparece no topo, ao lado do ícone de ajuda.'] }
        ]
      },
      {
        id: 'tema', title: 'Tema claro e escuro', desc: 'O interruptor no topo da tela e o que ele muda.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O sistema tem dois temas de cores. O interruptor com lua e sol, no canto superior direito, alterna entre eles. A escolha fica salva neste aparelho — da próxima vez que você entrar, o tema escolhido continua o mesmo.'] }
        ]
      },
      {
        id: 'notificacoes', title: 'Notificações', desc: 'O sino no topo e como ativar avisos de eventos.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O sino no topo da tela liga e desliga as notificações deste aparelho. Quando está aceso (colorido), você recebe um aviso — com um som curto — sempre que um evento é criado, tanto no seu aparelho quanto no de quem criou. Quando está apagado, nenhum aviso e nenhum som são gerados.'] },
          { icon: '⏱️', h: 'Como ativar', list: ['Toque no sino. Na primeira vez, o navegador pergunta se você permite notificações — toque em "Permitir".', 'O sino aceso confirma que está ativado; toque de novo para desativar.', 'Se o navegador estiver bloqueando, libere as notificações do site nas configurações do navegador.'] },
          { icon: '💡', h: 'O som do aviso', p: ['Com as notificações ativas, cada novo evento também toca um som curto de aviso. Para os demais usuários ouvirem na hora, eles precisam estar com o app aberto; se o app estiver fechado, o aviso depende da configuração de notificações do sistema.'] },
          { icon: '💡', h: 'Ao tocar no aviso', p: ['Tocar na notificação abre o sistema já na tela do evento. Se você estiver com a sessão salva, entra direto; se não estiver logado, cai na tela de login e segue para o evento depois que você entrar.'] }
        ]
      }
    ]
  },
  {
    id: 'dashboard', icon: 'layout-dashboard', title: 'Dashboard', desc: 'O resumo da sua igreja',
    articles: [
      {
        id: 'resumo', title: 'Entendendo o resumo', desc: 'O que cada card do topo mostra.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['A tela inicial reúne, em um só lugar, os números principais do seu setor: quantos setores, congregações, membros e eventos existem, além dos próximos compromissos e eventos recentes.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Toque em qualquer um dos 4 cards do topo (Setores, Congregações, Membros, Eventos) para ir direto para aquela tela.', 'Toque no ícone de atualizar (as duas setas), ao lado do seu nome, para recarregar os números sem sair da tela.'] }
        ]
      },
      {
        id: 'filtro-setor', title: 'Filtrar por setor e congregação', desc: 'Para quem enxerga mais de um setor.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Se sua permissão permite ver mais de um setor, um pequeno card de filtro aparece no topo do dashboard. Por padrão ele já vem marcado com o seu próprio setor.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Escolha outro setor na primeira lista para ver o resumo dele.', 'Se o setor tiver mais de uma congregação, uma segunda lista deixa você restringir para só uma delas.', 'Quem não tem essa permissão vê o nome do próprio setor fixo, sem poder trocar.'] }
        ]
      },
      {
        id: 'financeiro-mes', title: 'Financeiro do mês', desc: 'O card com a meta de arrecadação.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Card exclusivo de quem tem permissão de ver dados financeiros. Mostra o total de ofertas e dízimos do mês atual, comparado a uma meta, além do detalhamento de cada um.'] }
        ]
      }
    ]
  },
  {
    id: 'setores', icon: 'map-pin', title: 'Setores e Congregações', desc: 'A estrutura da sua igreja',
    articles: [
      {
        id: 'estrutura', title: 'Como o sistema é organizado', desc: 'Setor, congregação e membros.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['A organização segue três níveis: um Setor agrupa várias Congregações, e cada Congregação tem seus próprios Membros. Quase todo filtro do sistema (relatórios, eventos, ranking) segue essa mesma hierarquia.'] }
        ]
      },
      {
        id: 'editar-congregacao', title: 'Cadastrar e editar uma congregação', desc: 'Liderança, endereço e mapa.',
        sections: [
          { icon: '⏱️', h: 'Como fazer', list: ['Abra o setor e toque em "+ Congregação" (só aparece pra quem tem permissão de gerenciar congregações).', 'Preencha nome, endereço e a liderança (pastor local, dirigente, vice-dirigente, secretária, auxiliares).', 'Toque no card de um líder para ver se o nome digitado corresponde a um usuário cadastrado no sistema.'] },
          { icon: '💡', h: 'Sobre o endereço', p: ['Quando o endereço é preenchido, o sistema mostra links diretos para abrir a localização no Google Maps ou no Waze.'] }
        ]
      },
      {
        id: 'agenda-semana', title: 'Agenda semanal da congregação', desc: 'Compromissos dos próximos 7 dias.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Cada congregação tem uma agenda com os compromissos dos próximos dias — cultos extras, reuniões, visitas marcadas.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Na página da congregação, toque no "+" ao lado de "Agenda da Semana" para adicionar um compromisso.', 'Toque em "Ver completa" para ver a agenda inteira, não só os próximos 7 dias.'] },
          { icon: '❓', h: 'Não consigo escolher uma data passada', p: ['A agenda é para compromissos futuros, então não é possível adicionar um item com data anterior a hoje. Ao criar, o calendário já bloqueia os dias que passaram.'] }
        ]
      }
    ]
  },
  {
    id: 'membros', icon: 'users', title: 'Membros', desc: 'Cadastro e busca de membros',
    articles: [
      {
        id: 'cadastrar-membro', title: 'Cadastrar um membro', desc: 'Campos, EBD e área de atuação.',
        sections: [
          { icon: '⏱️', h: 'Como fazer', list: ['Toque em "+ Membro" na tela de Membros ou dentro de uma congregação.', 'Preencha nome, cargo e, se souber, telefone, e-mail e data de batismo.', 'Marque "Frequenta EBD" se for o caso, e informe a atuação (Superintendência, Coordenação ou Liderança) quando se aplicar.'] }
        ]
      },
      {
        id: 'buscar-membro', title: 'Buscar e filtrar membros', desc: 'Encontrar alguém rapidamente.',
        sections: [
          { icon: '⏱️', h: 'Como fazer', list: ['Na tela de Membros, digite o nome no campo de busca — a lista filtra enquanto você digita.', 'Se você enxerga mais de um setor, use o filtro de setor para restringir a busca.'] }
        ]
      },
      {
        id: 'jovens-fora-umadalpe', title: 'Jovens (Fora UMADALPE)', desc: 'Cadastro de jovens que ainda não são da UMADALPE.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Um cadastro à parte, para acompanhar jovens que ainda não fazem parte da UMADALPE — com dados de contato e o responsável, quando for menor de idade. Aparece só para quem tem permissão de ver ou gerenciar esse cadastro.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Abra a tela "Jovens (Fora UMADALPE)".', 'Toque em "+ Novo" para cadastrar: nome, sexo, data de nascimento, telefone, responsável, endereço (bairro, cidade, estado) e a congregação de referência.', 'Use a busca por nome para achar alguém; toque no olho para ver, no lápis para editar. Quem gerencia também pode excluir.'] }
        ]
      }
    ]
  },
  {
    id: 'eventos', icon: 'calendar-days', title: 'Eventos e Relatórios', desc: 'Registrar atividades e ver números',
    articles: [
      {
        id: 'registrar-evento', title: 'Registrar um culto ou evento', desc: 'Os tipos de evento disponíveis.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Todo culto, EBD, visita, saída evangelística ou atividade da congregação é registrado como um "evento". É a partir desses registros que os relatórios, o ranking e o dashboard calculam seus números — nada é somado manualmente.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Toque em "+ Evento" e escolha o tipo (culto, EBD, evangelismo, visita, etc.).', 'Preencha data, participantes e os campos específicos daquele tipo de evento.', 'Salve — o evento entra automaticamente nos totais do setor e da congregação.'] },
          { icon: '💰', h: 'Campos de oferta', p: ['O campo de Ofertas (R$) só aparece nos tipos de evento em que faz sentido registrar arrecadação — como cultos — e apenas para quem tem permissão de ver dados financeiros. Eventos de Evangelismo não têm campo de oferta, já que a coleta não é registrada nesse tipo de atividade.'] }
        ]
      },
      {
        id: 'status-evento', title: 'Rascunho, pendente e publicado', desc: 'Por que um evento pode não aparecer nos números.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Um evento pode estar como rascunho, pendente ou publicado. Cada congregação e cada setor define o próprio fluxo de aprovação, então, se um número parecer menor do que o esperado, vale conferir se o evento correspondente já foi publicado.'] }
        ]
      },
      {
        id: 'filtrar-relatorio', title: 'Filtrar relatórios por período', desc: 'Atalhos de data e exportação em PDF.',
        sections: [
          { icon: '⏱️', h: 'Como fazer', list: ['Na tela de Relatórios, use os atalhos "Esta semana", "Este mês" etc. para preencher o período rapidamente, ou escolha datas manualmente.', 'Toque em "Filtrar" para atualizar os números com o período escolhido.', 'Quem tem permissão de exportar dados encontra um botão "PDF" no topo da tela.'] }
        ]
      },
      {
        id: 'eventos-setoriais', title: 'Eventos setoriais', desc: 'Agendar, finalizar e acompanhar eventos do setor.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Diferente do evento de uma única congregação, o evento setorial reúne o setor todo (encontros, congressos, mutirões). Tem uma tela própria e aparece para quem tem permissão de criar eventos setoriais ou de vê-los no dashboard.'] },
          { icon: '⏱️', h: 'Agendar um evento futuro', list: ['Toque em "+ Novo Evento Setorial".', 'Se a data for futura, você preenche só data, horário, setor e título — os participantes e as conversões ficam para depois. O evento fica marcado como "Agendado".', 'Se a data for hoje, você já pode marcar os participantes e as conversões na hora.'] },
          { icon: '⏱️', h: 'Finalizar depois da realização', list: ['Na lista "Eventos Registrados", os eventos agendados mostram um botão "Finalizar".', 'Ao finalizar, informe as conversões e marque quem participou: participantes do setor, pessoas de fora do setor e obreiros (cada lista tem busca por nome).', 'Ao publicar, o evento sai de "Agendado" e, se as notificações estiverem ativadas, um aviso é enviado.'] },
          { icon: '💡', h: 'Ver os detalhes', p: ['Toque em qualquer evento (na lista de eventos registrados ou no card do dashboard) para abrir os detalhes: setor, data, horário, situação, participantes e conversões. A lista de "Usuários do Setor" tem busca por nome e rola sozinha quando passa de 5 pessoas.'] }
        ]
      }
    ]
  },
  {
    id: 'permissoes', icon: 'shield-check', title: 'Permissões', desc: 'Quem pode ver e fazer o quê',
    articles: [
      {
        id: 'papeis', title: 'Papéis do sistema', desc: 'Admin, dirigente, adjunto e usuário.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Cada pessoa tem um papel (role) — admin, dirigente, adjunto ou usuário — que define um conjunto padrão de permissões. Administradores enxergam e ajustam essas permissões na tela de Permissões.'] }
        ]
      },
      {
        id: 'permissao-individual', title: 'Permissão individual', desc: 'Quando alguém precisa de um acesso diferente do seu papel.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Além da permissão do papel, é possível liberar ou bloquear uma permissão específica para uma pessoa, sem mudar o papel dela — útil quando alguém precisa de um acesso pontual a mais ou a menos.'] }
        ]
      }
    ]
  },
  {
    id: 'ranking', icon: 'trophy', title: 'Ranking', desc: 'Como a apuração funciona',
    articles: [
      {
        id: 'apuracao', title: 'Como a apuração funciona', desc: 'Os níveis vermelho, amarelo e verde.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O ranking classifica cada congregação em vermelho, amarelo ou verde, de acordo com a quantidade de eventos registrados na semana ou no mês — os limites de cada faixa são configurados pelo administrador.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Registre os eventos normalmente — a apuração é automática, não existe lançamento manual de pontos.', 'Toque em uma congregação no ranking para ver o detalhamento de como ela chegou naquele nível.'] }
        ]
      }
    ]
  },
  {
    id: 'usuarios', icon: 'user-cog', title: 'Usuários do Sistema', desc: 'Criar acessos e definir papéis',
    articles: [
      {
        id: 'criar-usuario', title: 'Criar e editar um usuário', desc: 'Login, senha, papel e setor.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['A tela de Usuários é onde se cadastram as pessoas que fazem login no sistema. Só aparece para quem tem permissão de gerenciar usuários, e quem não enxerga todos os setores vê apenas os usuários do próprio setor.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Toque em "+ Novo" para abrir o cadastro.', 'Preencha nome, usuário (login) e senha, escolha o papel (admin, dirigente, adjunto ou usuário) e vincule o setor e a congregação.', 'Use a busca no topo para encontrar alguém pelo nome.', 'Toque em um usuário existente para editar seus dados ou trocar a senha.'] },
          { icon: '🔒', h: 'Ativar e desativar', p: ['Em vez de excluir, você pode marcar um usuário como inativo — ele perde o acesso mas o histórico dele nos eventos é preservado.'] }
        ]
      },
      {
        id: 'usuarios-bloqueados', title: 'Usuários bloqueados', desc: 'Liberar quem travou o acesso por errar a senha.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['Quando alguém erra a senha 10 vezes em 15 minutos, o acesso daquele usuário é travado por segurança. A tela "Usuários Bloqueados" mostra quem está travado no momento e aparece só para quem tem a permissão "Usuários Bloqueados".'] },
          { icon: '⏱️', h: 'Como liberar', list: ['Abra a tela "Usuários Bloqueados" no menu.', 'Cada usuário travado mostra quantas tentativas teve, o horário da última e em quanto tempo o desbloqueio acontece sozinho.', 'Toque em "Liberar" para devolver o acesso na hora, sem esperar os 15 minutos.', 'Use "Atualizar" para recarregar a lista.'] }
        ]
      }
    ]
  },
  {
    id: 'frequencia', icon: 'trending-up', title: 'Frequência', desc: 'Presença dos membros nos eventos',
    articles: [
      {
        id: 'entender-frequencia', title: 'Entendendo a frequência', desc: 'De onde vêm os percentuais.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['A tela de Frequência mostra, para cada membro, quanto ele participou dos eventos no período escolhido. O percentual é calculado a partir de quem foi marcado como presente ao registrar cada evento — por isso é importante marcar os participantes corretamente.'] },
          { icon: '💡', h: 'Duas medidas', p: ['Cada membro tem dois percentuais: a frequência em relação a TODOS os eventos e a frequência apenas nos cultos e atividades evangelísticas. A lista já vem ordenada de quem participa mais para quem participa menos.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Ajuste o período (início e fim) para a faixa de datas que deseja analisar.', 'Se você enxerga mais de um setor, use os filtros de setor e congregação.', 'Quem tem permissão de exportar dados pode gerar a frequência em PDF ou Excel.'] }
        ]
      }
    ]
  },
  {
    id: 'financeiro', icon: 'credit-card', title: 'Financeiro (Licenças)', desc: 'Controle de licenças e vencimentos',
    articles: [
      {
        id: 'licencas', title: 'Controle de licenças', desc: 'Cadastro, renovação e vencimento.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O módulo Financeiro controla as licenças de acesso: cada licença tem uma data de início e fim, e o sistema sinaliza em verde (em dia), amarelo (vence em breve, próximos 7 dias) ou vermelho (vencida). Só aparece para quem tem permissão de gerenciar financeiro.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Cadastre uma licença informando o usuário e o período de validade.', 'Use "Renovar" para estender a licença por mais 30 dias sem recadastrar.', 'Acompanhe pela cor e pela barra de progresso quanto tempo falta para cada vencimento.'] }
        ]
      }
    ]
  },
  {
    id: 'calendario', icon: 'calendar-days', title: 'Calendário Anual', desc: 'A agenda geral do ano',
    articles: [
      {
        id: 'ver-calendario', title: 'Consultar o calendário do ano', desc: 'Datas e eventos fixos da UMADALPE.',
        sections: [
          { icon: '💡', h: 'O que é', p: ['O Calendário reúne, em uma visão anual, as datas e eventos oficiais — congressos, vigílias, encontros e demais compromissos marcados para o ano inteiro.'] },
          { icon: '⏱️', h: 'Como fazer', list: ['Abra "Calendário" no menu lateral.', 'Percorra os meses para ver os compromissos de cada período.', 'Use o interruptor de tema (claro/escuro) do próprio calendário para ajustar a leitura.'] }
        ]
      }
    ]
  }
];

window._helpState = { view: 'home', collectionId: null, articleId: null, query: '' };

function helpIcon(name, size) { return typeof lc === 'function' ? lc(name, size || 18) : ''; }

function openHelpCenter() {
  const el = $('help-center');
  if (!el) return;
  window._helpState = { view: 'home', collectionId: null, articleId: null, query: '' };
  const input = $('help-search-input');
  if (input) input.value = '';
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderHelpCenter();
}

function closeHelpCenter() {
  const el = $('help-center');
  if (!el) return;
  el.classList.add('hidden');
  document.body.style.overflow = '';
}

function helpOverlayClick(e) { if (e.target.id === 'help-center') closeHelpCenter(); }

function helpBack() {
  const st = window._helpState;
  if (st.view === 'article') { st.view = 'collection'; st.articleId = null; }
  else { helpGoHome(); return; }
  renderHelpCenter();
}

function helpGoHome() {
  window._helpState = { view: 'home', collectionId: null, articleId: null, query: '' };
  const i = $('help-search-input'); if (i) i.value = '';
  renderHelpCenter();
}

function helpGoCollection(id) {
  window._helpState = { view: 'collection', collectionId: id, articleId: null, query: '' };
  renderHelpCenter();
}

function helpGoArticle(cid, aid) {
  window._helpState.view = 'article';
  window._helpState.collectionId = cid;
  window._helpState.articleId = aid;
  renderHelpCenter();
}

function helpSearch(q) {
  window._helpState.query = q;
  window._helpState.view = q.trim() ? 'search' : 'home';
  renderHelpCenter();
}

function renderHelpCenter() {
  const body = $('help-body');
  const backBtn = $('help-back-btn');
  if (!body) return;
  const st = window._helpState;
  if (backBtn) backBtn.classList.toggle('hidden', st.view === 'home');

  if (st.view === 'search') body.innerHTML = helpRenderSearch(st.query);
  else if (st.view === 'collection') body.innerHTML = helpRenderCollection(st.collectionId);
  else if (st.view === 'article') body.innerHTML = helpRenderArticle(st.collectionId, st.articleId);
  else body.innerHTML = helpRenderHome();

  refreshLucide();
  body.scrollTop = 0;
}

function helpRenderHome() {
  return `
  <div class="help-hero">
    <h2>Como podemos ajudar?</h2>
    <p>Tire dúvidas sobre setores, membros, eventos, relatórios e mais.</p>
  </div>
  <div class="help-collections-lbl">Todas as coleções</div>
  <div class="help-collections-grid">
    ${HELP_DATA.map(c => `
    <div class="help-coll-card" onclick="helpGoCollection('${c.id}')">
      <div class="help-coll-ico">${helpIcon(c.icon, 20)}</div>
      <div class="help-coll-title">${c.title}</div>
      <div class="help-coll-desc">${c.desc}</div>
      <div class="help-coll-count">${c.articles.length} artigo${c.articles.length === 1 ? '' : 's'}</div>
    </div>`).join('')}
  </div>`;
}

function helpRenderCollection(cid) {
  const c = HELP_DATA.find(x => x.id === cid);
  if (!c) return '<div class="help-empty"><p>Coleção não encontrada.</p></div>';
  return `
  <div class="help-crumb"><span onclick="helpGoHome()">Central de ajuda</span><span class="help-crumb-sep">›</span><span class="help-crumb-cur">${c.title}</span></div>
  <div class="help-coll-header">
    <div class="help-coll-header-ico">${helpIcon(c.icon, 22)}</div>
    <div><h2>${c.title}</h2><p>${c.desc}</p></div>
  </div>
  <div class="help-article-list">
    ${c.articles.map(a => `
    <div class="help-article-row" onclick="helpGoArticle('${c.id}','${a.id}')">
      <div class="help-article-row-ico">${helpIcon('book-open', 16)}</div>
      <div class="help-article-row-text">
        <div class="help-article-row-title">${a.title}</div>
        <div class="help-article-row-desc">${a.desc}</div>
      </div>
      <div class="help-article-row-chev">${helpIcon('chevron-right', 16)}</div>
    </div>`).join('')}
  </div>`;
}

function helpRenderArticle(cid, aid) {
  const c = HELP_DATA.find(x => x.id === cid);
  const a = c && c.articles.find(x => x.id === aid);
  if (!c || !a) return '<div class="help-empty"><p>Artigo não encontrado.</p></div>';
  return `
  <div class="help-crumb"><span onclick="helpGoHome()">Central de ajuda</span><span class="help-crumb-sep">›</span><span onclick="helpGoCollection('${c.id}')">${c.title}</span></div>
  <article class="help-article">
    <h1>${a.title}</h1>
    <p class="help-article-lede">${a.desc}</p>
    ${a.sections.map(s => `
    <section class="help-section">
      <h3>${s.icon ? `<span class="help-section-emoji">${s.icon}</span>` : ''}${s.h}</h3>
      ${(s.p || []).map(t => `<p>${t}</p>`).join('')}
      ${s.list ? `<ul>${s.list.map(li => `<li>${li}</li>`).join('')}</ul>` : ''}
    </section>`).join('')}
  </article>
  <div class="help-article-foot">
    <button class="btn btn-secondary btn-sm" onclick="helpGoCollection('${c.id}')">${helpIcon('arrow-left', 14)} Voltar para ${c.title}</button>
  </div>`;
}

function helpRenderSearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return helpRenderHome();
  const results = [];
  HELP_DATA.forEach(c => c.articles.forEach(a => {
    const sectionText = (a.sections || []).map(s =>
      [s.h, ...(s.p || []), ...(s.list || [])].join(' ')
    ).join(' ');
    const haystack = (c.title + ' ' + a.title + ' ' + a.desc + ' ' + sectionText).toLowerCase();
    if (haystack.includes(q)) results.push({ c, a });
  }));
  return `
  <div class="help-crumb"><span onclick="helpGoHome()">Central de ajuda</span><span class="help-crumb-sep">›</span><span class="help-crumb-cur">Busca</span></div>
  <div class="help-coll-header"><div><h2>${results.length} resultado${results.length === 1 ? '' : 's'} para "${escHtml(query)}"</h2></div></div>
  ${results.length ? `<div class="help-article-list">
    ${results.map(r => `
    <div class="help-article-row" onclick="helpGoArticle('${r.c.id}','${r.a.id}')">
      <div class="help-article-row-ico">${helpIcon('book-open', 16)}</div>
      <div class="help-article-row-text">
        <div class="help-article-row-title">${r.a.title}</div>
        <div class="help-article-row-desc">${r.c.title} · ${r.a.desc}</div>
      </div>
      <div class="help-article-row-chev">${helpIcon('chevron-right', 16)}</div>
    </div>`).join('')}
  </div>` : `<div class="help-empty">${helpIcon('search-x', 32)}<p>Nada encontrado. Tente outras palavras.</p></div>`}`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const el = $('help-center');
    if (el && !el.classList.contains('hidden')) closeHelpCenter();
  }
});


/* ══════════════════════════════════════════════════════════════════════
   FEATURE — Usuários Bloqueados
   Permissão 'gerenciar_usuarios_bloqueados': quem tiver vê um menu lateral
   com os usuários travados pela proteção de força-bruta do login e um botão
   "Liberar" que zera as tentativas no banco (via RPC verificada por token).
   ══════════════════════════════════════════════════════════════════════ */
if (typeof PERM_DESC !== 'undefined') {
  PERM_DESC['gerenciar_usuarios_bloqueados'] = {
    label: 'Usuários Bloqueados',
    desc: 'Ver e liberar usuários bloqueados por errarem a senha muitas vezes.'
  };
}

const canGerBloqueados = () =>
  (typeof isSuperAdmin === 'function' && isSuperAdmin()) ||
  (typeof hasPerm === 'function' && hasPerm('gerenciar_usuarios_bloqueados'));

/* Injeta o item no menu lateral (logo após "Permissões"). Idempotente. */
function injetarMenuBloqueados() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[data-page="usuarios_bloqueados"]')) return;
  if (!canGerBloqueados()) return;
  const div = document.createElement('div');
  div.className = 'nav-item';
  div.dataset.page = 'usuarios_bloqueados';
  div.innerHTML = `<span class="nav-icon"><i data-lucide="user-x"></i></span><span class="nav-lbl">Usuários Bloqueados</span>`;
  div.addEventListener('click', () => { navigate('usuarios_bloqueados'); if (typeof toggleMobile === 'function') toggleMobile(false); });
  const permItem = nav.querySelector('[data-page="permissoes"]');
  if (permItem) nav.insertBefore(div, permItem.nextSibling); else nav.appendChild(div);
  if (typeof refreshLucide === 'function') refreshLucide();
}

/* Encaixa a injeção no fluxo pós-login já existente (pfInjetarMenusExtras roda
   quando currentUser e as permissões já estão carregados) e mantém um fallback
   por tempo, para o caso de restauração de sessão ao recarregar a página. */
if (typeof pfInjetarMenusExtras === 'function' && !window._injBloqueadosPatched) {
  window._injBloqueadosPatched = true;
  const _origInjExtras = pfInjetarMenusExtras;
  window.pfInjetarMenusExtras = function () {
    _origInjExtras();
    injetarMenuBloqueados();
  };
}
setTimeout(() => { try { injetarMenuBloqueados(); } catch (_) {} }, 900);

/* Roteamento: intercepta navigate('usuarios_bloqueados') e delega o resto. */
(function () {
  const _prevNav = window.navigate;
  if (typeof _prevNav === 'function' && !window._navPatchedBloqueados) {
    window._navPatchedBloqueados = true;
    window.navigate = function (page) {
      if (page === 'usuarios_bloqueados') {
        if (currentPage) pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
        currentPage = 'usuarios_bloqueados';
        document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === 'usuarios_bloqueados'));
        $('page-title').textContent = 'Usuários Bloqueados';
        renderUsuariosBloqueados();
        return;
      }
      _prevNav(page);
    };
  }
})();

window.renderUsuariosBloqueados = async function () {
  const pc = $('page-content'); if (!pc) return;
  if (!canGerBloqueados()) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('shield-off', 44)}</div><p>Sem permissão.</p></div>`; return; }
  pc.innerHTML = loadingPage();

  const { data, error } = await db.rpc('rpc_usuarios_bloqueados', { p_token: getSessionToken() });
  if (error) { pc.innerHTML = `<div class="empty"><div class="empty-ico">${lc('alert-triangle', 44)}</div><p>${escHtml(error.message || 'Erro ao carregar')}</p></div>`; return; }

  const bloqueados = data || [];
  window._bloqueadosCache = bloqueados;
  pc.innerHTML = `
  <div class="sec-hdr">
    <h2>Usuários Bloqueados <span class="count-badge">${bloqueados.length}</span></h2>
    <div class="sec-actions">
      ${backBtn()}
      <button class="btn btn-secondary btn-sm" onclick="renderUsuariosBloqueados()">${lc('refresh-cw', 14)} Atualizar</button>
    </div>
  </div>
  <p class="fs-xs c3" style="margin-bottom:14px">Usuários travados por errarem a senha 10 vezes em 15 minutos. Toque em <strong>Liberar</strong> para devolver o acesso na hora, sem esperar os 15 minutos.</p>
  <div id="bloq-list">${renderBloqueadosCards(bloqueados)}</div>`;
  refreshLucide();
};

function renderBloqueadosCards(lista) {
  if (!lista || !lista.length) {
    return `<div class="empty"><div class="empty-ico">${lc('shield-check', 44)}</div><p>Nenhum usuário bloqueado no momento.</p></div>`;
  }
  const agora = Date.now();
  const hora = t => { try { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return '—'; } };
  return `<div style="display:flex;flex-direction:column;gap:8px">${lista.map(b => {
    const nome = b.nome || b.username;
    const restam = b.desbloqueio_em ? Math.max(0, Math.ceil((new Date(b.desbloqueio_em).getTime() - agora) / 60000)) : null;
    return `
    <div class="user-card">
      <div class="user-card-main">
        <div class="av av-sm" style="background:${avatarColor(nome)}">${initials(nome)}</div>
        <div class="user-card-info">
          <div class="fw5 fs-sm">${escHtml(nome)} ${b.nome ? `<em class="c3">@${escHtml(b.username)}</em>` : '<span class="tag tag-blue fs-xs">usuário inexistente</span>'}</div>
          <div class="fs-xs c3">${lc('alert-triangle', 11)} ${b.falhas} tentativas · última ${hora(b.ultima_tentativa)}${restam !== null ? ` · desbloqueio automático em ~${restam} min` : ''}</div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-primary btn-sm" onclick="liberarUsuarioBloqueado('${escAttr(b.username)}')">${lc('unlock', 14)} Liberar</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

window.liberarUsuarioBloqueado = async function (username) {
  const { error } = await db.rpc('rpc_liberar_usuario', { p_token: getSessionToken(), p_username: username });
  if (error) { toast(error.message || 'Erro ao liberar', 'error'); return; }
  toast(`Acesso de "${username}" liberado!`, 'success');
  renderUsuariosBloqueados();
};


/* ══════════════════════════════════════════════════════════════════════
   FEATURE — Botão "voltar" do celular
   Antes, o back do navegador saía do sistema inteiro (é uma SPA de página
   única). Agora ele é interpretado como "voltar dentro do app": fecha o que
   estiver aberto (menu de evento, central de ajuda, modal, menu mobile) e,
   se não houver nada aberto, volta uma página (goBack). Só quando não há mais
   para onde voltar é que ele permanece no dashboard, sem sair do sistema.
   ══════════════════════════════════════════════════════════════════════ */
(function instalarTrapVoltar() {
  if (window._ecclesiaBackTrap) return;
  window._ecclesiaBackTrap = true;

  // Coloca um estado "âncora" no histórico do navegador para que o primeiro
  // back seja capturado por nós em vez de sair da página.
  try { history.pushState({ ecclesiaTrap: true }, ''); } catch (_) {}

  window.addEventListener('popstate', function () {
    // Recoloca a âncora para continuar capturando os próximos "voltar".
    try { history.pushState({ ecclesiaTrap: true }, ''); } catch (_) {}

    // 1) Menu suspenso de "+ Evento" aberto?
    const em = document.getElementById('event-menu');
    if (em && !em.classList.contains('hidden')) { em.classList.add('hidden'); return; }

    // 2) Central de ajuda aberta?
    const hc = document.getElementById('help-center');
    if (hc && !hc.classList.contains('hidden')) {
      if (typeof closeHelpCenter === 'function') closeHelpCenter(); else hc.classList.add('hidden');
      return;
    }

    // 3) Algum modal aberto?
    const overlay = document.querySelector('#modal-container .overlay');
    if (overlay) { if (typeof closeModal === 'function') closeModal(); return; }

    // 4) Menu lateral aberto no celular?
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('mob-open')) {
      if (typeof toggleMobile === 'function') toggleMobile(false); else sb.classList.remove('mob-open');
      return;
    }

    // 5) App visível: volta uma página se houver histórico interno.
    const app = document.getElementById('screen-app');
    const appVisivel = app && !app.classList.contains('hidden');
    if (appVisivel) {
      if (typeof navHistory !== 'undefined' && Array.isArray(navHistory) && navHistory.length) {
        if (typeof goBack === 'function') goBack();
      }
      // Sem histórico: permanece no app (a âncora já foi recolocada acima).
      return;
    }
    // Tela de login: não faz nada — mantém o usuário onde está.
  });
})();


/* ══════════════════════════════════════════════════════════════════════
   NAVEGAÇÃO UNIFICADA + VOLTAR COERENTE  (correção definitiva de #2)
   ──────────────────────────────────────────────────────────────────────
   O app tinha vários overrides de navigate() empilhados; alguns (ranking,
   todos_membros) renderizavam SEM atualizar currentPage nem empilhar o
   histórico. Resultado: a pilha só continha 'dashboard' e o botão Voltar
   sempre caía nele. Aqui reescrevemos navigate() e goBack() de forma
   autoritativa (este bloco roda por último), com uma tabela única de
   renderizadores que cobre TODAS as páginas — inclusive as injetadas. Todo
   navigate empilha o estado anterior e todo goBack restaura a página +
   navState reais anteriores.
   ══════════════════════════════════════════════════════════════════════ */
(function unificarNavegacao() {
  const RENDER = {
    dashboard: () => (window.renderDashboard || renderDashboard)(),
    setores: () => (window.renderSetores || renderSetores)(),
    usuarios: () => (window.renderUsuarios || renderUsuarios)(),
    relatorios: () => (window.renderRelatorios || renderRelatorios)(),
    permissoes: () => (window.renderPermissoes || renderPermissoes)(),
    frequencia: () => (window.renderFrequencia || renderFrequencia)(),
    financeiro: () => (window.renderFinanceiro || renderFinanceiro)(),
    eventos_setoriais: () => (window.renderEventosSetoriais || renderEventosSetoriais)(),
    ranking: () => { if (typeof window.renderRanking === 'function') window.renderRanking(); },
    todos_membros: () => { if (typeof window.renderTodosMembros === 'function') window.renderTodosMembros(); },
    jovens_fora_umadalpe: () => { if (typeof window.renderJovensForaUmadalpe === 'function') window.renderJovensForaUmadalpe(); },
    usuarios_bloqueados: () => { if (typeof window.renderUsuariosBloqueados === 'function') window.renderUsuariosBloqueados(); },
    agendas_semanais: () => { if (typeof window.renderAgendasSemanais === 'function') window.renderAgendasSemanais(); },
  };
  const TITLES = {
    dashboard: 'Dashboard', setores: 'Setores', usuarios: 'Usuários', relatorios: 'Relatórios',
    permissoes: 'Permissões', frequencia: 'Frequência de Usuários', financeiro: 'Financeiro',
    eventos_setoriais: 'Eventos Setoriais', ranking: 'Ranking Mensal', todos_membros: 'Membros',
    jovens_fora_umadalpe: 'Jovens (Fora UMADALPE)', usuarios_bloqueados: 'Usuários Bloqueados',
    agendas_semanais: 'Agendas Semanais',
  };

  function aplicarPagina(page, restaurando) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    const titleEl = $('page-title'); if (titleEl) titleEl.textContent = TITLES[page] || page;
    try { Object.values(chartInstances).forEach(c => c?.destroy?.()); } catch (_) {}
    chartInstances = {};
    // Reset de filtros só ao ENTRAR numa página (não ao restaurar via Voltar),
    // replicando o comportamento dos overrides antigos.
    if (!restaurando) {
      if (page === 'dashboard') {
        dashSetorFiltro = currentUser?.setor_id || null; window.dashSetorFiltro = dashSetorFiltro;
        window.dashSetorFiltroManual = false; dashCongFiltro = null; window.dashCongFiltro = null;
      }
      if (page === 'relatorios') {
        relSetorFiltro = currentUser?.setor_id || null; window.relSetorFiltro = relSetorFiltro;
        relCongFiltro = null; window.relCongFiltro = null;
      }
      if (page === 'setores') navState = { view: 'setores', setor: null, cong: null };
      if (page === 'usuarios') userSearch = '';
    }
    const pc = $('page-content'); if (pc) { pc.style.animation = 'none'; void pc.offsetHeight; pc.style.animation = ''; }
    const fn = RENDER[page];
    if (typeof fn === 'function') fn();
    if (typeof refreshLucide === 'function') refreshLucide();
  }

  window.navigate = function (page) {
    // Empilha o estado atual antes de trocar (só quando muda de página).
    if (currentPage && currentPage !== page) {
      pushHistory({ page: currentPage, navState: JSON.parse(JSON.stringify(navState)) });
    }
    aplicarPagina(page, false);
  };

  window.goBack = function () {
    if (!navHistory.length) { aplicarPagina('dashboard', true); return; }
    const prev = navHistory.pop();
    if (prev && prev.navState) navState = prev.navState;
    aplicarPagina(prev && prev.page ? prev.page : 'dashboard', true);
  };
})();







