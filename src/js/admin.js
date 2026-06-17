/**
 * ═══════════════════════════════════════════════════════════════
 * 📋 LibNotify Admin - JavaScript
 * ═══════════════════════════════════════════════════════════════
 *
 * Arquivo: src/js/admin.js
 * Responsabilidade: Lógica completa do painel administrativo
 *
 * Funcionalidades:
 * • Autenticação (login/logout)
 * • Sincronização com Backend via API REST
 * • Gerenciamento de slides (criar, editar, deletar)
 * • Preview em tempo real dos slides
 * • Envio de comandos para o display
 *
 * Imports: apiClient (global window.apiClient do api-client.js)
 * ═══════════════════════════════════════════════════════════════
 */

console.log('🔧 Admin.js iniciando carregamento...');
console.log('📦 apiClient disponível?', typeof window.apiClient);

// ═══════════════════════════════════════════════════════════════
// 📁 CONSTANTES (carregadas do admin.html via window)
// ═══════════════════════════════════════════════════════════════

// Usar constantes já exportadas pelo admin.html (não redeclarar)
// Função para acessar SLIDES_PADRAO do window
function getSlidespadrao() {
  return window.SLIDES_PADRAO || [];
}

// Função para acessar gradientes e cores (podem estar no window)
function getGradientePadrao(index) {
  const gradientes = window.GRADIENTES_PADRAO || [];
  return gradientes[index] || gradientes[0] || "linear-gradient(135deg, #1a1f3a 0%, #141829 100%)";
}

function getCorPadrao(index) {
  const cores = window.CORES_PADRAO || [];
  return cores[index] || cores[0] || { titulo: "#667eea", emoji: "#ffdd00" };
}

// ═══════════════════════════════════════════════════════════════
// 🗂️ ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════

let slidesExtras = []; // Slides adicionados via admin, carregados da API

/** Retorna array normalizado de slides com ID garantido */
function normalizarSlidesArray(val) {
  if (!val) return [];
  
  let slides = [];
  
  if (Array.isArray(val)) {
    // Se for array, converter para objeto com índices como chave
    slides = val.map((item, idx) => ({
      id: String(item.id || idx),
      ...item
    }));
  } else {
    // Se for objeto com chaves numéricas, converter para array
    slides = Object.keys(val)
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b));
      })
      .map((k) => ({ id: k, ...val[k] }))
      .filter((item) => item != null);
  }
  
  return slides;
}

// ═══════════════════════════════════════════════════════════════
// 🗂️ ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════

let logado = false; // True se usuário passou na autenticação
let perfilAtual = null; // 'admin' ou 'controlador'
let slideAtualEmExibicao = 0; // Índice do slide que está sendo exibido no display
const ADMIN_PRESENCE_HEARTBEAT_MS = 5000;

function gerarAdminPresenceSessionId() {
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Funções de presença removidas (não usadas com API REST)

// 🎬 VARIÁVEIS DO PREVIEW AUTOMÁTICO
let previewSlideAtual = 0;           // Slide atual do preview (independente)
let previewTimerAtual = null;        // Timer de rotação do preview
let previewTempoRestante = 10;       // Tempo restante para próximo slide
let previewCountdownInterval = null; // Interval do contador visual

// 🔄 PREVENÇÃO DE SINCRONIZAÇÃO EXCESSIVA
let _sincronizaPreviewTimer = null; // Debounce timer para sincronização
const DEBOUNCE_SINCRONIZACAO = 300; // ms entre sincronizações (evita loop)

// ═══════════════════════════════════════════════════════════════
// 🔐 AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════

/**
 * Seleciona o perfil (Admin ou Controlador)
 * @function window.selecionarPerfil
 */
window.selecionarPerfil = function (perfil) {
  perfilAtual = perfil;
  
  const selecaoPerfil = document.getElementById("selecao-perfil");
  const telasenhaLogin = document.getElementById("tela-senha-login");
  const perfilIcon = document.getElementById("perfil-icon");
  const perfilTitulo = document.getElementById("perfil-titulo");
  const inputSenha = document.getElementById("input-senha");
  
  // Atualizar UI baseado no perfil
  if (perfil === 'admin') {
    perfilIcon.src = "bootstrap/person-fill-gear.svg";
    perfilTitulo.textContent = "ADMIN";
  } else {
    perfilIcon.src = "bootstrap/controller.svg";
    perfilTitulo.textContent = "CONTROLADOR";
  }
  
  // Esconder seleção e mostrar tela de senha
  selecaoPerfil.style.display = "none";
  telasenhaLogin.style.display = "flex";
  inputSenha.focus();
  inputSenha.value = "";
};

/**
 * Volta para a seleção de perfil
 * @function window.voltarSelecaoPerfil
 */
window.voltarSelecaoPerfil = function () {
  const selecaoPerfil = document.getElementById("selecao-perfil");
  const telasenhaLogin = document.getElementById("tela-senha-login");
  
  perfilAtual = null;
  selecaoPerfil.style.display = "flex";
  telasenhaLogin.style.display = "none";
  document.getElementById("input-senha").value = "";
  document.getElementById("erro-login").style.display = "none";
};

/**
 * Oculta/mostra seções baseado no perfil
 */
function aplicarPermissoesPerfil() {
  const secaoControles = document.querySelector(".controles-grid");
  const secaoIrParaSlide = document.querySelectorAll(".section-title")[1]; // "Ir para slide"
  const secaoPreview = document.querySelector("#secao-preview");
  const secaoAdicionarSlide = Array.from(document.querySelectorAll(".section-title")).find(el => el.textContent.includes("Adicionar novo"));
  const secaoSlidesAtuais = Array.from(document.querySelectorAll(".section-title")).find(el => el.textContent.includes("Slides atuais"));
  const secaoConfiguracao = Array.from(document.querySelectorAll(".section-title")).find(el => el.textContent.includes("Configuração"));
  
  if (perfilAtual === 'controlador') {
    // Controlador: ocultar tudo exceto displays
    if (secaoControles) secaoControles.style.display = "none";
    if (secaoIrParaSlide) secaoIrParaSlide.style.display = "none";
    if (secaoIrParaSlide?.nextElementSibling) secaoIrParaSlide.nextElementSibling.style.display = "none";
    if (secaoPreview) secaoPreview.style.display = "none";
    if (secaoAdicionarSlide) secaoAdicionarSlide.style.display = "none";
    if (secaoAdicionarSlide?.nextElementSibling) secaoAdicionarSlide.nextElementSibling.style.display = "none";
    if (secaoSlidesAtuais) secaoSlidesAtuais.style.display = "none";
    if (secaoSlidesAtuais?.nextElementSibling) secaoSlidesAtuais.nextElementSibling.style.display = "none";
    if (secaoConfiguracao) secaoConfiguracao.style.display = "none";
    if (secaoConfiguracao?.nextElementSibling) secaoConfiguracao.nextElementSibling.style.display = "none";
    
    // Mostrar apenas a seção de displays
    const secaoDisplays = Array.from(document.querySelectorAll(".section-title")).find(el => el.textContent.includes("Displays"));
    if (secaoDisplays) secaoDisplays.style.display = "block";
    const wrapperDisplays = document.getElementById("wrapper-displays-bloco");
    if (wrapperDisplays) wrapperDisplays.style.display = "block";
    
    console.log("🎮 Modo Controlador ativado - apenas displays visíveis");
  } else {
    // Admin: mostrar tudo
    if (secaoControles) secaoControles.style.display = "grid";
    if (secaoIrParaSlide) secaoIrParaSlide.style.display = "block";
    if (secaoIrParaSlide?.nextElementSibling) secaoIrParaSlide.nextElementSibling.style.display = "block";
    if (secaoPreview) secaoPreview.style.display = "block";
    if (secaoAdicionarSlide) secaoAdicionarSlide.style.display = "block";
    if (secaoAdicionarSlide?.nextElementSibling) secaoAdicionarSlide.nextElementSibling.style.display = "block";
    if (secaoSlidesAtuais) secaoSlidesAtuais.style.display = "block";
    if (secaoSlidesAtuais?.nextElementSibling) secaoSlidesAtuais.nextElementSibling.style.display = "block";
    if (secaoConfiguracao) secaoConfiguracao.style.display = "block";
    if (secaoConfiguracao?.nextElementSibling) secaoConfiguracao.nextElementSibling.style.display = "block";
    
    console.log("👨‍💼 Modo Admin ativado - acesso total");
  }
}

/**
 * Trata o login do usuário
 * Valida credenciais no backend Node.js
 * @function window.fazerLogin
 */
window.fazerLogin = async function () {
  const val = document.getElementById("input-senha").value;
  const btnLogin = document.getElementById("btn-login");
  const img = btnLogin.querySelector("img");
  const btnText = document.getElementById("btn-login-text");
  
  if (!val) {
    alert("Digite a senha");
    return;
  }

  // Desabilitar botão durante requisição
  btnLogin.disabled = true;
  btnText.textContent = "Verificando...";

  // Chamar API de login
  const result = await apiClient.login(perfilAtual, val);

  if (result.status === 'ok') {
    // ✅ Login bem-sucedido no backend
    img.src = "bootstrap/unlock-fill.svg";
    img.alt = "Desbloqueado";
    btnText.textContent = "Acessando";
    btnLogin.title = "Desbloqueado";
    
    setTimeout(() => {
      document.getElementById("tela-login").style.display = "none";
      document.getElementById("painel-admin").style.display = "block";
      logado = true;
      
      // Atualizar topbar com nome do perfil
      const topbarH1 = document.querySelector(".topbar h1");
      if (perfilAtual === 'admin') {
        topbarH1.textContent = "ADMIN";
      } else {
        topbarH1.textContent = "CONTROLADOR";
      }
      
      // 📌 JWT agora está armazenado no localStorage pelo apiClient
      console.log(`✅ JWT armazenado: ${apiClient.getToken().substring(0, 20)}...`);
      
      inicializarPainel();
      
      // Aplicar permissões baseado no perfil
      aplicarPermissoesPerfil();
      
      // 🎬 Iniciar preview automático (apenas para admin)
      if (perfilAtual === 'admin') {
        previewSlideAtual = 0;
        renderizarPreview();
        iniciarPreviewAutomatico();
      }
      
      console.log(`✅ Login bem-sucedido (${perfilAtual})`);
    }, 300);
  } else {
    // ❌ Login falhou
    const inp = document.getElementById("input-senha");
    inp.classList.add("erro");
    document.getElementById("erro-login").textContent = result.message || "Erro ao fazer login";
    document.getElementById("erro-login").style.display = "block";
    setTimeout(() => inp.classList.remove("erro"), 500);
    inp.value = "";
    btnLogin.disabled = false;
    btnText.textContent = "Acessar";
    console.warn("❌ Erro ao fazer login:", result.message);
  }
};

/**
 * Trata o logout do usuário
 * Retorna à tela de login
 * @function window.fazerLogout
 */
window.fazerLogout = function () {
  clearTimeout(previewTimerAtual);
  // Presença removida (não necessária com API REST)
  logado = false;
  perfilAtual = null;
  document.getElementById("painel-admin").style.display = "none";
  
  // Mostrar seleção de perfil novamente
  document.getElementById("tela-login").style.display = "flex";
  document.getElementById("selecao-perfil").style.display = "flex";
  document.getElementById("tela-senha-login").style.display = "none";
  document.getElementById("input-senha").value = "";
  
  // Restaurar ícone e texto do botão para "fechado"
  const btnLogin = document.getElementById("btn-login");
  const img = btnLogin.querySelector("img");
  const btnText = document.getElementById("btn-login-text");
  img.src = "bootstrap/lock-fill.svg";
  img.alt = "Entrar";
  btnText.textContent = "Entrar";
  btnLogin.title = "Desbloquear";
  
  console.log("👋 Logout realizado");
};

window.addEventListener("beforeunload", () => {
  // Presença removida (não necessária com API REST)
});

// ═══════════════════════════════════════════════════════════════

// �🔥 FIREBASE - Inicialização e Listeners
// ═══════════════════════════════════════════════════════════════

/**
 * Carrega slides da API Backend
 * Substitui listener de Firebase por chamada HTTP
 * @function carregarSlidesAPI
 */
async function carregarSlidesAPI() {
  try {
    const result = await apiClient.apiCall('/slides', 'GET');
    
    console.log('📊 Resposta da API /slides:', result);
    
    if (result.status === 'ok') {
      // ⚠️ IMPORTANTE: apiClient retorna { status, data }
      // data contém { status, slides, total, message }
      const slidesData = result.data?.slides || [];
      
      console.log(`📍 Slides recebidos da API:`, slidesData.length);
      
      slidesExtras = normalizarSlidesArray(slidesData);
      console.log(`✅ ${slidesExtras.length} slides normalizados:`, slidesExtras);
      
      renderizarListaSlides();
      atualizarInfoTotal();
      
      if (logado) {
        sincronizarPreviewComSlides();
      } else {
        renderizarPreview();
      }
    } else {
      console.error('❌ Erro ao carregar slides:', result.message);
      toast('❌ Erro ao carregar slides', 'erro', 5000);
    }
  } catch (error) {
    console.error('❌ Erro ao chamar API de slides:', error);
    toast('❌ Erro de conexão com servidor', 'erro', 5000);
  }
}

/**
 * Inicializa o painel admin após login bem-sucedido
 * Carrega dados iniciais via API
 * @function inicializarPainel
 */
async function inicializarPainel() {
  try {
    console.log('🚀 Inicializando painel admin...');
    
    // Carregar slides da API
    await carregarSlidesAPI();
    
    // Recarregar slides a cada 5 segundos (polling simples)
    setInterval(carregarSlidesAPI, 5000);
    
    console.log('✅ Painel inicializado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao inicializar painel:', error);
    toast('❌ Erro ao inicializar painel', 'erro', 5000);
  }
}

// ═══════════════════════════════════════════════════════════════
// 📡 ENVIAR COMANDOS
// ═══════════════════════════════════════════════════════════════

/**
 * Envia um comando para o display (navegação, pausar, etc)
 * @function window.enviarComando
 * @param {Object} cmd - Comando com tipo e parâmetros
 * @example enviarComando({ tipo: 'irParaSlide', indice: 2 })
 */
window.enviarComando = async function (cmd) {
  try {
    // Enviar comando via API REST com JWT
    const result = await apiClient.apiCall('/slides/comando', 'POST', {
      ...cmd,
      timestamp: Date.now(),
    });

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Erro ao enviar comando');
    }

    // Mostrar feedback ao usuário
    const labels = {
      irParaSlide: `📺 Exibindo slide ${(cmd.indice || 0) + 1}`,
      pausar: "⏸️ Apresentação pausada",
      retomar: "▶️ Apresentação retomada",
      atualizarSlides: "🔄 Slides sincronizados",
    };
    toast(labels[cmd.tipo] || "✅ Comando enviado", "verde");

    // Atualizar preview imediatamente para navegação
    if (cmd.tipo === "irParaSlide" && typeof cmd.indice === "number") {
      slideAtualEmExibicao = cmd.indice;
      renderizarPreview();
    }

    console.log(`📤 Comando enviado:`, cmd);

  } catch (e) {
    toast("❌ Erro ao enviar comando", "erro");
    console.error("❌ Erro ao enviar comando:", e);
  }
};

// ═══════════════════════════════════════════════════════════════
// 📋 RENDERIZAÇÃO DE LISTA E BOTÕES
// ═══════════════════════════════════════════════════════════════

/**
 * Renderiza a lista de slides (padrões + extras)
 * @function renderizarListaSlides
 */
function renderizarListaSlides() {
  const lista = document.getElementById("lista-slides");
  let html = "";

  // Renderizar slides padrão
  window.SLIDES_PADRAO.forEach((s, i) => {
    html += `
      <div class="slide-item">
        <div class="slide-num">${i + 1}</div>
        <div class="slide-info">
          <div class="slide-titulo">${s.titulo}</div>
          <div class="slide-meta">⏱️ ${s.duracao}s &nbsp;|&nbsp; Slide padrão</div>
        </div>
        <span class="badge badge-pad">Padrão</span>
        <div class="slide-acoes">
          <button class="btn-sm ir" onclick="irParaSlidePreview(${i})" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
            <img src="bootstrap/display.svg" alt="Exibir" style="width: 16px; height: 16px; filter: brightness(0) invert(1);">
            Exibir
          </button>
        </div>
      </div>`;
  });

  // Renderizar slides extras ou mensagem vazia
  if (slidesExtras.length === 0) {
    html += `<div style="padding:20px;text-align:center;color:var(--text2);">
      ✨ Nenhum slide extra adicionado ainda.
    </div>`;
  } else {
    slidesExtras.forEach((s, i) => {
      const idx = window.SLIDES_PADRAO.length + i;
      const tipoLabel = s.tipo === "imagem" ? "🖼️ Imagem" : s.tipo === "video" ? "🎥 Vídeo" : "📝 Texto";
      html += `
        <div class="slide-item" draggable="true" data-slide-index="${i}" 
             ondragstart="iniciarDragSlide(event, ${i})" 
             ondragover="permitirDropSlide(event)" 
             ondrop="reordenarSlidesAoSoltar(event, ${i})"
             ondragleave="removerMarcacaoDrop(event)"
             ondragend="finalizarDragSlide(event)">
          <div class="slide-drag-handle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="5" r="1"></circle>
              <circle cx="9" cy="12" r="1"></circle>
              <circle cx="9" cy="19" r="1"></circle>
              <circle cx="15" cy="5" r="1"></circle>
              <circle cx="15" cy="12" r="1"></circle>
              <circle cx="15" cy="19" r="1"></circle>
            </svg>
          </div>
          <div class="slide-num">${idx + 1}</div>
          <div class="slide-info">
            <div class="slide-titulo">${s.titulo || "(sem título)"}</div>
            <div class="slide-meta">⏱️ ${s.duracao || 10}s &nbsp;|&nbsp; ${tipoLabel}</div>
          </div>
          <span class="badge badge-txt">Extra</span>
          <div class="slide-acoes">
            <button class="btn-sm ir" onclick="irParaSlidePreview(${idx})" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
              <img src="bootstrap/display.svg" alt="Exibir" style="width: 16px; height: 16px; filter: brightness(0) invert(1);">
              Exibir
            </button>
            <button class="btn-sm del" onclick="deletarSlideExtra(${i})" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
              <img src="bootstrap/archive-fill.svg" alt="Deletar" style="width: 16px; height: 16px; filter: brightness(0) invert(1);">
              Deletar
            </button>
          </div>
        </div>`;
    });
  }

  lista.innerHTML = html;
  renderizarBotoesSlides();
  atualizarInfoTotal();
}

/**
 * Renderiza os botões de navegação rápida (1, 2, 3, 4, ...)
 * @function window.renderizarBotoesSlides
 */
window.renderizarBotoesSlides = function () {
  const container = document.getElementById("botoes-slides");
  if (!container) return;

  const totalSlides = window.SLIDES_PADRAO.length + slidesExtras.length;
  let html = "";

  for (let i = 0; i < totalSlides; i++) {
    const isPadraoSlide = i < window.SLIDES_PADRAO.length;
    const classe = isPadraoSlide ? "padrao" : "extra";
    const tooltipTipo = isPadraoSlide ? "📌 Slide padrão" : "⭐ Slide customizado";

    html += `
      <button 
        class="btn-slide ${classe}" 
        onclick="irParaSlidePreview(${i})"
        title="${tooltipTipo} #${i + 1}"
      >
        ${i + 1}
      </button>`;
  }

  container.innerHTML = html;
  renderizarPreview();
};

/**
 * Atualiza informações totais de slides
 * @function atualizarInfoTotal
 */
function atualizarInfoTotal() {
  const total = window.SLIDES_PADRAO.length + slidesExtras.length;
  console.log(`📊 Total de slides no sistema: ${total}`);
}

// ═══════════════════════════════════════════════════════════════
// ➕ ADICIONAR SLIDES
// ═══════════════════════════════════════════════════════════════

/**
 * Adiciona um novo slide de TEXTO via formulário
 * @function window.adicionarSlideAdmin
 */
window.adicionarSlideAdmin = function () {
  // ⚠️ Verificar permissão
  if (perfilAtual !== 'admin') {
    toast("❌ Apenas Admin pode adicionar slides", "erro");
    console.warn("❌ Tentativa de adicionar slide com perfil Controlador");
    return;
  }

  const emoji = document.getElementById("f-emoji").value.trim() || "📌";
  const titulo = document.getElementById("f-titulo").value.trim();
  const descritivo = document.getElementById("f-descritivo").value.trim();
  const destaque = document.getElementById("f-destaque").value.trim();
  const final = document.getElementById("f-final").value.trim();
  const duracao = parseInt(document.getElementById("f-duracao").value) || 10;
  const corFundo = document.getElementById("f-cor-fundo").value;
  const corTitulo = document.getElementById("f-cor-titulo").value;
  const corDest = document.getElementById("f-cor-destaque").value;

  if (!titulo) {
    toast("❌ Preencha o título do slide", "erro");
    return;
  }

  // Montar HTML do slide customizado
  let htmlDestaque = destaque
    ? `<div class="mensagem-destaque" style="color:${corDest};">${destaque}</div>`
    : "";

  let htmlFinal = final
    ? `<div class="descritivo" style="color:#e0e0e0;margin-top:1vh;">${final}</div>`
    : "";

  const html = `<div class="conteudo-wrapper">
    <div class="icon-grande" style="color:${corTitulo};">${emoji}</div>
    <div class="titulo-principal" style="color:${corTitulo};">${titulo}</div>
    <div class="card-info">
      <div class="descritivo" style="color:#e0e0e0;">${descritivo}</div>
      ${htmlDestaque}
      ${htmlFinal}
    </div>
  </div>`;

  const novoSlide = {
    html,
    background: `linear-gradient(135deg, ${corFundo}dd 0%, ${corFundo}99 100%)`,
    classe: "slide",
    duracao: String(duracao),
    titulo,
    tipo: "texto",
    criadoEm: Date.now(),
  };

  salvarSlideFirebase(novoSlide);
};

/**
 * Adiciona um novo slide de IMAGEM
 * Converte a imagem para base64 antes de salvar no Firebase
 * @function window.adicionarSlideComImagemAdmin
 */
window.adicionarSlideComImagemAdmin = async function () {
  // ⚠️ Verificar permissão
  if (perfilAtual !== 'admin') {
    toast("❌ Apenas Admin pode adicionar slides", "erro");
    console.warn("❌ Tentativa de adicionar slide com imagem - perfil Controlador");
    return;
  }

  const file = document.getElementById("arquivo-imagem-admin").files[0];
  if (!file) {
    toast("⚠️ Selecione uma imagem", "erro");
    return;
  }

  const duracao = parseInt(document.getElementById("duracao-imagem-input-admin").value) || 10;

  // Converter imagem para base64
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const base64 = e.target.result;

      const slideData = {
        tipo: "imagem",
        imagem: base64,
        duracao: duracao,
        nome: file.name,
        titulo: file.name.replace(/\.[^.]+$/, ""), // Remove extensão
        dataCriacao: new Date().toLocaleString("pt-BR"),
      };

      // Salvar slide via API REST com JWT
      const result = await apiClient.apiCall('/slides', 'POST', slideData);

      if (result.status !== 'ok') {
        throw new Error(result.message || 'Erro ao salvar slide com imagem');
      }

      // Recarregar slides
      await carregarSlidesAPI();

      renderizarBotoesSlides();
      renderizarPreview();
      toast("✅ Slide de imagem adicionado com sucesso!", "verde");
      
      // Limpar inputs
      document.getElementById("arquivo-imagem-admin").value = "";
      document.getElementById("preview-admin").style.display = "none";
      document.getElementById("nome-arquivo-admin").textContent = "";

    } catch (e) {
      toast("❌ Erro ao salvar imagem", "erro");
      console.error(e);
    }
  };

  reader.readAsDataURL(file);
};

/**
 * Salva um slide customizado (texto) no Firebase
 * @function salvarSlideFirebase
 * @param {Object} slideData - Dados do slide a salvar
 */
async function salvarSlideFirebase(slideData) {
  try {
    // Salvar slide via API REST com JWT
    const result = await apiClient.apiCall('/slides', 'POST', slideData);

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Erro ao salvar slide');
    }

    // Recarregar slides da API
    await carregarSlidesAPI();

    // 🔄 SINCRONIZAÇÃO:
    // 1️⃣ SINCRONIZAR COMPORTAMENTO DO PREVIEW
    sincronizarPreviewComSlides();

    // 2️⃣ ATUALIZAR INTERFACE
    renderizarBotoesSlides();
    renderizarListaSlides();
    
    toast("✅ Slide adicionado com sucesso!", "verde");
    reiniciarPreviewTempoReal();

  } catch (e) {
    toast("❌ Erro ao salvar slide", "erro");
    console.error(e);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🗑️ DELETAR SLIDES
// ═══════════════════════════════════════════════════════════════

/**
 * Atualiza o preview em tempo real da aba de adicionar slides
 * Chamada a cada mudança nos inputs (com debounce para performance)
 * @function window.atualizarPreviewTempoReal
 */
let previewDebounceTimer = null;

window.atualizarPreviewTempoReal = function () {
  clearTimeout(previewDebounceTimer);

  previewDebounceTimer = setTimeout(() => {
    const previewConteudo = document.getElementById("preview-conteudo-tempo-real");
    const previewFooter  = document.getElementById("preview-footer-tempo-real");

    if (!previewConteudo || !previewFooter) return;

    // Ler valores do formulário
    const emoji     = document.getElementById("f-emoji").value.trim() || "📌";
    const titulo    = document.getElementById("f-titulo").value.trim();
    const descritivo= document.getElementById("f-descritivo").value.trim();
    const destaque  = document.getElementById("f-destaque")?.value.trim() || "";
    const final_txt = document.getElementById("f-final")?.value.trim() || "";
    const duracao   = document.getElementById("f-duracao").value || "10";
    const corFundo  = document.getElementById("f-cor-fundo").value || "#2d3561";
    const corTitulo = document.getElementById("f-cor-titulo").value || "#667eea";
    const corDestaque = document.getElementById("f-cor-destaque")?.value || "#ffdd00";

    // Se não tem título, mostrar placeholder
    if (!titulo) {
      previewConteudo.innerHTML = `
        <div class="preview-empty">
          <span class="preview-empty-icon">👀</span>
          <span>Comece a digitar...</span>
        </div>
      `;
      previewFooter.innerHTML = `<span class="preview-duracao-tempo-real">— s</span>`;
      return;
    }

    // Calcular escala: canvas interno é sempre 1280×720
    // A preview-box tem largura real = previewConteudo.offsetWidth
    const boxW = previewConteudo.offsetWidth || 380;
    const boxH = previewConteudo.offsetHeight || (boxW * 9 / 16);
    // Escala pelo menor fator para não transbordar
    const scaleW = boxW / 1280;
    const scaleH = boxH / 720;
    const scale  = Math.min(scaleW, scaleH);

    // Montar HTML do destaque e texto final
    const htmlDestaque = destaque
      ? `<div class="preview-destaque-tempo-real" style="color:${corDestaque};">${destaque}</div>`
      : "";
    const htmlDesc = descritivo
      ? `<div class="preview-desc-tempo-real">${descritivo}</div>`
      : "";
    const htmlFinal = final_txt
      ? `<div class="preview-desc-tempo-real" style="opacity:0.6;font-size:34px;">${final_txt}</div>`
      : "";

    // Fundo gradiente fiel ao slide real
    const bg = `linear-gradient(135deg, ${corFundo}ee 0%, ${corFundo}99 100%)`;

    previewConteudo.innerHTML = `
      <div class="preview-text-content-tempo-real"
           style="background:${bg}; --preview-scale:${scale};">
        <span class="preview-emoji-tempo-real">${emoji}</span>
        <div class="preview-titulo-tempo-real" style="color:${corTitulo};">${titulo}</div>
        ${htmlDestaque}
        ${htmlDesc}
        ${htmlFinal}
      </div>
    `;

    // Aplicar escala diretamente no elemento recém-criado
    const canvas = previewConteudo.querySelector(".preview-text-content-tempo-real");
    if (canvas) canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;

    previewFooter.innerHTML = `<span class="preview-duracao-tempo-real">⏱️ ${duracao}s</span>`;

  }, 150); // Debounce de 150ms
};

/**
 * Limpa o preview quando o formulário é resetado
 * @function limparPreviewTempoReal
 */
function limparPreviewTempoReal() {
  const previewConteudo = document.getElementById("preview-conteudo-tempo-real");
  const previewFooter = document.getElementById("preview-footer-tempo-real");
  
  if (previewConteudo) {
    previewConteudo.innerHTML = `
      <div class="preview-empty">
        <span class="preview-empty-icon">👀</span>
        <span>Comece a digitar...</span>
      </div>
    `;
  }
  
  if (previewFooter) {
    previewFooter.innerHTML = `<span class="preview-duracao-tempo-real">— s</span>`;
  }
}

/**
 * Função auxiliar para chamar preview após adicionar slide
 * @function reiniciarPreviewTempoReal
 */
function reiniciarPreviewTempoReal() {
  // Reset dos inputs
  document.getElementById("f-emoji").value = "📌";
  document.getElementById("f-titulo").value = "";
  document.getElementById("f-descritivo").value = "";
  document.getElementById("f-destaque").value = "";
  document.getElementById("f-final").value = "";
  document.getElementById("f-duracao").value = "10";
  document.getElementById("f-cor-fundo").value = "#2d3561";
  document.getElementById("f-cor-titulo").value = "#667eea";
  document.getElementById("f-cor-destaque").value = "#ffdd00";
  
  limparPreviewTempoReal();
}

// ═══════════════════════════════════════════════════════════════
// 🎯 ADICIONAR SLIDES (funções modificadas para chamar preview)
// ═══════════════════════════════════════════════════════════════
/**
 * @function window.deletarSlideExtra
 * @param {number} idx - Índice do slide extra a deletar (relativo a slidesExtras)
 */
window.deletarSlideExtra = async function (idx) {
  // ⚠️ Verificar permissão
  if (perfilAtual !== 'admin') {
    toast("❌ Apenas Admin pode deletar slides", "erro");
    console.warn("❌ Tentativa de deletar slide - perfil Controlador");
    return;
  }

  try {
    // Debug: log do estado atual
    console.log(`🗑️ Tentando deletar slide index=${idx}, total slidesExtras=${slidesExtras.length}`);
    
    if (idx < 0 || idx >= slidesExtras.length) {
      throw new Error(`Índice inválido: ${idx}. slidesExtras.length=${slidesExtras.length}`);
    }

    const slide = slidesExtras[idx];
    if (!slide || !slide.id) {
      console.error('Slide completo:', JSON.stringify(slide));
      throw new Error(`Slide no índice ${idx} não tem ID. Slide: ${JSON.stringify(slide)}`);
    }

    const slideId = slide.id;
    console.log(`✅ Deletando slide com ID: ${slideId}, Título: ${slide.titulo}`);

    if (!confirm(`Deletar slide "#${slide.titulo}"?`)) return;

    // Deletar via API REST
    const result = await apiClient.apiCall(`/slides/${slideId}`, 'DELETE');

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Erro ao deletar slide');
    }

    console.log('✅ Slide deletado do servidor:', result);
    
    // Recarregar slides da API
    await carregarSlidesAPI();
    
    // Sincronizar preview
    sincronizarPreviewComSlides();
    
    // Atualizar interface
    renderizarBotoesSlides();
    renderizarListaSlides();
    
    toast("🗑️ Slide deletado com sucesso", "verde");

  } catch (e) {
    toast(`❌ Erro ao deletar slide: ${e.message}`, "erro");
    console.error('❌ Erro completo:', e);
  }
};

// ═══════════════════════════════════════════════════════════════
// 🎯 DRAG & DROP - REORDENAR SLIDES
// ═══════════════════════════════════════════════════════════════

/**
 * Variável global para rastrear o slide sendo arrastado
 * @type {number|null}
 */
let draggedSlideIndex = null;

/**
 * Inicia o drag de um slide
 * @function iniciarDragSlide
 * @param {DragEvent} event - Evento do drag
 * @param {number} index - Índice do slide sendo arrastado
 */
window.iniciarDragSlide = function (event, index) {
  if (perfilAtual !== 'admin') {
    event.preventDefault();
    return;
  }
  draggedSlideIndex = index;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", index.toString());
};

/**
 * Permite drop em zonas de drop válidas
 * @function permitirDropSlide
 * @param {DragEvent} event - Evento do dragover
 */
window.permitirDropSlide = function (event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  if (!event.currentTarget.classList.contains("dragging")) {
    event.currentTarget.classList.add("drag-over");
  }
};

/**
 * Remove a marcação de drop ao sair da zona
 * @function removerMarcacaoDrop
 * @param {DragEvent} event - Evento do dragleave
 */
window.removerMarcacaoDrop = function (event) {
  event.currentTarget.classList.remove("drag-over");
};

/**
 * Atualiza apenas os números dos slides após reordenação (re-render otimizado)
 * Não reescreve todo o HTML, apenas atualiza os números
 * @function atualizarNumerosSlidesAposReordenacao
 */
function atualizarNumerosSlidesAposReordenacao() {
  const slideItems = document.querySelectorAll(".slide-item[data-slide-index]");
  slideItems.forEach((item, i) => {
    const idx = window.SLIDES_PADRAO.length + i;
    const numElement = item.querySelector(".slide-num");
    if (numElement) numElement.textContent = idx + 1;
  });
  renderizarBotoesSlides();
};

/**
 * Reordena os slides ao soltar
 * @function reordenarSlidesAoSoltar
 * @param {DragEvent} event - Evento do drop
 * @param {number} targetIndex - Índice do slide de destino
 */
window.reordenarSlidesAoSoltar = async function (event, targetIndex) {
  event.preventDefault();
  event.stopPropagation();
  
  const slideItems = document.querySelectorAll(".slide-item");
  slideItems.forEach(el => el.classList.remove("drag-over", "dragging"));
  
  if (draggedSlideIndex === null || draggedSlideIndex === targetIndex) {
    draggedSlideIndex = null;
    return;
  }
  
  if (perfilAtual !== 'admin') {
    toast("❌ Apenas Admin pode reorganizar", "erro");
    draggedSlideIndex = null;
    return;
  }
  
  try {
    const novoArray = [...slidesExtras];
    const [slideMovido] = novoArray.splice(draggedSlideIndex, 1);
    novoArray.splice(targetIndex, 0, slideMovido);
    
    // Atualizar servidor via API REST
    const result = await apiClient.apiCall('/slides/reorder', 'POST', {
      slides: novoArray
    });
    
    if (result.status === 'ok') {
      // Recarregar slides da API
      await carregarSlidesAPI();
      
      // Re-render OTIMIZADO
      atualizarNumerosSlidesAposReordenacao();
      
      toast("✅ Reorganizado com sucesso!", "verde");
    } else {
      throw new Error(result.message || 'Erro ao reorganizar');
    }
    
  } catch (err) {
    toast("❌ Erro na reordenação", "erro");
    console.error(err);
  } finally {
    draggedSlideIndex = null;
  }
};

/**
 * Finaliza o drag, limpando classes e estados
 * @function finalizarDragSlide
 * @param {DragEvent} event - Evento do dragend
 */
window.finalizarDragSlide = function (event) {
  // Limpar todas as classes de drag
  document.querySelectorAll(".slide-item").forEach(el => {
    el.classList.remove("dragging", "drag-over");
  });
  
  draggedSlideIndex = null;
  console.log("🏁 Drag finalizado");
};

// ═══════════════════════════════════════════════════════════════
// 🔄 SINCRONIZAR SLIDES
// ═══════════════════════════════════════════════════════════════

/**
 * Sincroniza os slides da API com o painel local
 * Recarrega slides e atualiza display
 * @function window.sincronizarSlidesAPI
 */
window.sincronizarSlidesAPI = async function () {
  try {
    await carregarSlidesAPI();
    
    // Enviar ao display
    await enviarComando({ tipo: "atualizarSlides", slides: slidesExtras });

    // Atualizar interface local
    renderizarBotoesSlides();
    renderizarPreview();

    toast(`✅ Sincronizado! ${slidesExtras.length} slides`, "verde");
    console.log(`✅ Sincronizados ${slidesExtras.length} slides`);

  } catch (e) {
    toast("❌ Erro ao sincronizar", "erro");
    console.error(e);
  }
};

// Manter referência para compatibilidade
window.sincronizarSlidesFirebase = window.sincronizarSlidesAPI;

// ═══════════════════════════════════════════════════════════════
// 📝 FORMULÁRIO - ABAS E PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Muda entre as abas Texto e Imagem
 * @function window.mudarAbaAdmin
 * @param {string} aba - 'texto' ou 'imagem'
 * @param {HTMLElement} botao - Elemento do botão clicado
 */
window.mudarAbaAdmin = function (aba, botao) {
  // Esconder todas as abas
  document.getElementById("aba-admin-texto").style.display = "none";
  document.getElementById("aba-admin-imagem").style.display = "none";

  // Mostrar aba selecionada
  document.getElementById("aba-admin-" + aba).style.display = "block";

  // Atualizar estilos dos botões
  const botoes = document.querySelectorAll(".form-slide .aba-botao");
  botoes.forEach((b) => {
    b.style.color = "var(--text2)";
    b.style.borderBottom = "3px solid transparent";
  });

  botao.style.color = "var(--text)";
  botao.style.borderBottom = "3px solid var(--accent)";
};

/**
 * Renderiza preview da imagem selecionada (admin)
 * @function window.previewImagemAdmin
 */
window.previewImagemAdmin = function () {
  const file = document.getElementById("arquivo-imagem-admin").files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const preview = document.getElementById("preview-admin");
    preview.src = e.target.result;
    preview.style.display = "block";
    document.getElementById("nome-arquivo-admin").textContent = file.name;
  };
  reader.readAsDataURL(file);
};

/**
 * Limpa o formulário de novo slide
 * @function window.limparFormulario
 */
window.limparFormulario = function () {
  document.getElementById("f-emoji").value = "📌";
  document.getElementById("f-titulo").value = "";
  document.getElementById("f-descritivo").value = "";
  document.getElementById("f-destaque").value = "";
  document.getElementById("f-final").value = "";
  document.getElementById("f-duracao").value = "10";
  document.getElementById("f-cor-fundo").value = "#2d3561";
  document.getElementById("f-cor-titulo").value = "#667eea";
  document.getElementById("f-cor-destaque").value = "#ffdd00";
  
  // Limpar também a imagem
  document.getElementById("arquivo-imagem-admin").value = "";
  document.getElementById("preview-admin").style.display = "none";
  document.getElementById("nome-arquivo-admin").textContent = "";

  // Limpar também o vídeo
  document.getElementById("arquivo-video-admin").value = "";
  document.getElementById("preview-video").style.display = "none";
  document.getElementById("nome-arquivo-video").textContent = "";
  document.getElementById("tamanho-arquivo-video").textContent = "";
  document.getElementById("duracao-video-input-admin").value = "15";
  document.getElementById("titulo-video-admin").value = "";
  
  // Limpar preview em tempo real
  limparPreviewTempoReal();
};

// ═══════════════════════════════════════════════════════════════
// 👀 PREVIEW EM TEMPO REAL
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna todos os slides do sistema como array unificado
 * Combina slides padrão com extras, completando informações faltantes
 * @function obterTodosSlides
 * @returns {Array<Object>} Array com todos os slides
 */
function obterTodosSlides() {
  const slidesPadrao = window.SLIDES_PADRAO.map((s, i) => ({
    titulo: s.titulo || "Slide Padrão",
    tipo: "padrao",
    duracao: s.duracao || 10,
    emoji: s.titulo ? s.titulo.split(" ")[0] : "📌",
    descricao: "",
    imagem: null,
    videoUrl: null,
    background: getGradientePadrao(i),
    corTitulo: getCorPadrao(i).titulo,
    corEmoji: getCorPadrao(i).emoji,
  }));

  const slidesExtrasMapeados = slidesExtras.map((s) => {
    if (s.tipo === "imagem") {
      return {
        titulo: s.nome || s.titulo || "Imagem",
        tipo: "imagem",
        duracao: parseInt(s.duracao) || 10,
        emoji: "🖼️",
        descricao: "",
        imagem: s.imagem || null,
        videoUrl: null,
        background: null,
        corTitulo: null,
        corEmoji: null,
      };
    }

    if (s.tipo === "video") {
      return {
        titulo: s.nome || s.titulo || "Vídeo",
        tipo: "video",
        duracao: parseInt(s.duracao) || 15,
        emoji: "🎥",
        descricao: "",
        imagem: null,
        videoUrl: s.videoUrl || null,
        background: null,
        corTitulo: null,
        corEmoji: null,
      };
    }

    // Slide de texto customizado
    const bg = extrairBackgroundDoHtml(s);
    const corTit = extrairCorDoHtml(s.html, "titulo-principal") || "#667eea";
    const corEmo = extrairCorDoHtml(s.html, "icon-grande") || corTit;

    return {
      titulo: s.titulo || "(sem título)",
      tipo: "texto",
      duracao: parseInt(s.duracao) || 10,
      emoji: s.html ? extrairEmojiDoHtml(s.html) : "📌",
      descricao: s.html ? extrairDescricaoDoHtml(s.html) : "",
      imagem: null,
      videoUrl: null,
      background: bg,
      corTitulo: corTit,
      corEmoji: corEmo,
    };
  });

  return [...slidesPadrao, ...slidesExtrasMapeados];
}

/**
 * Extrai emoji do HTML gerado de um slide de texto
 * @function extrairEmojiDoHtml
 * @param {string} html - HTML do slide
 * @returns {string} Emoji encontrado ou "📌" como fallback
 */
function extrairEmojiDoHtml(html) {
  try {
    const match = html.match(/class="icon-grande"[^>]*>([^<]+)</);
    return match ? match[1].trim() : "📌";
  } catch (_) {
    return "📌";
  }
}

/**
 * Extrai uma cor inline de um elemento pelo nome de classe
 * @function extrairCorDoHtml
 * @param {string} html - HTML do slide
 * @param {string} nomeClasse - Nome da classe CSS para buscar
 * @returns {string|null} Cor encontrada ou null
 */
function extrairCorDoHtml(html, nomeClasse) {
  if (!html) return null;
  try {
    const re = new RegExp(`class="${nomeClasse}"[^>]*style="[^"]*color:\\s*([^;"\s]+)`);
    const match = html.match(re);
    return match ? match[1].trim() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Extrai o gradiente/background de um slide extra
 * @function extrairBackgroundDoHtml
 * @param {Object} slideObj - Objeto do slide
 * @returns {string} Gradiente CSS
 */
function extrairBackgroundDoHtml(slideObj) {
  if (slideObj.background) return slideObj.background;
  return "linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)";
}

/**
 * Extrai a descrição do HTML gerado de um slide de texto
 * @function extrairDescricaoDoHtml
 * @param {string} html - HTML do slide
 * @returns {string} Descrição encontrada ou string vazia
 */
function extrairDescricaoDoHtml(html) {
  try {
    const match = html.match(/class="descritivo"[^>]*>([^<]+)</);
    return match ? match[1].trim() : "";
  } catch (_) {
    return "";
  }
}

/**
 * Gera o HTML interno da área de conteúdo do preview
 * Aplica gradiente de fundo e cores reais do slide
 * @function gerarConteudoPreview
 * @param {Object} slide - Objeto do slide com todas as propriedades
 * @returns {string} HTML a inserir no preview
 */
function gerarConteudoPreview(slide) {
  if (!slide) {
    return `<div class="preview-empty">
      <span class="preview-empty-icon">⏸️</span>
      <span>Nenhum slide</span>
    </div>`;
  }

  // Preview de vídeo (muted + autoplay: exige política dos browsers; loop mantém movimento no painel)
  if (slide.tipo === "video" && slide.videoUrl) {
    const tituloEsc = String(slide.titulo || "Vídeo").replace(/"/g, "&quot;");
    return `<video 
      class="preview-video" 
      src="${slide.videoUrl}" 
      crossorigin="anonymous"
      title="${tituloEsc}"
      muted 
      playsinline 
      autoplay 
      loop
      preload="auto"
      style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    ></video><div class="preview-empty" style="display:none;">
      <span class="preview-empty-icon">🎥</span>
      <span>Vídeo</span>
    </div>`;
  }

  // Preview de imagem
  if (slide.tipo === "imagem" && slide.imagem) {
    return `<img 
      class="preview-img" 
      src="${slide.imagem}" 
      alt="${slide.titulo}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    /><div class="preview-empty" style="display:none;">
      <span class="preview-empty-icon">🖼️</span>
      <span>Imagem</span>
    </div>`;
  }

  // Preview de texto (padrão ou customizado)
  const desc = slide.descricao
    ? (slide.descricao.length > 70
        ? slide.descricao.substring(0, 70) + "…"
        : slide.descricao)
    : "";

  const bg = slide.background || "linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)";
  const corTit = slide.corTitulo || "#ffffff";
  const corEmoji = slide.corEmoji || corTit;

  return `<div class="preview-text-content" style="background:${bg};">
    <span class="preview-emoji" style="color:${corEmoji};">${slide.emoji || "📌"}</span>
    <div class="preview-slide-titulo" style="color:${corTit};">${slide.titulo}</div>
    ${desc ? `<div class="preview-slide-desc">${desc}</div>` : ""}
  </div>`;
}

/**
 * Gera as tags de metadados (duração e tipo) para o footer do preview
 * @function gerarTagsPreview
 * @param {Object} slide - Objeto do slide
 * @returns {string} HTML com as tags
 */
function gerarTagsPreview(slide) {
  if (!slide) return "";

  const tagTipo = slide.tipo === "imagem"
    ? `<span class="preview-tag tipo-imagem">🖼️ Imagem</span>`
    : slide.tipo === "video"
    ? `<span class="preview-tag tipo-video">🎥 Vídeo</span>`
    : slide.tipo === "padrao"
    ? `<span class="preview-tag tipo-padrao">📌 Padrão</span>`
    : slide.tipo === "video"
    ? `<span class="preview-tag tipo-video">🎥 Vídeo</span>`
    : `<span class="preview-tag tipo-texto">📝 Texto</span>`;

  const tagDuracao = `<span class="preview-tag duracao">⏱️ ${slide.duracao}s</span>`;

  return tagDuracao + tagTipo;
}

// ═══════════════════════════════════════════════════════════════
// 🎬 FUNÇÕES DO PREVIEW AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════

/**
 * Obtém a duração do slide no preview
 * @function obterDuracaoSlidePreview
 * @param {number} indice - Índice do slide
 * @returns {number} Duração em segundos
 */
function obterDuracaoSlidePreview(indice) {
  const todosSlides = obterTodosSlides();
  if (todosSlides && todosSlides[indice]) {
    return parseInt(todosSlides[indice].duracao) || 10;
  }
  return 10;
}

/**
 * Inicia rotação automática do preview
 * @function iniciarPreviewAutomatico
 */
function iniciarPreviewAutomatico() {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    console.warn("🔒 CONTROLADOR: preview automático bloqueado");
    return;
  }

  // Limpar timers anteriores sempre que iniciar
  clearTimeout(previewTimerAtual);
  clearInterval(previewCountdownInterval);

  const duracao = obterDuracaoSlidePreview(previewSlideAtual);
  previewTempoRestante = duracao; // sempre começa do zero ao trocar de slide

  _dispararLoopPreview();
}

/**
 * Dispara o loop de countdown usando previewTempoRestante atual.
 * Chamado por iniciarPreviewAutomatico (tempo cheio) e por
 * retomarPreview (tempo restante de onde pausou).
 */
function _dispararLoopPreview() {
  if (!logado) return;

  clearTimeout(previewTimerAtual);
  clearInterval(previewCountdownInterval);

  const tempoMs = previewTempoRestante * 1000;

  console.log(`⏱️ Preview: Slide ${previewSlideAtual + 1} — retomando com ${previewTempoRestante}s restantes`);

  // Atualizar contador visual imediatamente
  _atualizarContadorPreview(previewTempoRestante);

  // Ticker de 1 em 1 segundo
  previewCountdownInterval = setInterval(() => {
    previewTempoRestante--;
    _atualizarContadorPreview(previewTempoRestante);
  }, 1000);

  // Timeout que avança o slide ao fim do tempo restante
  previewTimerAtual = setTimeout(() => {
    clearInterval(previewCountdownInterval);

    const totalSlides = obterTodosSlides().length;
    previewSlideAtual = (previewSlideAtual + 1) % totalSlides;

    enviarComando({
      tipo: "irParaSlide",
      indice: previewSlideAtual,
      source: "preview-admin"
    });

    renderizarPreview();
    iniciarPreviewAutomatico(); // próximo slide começa do tempo cheio
  }, tempoMs);
}

/** Atualiza o badge de countdown no preview */
function _atualizarContadorPreview(segundos) {
  const el = document.getElementById("preview-countdown");
  if (!el) return;
  el.textContent = `${Math.max(segundos, 0)}s`;
  el.style.color = segundos <= 3 ? "#ff6b6b" : "var(--accent)";
}

/**
 * Vai para slide anterior no preview
 * @function previaPrevio
 */
window.previaPrevio = function () {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    toast("🔒 CONTROLADOR: acesso bloqueado", "erro");
    return;
  }
  
  clearTimeout(previewTimerAtual);
  
  const totalSlides = obterTodosSlides().length;
  previewSlideAtual = previewSlideAtual === 0 
    ? totalSlides - 1 
    : previewSlideAtual - 1;
  
  enviarComando({
    tipo: "irParaSlide",
    indice: previewSlideAtual,
    source: "preview-admin"
  });
  
  renderizarPreview();
  iniciarPreviewAutomatico();
  
  toast(`⏮️ Anterior: Slide ${previewSlideAtual + 1}`, "verde", 1500);
};

/**
 * Vai para próximo slide no preview
 * @function proximaPreview
 */
window.proximaPreview = function () {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    toast("🔒 CONTROLADOR: acesso bloqueado", "erro");
    return;
  }
  
  clearTimeout(previewTimerAtual);
  
  const totalSlides = obterTodosSlides().length;
  previewSlideAtual = (previewSlideAtual + 1) % totalSlides;
  
  enviarComando({
    tipo: "irParaSlide",
    indice: previewSlideAtual,
    source: "preview-admin"
  });
  
  renderizarPreview();
  iniciarPreviewAutomatico();
  
  toast(`⏭️ Próximo: Slide ${previewSlideAtual + 1}`, "verde", 1500);
};

/**
 * Pausa rotação do preview
 * @function pausarPreview
 */
window.pausarPreview = function () {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    toast("🔒 CONTROLADOR: acesso bloqueado", "erro");
    return;
  }

  // 1️⃣ Parar o loop do preview no admin
  clearTimeout(previewTimerAtual);
  clearInterval(previewCountdownInterval);

  // 2️⃣ Mostrar ⏸️ no contador visual
  const el = document.getElementById("preview-countdown");
  if (el) {
    el.textContent = "⏸️";
    el.style.color = "#ffdd00";
  }

  // 3️⃣ Pausar o timer/contador do index.html via Firebase
  enviarComando({
    tipo: "pausar",
    source: "preview-admin"
  });

  toast("⏸️ Pausado — preview e display parados", "amarelo", 2000);
  console.log("⏸️ Preview e display pausados");
};

/**
 * Retoma rotação do preview
 * @function retomarPreview
 */
window.retomarPreview = function () {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    toast("🔒 CONTROLADOR: acesso bloqueado", "erro");
    return;
  }

  // 1️⃣ Retomar o timer/contador do index.html via Firebase
  enviarComando({
    tipo: "retomar",
    source: "preview-admin"
  });

  // 2️⃣ Retomar o preview de onde parou (previewTempoRestante foi preservado no pause)
  _dispararLoopPreview();

  toast("▶️ Retomado — preview e display rodando", "verde", 2000);
  console.log("▶️ Preview e display retomados");
};

/**
 * SINCRONIZAÇÃO DO PREVIEW COM SLIDES
 * ═════════════════════════════════════════════════════════════
 * Garante que o preview reconhece novos slides adicionados/removidos
 * e que previewSlideAtual permanece válido
 * 
 * Fluxo:
 * 1. Slide é adicionado/removido → slidesExtras é atualizado
 * 2. Listener no Firebase dispara
 * 3. obterTodosSlides() retorna novo array com slides atualizados
 * 4. sincronizarPreviewComSlides() valida previewSlideAtual
 * 5. Se inválido → ajusta para último índice válido
 * 6. Reinicia rotação automática com novo total de slides
 * ═════════════════════════════════════════════════════════════
 */

/**
 * Valida e sincroniza o estado do preview com o total de slides atual
 * Chamado quando slides são adicionados/removidos durante a rotação
 * 
 * ⚠️ USA DEBOUNCE para evitar múltiplas chamadas simultâneas
 * que causam rotação excessiva de slides
 * 
 * @function sincronizarPreviewComSlides
 */
function sincronizarPreviewComSlides() {
  // 🔒 Apenas ADMIN pode sincronizar preview
  if (perfilAtual !== 'admin') {
    console.warn("🔒 CONTROLADOR: sincronização de preview bloqueada");
    return;
  }

  // Cancelar sincronização pendente anterior
  if (_sincronizaPreviewTimer) {
    clearTimeout(_sincronizaPreviewTimer);
  }
  
  // Agendar nova sincronização com delay (debounce)
  _sincronizaPreviewTimer = setTimeout(() => {
    _sincronizaPreviewTimer = null; // Limpar flag
    
    if (!logado) return;
    
    const todosSlides = obterTodosSlides();
    const totalSlides = todosSlides.length;
    
    console.group("🔄 SINCRONIZAÇÃO DE PREVIEW");
    console.log(`Total de slides atual: ${totalSlides}`);
    console.log(`Preview slide atual: ${previewSlideAtual + 1} (índice ${previewSlideAtual})`);
    
    // Validar se previewSlideAtual ainda é válido
    if (previewSlideAtual >= totalSlides) {
      const novoIndice = Math.max(0, totalSlides - 1);
      console.warn(`⚠️ previewSlideAtual inválido! (${previewSlideAtual} >= ${totalSlides})`);
      console.log(`✅ Ajustando para: ${novoIndice + 1} (último slide válido)`);
      previewSlideAtual = novoIndice;
    }
    
    // Parar e reiniciar rotação para reconhecer novo total
    clearTimeout(previewTimerAtual);
    console.log("⏸️ Parando rotação anterior");
    
    // Renderizar imediatamente com novo estado
    renderizarPreview();
    
    // Reiniciar rotação automática com novo total
    iniciarPreviewAutomatico();
    console.log("▶️ Rotação reiniciada com novo total");
    
    console.log(`📊 Estado final: ${previewSlideAtual + 1}/${totalSlides}`);
    console.groupEnd();
    
  }, DEBOUNCE_SINCRONIZACAO); // Aguarda 300ms antes de sincronizar
}

/**
 * Ir para slide sincronizado com preview
 * Funciona mesmo durante rotação automática
 * @function irParaSlidePreview
 * @param {number} indice - Índice do slide alvo
 */
window.irParaSlidePreview = function (indice) {
  if (!logado) return;
  if (perfilAtual !== 'admin') {
    toast("🔒 CONTROLADOR: acesso bloqueado", "erro");
    return;
  }
  
  // Validar índice
  const totalSlides = obterTodosSlides().length;
  if (indice < 0 || indice >= totalSlides) {
    console.warn(`⚠️ Índice ${indice} inválido`);
    return;
  }
  
  // Pausar a rotação automática
  clearTimeout(previewTimerAtual);
  
  // Atualizar preview para o novo slide
  previewSlideAtual = indice;
  
  // Enviar comando ao Firebase
  enviarComando({
    tipo: "irParaSlide",
    indice: indice,
    source: "preview-admin"
  });
  
  // Renderizar preview imediatamente
  renderizarPreview();
  
  // Retomar rotação automática
  iniciarPreviewAutomatico();
  
  console.log(`🎯 Navegação sincronizada: Slide ${indice + 1}`);
};

// ═══════════════════════════════════════════════════════════════
// 📊 RENDERIZAR PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Garante reprodução dos vídeos no mini-preview (innerHTML não dispara autoplay em alguns casos).
 */
function garantirPlaybackVideosPreview(areas) {
  const lista = Array.isArray(areas) ? areas : [areas];
  lista.forEach((root) => {
    if (!root) return;
    root.querySelectorAll("video.preview-video").forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute("playsinline", "");
      const tentarPlay = () => {
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      };
      tentarPlay();
      video.addEventListener("loadeddata", tentarPlay, { once: true });
      video.addEventListener("canplay", tentarPlay, { once: true });
    });
  });
}

/**
 * Renderiza o preview dos 2 slides (atual + próximo) no painel
 * Função principal que deve ser chamada quando estado mudar
 * @function window.renderizarPreview
 */
window.renderizarPreview = function () {
  try {
    // Validar elementos DOM
    const areaAtual = document.getElementById("preview-area-atual");
    const areaProximo = document.getElementById("preview-area-proximo");
    const numAtual = document.getElementById("preview-num-atual");
    const numProximo = document.getElementById("preview-num-proximo");
    const tagsAtual = document.getElementById("preview-tags-atual");
    const tagsProximo = document.getElementById("preview-tags-proximo");

    if (!areaAtual || !areaProximo || !numAtual || !numProximo) {
      console.warn("⚠️ Elementos do preview não encontrados");
      return;
    }

    // Montar lista de todos os slides
    const todosSlides = obterTodosSlides();
    const total = todosSlides.length;

    if (total === 0) {
      // Edge case: sem slides
      areaAtual.innerHTML = `<div class="preview-empty"><span class="preview-empty-icon">📭</span><span>Sem slides</span></div>`;
      areaProximo.innerHTML = `<div class="preview-empty"><span class="preview-empty-icon">—</span><span>—</span></div>`;
      numAtual.textContent = "—";
      numProximo.textContent = "—";
      if (tagsAtual) tagsAtual.innerHTML = "";
      if (tagsProximo) tagsProximo.innerHTML = "";
      return;
    }

    // Validar índice atual
    const idxAtual = Math.min(Math.max(previewSlideAtual, 0), total - 1);
    const idxProximo = (idxAtual + 1) % total;

    const slideAtual = todosSlides[idxAtual];
    const slideProximo = todosSlides[idxProximo];

    // Renderizar card atual
    areaAtual.innerHTML = gerarConteudoPreview(slideAtual);
    numAtual.textContent = `Slide ${idxAtual + 1} de ${total}`;
    if (tagsAtual) tagsAtual.innerHTML = gerarTagsPreview(slideAtual);

    // Renderizar card próximo
    areaProximo.innerHTML = gerarConteudoPreview(slideProximo);
    numProximo.textContent = `Slide ${idxProximo + 1} de ${total}`;
    if (tagsProximo) tagsProximo.innerHTML = gerarTagsPreview(slideProximo);

    garantirPlaybackVideosPreview([areaAtual, areaProximo]);

    console.log(`✅ Preview: Slide ${idxAtual + 1} (${slideAtual.tipo}) → ${idxProximo + 1} (${slideProximo.tipo})`);
    
    // Ativar preview clicável
    ativarPreviewClicavel();

  } catch (err) {
    console.error("❌ Erro ao renderizar preview:", err);
  }
};

// Fazer preview clicável para sincronização
function ativarPreviewClicavel() {
  const previewCardAtual = document.getElementById("preview-card-atual");
  
  if (!previewCardAtual) return;
  
  // Remover listener anterior se existir
  previewCardAtual.onclick = null;
  
  // Adicionar novo listener
  previewCardAtual.addEventListener("click", function () {
    if (previewSlideAtual >= 0) {
      // Pausar timer e ir para slide clicado
      clearTimeout(previewTimerAtual);
      
      enviarComando({
        tipo: "irParaSlide",
        indice: previewSlideAtual,
        source: "preview-admin"
      });
      
      // Feedback visual
      toast(`🔗 Sincronizando todos para Slide ${previewSlideAtual + 1}`, "verde", 2000);
      
      // Adicionar classe visual temporária
      previewCardAtual.classList.add("sync-enviado");
      setTimeout(() => previewCardAtual.classList.remove("sync-enviado"), 600);
      
      // Retomar preview após 1 segundo
      setTimeout(() => iniciarPreviewAutomatico(), 1000);
    }
  }, { once: false });
  
  // Mostrar que é clicável
  previewCardAtual.style.cursor = "pointer";
  console.log("✅ Preview sincronizável ativado");
}

// ═══════════════════════════════════════════════════════════════
// 📢 TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

let toastTimeout;

/**
 * Mostra uma notificação Toast (aviso/sucesso/erro)
 * @function window.toast
 * @param {string} msg - Mensagem a exibir
 * @param {string} tipo - Tipo: 'verde', 'erro', ou vazio (padrão)
 * @param {number} ms - Duração em milissegundos (padrão: 3000)
 */
window.toast = function (msg, tipo = "", ms = 3000) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show " + (tipo || "");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => (el.className = ""), ms);
};

// ═══════════════════════════════════════════════════════════════
// 🔌 INICIALIZAÇÃO FIREBASE (funções globais mock)
// ═══════════════════════════════════════════════════════════════
/**
 * ⚠️ DEPRECATED: Firebase direct calls have been removed in Phase 4
 * All references have been migrated to use apiClient and Node.js/Express backend
 */

// ═══════════════════════════════════════════════════════════════
// 🖥️ GERENCIAMENTO DE DISPLAYS REMOTOS
// ═══════════════════════════════════════════════════════════════

function atualizarBotaoMuteVideoDisplays() {
  const btn = document.getElementById("btn-mute-video-displays");
  if (!btn) return;
  if (videoSlideMutedPainel) {
    btn.textContent = "🔊 Ativar som do vídeo";
    btn.title =
      "Os vídeos no slide atual estão mutados nos displays. Clique para permitir áudio.";
  } else {
    btn.textContent = "🔇 Silenciar vídeo";
    btn.title =
      "O áudio do vídeo no slide atual está ligado nos displays. Clique para silenciar.";
  }
}

async function escutarVideoSlideMutedConfig() {
  try {
    const result = await apiClient.apiCall('/video/mute', 'GET');
    if (result.status === 'ok') {
      videoSlideMutedPainel = result.muted;
      atualizarBotaoMuteVideoDisplays();
    }
  } catch (err) {
    console.warn("⚠️ Erro ao obter status de mute:", err);
  }
}

window.alternarMuteVideoNosDisplays = async function () {
  const novo = !videoSlideMutedPainel;
  try {
    const result = await apiClient.apiCall('/video/mute', 'POST', { muted: novo });
    if (result.status === 'ok') {
      videoSlideMutedPainel = novo;
      toast(result.message, "verde", 2500);
    } else {
      throw new Error(result.message || 'Erro ao salvar preferência de áudio');
    }
  } catch (e) {
    toast("❌ Erro ao salvar preferência de áudio", "erro");
    console.error(e);
  }
};

function normalizarVolumeVideoPainel(v) {
  if (v === null || v === undefined) return 1;
  const n = Number(v);
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

async function escutarVideoSlideVolumeConfig() {
  try {
    const result = await apiClient.apiCall('/video/volume', 'GET');
    if (result.status === 'ok') {
      videoSlideVolumePainel = result.volume;
      const slider = document.getElementById("slider-volume-video-displays");
      const lbl = document.getElementById("label-volume-video-displays");
      const pct = result.percentage;
      if (slider && Math.abs(parseInt(slider.value, 10) - pct) > 0) {
        slider.value = String(pct);
      }
      if (lbl) lbl.textContent = `${pct}%`;
    }
  } catch (err) {
    console.warn("⚠️ Erro ao obter volume:", err);
  }
}

async function publicarVolumeVideoDisplays(vol01) {
  const v = normalizarVolumeVideoPainel(vol01);
  try {
    const result = await apiClient.apiCall('/video/volume', 'POST', { volume: v });
    if (result.status !== 'ok') {
      throw new Error(result.message || 'Erro ao salvar volume');
    }
  } catch (e) {
    toast("❌ Erro ao salvar volume", "erro");
    console.error(e);
  }
}

function configurarSliderVolumeVideoDisplays() {
  const slider = document.getElementById("slider-volume-video-displays");
  if (!slider || slider.dataset.volumeListener === "1") return;
  slider.dataset.volumeListener = "1";
  slider.addEventListener("input", () => {
    const pct = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
    const el = document.getElementById("label-volume-video-displays");
    if (el) el.textContent = `${pct}%`;
    clearTimeout(_volumeDebounceTimer);
    _volumeDebounceTimer = setTimeout(() => {
      publicarVolumeVideoDisplays(pct / 100);
    }, 200);
  });
}

/**
 * Escuta displays conectados via API
 */
async function escutarDisplaysConectados() {
  try {
    const result = await apiClient.apiCall('/displays', 'GET');
    if (result.status === 'ok') {
      const displays = result.displays || [];
      if (displays.length === 0) {
        console.log("ℹ️ Nenhum display conectado");
      } else {
        console.log(`📺 ${displays.length} display(s) carregado(s)`);
      }
      renderizarDisplays(displays);
    }
  } catch (error) {
    console.warn("⚠️ Erro ao carregar displays:", error);
  }
}

/**
 * Renderiza lista de displays conectados
 */
function renderizarDisplays(displays) {
  const container = document.getElementById("container-displays");
  if (!container) return;

  if (!displays || displays.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #999; padding: 20px;">
        <p>📺 Nenhum display conectado</p>
        <p style="font-size: 12px; margin-top: 8px;">Os displays aparecerão aqui quando se conectarem</p>
      </div>
    `;
    return;
  }

  // Limiar: se o último heartbeat foi há mais de 75s, o display está offline
  const LIMIAR_INATIVO_MS = 75 * 1000;
  const agora = Date.now();

  let html = `<div style="display: grid; gap: 12px;">`;

  displays.forEach(display => {
    const msSemHeartbeat = agora - (display.ultimaAtualizacao || 0);
    const isAtivo = display.status === "ativo" && msSemHeartbeat < LIMIAR_INATIVO_MS;
    const statusIcon = isAtivo ? "🟢" : "🔴";
    const statusTexto = isAtivo ? "ATIVO" : "OFFLINE";
    const statusColor = isAtivo ? "#4ade80" : "#ef4444";
    const tempoTexto = msSemHeartbeat < 60000
      ? `${Math.round(msSemHeartbeat / 1000)}s atrás`
      : `${Math.round(msSemHeartbeat / 60000)}m atrás`;

    const nomeSemNome = !display.nome || display.nome === "NOVO DISPLAY A SER CADASTRADO";
    const nomeExibido = nomeSemNome
      ? `<span style="color:#f59e0b;">⚠️ Sem nome</span>`
      : `<strong style="color: var(--text);">${display.nome}</strong>`;

    html += `
      <div style="
        background: var(--bg3);
        border: 1px solid ${isAtivo ? "rgba(74,222,128,0.3)" : "var(--border)"};
        border-radius: 10px;
        padding: 14px;
      ">
        <!-- Cabeçalho: nome + status -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${statusColor}; font-size: 14px;">${statusIcon}</span>
            ${nomeExibido}
            <span style="
              font-size: 10px;
              font-weight: 700;
              padding: 2px 7px;
              border-radius: 20px;
              background: ${isAtivo ? "rgba(74,222,128,0.15)" : "rgba(239,68,68,0.15)"};
              color: ${statusColor};
              border: 1px solid ${isAtivo ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.4)"};
            ">${statusTexto}</span>
          </div>
          <div style="font-size: 11px; color: #666;">
            Heartbeat: ${tempoTexto}
          </div>
        </div>

        <!-- Botão Renomear (abre modal) -->
        <div style="margin-bottom: 10px;">
          <button
            onclick="abrirModalRenomearDisplay('${display.id}', '${(display.nome || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')}')"
            style="
              background: #4ade80;
              color: #000;
              border: none;
              border-radius: 6px;
              padding: 7px 14px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='#22c55e'"
            onmouseout="this.style.background='#4ade80'"
            title="Renomear este display"
          >✏️ Renomear</button>
        </div>

        <!-- ID e UA -->
        <div style="font-size: 11px; color: #555; margin-bottom: 10px; word-break: break-all;">
          ID: ${display.id}
        </div>

        <!-- Botões de ação -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            onclick="enviarComandoDisplay('${display.id}', 'abrirBiblioteca')"
            style="background: #667eea; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer; transition: background 0.2s;"
            onmouseover="this.style.background='#5568d3'" onmouseout="this.style.background='#667eea'"
            title="Abrir biblioteca"
          >
            📚 Abrir
          </button>
          <button
            onclick="enviarComandoDisplay('${display.id}', 'fecharBiblioteca')"
            style="background: #764ba2; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer;"
            title="Fechar biblioteca"
          >✕ Fechar</button>
          <button
            onclick="enviarComandoDisplay('${display.id}', 'tocarSom')"
            style="background: #f59e0b; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer;"
            title="Tocar som de atenção"
          >🔔 Atenção</button>
          <button
            onclick="abrirMonitorDisplay('${display.id}', '${(display.nome || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')}')"
            style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-weight:700;"
            onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'"
            title="Ver ao vivo o que está sendo exibido"
          >📺 Tela</button>
          <button
            onclick="if(confirm('Deletar este display do Firebase?')) window.deletarDisplayDoFirebase('${display.id}')"
            style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer; margin-left: auto;"
            title="Deletar display"
          >🗑️ Deletar</button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  console.log(`✅ ${displays.length} display(s) renderizado(s)`);
}

/**
 * Envia comando para um display específico
 */
window.enviarComandoDisplay = async function(displayId, tipo, dados = {}) {
  try {
    const result = await apiClient.apiCall(`/displays/${displayId}/comando`, 'POST', {
      tipo,
      dados
    });
    if (result.status === 'ok') {
      toast(result.message, "verde", 2000);
      console.log(`📡 Comando enviado para ${displayId}:`, tipo);
    } else {
      throw new Error(result.message || 'Erro ao enviar comando');
    }
  } catch (err) {
    toast("❌ Erro ao enviar comando", "erro");
    console.error("Erro ao enviar comando:", err);
  }
};

/**
 * Deleta um display da API
 */
window.deletarDisplayDoFirebase = async function(idDisplay) {
  if (!idDisplay || idDisplay.trim() === "") {
    console.error("❌ ID do display inválido");
    toast("❌ ID do display inválido", "erro");
    return;
  }
  
  try {
    console.log(`🗑️ Deletando display: ${idDisplay}`);
    const result = await apiClient.apiCall(`/displays/${idDisplay}`, 'DELETE');
    if (result.status === 'ok') {
      console.log(`✅ Display deletado: ${idDisplay}`);
      toast(result.message, "verde", 2000);
      // Recarregar lista de displays
      await escutarDisplaysConectados();
    } else {
      throw new Error(result.message || 'Erro ao deletar display');
    }
  } catch (err) {
    console.error(`❌ Erro ao deletar display ${idDisplay}:`, err);
    toast(`❌ Erro ao deletar: ${err.message}`, "erro");
  }
};

/**
 * ═══════════════════════════════════════════════════════════════
 * ✏️ RENOMEAR DISPLAY VIA MODAL
 * ═══════════════════════════════════════════════════════════════
 * Substitui o input inline por um modal dedicado.
 * O nome é gravado em libnotify/displays/{id}/nome via firebase_update
 * (PATCH — preserva status/comando/etc.).
 */

let _displayIdEditando = null;

/** Cria o modal e injeta os estilos uma única vez. */
function garantirModalRenameDisplay() {
  if (document.getElementById("modal-rename-display")) return;

  // Estilos (injetados uma vez)
  if (!document.getElementById("modal-rename-display-styles")) {
    const style = document.createElement("style");
    style.id = "modal-rename-display-styles";
    style.textContent = `
      .modal-rename-display {
        display: none;
        position: fixed; inset: 0;
        z-index: 9999;
        align-items: center; justify-content: center;
      }
      .modal-rename-display.aberto { display: flex; animation: mrdFade .18s ease; }
      @keyframes mrdFade { from { opacity: 0 } to { opacity: 1 } }
      .mrd-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,.65);
        backdrop-filter: blur(4px);
      }
      .mrd-conteudo {
        position: relative;
        background: var(--bg2, #1a1f3a);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px;
        padding: 22px 26px;
        width: min(440px, 92vw);
        color: #fff;
        box-shadow: 0 20px 60px rgba(0,0,0,.55);
      }
      .mrd-titulo { margin: 0 0 14px; font-size: 1.2em; font-weight: 600; }
      .mrd-info { margin: 4px 0; font-size: .9em; color: rgba(255,255,255,.7); word-break: break-all; }
      .mrd-label { display: block; margin: 16px 0 6px; font-size: .9em; color: rgba(255,255,255,.85); }
      .mrd-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 1em;
        font-family: inherit;
        outline: none;
      }
      .mrd-input:focus { border-color: #667eea; background: rgba(255,255,255,.1); }
      .mrd-acoes { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
      .mrd-btn {
        padding: 9px 18px;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        font-size: .95em;
        font-weight: 600;
        font-family: inherit;
        transition: all .15s ease;
      }
      .mrd-cancelar { background: transparent; color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.2); }
      .mrd-cancelar:hover { background: rgba(255,255,255,.08); color: #fff; }
      .mrd-confirmar { background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; }
      .mrd-confirmar:hover { filter: brightness(1.1); transform: translateY(-1px); }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement("div");
  modal.id = "modal-rename-display";
  modal.className = "modal-rename-display";
  modal.innerHTML = `
    <div class="mrd-backdrop" onclick="fecharModalRenomearDisplay()"></div>
    <div class="mrd-conteudo" role="dialog" aria-modal="true">
      <h3 class="mrd-titulo">✏️ Renomear Display</h3>
      <p class="mrd-info">ID: <span id="mrd-display-id">—</span></p>
      <p class="mrd-info">Nome atual: <strong id="mrd-nome-atual">—</strong></p>
      <label class="mrd-label" for="mrd-input">Novo nome</label>
      <input type="text" id="mrd-input" class="mrd-input"
             placeholder="Ex.: TV Recepção" maxlength="60" autocomplete="off" />
      <div class="mrd-acoes">
        <button class="mrd-btn mrd-cancelar" onclick="fecharModalRenomearDisplay()">Cancelar</button>
        <button class="mrd-btn mrd-confirmar" onclick="confirmarRenomearDisplay()">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const input = modal.querySelector("#mrd-input");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmarRenomearDisplay();
    if (e.key === "Escape") fecharModalRenomearDisplay();
  });
}

window.abrirModalRenomearDisplay = function(displayId, nomeAtual) {
  garantirModalRenameDisplay();
  _displayIdEditando = displayId;

  document.getElementById("mrd-display-id").textContent = displayId;
  document.getElementById("mrd-nome-atual").textContent = nomeAtual || "—";

  const input = document.getElementById("mrd-input");
  const nomeValido = nomeAtual && nomeAtual !== "NOVO DISPLAY A SER CADASTRADO";
  input.value = nomeValido ? nomeAtual : "";

  document.getElementById("modal-rename-display").classList.add("aberto");
  setTimeout(() => input.focus(), 50);
};

window.fecharModalRenomearDisplay = function() {
  const modal = document.getElementById("modal-rename-display");
  if (modal) modal.classList.remove("aberto");
  _displayIdEditando = null;
};

window.confirmarRenomearDisplay = async function() {
  if (!_displayIdEditando) {
    toast("⚠️ Display não selecionado", "erro");
    return;
  }

  const input = document.getElementById("mrd-input");
  const novoNome = (input?.value || "").trim();
  if (!novoNome) {
    toast("⚠️ Digite um nome válido", "erro");
    input?.focus();
    return;
  }

  try {
    const result = await apiClient.apiCall(`/displays/${_displayIdEditando}`, 'PUT', {
      nome: novoNome
    });
    if (result.status === 'ok') {
      toast(result.message, "verde", 2500);
      console.log(`✅ Display ${_displayIdEditando} renomeado para: ${novoNome}`);
      window.fecharModalRenomearDisplay();
      // Recarregar lista de displays
      await escutarDisplaysConectados();
    } else {
      throw new Error(result.message || 'Erro ao renomear display');
    }
  } catch (err) {
    toast(`❌ Erro ao renomear: ${err.message}`, "erro");
    console.error("Erro ao renomear display:", err);
  }
};

/**
 * Mantido para compatibilidade — apenas redireciona ao modal
 * (caso alguma chamada antiga ainda exista em outros arquivos).
 */
window.renomearDisplayAdmin = function(displayId) {
  const cardBtn = document.querySelector(`[onclick*="${displayId}"][onclick*="abrirModalRenomearDisplay"]`);
  // Tenta extrair nome atual do HTML; fallback vazio
  window.abrirModalRenomearDisplay(displayId, "");
};

// Iniciar escuta de displays após login
window.addEventListener("displayadmin-logado", escutarDisplaysConectados);

// Se já logado, iniciar agora
if (window.logado) {
  setTimeout(escutarDisplaysConectados, 500);
}


// ═══════════════════════════════════════════════════════════════
// ⚠️ GERENCIAMENTO DE VÍDEOS (SUPABASE DESABILITADO)
// ═══════════════════════════════════════════════════════════════
// Funcionalidade de upload de vídeos removida.
// Para restaurar, configure Supabase ou implemente upload no backend.

/**
 * Renderiza preview do vídeo selecionado (admin)
 * @function window.previewVideoAdmin
 */
window.previewVideoAdmin = function () {
  const file = document.getElementById("arquivo-video-admin").files[0];
  if (!file) return;

  // Mostrar nome e tamanho do arquivo
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  document.getElementById("nome-arquivo-video").textContent = file.name;
  document.getElementById("tamanho-arquivo-video").textContent = `Tamanho: ${sizeMB} MB`;

  // Renderizar preview de vídeo
  const videoElement = document.getElementById("preview-video");
  const reader = new FileReader();
  reader.onload = function (e) {
    // ✅ Use DataURL para que o vídeo possa ser exibido
    videoElement.src = e.target.result;
    videoElement.style.display = "block";
    
    // Detectar duração do vídeo
    videoElement.onloadedmetadata = function () {
      const duracao = Math.round(videoElement.duration);
      document.getElementById("duracao-video-input-admin").value = duracao;
      console.log(`📹 Duração detectada: ${duracao}s`);
    };
  };
  reader.readAsDataURL(file);
};

/**
 * Adiciona um novo slide de VÍDEO
 * Upload de vídeos via backend Node.js (endpoint /api/videos/upload)
 * 
 * @function window.adicionarSlideComVideoAdmin
 * @version 2 - Implementado upload no backend em Phase 4
 */
window.adicionarSlideComVideoAdmin = async function () {
  // ⚠️ Verificar permissão
  if (perfilAtual !== 'admin') {
    toast("❌ Apenas Admin pode adicionar vídeos", "erro");
    console.warn("❌ Tentativa de adicionar vídeo - perfil Controlador");
    return;
  }

  const fileInput = document.getElementById("arquivo-video-admin");
  const file = fileInput?.files[0];
  
  if (!file) {
    toast("⚠️ Selecione um vídeo", "erro");
    return;
  }

  // Validar tipo de arquivo
  if (!file.type.startsWith("video/")) {
    toast("❌ Arquivo deve ser um vídeo", "erro");
    return;
  }

  // Validar tamanho (máximo 500 MB)
  const maxSize = 500 * 1024 * 1024; // 500 MB
  if (file.size > maxSize) {
    toast("❌ Vídeo muito grande (máx 500MB)", "erro");
    return;
  }

  const duracao = parseInt(document.getElementById("duracao-video-input-admin").value) || 15;
  const titulo = document.getElementById("titulo-video-admin").value.trim() || file.name.replace(/\.[^.]+$/, "");

  try {
    // Mostrar loading
    toast("📤 Enviando vídeo para servidor...", "");
    
    // Criar FormData para envio multipart
    const formData = new FormData();
    formData.append('video', file);

    // 1️⃣ Upload do vídeo via POST /api/videos/upload
    console.log(`📹 Iniciando upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    
    const uploadResponse = await fetch('/api/videos/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.message || `Erro HTTP ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    if (uploadData.status !== 'ok') {
      throw new Error(uploadData.message || 'Erro ao fazer upload');
    }

    console.log(`✅ Vídeo enviado com sucesso:`, uploadData);

    // 2️⃣ Criar slide de vídeo com a URL retornada
    const slideData = {
      tipo: "video",
      url: uploadData.url,
      titulo: titulo,
      duracao: String(duracao),
      nome: file.name,
      tamanho: file.size,
      dataCriacao: new Date().toLocaleString("pt-BR"),
      criadoEm: Date.now(),
    };

    // Salvar via API
    const result = await apiClient.apiCall('/slides', 'POST', slideData);
    if (result.status !== 'ok') {
      throw new Error(result.message || 'Erro ao salvar slide de vídeo');
    }

    console.log(`✅ Slide de vídeo criado com sucesso`);

    // Disparar sincronização no display
    await enviarComando({
      tipo: "atualizarSlides",
      slides: result.data?.slides || [],
    });

    await carregarSlidesAPI();
    renderizarBotoesSlides();
    renderizarPreview();
    toast("✅ Vídeo adicionado com sucesso!", "verde");
    
    // Limpar inputs
    fileInput.value = "";
    const previewVideo = document.getElementById("preview-video");
    if (previewVideo) previewVideo.style.display = "none";
    
    const nomeArquivo = document.getElementById("nome-arquivo-video");
    if (nomeArquivo) nomeArquivo.textContent = "";
    
    const tamanhoArquivo = document.getElementById("tamanho-arquivo-video");
    if (tamanhoArquivo) tamanhoArquivo.textContent = "";
    
    const duracaoInput = document.getElementById("duracao-video-input-admin");
    if (duracaoInput) duracaoInput.value = "15";
    
    const tituloInput = document.getElementById("titulo-video-admin");
    if (tituloInput) tituloInput.value = "";
    
  } catch (err) {
    console.error("❌ Erro ao adicionar vídeo:", err);
    toast(`❌ Erro: ${err.message}`, "erro");
  }
};

console.log("✅ Script admin.js carregado");
