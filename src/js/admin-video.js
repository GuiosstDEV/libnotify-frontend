/**
 * ═══════════════════════════════════════════════════════════════
 * 🎬 LibNotify — Módulo de Vídeo (Admin)
 * ═══════════════════════════════════════════════════════════════
 *
 * Arquivo: src/js/admin-video.js
 * Responsabilidade: Toda a lógica de upload e criação de slides
 *                   de vídeo no painel administrativo.
 *
 * Depende de:
 *   • window.db, window.firebase_ref, window.firebase_set
 *     (globalizados pelo bloco <script type="module"> em admin.html)
 *   • window.slidesExtras, window.salvarSlideFirebase,
 *     window.enviarComando, window.toast
 *     (definidos em admin.js)
 *   • window.perfilAtual (definido em admin.js)
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// 📌 CONSTANTES
// ═══════════════════════════════════════════════════════════════

/** Formatos de vídeo aceitos pelo input */
const VIDEO_ACCEPT = "video/mp4,video/webm,video/ogg,video/mov,video/quicktime,video/*";

/** Tamanho a partir do qual exibimos aviso de arquivo grande (8 MB) */
const VIDEO_TAMANHO_AVISO_BYTES = 8 * 1024 * 1024;

/** Tamanho máximo absoluto que aceitamos (100 MB para Firebase Storage) */
const VIDEO_TAMANHO_MAX_BYTES = 100 * 1024 * 1024;

/** Ajuste de exibição padrão */
let _videoAjustePadrao = "contain"; // "contain" | "cover"

// ═══════════════════════════════════════════════════════════════
// 🔍 HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════

function _el(id) {
  return document.getElementById(id);
}

function _formatarTamanho(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _formatarDuracao(segundos) {
  if (!segundos || isNaN(segundos) || !isFinite(segundos)) return "—";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Lê o arquivo de vídeo como base64 com feedback de progresso.
 * @param {File} file
 * @param {function(number)} onProgress - callback com % (0-100)
 * @returns {Promise<string>} — data URL base64
 */
function _lerArquivoComoBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo de vídeo."));

    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════
// 🎞️ PREVIEW DO VÍDEO NO ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * Chamado pelo onchange do input de arquivo de vídeo.
 * Exibe o preview, valida o arquivo e mostra informações.
 * @function window.previewVideoAdmin
 */
window.previewVideoAdmin = function () {
  const input = _el("arquivo-video-admin");
  const previewVideo = _el("preview-video-admin");
  const nomeArquivoEl = _el("nome-arquivo-video-admin");
  const infoBox = _el("video-info-box");
  const avisoTamanho = _el("video-aviso-tamanho");
  const avisoErro = _el("video-aviso-erro");
  const progressWrapper = _el("video-progress-wrapper");
  const btnAdicionar = _el("btn-adicionar-video-admin");

  if (!input || !input.files || !input.files[0]) return;

  const file = input.files[0];

  // ── Ocultar estado anterior ──
  _ocultarElementosPreviewVideo();

  // ── Validar tipo ──
  if (!file.type.startsWith("video/")) {
    if (avisoErro) {
      avisoErro.textContent = `❌ Formato não suportado: "${file.type || "desconhecido"}". Use MP4, WebM ou OGG.`;
      avisoErro.classList.add("visivel");
    }
    if (btnAdicionar) btnAdicionar.disabled = true;
    return;
  }

  // ── Validar tamanho máximo ──
  if (file.size > VIDEO_TAMANHO_MAX_BYTES) {
    if (avisoErro) {
      avisoErro.textContent = `❌ Arquivo muito grande (${_formatarTamanho(file.size)}). O limite é ${_formatarTamanho(VIDEO_TAMANHO_MAX_BYTES)}.`;
      avisoErro.classList.add("visivel");
    }
    if (btnAdicionar) btnAdicionar.disabled = true;
    return;
  }

  // ── Aviso de arquivo grande (>= 8 MB) ──
  if (file.size >= VIDEO_TAMANHO_AVISO_BYTES && avisoTamanho) {
    avisoTamanho.innerHTML =
      `⚠️ Arquivo grande (${_formatarTamanho(file.size)}). O upload pode demorar alguns segundos. Considere usar um vídeo mais comprimido para melhor desempenho.`;
    avisoTamanho.classList.add("visivel");
  }

  // ── Exibir nome do arquivo ──
  if (nomeArquivoEl) {
    nomeArquivoEl.textContent = file.name;
  }

  // ── Criar URL de objeto para preview imediato ──
  const objectURL = URL.createObjectURL(file);

  if (previewVideo) {
    previewVideo.src = objectURL;
    previewVideo.style.display = "block";

    // Aplicar ajuste de exibição atual
    previewVideo.className = previewVideo.className.replace(/ajuste-\S+/g, "").trim();
    previewVideo.classList.add(`ajuste-${_videoAjustePadrao}`);

    // Preencher caixa de informações quando metadados carregarem
    previewVideo.onloadedmetadata = () => {
      if (infoBox) {
        infoBox.innerHTML = `
          <div class="video-info-item">🎞️ <strong>Formato:</strong> ${file.type.split("/")[1]?.toUpperCase() || "Vídeo"}
          </div>
          <div class="video-info-item">⏱️ <strong>Duração:</strong> ${_formatarDuracao(previewVideo.duration)}
          </div>
          <div class="video-info-item">💾 <strong>Tamanho:</strong> ${_formatarTamanho(file.size)}
          </div>
          <div class="video-info-item">📐 <strong>Resolução:</strong> ${previewVideo.videoWidth}×${previewVideo.videoHeight}
          </div>
        `;
        infoBox.classList.add("visivel");

        // Preencher sugestão de duração no campo
        const duracaoInput = _el("duracao-video-input-admin");
        if (duracaoInput && previewVideo.duration && isFinite(previewVideo.duration)) {
          duracaoInput.value = Math.ceil(previewVideo.duration);
        }
      }
    };
  }

  if (btnAdicionar) btnAdicionar.disabled = false;
  console.log(`📂 Vídeo selecionado: ${file.name} (${_formatarTamanho(file.size)})`);
};

/** Oculta todos os elementos de estado do preview */
function _ocultarElementosPreviewVideo() {
  const ids = [
    "video-info-box",
    "video-aviso-tamanho",
    "video-aviso-erro",
    "video-progress-wrapper",
  ];
  ids.forEach((id) => {
    const el = _el(id);
    if (el) el.classList.remove("visivel");
  });

  const previewVideo = _el("preview-video-admin");
  if (previewVideo) {
    previewVideo.style.display = "none";
    previewVideo.src = "";
  }

  const nomeEl = _el("nome-arquivo-video-admin");
  if (nomeEl) nomeEl.textContent = "";

  const btnAdicionar = _el("btn-adicionar-video-admin");
  if (btnAdicionar) btnAdicionar.disabled = false;
}

// ═══════════════════════════════════════════════════════════════
// 🎛️ AJUSTE DE EXIBIÇÃO (contain / cover)
// ═══════════════════════════════════════════════════════════════

/**
 * Altera o ajuste de exibição do vídeo (contain = barras, cover = corte).
 * @function window.alterarAjusteVideo
 * @param {"contain"|"cover"} modo
 */
window.alterarAjusteVideo = function (modo) {
  _videoAjustePadrao = modo;

  // Atualizar botões visuais
  document.querySelectorAll(".btn-ajuste-video").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.ajuste === modo);
  });

  // Atualizar preview
  const previewVideo = _el("preview-video-admin");
  if (previewVideo) {
    previewVideo.classList.remove("ajuste-contain", "ajuste-cover");
    previewVideo.classList.add(`ajuste-${modo}`);
  }

  console.log(`🎛️ Ajuste de vídeo: ${modo}`);
};

// ═══════════════════════════════════════════════════════════════
// ➕ ADICIONAR SLIDE DE VÍDEO
// ═══════════════════════════════════════════════════════════════

/**
 * Lê o arquivo de vídeo selecionado, converte para base64 e
 * salva no Firebase como slide do tipo "video".
 * @function window.adicionarSlideComVideoAdmin
 */
window.adicionarSlideComVideoAdmin = async function () {
  // ── Verificar permissão ──
  if (window.perfilAtual !== "admin") {
    window.toast("❌ Apenas Admin pode adicionar slides", "erro");
    return;
  }

  const input = _el("arquivo-video-admin");
  const file = input && input.files && input.files[0];

  if (!file) {
    window.toast("⚠️ Selecione um vídeo", "erro");
    return;
  }

  if (!file.type.startsWith("video/")) {
    window.toast("❌ Formato de arquivo inválido", "erro");
    return;
  }

  if (file.size > VIDEO_TAMANHO_MAX_BYTES) {
    window.toast(`❌ Arquivo muito grande. Máximo: ${_formatarTamanho(VIDEO_TAMANHO_MAX_BYTES)}`, "erro");
    return;
  }

  const duracao = parseInt(_el("duracao-video-input-admin")?.value) || 15;
  const titulo = (_el("titulo-video-admin")?.value?.trim()) || file.name.replace(/\.[^.]+$/, "");
  const ajuste = _videoAjustePadrao;

  // ── Mostrar barra de progresso ──
  const progressWrapper = _el("video-progress-wrapper");
  const progressFill = _el("video-progress-fill");
  const progressLabel = _el("video-progress-pct");
  const btnAdicionar = _el("btn-adicionar-video-admin");

  if (progressWrapper) progressWrapper.classList.add("visivel");
  if (btnAdicionar) {
    btnAdicionar.disabled = true;
    btnAdicionar.textContent = "Enviando para storage...";
  }

  // Atualizar progresso visualmente
  function _setProgresso(pct) {
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `${pct}%`;
  }

  try {
    _setProgresso(5);
    console.log(`🎬 Upload de vídeo: ${file.name} (${_formatarTamanho(file.size)})`);

    if (!window.db || !window.storage) {
      window.toast("⚠️ Firebase não configurado", "erro");
      _resetarFormularioVideo();
      return;
    }

    // ── FAZER UPLOAD PARA FIREBASE STORAGE ──
    _setProgresso(10);
    const storagePath = `libnotify/videos/${Date.now()}_${file.name}`;
    const storageReference = window.firebase_storageRef(window.storage, storagePath);
    
    console.log(`📤 Iniciando upload para: ${storagePath}`);
    await window.firebase_uploadBytes(storageReference, file);
    _setProgresso(96);

    console.log(`✅ Vídeo enviado para Storage: ${storagePath}`);

    // ── OBTER URL DE DOWNLOAD ──
    const videoUrl = await window.firebase_getDownloadURL(storageReference);
    _setProgresso(98);
    console.log(`🔗 URL obtida: ${videoUrl.substring(0, 80)}...`);

    const slideData = {
      tipo: "video",
      video: videoUrl,
      ajuste,
      duracao,
      nome: file.name,
      titulo,
      mimeType: file.type,
      tamanhoBytes: file.size,
      dataCriacao: new Date().toLocaleString("pt-BR"),
      storagePath,
    };

    // ── SALVAR METADADOS NO REALTIME DATABASE ──
    const novosSlides = [...(window.slidesExtras || []), slideData];
    await window.firebase_set(
      window.firebase_ref(window.db, "libnotify/slidesExtras"),
      novosSlides
    );

    _setProgresso(99);

    // ── Disparar sincronização ──
    await window.enviarComando({
      tipo: "atualizarSlides",
      slides: novosSlides,
    });

    _setProgresso(100);
    window.toast("✅ Slide de vídeo adicionado!", "verde");
    console.log(`✅ Slide de vídeo salvo: "${titulo}" (${_formatarTamanho(file.size)})`);

    // ── Limpar formulário ──
    _resetarFormularioVideo();

  } catch (err) {
    console.error("❌ Erro ao adicionar slide de vídeo:", err);
    window.toast(`❌ Erro: ${err.message}`, "erro");

    if (progressWrapper) progressWrapper.classList.remove("visivel");
    if (btnAdicionar) {
      btnAdicionar.disabled = false;
      btnAdicionar.innerHTML = `
        <img src="bootstrap/check-lg.svg" alt="Adicionar"
          style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
        Adicionar Slide
      `;
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// 🧹 LIMPAR FORMULÁRIO DE VÍDEO
// ═══════════════════════════════════════════════════════════════

/**
 * Limpa o formulário da aba de vídeo (input, preview, campos).
 * Chamado após upload bem-sucedido ou pelo botão "Limpar".
 * @function window.limparFormularioVideo
 */
window.limparFormularioVideo = function () {
  _resetarFormularioVideo();
  window.toast("🗑️ Formulário de vídeo limpo", "verde");
};

function _resetarFormularioVideo() {
  // Input de arquivo
  const input = _el("arquivo-video-admin");
  if (input) input.value = "";

  // Preview
  _ocultarElementosPreviewVideo();

  // Campos de texto
  const tituloInput = _el("titulo-video-admin");
  if (tituloInput) tituloInput.value = "";

  const duracaoInput = _el("duracao-video-input-admin");
  if (duracaoInput) duracaoInput.value = "15";

  // Barra de progresso
  const progressFill = _el("video-progress-fill");
  if (progressFill) progressFill.style.width = "0%";

  const progressLabel = _el("video-progress-pct");
  if (progressLabel) progressLabel.textContent = "0%";

  const progressWrapper = _el("video-progress-wrapper");
  if (progressWrapper) progressWrapper.classList.remove("visivel");

  // Botão de adicionar
  const btnAdicionar = _el("btn-adicionar-video-admin");
  if (btnAdicionar) {
    btnAdicionar.disabled = false;
    btnAdicionar.innerHTML = `
      <img src="bootstrap/check-lg.svg" alt="Adicionar"
        style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
      Adicionar Slide
    `;
  }

  // Restaurar ajuste padrão
  _videoAjustePadrao = "contain";
  document.querySelectorAll(".btn-ajuste-video").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.ajuste === "contain");
  });

  console.log("🧹 Formulário de vídeo limpo");
}

// ═══════════════════════════════════════════════════════════════
// 🎬 PREVIEW NO PAINEL ADMIN (renderizarPreviewSlide)
// ═══════════════════════════════════════════════════════════════

/**
 * Gera o HTML de preview para um slide de vídeo no painel admin.
 * Chamado internamente por admin.js na função renderizarPreview().
 *
 * @param {Object} slideData — dados do slide (tipo "video")
 * @returns {string} HTML a ser inserido na área de preview
 */
window.gerarPreviewVideoAdmin = function (slideData) {
  if (!slideData || slideData.tipo !== "video") return "";

  const ajuste = slideData.ajuste || "contain";
  const titulo = slideData.titulo || slideData.nome || "Vídeo";

  return `
    <div style="
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      overflow: hidden;
    ">
      <video
        src="${slideData.video}"
        crossorigin="anonymous"
        style="width:100%;height:100%;object-fit:${ajuste};display:block;background:#000;"
        muted
        autoplay
        loop
        playsinline
        preload="metadata"
      ></video>
      <div style="
        position:absolute;
        bottom:8px;
        left:8px;
        right:8px;
        background:rgba(0,0,0,0.55);
        color:#fff;
        font-size:11px;
        padding:4px 8px;
        border-radius:4px;
        backdrop-filter:blur(4px);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      ">🎬 ${titulo}</div>
    </div>
  `;
};

// ═══════════════════════════════════════════════════════════════
// 🔌 INTEGRAÇÃO COM renderizarListaSlides (admin.js)
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna o label de tipo para exibição na lista de slides.
 * Chamado por admin.js em renderizarListaSlides().
 *
 * @param {Object} slideData
 * @returns {string}
 */
window.labelTipoSlide = function (slideData) {
  const mapa = {
    imagem: "🖼️ Imagem",
    texto: "📝 Texto",
    video: "🎬 Vídeo",
  };
  return mapa[slideData?.tipo] || "📄 Slide";
};

console.log("✅ Módulo admin-video.js carregado com suporte a Firebase Storage");
