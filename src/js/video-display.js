/**
 * ═══════════════════════════════════════════════════════════════
 * 🎬 LibNotify — Renderização de Vídeo no Display
 * ═══════════════════════════════════════════════════════════════
 *
 * Arquivo: src/js/video-display.js
 * Responsabilidade: Controlar a reprodução de slides do tipo
 *                   "video" no display (index.html).
 *
 * Como funciona:
 *   1. aplicarSlidesExtrasNoDisplay() em index.js cria o elemento
 *      .slide com tipo "video" chamando criarElementoSlideVideo().
 *   2. Quando o slide fica ativo (mostrarSlide()), o timer do
 *      display é governado pela duração configurada no admin.
 *   3. Se o vídeo tiver áudio, ele é mutado por padrão (exibição
 *      pública). O admin pode habilitar áudio via propriedade
 *      `comAudio` no futuro.
 *
 * Depende de:
 *   • Nada — este módulo é autossuficiente.
 *   • É chamado por index.js via window.criarElementoSlideVideo()
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Cria um elemento <div class="slide slide-video"> completo
 * para um slide do tipo "video", pronto para ser inserido no DOM.
 *
 * @param {Object} slideData - Dados do slide vindo do Firebase
 * @param {string}  slideData.video      - Data URL base64 do vídeo
 * @param {string}  slideData.mimeType   - Ex: "video/mp4"
 * @param {string} [slideData.ajuste]    - "contain" (padrão) | "cover"
 * @param {string} [slideData.titulo]    - Título para acessibilidade
 * @param {number} [slideData.duracao]   - Duração em segundos
 * @param {boolean}[slideData.comAudio]  - true = permite áudio (padrão: false)
 * @returns {HTMLElement} O elemento slide montado
 */
window.criarElementoSlideVideo = function (slideData) {
  const ajuste = slideData.ajuste || "contain";
  const titulo = slideData.titulo || slideData.nome || "Vídeo";
  const muted = !slideData.comAudio; // mudo por padrão em exibição pública

  // ── Elemento raiz do slide ──
  const slide = document.createElement("div");
  slide.className = "slide slide-video";
  slide.setAttribute("data-duration", parseInt(slideData.duracao) || 15);
  slide.setAttribute("data-tipo", "video");

  // ── Overlay de loading (visível enquanto vídeo carrega) ──
  const loading = document.createElement("div");
  loading.className = "video-loading-overlay";
  loading.innerHTML = `
    <div class="video-loading-spinner"></div>
    <span>Carregando vídeo…</span>
  `;

  // ── Elemento de vídeo ──
  const video = document.createElement("video");
  video.className = "video-tela-cheia";
  video.setAttribute("aria-label", titulo);
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.loop = true;
  video.muted = muted;
  video.autoplay = false; // controlado manualmente abaixo
  
  // ⚡ FORÇA crossOrigin="anonymous" IMEDIATAMENTE para permitir captureStream
  try { video.crossOrigin = "anonymous"; } catch (_) {}

  // Definir object-fit via inline style (mais direto que classe)
  video.style.objectFit = ajuste;

  // ── Source ──
  const source = document.createElement("source");
  // ⚡ FORÇA crossOrigin no source também
  try { source.crossOrigin = "anonymous"; } catch (_) {}
  source.src = slideData.video;
  if (slideData.mimeType) source.type = slideData.mimeType;
  video.appendChild(source);

  // ── Fallback para browsers sem suporte ──
  video.insertAdjacentText("beforeend", "Seu navegador não suporta a reprodução deste vídeo.");

  // ── Badge discreto "Vídeo" no canto ──
  const badge = document.createElement("div");
  badge.className = "video-badge-tipo";
  badge.textContent = "🎬 Vídeo";

  // ── Montar slide ──
  slide.appendChild(loading);
  slide.appendChild(video);
  slide.appendChild(badge);

  // ── Eventos do vídeo ──

  // Oculta overlay quando vídeo está pronto para reproduzir
  video.addEventListener("canplay", () => {
    loading.classList.add("oculto");
  }, { once: true });

  // Se acontecer erro, exibir mensagem no overlay
  video.addEventListener("error", () => {
    loading.classList.remove("oculto");
    loading.innerHTML = `
      <span style="color:#f87171;font-size:1rem;">
        ⚠️ Não foi possível carregar o vídeo.
      </span>
    `;
    console.warn(`⚠️ Erro ao carregar vídeo: "${titulo}"`);
  });

  // ── Iniciar / parar reprodução junto com a visibilidade do slide ──
  // Usa MutationObserver para detectar adição/remoção da classe "active"
  const observer = new MutationObserver(() => {
    if (slide.classList.contains("active")) {
      video.currentTime = 0;
      video.play().catch((err) => {
        // Autoplay bloqueado pelo browser — ignorar silenciosamente
        console.warn(`⚠️ Autoplay bloqueado para "${titulo}":`, err.message);
      });
    } else {
      video.pause();
    }
  });

  observer.observe(slide, { attributes: true, attributeFilter: ["class"] });

  // Parar observer quando slide for removido do DOM
  const parentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if ([...mutation.removedNodes].includes(slide)) {
        observer.disconnect();
        parentObserver.disconnect();
        video.pause();
        video.src = ""; // libera memória
        console.log(`🗑️ Slide de vídeo "${titulo}" removido — observer encerrado`);
      }
    }
  });

  // Aguardar inserção no DOM para começar a observar o pai
  requestAnimationFrame(() => {
    if (slide.parentNode) {
      parentObserver.observe(slide.parentNode, { childList: true });
    }
  });

  return slide;
};

console.log("✅ Módulo video-display.js carregado");
