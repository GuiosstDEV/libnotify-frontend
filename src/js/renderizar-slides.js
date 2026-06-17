/* ═══════════════════════════════════════════════════════════════
   🎬 RENDERIZAR SLIDES PADRÃO DINAMICAMENTE
   ═══════════════════════════════════════════════════════════════ */

// Mapa de ícones para cada slide padrão
const SLIDE_ICONS = {
  "⚠️ ATENÇÃO - Guarde suas bolsas": "fas fa-bag-shopping",
  "📚 Biblioteca – Horário 9h–21h": "fas fa-book",
  "👤 Novo Aqui? Faça seu cadastro": "fas fa-user-check",
  "💻 Computadores – Fins Acadêmicos": "fas fa-laptop",
  "🚪 Sala de Estudo – Reserva Prévia": "fas fa-door-open",
};

// Mapa de estruturas HTML específicas para cada slide
const SLIDE_ESTRUTURAS = {
  "⚠️ ATENÇÃO - Guarde suas bolsas": {
    titulo: "⚠️ ATENÇÃO ⚠️",
    conteudo: `
      <div class="subtitulo">Guarde suas bolsas</div>
      <div class="subtitulo">e mochilas</div>
      <div class="mensagem-destaque">NO ARMÁRIO</div>
      <div class="descritivo">atrás!</div>
    `,
  },
  "📚 Biblioteca – Horário 9h–21h": {
    titulo: "Biblioteca",
    conteudo: `
      <div class="descritivo">📖 Horário de Funcionamento</div>
      <div class="mensagem-destaque">9h00 às 21h00</div>
      <div class="descritivo">Venha aproveitar nosso acervo!</div>
    `,
  },
  "👤 Novo Aqui? Faça seu cadastro": {
    titulo: "Novo Aqui?",
    conteudo: `
      <div class="subtitulo">Realize seu</div>
      <div class="mensagem-destaque">Cadastro</div>
      <div class="descritivo">no balcão com nosso recepcionista<br />para emprestar livros</div>
    `,
  },
  "💻 Computadores – Fins Acadêmicos": {
    titulo: "Computadores",
    conteudo: `
      <div class="descritivo">Use livremente para</div>
      <div class="mensagem-destaque">Fins Acadêmicos</div>
      <div class="descritivo">Com responsabilidade<br />e respeito às normas</div>
    `,
  },
  "🚪 Sala de Estudo – Reserva Prévia": {
    titulo: "Sala de Estudo",
    conteudo: `
      <div class="descritivo">Uso exclusivo mediante</div>
      <div class="mensagem-destaque">Reserva Prévia</div>
      <div class="descritivo">Fale com nosso recepcionista<br />para reservar seu espaço</div>
    `,
  },
};

/**
 * 🎬 Renderizar slides padrão no container
 * Chamado quando window.SLIDES_PADRAO está disponível
 */
function renderizarSlidesPadrao() {
  // Esperar o SLIDES_PADRAO estar disponível
  if (!window.SLIDES_PADRAO || !Array.isArray(window.SLIDES_PADRAO)) {
    console.warn("⏳ Aguardando SLIDES_PADRAO do admin.html...");
    setTimeout(renderizarSlidesPadrao, 500);
    return;
  }

  const container = document.getElementById("slides-container");
  if (!container) {
    console.error("❌ Container #slides-container não encontrado!");
    return;
  }

  // Limpar container
  container.innerHTML = "";

  // Renderizar cada slide padrão
  window.SLIDES_PADRAO.forEach((slide, indice) => {
    const estrutura = SLIDE_ESTRUTURAS[slide.titulo] || {};
    const icon = SLIDE_ICONS[slide.titulo] || "fas fa-star";
    const slideClass = `slide-${indice + 1}`;
    const activeClass = indice === 0 ? "active" : "";

    const slideHTML = `
      <div class="slide ${slideClass} ${activeClass}" data-index="${indice}" data-tipo="padrao">
        <div class="conteudo-wrapper">
          <div class="icon-grande"><i class="${icon}"></i></div>
          <div class="titulo-principal">${estrutura.titulo || slide.titulo}</div>
          <div class="card-info">
            ${estrutura.conteudo || `<div class="descritivo">${slide.titulo}</div>`}
          </div>
        </div>
      </div>
    `;

    container.innerHTML += slideHTML;
  });

  console.log(`✅ ${window.SLIDES_PADRAO.length} slides padrão renderizados dinamicamente`);
}

// 🚀 Executar quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", renderizarSlidesPadrao);

// Tentar renderizar também imediatamente (em caso de script já estar carregado)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderizarSlidesPadrao);
} else {
  renderizarSlidesPadrao();
}
