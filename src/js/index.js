// ===============================
// 🔔 NOTIFICAÇÕES BROWSER - LibNotify
// ===============================
function solicitarPermissaoNotificacao() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then(function (permission) {
      console.log("🔔 Permissão de notificação:", permission);
    });
  }
}

function mostrarNotificacaoBrowser(titulo, opcoes = {}) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(titulo, opcoes);
    } catch (e) {
      console.warn("🔔 Erro ao mostrar notificação:", e);
    }
  } else if (Notification.permission === "default") {
    solicitarPermissaoNotificacao();
  }
}

// Solicitar permissão ao carregar
window.addEventListener("DOMContentLoaded", solicitarPermissaoNotificacao);

// Detectar movimento do mouse para mostrar botões e indicadores
let mostrarIndicadoresTimeout;
let toolbarActive = false; // Flag para saber se o mouse está sobre a toolbar

document.addEventListener("mousemove", function (event) {
  const toolbar = document.querySelector(".botoes-toolbar");
  const setasBorda = document.querySelectorAll(".setas-borda");
  const indicador = document.querySelector(".indicador");
  const temporizador = document.querySelector(".temporizador");

  // 🔧 VALIDAÇÃO: Verifica todos elementos necessários
  if (!indicador || !temporizador) {
    console.warn("⚠️ Elemento não encontrado no mousemove:", {
      toolbar: !!toolbar,
      indicador: !!indicador,
      temporizador: !!temporizador,
    });
    return; // Elementos não encontrados, sair
  }

  const distancia = 200;

  // 🔧 Mostrar barra de botões APENAS quando mouse está perto do canto superior direito
  const distDireita = window.innerWidth - event.clientX;
  const distTopo = event.clientY;

  if (toolbar) {
    // Se o mouse está sobre a toolbar, manter visível
    // Se não, verificar se está na zona de detecção
    if (distDireita < distancia && distTopo < distancia) {
      toolbar.classList.add("visivel");
    } else if (!toolbarActive) {
      // Remove apenas se o mouse NÃO está sobre a toolbar
      toolbar.classList.remove("visivel");
    }
  }

  // Mostrar setas, indicador e temporizador quando mouse se move
  setasBorda.forEach((seta) => seta.classList.add("visivel"));
  indicador.classList.add("visivel");
  temporizador.classList.add("visivel");

  // Limpar timeout anterior se existir
  clearTimeout(mostrarIndicadoresTimeout);

  // Esconder após 3 segundos de inatividade
  mostrarIndicadoresTimeout = setTimeout(() => {
    setasBorda.forEach((seta) => seta.classList.remove("visivel"));
    indicador.classList.remove("visivel");
    temporizador.classList.remove("visivel");
    // Toolbar desaparece automaticamente porque o mouse saiu do canto
  }, 3000);
});

// Manter toolbar visível quando mouse está sobre ela
const toolbar = document.querySelector(".botoes-toolbar");
if (toolbar) {
  toolbar.addEventListener("mouseenter", () => {
    toolbarActive = true;
    toolbar.classList.add("visivel");
  });

  toolbar.addEventListener("mouseleave", () => {
    toolbarActive = false;
    toolbar.classList.remove("visivel");
  });
}

const SLIDES_PADRAO = 5; // Número de slides padrão (1-5)
const TEMPOS = [10000, 8000, 9000, 7000, 8000];
let slideAtual = 0;
let tempoRestante = 10;
let timerAtual = null;
let timerContador = null;
let totalSlides = SLIDES_PADRAO;
/** Quando true, o vídeo do slide ativo toca sem som (controlado pelo admin via Firebase). */
let videoSlideMutedRemoto = true;
/** Volume do vídeo no slide ativo (0–1), vindo do Firebase. */
let videoSlideVolumeRemoto = 1;
/** Último índice exibido em mostrarSlide — usado para reiniciar vídeo ao voltar no slide. */
let ultimoIndiceSlideExibido = null;
let modoEdicao = false; // Flag para saber se está editando ou criando
let _publishTimer = null; // Timer para publicar slide atual no Firebase

// ========================================
// �🔲 TELA CHEIA
// ========================================
function alternarTelaCheia() {
  const btn = document.getElementById("botao-fullscreen");
  const img = btn.querySelector("img");
  if (!document.fullscreenElement) {
    document.documentElement
      .requestFullscreen()
      .then(() => {
        img.src = "bootstrap/fullscreen-exit.svg";
        img.alt = "Sair de fullscreen";
        btn.title = "Sair da tela cheia";
      })
      .catch(() => {});
  } else {
    document
      .exitFullscreen()
      .then(() => {
        img.src = "bootstrap/fullscreen.svg";
        img.alt = "Entrar em fullscreen";
        btn.title = "Tela cheia";
      })
      .catch(() => {});
  }
}

// Atualizar ícone se o usuário sair do fullscreen pelo teclado/swipe
document.addEventListener("fullscreenchange", () => {
  const btn = document.getElementById("botao-fullscreen");
  if (btn) {
    const img = btn.querySelector("img");
    if (img) {
      img.src = document.fullscreenElement 
        ? "bootstrap/fullscreen-exit.svg" 
        : "bootstrap/fullscreen.svg";
      img.alt = document.fullscreenElement 
        ? "Sair de fullscreen" 
        : "Entrar em fullscreen";
    }
    btn.title = document.fullscreenElement
      ? "Sair da tela cheia"
      : "Tela cheia";
  }
});

// SALVAR E CARREGAR SLIDES DO LOCALSTORAGE
function salvarSlides() {
  const slides = document.querySelectorAll(".slide");
  const dadosSlides = [];

  // Salvar apenas slides adicionados (índice >= SLIDES_PADRAO)
  slides.forEach((slide, index) => {
    if (index >= SLIDES_PADRAO) {
      dadosSlides.push({
        html: slide.innerHTML,
        background: slide.style.background,
        classe: slide.className,
        duracao: slide.getAttribute("data-duration") || "10",
      });
    }
  });

  localStorage.setItem("slidesAdicionados", JSON.stringify(dadosSlides));
  console.log(
    `💾 ${dadosSlides.length} slide(s) adicionado(s) salvos no cache`,
  );
}

function carregarSlides() {
  const slidesSalvos = localStorage.getItem("slidesAdicionados");
  if (slidesSalvos) {
    try {
      const dadosSlides = JSON.parse(slidesSalvos);

      if (Array.isArray(dadosSlides) && dadosSlides.length > 0) {
        const container = document.getElementById("slides-container");
        if (!container) {
          console.warn("⚠️ slides-container não encontrado, cache ignorado");
          return;
        }
        dadosSlides.forEach((data) => {
          const novoSlide = document.createElement("div");
          novoSlide.className = data.classe || "slide";
          novoSlide.style.background = data.background || "";
          novoSlide.innerHTML = data.html || "";

          // Higienizar vídeos vindos de cache legado:
          // evita autoplay/handlers antigos disparando fora do slide ativo.
          novoSlide.querySelectorAll("video").forEach((video) => {
            video.removeAttribute("autoplay");
            video.removeAttribute("onended");
            video.removeAttribute("onerror");
            video.setAttribute("playsinline", "");
            video.setAttribute("muted", "");
            video.muted = true;
            video.preload = "metadata";
          });

          // Restaurar duração
          const duracao = parseInt(data.duracao) || 10;
          novoSlide.setAttribute("data-duration", duracao);

          container.appendChild(novoSlide);
          totalSlides++;
          TEMPOS.push(duracao * 1000);
        });
        console.log(`✅ ${dadosSlides.length} slide(s) carregado(s) do cache`);
        atualizarTotalSlides();
      } else {
        console.log("ℹ️ Nenhum slide adicional salvo no cache");
      }
    } catch (erro) {
      console.warn("⚠️ Erro ao carregar slides do cache:", erro);
      localStorage.removeItem("slidesAdicionados");
    }
  } else {
    console.log("ℹ️ Nenhum slide adicional no cache");
  }
}

// ATUALIZAR TOTAL DE SLIDES NO INDICADOR
function atualizarTotalSlides() {
  const slides = document.querySelectorAll(".slide");
  totalSlides = slides.length;
  document.getElementById("total-slides").textContent = totalSlides;
  console.log(`📊 Total de slides: ${totalSlides}`);
}

// ATUALIZAR INDICADOR (numerador + denominador) SEM REINICIAR O TIMER
// Usado quando slides extras chegam do Firebase enquanto apresentacao ja roda
function atualizarIndicador() {
  const slides = document.querySelectorAll(".slide");
  totalSlides = slides.length;
  document.getElementById("total-slides").textContent = totalSlides;
  document.getElementById("slide-numero").textContent = slideAtual + 1;
}

// ========================================
// ⚠️ FUNÇÕES DE GERENCIAMENTO REMOVIDAS
// ========================================
// Estas funções foram descontinuadas:
// - deletarSlideAtual(): deleção de slides
// - abrirModal(), fecharModal(): gerenciamento de modal
// - editarSlideAtual(): edição de slides
// - mudarAba(), previewImagem(): funcionalidades de modal
// - adicionarSlideComImagem(), adicionarSlideComTexto(): adição de slides
// Todas as operações de CRUD agora são feitas via admin.html
// ========================================

function mostrarSlide(index) {
  const slides = document.querySelectorAll(".slide");

  // Sincronizar totalSlides com o DOM real antes de validar
  totalSlides = slides.length;
  document.getElementById("total-slides").textContent = totalSlides;

  // Validação: garantir que o índice é válido
  if (index < 0 || index >= slides.length) {
    console.warn(`❌ Índice ${index} inválido. Total de slides: ${slides.length}`);
    return;
  }

  const mudouDeSlide = ultimoIndiceSlideExibido !== index;
  ultimoIndiceSlideExibido = index;
  slideAtual = index;

  slides.forEach((s) => s.classList.remove("active"));
  slides[index].classList.add("active");
  document.getElementById("slide-numero").textContent = index + 1;

  // Ler duração do slide (do atributo data-duration ou do array TEMPOS)
  const slide = slides[index];
  const duracaoAtributo = slide.getAttribute("data-duration");
  const tempoMs = duracaoAtributo
    ? parseInt(duracaoAtributo) * 1000
    : TEMPOS[index];

  tempoRestante = Math.ceil(tempoMs / 1000);
  atualizarContador();
  resetarTimer();
  sincronizarVideosNosSlides(mudouDeSlide);

  // 📡 Publicar slide atual no Firebase para sincronizar o preview do admin
  publicarSlideAtual(index);
}

function proximoSlide() {
  slideAtual = (slideAtual + 1) % totalSlides;
  mostrarSlide(slideAtual);
}

function anteriorSlide() {
  slideAtual = (slideAtual - 1 + totalSlides) % totalSlides;
  mostrarSlide(slideAtual);
}

function atualizarContador() {
  document.getElementById("contadorSegundos").textContent = tempoRestante;
}

function resetarTimer() {
  clearTimeout(timerAtual);
  clearInterval(timerContador);

  // Ler duração customizada do slide
  const slides = document.querySelectorAll(".slide");
  const slide = slides[slideAtual];
  const duracaoAtributo = slide.getAttribute("data-duration");
  const tempo = duracaoAtributo
    ? parseInt(duracaoAtributo) * 1000
    : TEMPOS[slideAtual];

  // 🎥 Se é um vídeo, adicionar listener para avançar quando terminar
  const videoElement = slide?.querySelector("video");
  if (videoElement) {
    // Remover listeners anteriores para evitar duplicatas
    videoElement.onended = null;
    videoElement.onerror = null;

    // Quando vídeo termina, avança
    videoElement.onended = function () {
      console.log("✅ Vídeo terminou, avançando...");
      proximoSlide();
    };

    // Fallback: se vídeo falhar, avança após o tempo
    videoElement.onerror = function () {
      console.warn("⚠️ Erro ao carregar vídeo, avançando...");
      proximoSlide();
    };

    // 🎬 CONTADOR PARA VÍDEOS: atualizar cada 100ms baseado no currentTime do vídeo
    timerContador = setInterval(() => {
      if (videoElement && videoElement.duration) {
        const tempoRestante = Math.ceil(videoElement.duration - videoElement.currentTime);
        document.getElementById("contadorSegundos").textContent = Math.max(tempoRestante, 0);
      }
    }, 100);

    // Garantir que mesmo que vídeo não carregue, avança após duração
    timerAtual = setTimeout(() => {
      console.log("⏱️ Tempo do slide expirou, avançando...");
      proximoSlide();
    }, tempo);
  } else {
    // Para slides normais, usar timer + contador
    timerContador = setInterval(() => {
      tempoRestante--;
      atualizarContador();
      if (tempoRestante <= 0) {
        proximoSlide();
      }
    }, 1000);

    timerAtual = setTimeout(() => {
      proximoSlide();
    }, tempo);
  }
}

/**
 * Só o vídeo do slide ativo pode reproduzir áudio; demais ficam pausados e silenciados.
 * O mute do slide ativo segue a preferência remota (painel admin).
 * @param {boolean} reiniciarVideoDoInicio - true ao mudar de slide (admin/navegação); false em mute/retomar.
 */
function sincronizarVideosNosSlides(reiniciarVideoDoInicio = false) {
  const slides = document.querySelectorAll(".slide");
  slides.forEach((slideEl) => {
    const video = slideEl.querySelector("video");
    if (!video) return;

    if (!slideEl.classList.contains("active")) {
      try {
        video.pause();
        video.currentTime = 0;
      } catch (_) {}
      video.muted = true;
      return;
    }

    if (reiniciarVideoDoInicio) {
      try {
        video.currentTime = 0;
      } catch (_) {}
    }

    video.volume = Math.max(0, Math.min(1, videoSlideVolumeRemoto));
    video.muted = videoSlideMutedRemoto;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  });
}

// ========================================
// 📚 MODO BIBLIOTECA FULLSCREEN
// ========================================
let modoGoogleAtivo = false;

function abrirModoGoogleFullscreen() {
  const modal = document.getElementById("modo-google-fullscreen");
  if (modal) {
    modal.classList.add("ativo");
    modoGoogleAtivo = true;
    console.log("✅ Modo Biblioteca aberto");

    // Ativar detecção de zona no canto superior esquerdo para o botão de saída
    _iniciarDeteccaoZonaBiblioteca();

    // Entrar em fullscreen automaticamente
    setTimeout(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
          .then(() => {
            console.log("✅ Fullscreen ativado para biblioteca");
          })
          .catch((err) => {
            console.warn("⚠️ Não foi possível ativar fullscreen:", err);
          });
      }
    }, 100);
  } else {
    console.error("❌ Elemento #modo-google-fullscreen não encontrado");
  }
}

function sairModoGoogleFullscreen() {
  const modal = document.getElementById("modo-google-fullscreen");
  if (modal) {
    modal.classList.remove("ativo");
    modoGoogleAtivo = false;

    // Remover listener de zona e ocultar botão
    _pararDeteccaoZonaBiblioteca();

    console.log("✅ Modo Biblioteca fechado");

    // Sair do fullscreen se estiver ativo
    if (document.fullscreenElement) {
      document.exitFullscreen()
        .then(() => {
          console.log("✅ Fullscreen desativado");
        })
        .catch((err) => {
          console.warn("⚠️ Não foi possível sair do fullscreen:", err);
        });
    }
  }
}

/* ── ZONA DE DETECÇÃO DO BOTÃO DE SAÍDA DA BIBLIOTECA ─────────────
   A exibição do botão é feita via CSS puro (.zona-escape:hover ~ .btn).
   O JS aqui só garante que o botão fica oculto ao fechar o modo.
   ────────────────────────────────────────────────────────────────*/
let _zonaTimer = null;

function _iniciarDeteccaoZonaBiblioteca() {
  const btn = document.getElementById("btn-sair-biblioteca");
  if (btn) btn.classList.remove("visivel");
}

function _pararDeteccaoZonaBiblioteca() {
  clearTimeout(_zonaTimer);
  const btn = document.getElementById("btn-sair-biblioteca");
  if (btn) btn.classList.remove("visivel");
}

// Listener global no document — funciona mesmo com iframe na frente
document.addEventListener("mousemove", (e) => {
  if (!modoGoogleAtivo) return;

  const btn = document.getElementById("btn-sair-biblioteca");
  if (!btn) return;

  const ZONA = 100; // px — zona de ativação no canto superior esquerdo
  const noZona = e.clientX <= ZONA && e.clientY <= ZONA;

  if (noZona) {
    clearTimeout(_zonaTimer);
    btn.classList.add("visivel");
  } else {
    clearTimeout(_zonaTimer);
    _zonaTimer = setTimeout(() => {
      if (!btn.matches(":hover")) {
        btn.classList.remove("visivel");
      }
    }, 600);
  }
});

// Manter visível enquanto o mouse estiver sobre o próprio botão
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-sair-biblioteca");
  if (!btn) return;
  btn.addEventListener("mouseenter", () => {
    clearTimeout(_zonaTimer);
    btn.classList.add("visivel");
  });
  btn.addEventListener("mouseleave", () => {
    _zonaTimer = setTimeout(() => btn.classList.remove("visivel"), 400);
  });
});

// Detectar teclas numéricas
document.addEventListener("keydown", function (event) {
  const tecla = event.key;
  if (tecla >= "1" && tecla <= "9") {
    const numeroSlide = parseInt(tecla) - 1;
    if (numeroSlide < totalSlides) {
      slideAtual = numeroSlide;
      mostrarSlide(slideAtual);
    }
  }
  // Setas do teclado para navegar
  if (tecla === "ArrowRight") {
    proximoSlide();
  }
  if (tecla === "ArrowLeft") {
    anteriorSlide();
  }
  // Escape fecha modal
  if (tecla === "Escape") {
    fecharModal();
  }
});

// Auto-backup periódico do cache (a cada 30 segundos)
setInterval(() => {
  const slidesSalvos = localStorage.getItem("slidesAdicionados");
  if (slidesSalvos) {
    try {
      JSON.parse(slidesSalvos);
      // Cache está válido, continuar
    } catch (e) {
      console.warn("⚠️ Cache corrompido detectado! Recriando...");
      salvarSlides();
    }
  }
}, 30000);

// Fechar modal clicando fora
window.onclick = function (event) {
  const modal = document.getElementById("modal");
  const painel = document.getElementById("painel");
  if (event.target === modal) {
    fecharModal();
  }
  if (event.target === painel) {
    fecharPainel();
  }
};

// ========================================
// ⚠️ FUNÇÕES DO PAINEL REMOVIDAS
// ========================================
// As seguintes funções foram descontinuadas:
// - abrirPainel(), fecharPainel()
// - filtrarSlidesPainel(), atualizarBotoesFiltro()
// - renderizarTabelaPainel()
// - exportarDadosPainel()
// O painel de gerenciamento agora está em admin.html
// ========================================

// ========================================
// 📥 IMPORTAR SLIDES DE ARQUIVO JSON
// ========================================
function importarSlides(event) {
  const arquivo = event.target.files[0];

  if (!arquivo) {
    console.log("ℹ️ Nenhum arquivo selecionado");
    return;
  }

  // VALIDAÇÃO 1: Verificar tipo de arquivo
  if (!arquivo.name.endsWith(".json")) {
    mostrarNotificacaoBrowser("❌ Arquivo inválido", {
      body: "Por favor, selecione um arquivo .json",
      icon: "imagem/libnotify-icon.png",
    });
    alert(
      "❌ Erro: O arquivo selecionado não é um JSON!\n\nPor favor, selecione um arquivo .json válido.",
    );
    console.error("❌ Arquivo não é JSON:", arquivo.name);
    event.target.value = ""; // Limpar input
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      // VALIDAÇÃO 2: Parsear JSON
      const dados = JSON.parse(e.target.result);
      console.log("📖 Dados JSON parseados:", dados);

      // VALIDAÇÃO 3: Verificar estrutura básica
      if (!dados || typeof dados !== "object") {
        throw new Error("JSON inválido - não é um objeto");
      }

      // VALIDAÇÃO 4: Verificar array de slides
      if (!Array.isArray(dados.slidesAdicionados)) {
        throw new Error('Nenhum array "slidesAdicionados" encontrado no JSON');
      }

      const slidesImportacao = dados.slidesAdicionados;
      console.log(`📊 Slides a importar: ${slidesImportacao.length}`);

      // VALIDAÇÃO 5: Verificar se há slides
      if (slidesImportacao.length === 0) {
        alert(
          "⚠️ Atenção: O arquivo não contém slides!\n\nO arquivo está vazio ou não tem dados válidos.",
        );
        event.target.value = "";
        return;
      }

      // VALIDAÇÃO 6: Verificar estrutura de cada slide
      let slidesValidos = 0;
      for (let i = 0; i < slidesImportacao.length; i++) {
        const slide = slidesImportacao[i];

        // Verificar se tem estrutura COMPLETA (html, background, classe, duracao)
        if (
          slide.html &&
          slide.background !== undefined &&
          slide.classe &&
          slide.duracao
        ) {
          slidesValidos++;
        } else {
          // Debug: mostrar o que está faltando
          console.warn(`⚠️ Slide ${i} - Estrutura:`, {
            temHTML: !!slide.html,
            temBackground: slide.background !== undefined,
            temClasse: !!slide.classe,
            temDuracao: !!slide.duracao,
            conteudo: slide,
          });
        }
      }

      console.log(
        `📊 Validação: Slides válidos encontrados: ${slidesValidos}/${slidesImportacao.length}`,
      );

      // Se nenhum slide é válido, indicar que precisa de um arquivo novo
      if (slidesValidos === 0) {
        throw new Error(
          "O arquivo não tem estrutura válida.\n\n" +
            "Por favor:\n" +
            '1. Clique novamente em "💾 Exportar"\n' +
            "2. Selecione o arquivo NOVO baixado\n" +
            "O arquivo antigo tem formato diferente e não pode ser importado.",
        );
      }

      // VALIDAÇÃO 7: Pedir confirmação ao usuário
      const slidesExistentes = JSON.parse(
        localStorage.getItem("slidesAdicionados") || "[]",
      ).length;

      let mensagem = `📥 IMPORTAR SLIDES\n\n`;
      mensagem += `✅ Slides a importar: ${slidesValidos}\n`;
      if (slidesExistentes > 0) {
        mensagem += `⚠️ Você tem ${slidesExistentes} slides salvos\n\n`;
        mensagem += `⚙️ Opções:\n`;
        mensagem += `• OK = SOBRESCREVER slides atuais\n`;
        mensagem += `• Cancelar = Manter slides atuais\n\n`;
        mensagem += `Tem certeza?`;
      } else {
        mensagem += `\n✅ Seus slides serão importados com sucesso!\n\nDeseja continuar?`;
      }

      const confirmar = confirm(mensagem);

      if (!confirmar) {
        console.log("❌ Importação cancelada pelo usuário");
        event.target.value = "";
        return;
      }

      // PROCESSO DE IMPORTAÇÃO
      console.log("🔄 Iniciando importação de slides...");

      // Deletar slides antigos do DOM (manter apenas SLIDES_PADRAO)
      const slides = document.querySelectorAll(".slide");
      for (let i = slides.length - 1; i >= SLIDES_PADRAO; i--) {
        slides[i].remove();
      }

      // Resetar variáveis globais
      totalSlides = SLIDES_PADRAO;
      TEMPOS.length = 0; // Limpar array (sem reatribuir constante)
      slideAtual = 0;

      // Restaurar slides no localStorage
      try {
        localStorage.setItem(
          "slidesAdicionados",
          JSON.stringify(slidesImportacao),
        );
        console.log("✅ Slides restaurados no localStorage");
      } catch (erroStorage) {
        throw new Error(
          `Erro ao salvar no localStorage: ${erroStorage.message}`,
        );
      }

      // Recarregar slides (render visual)
      try {
        carregarSlides();
        console.log("✅ Slides carregados no DOM");
      } catch (erroCarregar) {
        throw new Error(`Erro ao carregar slides: ${erroCarregar.message}`);
      }

      // Atualizar indicadores
      atualizarTotalSlides();
      mostrarSlide(0);

      // Feedback ao usuário
      const mensagemSucesso = `✅ Importação Concluída!\n\n📊 ${slidesValidos} slide(s) importado(s) com sucesso\n⏰ Total atual: ${totalSlides} slides\n💾 Dados salvos no cache`;

      alert(mensagemSucesso);

      mostrarNotificacaoBrowser("✅ Slides Importados!", {
        body: `${slidesValidos} slide(s) foram importados com sucesso!`,
        icon: "imagem/libnotify-icon.png",
      });

      console.log(`🎉 Importação concluída:`, {
        slidesImportados: slidesValidos,
        totalSlidesSistema: totalSlides,
        timestamp: new Date().toLocaleString("pt-BR"),
      });

      // Fechar painel e renderizar
      renderizarTabelaPainel();
    } catch (erroJson) {
      // TRATAMENTO DE ERROS
      console.error("❌ Erro ao processar importação:", erroJson.message);

      let mensagemErro = `❌ ERRO NA IMPORTAÇÃO\n\n`;
      mensagemErro += `${erroJson.message}\n\n`;
      mensagemErro += `Dicas:\n`;
      mensagemErro += `• Certifique-se de que é um arquivo .json válido\n`;
      mensagemErro += `• O arquivo deve ter sido exportado do LibNotify\n`;
      mensagemErro += `• Tente exportar os slides atuais para ver o formato correto`;

      alert(mensagemErro);

      mostrarNotificacaoBrowser("❌ Erro na Importação", {
        body: `Falha ao importar slides: ${erroJson.message}`,
        icon: "imagem/libnotify-icon.png",
      });
    }

    // Limpar input file para permitir selecionar o mesmo arquivo novamente
    event.target.value = "";
  };

  reader.onerror = function (erroLeitura) {
    console.error("❌ Erro ao ler arquivo:", erroLeitura);
    alert(
      "❌ Erro ao ler o arquivo!\n\nTente novamente ou selecione outro arquivo.",
    );
    mostrarNotificacaoBrowser("❌ Erro ao Ler Arquivo", {
      body: "Falha ao ler o arquivo selecionado",
      icon: "imagem/libnotify-icon.png",
    });
    event.target.value = "";
  };

  // Iniciar leitura do arquivo
  reader.readAsText(arquivo);
}

// ========================================
// 🔄 REORDENAÇÃO DE SLIDES (DRAG-DROP)
// ========================================
let draggedRow = null;
let modoReorderAtivo = false;

function ativarModoReordenar() {
  const painel = document.getElementById("painel");
  const btnReordenar = document.getElementById("btn-reordenar");
  const infoReorder = document.getElementById("info-reorder");

  if (!modoReorderAtivo) {
    // ATIVAR MODO REORDER
    modoReorderAtivo = true;
    painel.classList.add("modo-reorder");
    btnReordenar.textContent = "✅ Confirmar";
    btnReordenar.classList.add("btn-reordenar-ativo");
    btnReordenar.onclick = desativarModoReordenar;
    infoReorder.style.display = "block";

    renderizarTabelaPainel();
    console.log("🔄 Modo reordenação ATIVADO");
  }
}

function desativarModoReordenar() {
  const painel = document.getElementById("painel");
  const btnReordenar = document.getElementById("btn-reordenar");
  const infoReorder = document.getElementById("info-reorder");

  // DESATIVAR MODO REORDER
  modoReorderAtivo = false;
  painel.classList.remove("modo-reorder");
  btnReordenar.textContent = "🔄 Reordenar";
  btnReordenar.classList.remove("btn-reordenar-ativo");
  btnReordenar.onclick = ativarModoReordenar;
  infoReorder.style.display = "none";

  // 🔧 Salvar nova ordem
  reordenarSlidesDragDrop();
  salvarSlides();
  atualizarTotalSlides();

  renderizarTabelaPainel();
  alert("✅ Slides reordenados com sucesso!");
  console.log("🔄 Modo reordenação DESATIVADO | Slides salvos");
}

function adicionarEventosDragDrop() {
  const tbody = document.getElementById("slides-tbody");
  const linhas = tbody.querySelectorAll('tr[draggable="true"]');

  linhas.forEach((linha) => {
    linha.addEventListener("dragstart", function (e) {
      draggedRow = this;
      this.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      console.log(`📍 Drag iniciado: Slide ${this.dataset.slideIndex}`);
    });

    linha.addEventListener("dragend", function (e) {
      this.classList.remove("dragging");
      linhas.forEach((l) => l.classList.remove("drag-over"));
      draggedRow = null;
      console.log("🛑 Drag finalizado");
    });

    linha.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (this !== draggedRow) {
        this.classList.add("drag-over");
      }
    });

    linha.addEventListener("dragleave", function (e) {
      this.classList.remove("drag-over");
    });

    linha.addEventListener("drop", function (e) {
      e.preventDefault();
      if (this !== draggedRow && draggedRow) {
        // Determinar se inserir antes ou depois
        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
          this.parentNode.insertBefore(draggedRow, this);
        } else {
          this.parentNode.insertBefore(draggedRow, this.nextSibling);
        }

        console.log(`↔️ Slide ${draggedRow.dataset.slideIndex} reposicionado`);
        this.classList.remove("drag-over");
      }
    });
  });
}

function reordenarSlidesDragDrop() {
  const tbody = document.getElementById("slides-tbody");
  const linhas = tbody.querySelectorAll("tr");
  const slides = document.querySelectorAll(".slide");
  const novaOrdem = [];

  // Pegar nova ordem da tabela
  linhas.forEach((linha) => {
    const slideIndex = parseInt(linha.dataset.slideIndex);
    novaOrdem.push(slideIndex);
  });

  console.log("📊 Nova ordem de slides:", novaOrdem);

  // Reordenar elementos no DOM
  const modal = document.getElementById("modal");
  novaOrdem.forEach((slideIndex) => {
    const slide = slides[slideIndex];
    document.body.insertBefore(slide, modal);
  });

  // Reordenar array TEMPOS para corresponder
  const novosTEMPOS = [...TEMPOS.slice(0, SLIDES_PADRAO)];
  novaOrdem.forEach((slideIndex) => {
    const indiceAdicionado = slideIndex - SLIDES_PADRAO;
    novosTEMPOS.push(TEMPOS[slideIndex]);
  });

  // Atualizar TEMPOS
  TEMPOS.length = 0;
  novosTEMPOS.forEach((tempo) => TEMPOS.push(tempo));

  console.log("✅ Slides reordenados no DOM | TEMPOS sincronizados");
}

function irParaSlideEEditar(slideIndex) {
  // Validação de segurança
  if (slideIndex < SLIDES_PADRAO) {
    console.warn("⚠️ Tentativa de editar slide padrão bloqueada");
    alert("❌ Não é possível editar slides padrão!");
    return;
  }

  slideAtual = slideIndex;
  mostrarSlide(slideIndex);
  fecharPainel();
  setTimeout(() => {
    editarSlideAtual();
  }, 300);
}

function duplicarSlidePainel(slideIndex) {
  const slides = document.querySelectorAll(".slide");
  const slideOriginal = slides[slideIndex];
  const novoSlide = slideOriginal.cloneNode(true);

  novoSlide.classList.remove("active");

  // 🔧 Inserir antes do modal para manter ordem correta
  document.body.insertBefore(novoSlide, document.getElementById("modal"));

  totalSlides++;
  const duracao = slideOriginal.getAttribute("data-duration") || "10";
  TEMPOS.push(duracao * 1000);

  salvarSlides();
  atualizarTotalSlides();
  renderizarTabelaPainel();

  alert(
    `✅ Slide ${slideIndex + 1} duplicado com sucesso!\nTotal: ${totalSlides} slides`,
  );
  console.log(`📋 Slide duplicado: ${slideIndex + 1} → ${totalSlides}`);
}

function deletarSlidePainel(slideIndex) {
  if (totalSlides <= 1) {
    alert("❌ Não é possível deletar o último slide!");
    return;
  }

  if (confirm(`Tem certeza que deseja deletar o slide ${slideIndex + 1}?`)) {
    // Identificar se é slide padrão ou extra
    const ehSlideExtra = slideIndex >= SLIDES_PADRAO;
    const indiceNoExtra = slideIndex - SLIDES_PADRAO;

    // 🔒 BLOQUEAR recarregos do Firebase enquanto sincroniza
    if (ehSlideExtra) {
      permitirRecarregarFirebase = false;
      console.log("🔒 Firebase sync bloqueado");
    }

    // PASSO 1: Remover slide do DOM
    const slides = document.querySelectorAll(".slide");
    if (slides[slideIndex]) {
      slides[slideIndex].remove();
    }
    
    // PASSO 2: Atualizar arrays
    TEMPOS.splice(slideIndex, 1);
    totalSlides--;

    // PASSO 3: Garantir que slideAtual é válido
    if (slideAtual >= totalSlides) {
      slideAtual = Math.max(0, totalSlides - 1);
    }

    // PASSO 4: Salvar no localStorage
    salvarSlides();
    
    // PASSO 5: Se for slide extra (imagem), remover do Firebase
    if (ehSlideExtra) {
      removerSlideExtraDoFirebase(indiceNoExtra).finally(() => {
        // 🔓 DESBLOQUEAR após completar
        permitirRecarregarFirebase = true;
        console.log("🔓 Firebase sync desbloqueado");
      });
    }
    
    // PASSO 6: Atualizar interface visual
    atualizarTotalSlides();
    
    // PASSO 7: Forçar re-renderização visual
    setTimeout(() => {
      mostrarSlide(slideAtual);
    }, 50);
    
    // PASSO 8: Sincronizar com Firebase
    enviarComandoDelete(slideIndex);
    
    // PASSO 9: Atualizar painel de gerenciamento
    renderizarTabelaPainel();

    console.log(`🗑️ Slide ${slideIndex + 1} deletado${ehSlideExtra ? ' (Extra do Firebase removido)' : ' (Padrão)'}`);
  }
}

// ════════════════════════════════════
// REMOVER SLIDE EXTRA DO FIREBASE
// ════════════════════════════════════
async function removerSlideExtraDoFirebase(indiceNoExtra) {
  try {
    const slidesRef = ref(db, "libnotify/slidesExtras");
    const snapshot = await get(slidesRef);
    
    if (snapshot.exists()) {
      const slides = snapshot.val();
      if (Array.isArray(slides)) {
        // Remover o slide do índice especificado
        const slidesFiltrados = slides.filter((_, i) => i !== indiceNoExtra);
        
        // Atualizar Firebase
        await set(slidesRef, slidesFiltrados.length > 0 ? slidesFiltrados : null);
        console.log(`✅ Slide extra removido do Firebase`);
      }
    }
  } catch (e) {
    console.warn("⚠️ Erro ao remover slide extra do Firebase:", e);
  }
}

// Função para enviar comando de delete via Firebase
async function enviarComandoDelete(slideIndex) {
  try {
    const comandoRef = ref(db, "libnotify/comando");
    await set(comandoRef, {
      tipo: "deletarSlide",
      indice: slideIndex,
      timestamp: Date.now(),
    });
    console.log(`📡 Comando delete enviado: slide ${slideIndex + 1}`);
  } catch (e) {
    console.warn("⚠️ Erro ao sincronizar delete:", e);
  }
}

// Inicialização síncrona (Firebase ainda não disponível aqui)
(async () => {
  try {
    // Verificar integridade do cache antes de carregar
    const slidesCacheRaw = localStorage.getItem("slidesAdicionados");
    if (slidesCacheRaw) {
      try {
        JSON.parse(slidesCacheRaw);
        console.log("✅ Cache intacto");
      } catch (e) {
        console.warn("⚠️ Cache corrompido! Limpando...");
        localStorage.removeItem("slidesAdicionados");
      }
    }

    carregarSlides();
    atualizarTotalSlides();

    // Iniciar no slide 0 — a sincronização com Firebase
    // acontece após o import do SDK (mais abaixo no arquivo)
    mostrarSlide(0);

    console.log("✅ Inicialização completada");
    console.log(`📊 Total de slides: ${totalSlides}`);
    console.log(`🎯 Slides padrão: ${SLIDES_PADRAO}`);
    console.log(`➕ Slides adicionados: ${totalSlides - SLIDES_PADRAO}`);
  } catch (erro) {
    console.error("❌ Erro na inicialização:", erro);
  }
})();

// ========================================
// 📱 REGISTRAR SERVICE WORKER (PWA)
// ========================================
if ("serviceWorker" in navigator) {
  console.log("✅ Browser suporta Service Workers");

  // Limpar service workers antigos
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
    }
  });

  // Registrar novo service worker
  navigator.serviceWorker
    .register("./service-worker.js", { scope: "./" })
    .then((registration) => {
      console.log("✅ Service Worker registrado com sucesso!");
      console.log("📱 PWA está pronto para ser instalado!");
    })
    .catch((error) => {
      console.error("❌ Erro ao registrar Service Worker:", error);
    });

  // Detectar quando PWA é instalada
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("💾 PWA pode ser instalada!");
    console.log("📥 Prompt de instalação disponível");
  });

  window.addEventListener("appinstalled", () => {
    console.log("🎉 PWA instalada com sucesso!");
    deferredPrompt = null;
  });
} else {
  console.warn("⚠️ Browser não suporta Service Workers");
}

// 📚 LISTENER F2 - ABRIR BIBLIOTECA
document.addEventListener("keydown", function (e) {
  if (e.key === "F2") {
    e.preventDefault();
    console.log("✅ F2 pressionado - abrindo biblioteca");
    if (window.abrirModoGoogleFullscreen && !modoGoogleAtivo) {
      window.abrirModoGoogleFullscreen();
    } else if (modoGoogleAtivo) {
      console.log("⚠️ Modo biblioteca já ativo");
    } else {
      console.error("❌ Função abrirModoGoogleFullscreen não disponível");
    }
  }
});

// ================================================================
// ================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  serverTimestamp,
  get,
  set,
  update,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpXgjUEnz-s4gZAtXtUkBdRywK00ZbTRs",
  authDomain: "libnotify-1f612.firebaseapp.com",
  databaseURL: "https://libnotify-1f612-default-rtdb.firebaseio.com",
  projectId: "libnotify-1f612",
  storageBucket: "libnotify-1f612.firebasestorage.app",
  messagingSenderId: "998002356959",
  appId: "1:998002356959:web:9114e099136737aac3ef6a",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const statusEl = document.getElementById("firebase-status");

// 🌍 Disponibilizar Firebase globalmente para display-manager.js
window.db = db;
window.app = app;
window.firebase_ref = ref;
window.firebase_set = set;
window.firebase_update = update;
window.firebase_onValue = onValue;
window.firebase_get = get;
window.firebase_onDisconnect = onDisconnect;

// Expor para display-manager.js (script não-módulo não acessa escopo de módulo)
window.mostrarNotificacaoBrowser = mostrarNotificacaoBrowser;

// 🔄 slideAtual na inicialização sempre começa do 0.
// A sincronização com o admin acontece via comando "irParaSlide" em tempo real.
console.log("✅ Iniciando do slide 1 (sincronização via comando admin em tempo real)");

// 🎯 Disparar evento indicando que Firebase está pronto
window.dispatchEvent(new CustomEvent("firebaseReady"));
console.log("✅ Firebase SDK globalizado para display-manager.js");

// ========================================
// 🖥️ GERENCIAMENTO DE DISPLAYS
// ========================================
// Agora é feito via evento firebaseReady em display-manager.js

// ──────────────────────────────────────────────
// 📡 PUBLICAR SLIDE ATUAL NO FIREBASE
// Chamado sempre que o display muda de slide,
// para que o admin saiba qual slide está visível.
// Usa set com throttle para evitar escritas excessivas.
// ──────────────────────────────────────────────

function publicarSlideAtual(indice) {
  // Throttle: aguarda 300ms antes de escrever (evita flood em navegação rápida)
  clearTimeout(_publishTimer);
  _publishTimer = setTimeout(async () => {
    try {
      await set(ref(db, "libnotify/slideAtual"), {
        indice,
        atualizadoEm: Date.now(),
      });
      console.log(`📡 Slide atual publicado no Firebase: ${indice + 1}`);
    } catch (err) {
      // Falha silenciosa — não interrompe a apresentação
      console.warn("⚠️ Não foi possível publicar slideAtual no Firebase:", err);
    }
  }, 300);
}

// ⏸️ FLAG legada para compatibilidade com rotinas antigas de gerenciamento
// Slides extras: apenas o listener em libnotify/slidesExtras aplica mudanças.
// Não processar "atualizarSlides" em libnotify/comando — onValue reentrega o último
// comando ao abrir a página e pode sobrescrever com lista antiga (bug de sincronização).
let permitirRecarregarFirebase = true; // mantido para compatibilidade, mas não usado no listener
let adminOnline = false;
const ADMIN_PRESENCE_TIMEOUT_MS = 20000;

function calcularAdminOnline(presenceData) {
  if (!presenceData || typeof presenceData !== "object") return false;
  const agora = Date.now();

  return Object.values(presenceData).some((sessao) => {
    if (!sessao || sessao.perfil !== "admin") return false;
    if (sessao.online !== true) return false;
    if (typeof sessao.atualizadoEm !== "number") return false;
    return agora - sessao.atualizadoEm <= ADMIN_PRESENCE_TIMEOUT_MS;
  });
}

// ──────────────────────────────────────────────
// 📡 CARREGAR SLIDES EXTRAS DO FIREBASE
// Esta é a ÚNICA fonte de verdade para slides extras.
// Sempre que o admin altera slidesExtras no Firebase,
// este listener recarrega e re-renderiza tudo corretamente.
// ──────────────────────────────────────────────
const slidesExtrasRef = ref(db, "libnotify/slidesExtras");

// Debounce: evita múltiplos disparos em rápida sucessão
let _slidesExtrasDebounce = null;
let _sincronizacaoInicialSlidesExtrasConcluida = false;

onValue(
  slidesExtrasRef,
  (snapshot) => {
    // Debounce de 200ms para ignorar disparos duplos imediatos
    clearTimeout(_slidesExtrasDebounce);
    _slidesExtrasDebounce = setTimeout(() => {
      _aplicarSlidesExtras(snapshot);

      // Primeira carga do Firebase: força começar no slide 1 já sincronizado.
      // Evita cenário em que o loop local avança antes de receber slidesExtras.
      if (!_sincronizacaoInicialSlidesExtrasConcluida) {
        _sincronizacaoInicialSlidesExtrasConcluida = true;
        slideAtual = 0;
        ultimoIndiceSlideExibido = null;
        // 🔧 FIX: Garantir que mostrarSlide() atualize indicador desde o slide 1
        mostrarSlide(0);
        console.log("🎯 Sincronização inicial concluída — reiniciado no slide 1 com indicador atualizado");
        
        // Extra logging para garantir que tudo está sincronizado
        console.log(`📊 Estado após sync: slideAtual=${slideAtual}, totalSlides=${totalSlides}, indicador=${document.getElementById("slide-numero").textContent}/${document.getElementById("total-slides").textContent}`);
      }
    }, 200);
  },
  (error) => {
    console.warn("⚠️ Erro ao carregar slidesExtras:", error);
  }
);

const adminPresenceRef = ref(db, "libnotify/adminPresence");
onValue(
  adminPresenceRef,
  (snapshot) => {
    const estavaOnline = adminOnline;
    adminOnline = calcularAdminOnline(snapshot.val());
    if (adminOnline !== estavaOnline) {
      console.log(adminOnline ? "🟢 Admin online (sync remota ativa)" : "🟡 Sem admin online (loop local ativo)");
    }
  },
  (error) => {
    console.warn("⚠️ Erro ao escutar presença de admin:", error);
    adminOnline = false;
  }
);

const videoSlideMutedRef = ref(db, "libnotify/videoSlideMuted");
onValue(
  videoSlideMutedRef,
  (snapshot) => {
    const v = snapshot.val();
    videoSlideMutedRemoto = v === null || v === undefined ? true : !!v;
    sincronizarVideosNosSlides(false);
  },
  (error) => {
    console.warn("⚠️ Erro ao escutar videoSlideMuted:", error);
  }
);

function normalizarVolumeVideo(v) {
  if (v === null || v === undefined) return 1;
  const n = Number(v);
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

const videoSlideVolumeRef = ref(db, "libnotify/videoSlideVolume");
onValue(
  videoSlideVolumeRef,
  (snapshot) => {
    videoSlideVolumeRemoto = normalizarVolumeVideo(snapshot.val());
    sincronizarVideosNosSlides(false);
  },
  (error) => {
    console.warn("⚠️ Erro ao escutar videoSlideVolume:", error);
  }
);

function _aplicarSlidesExtras(snapshot) {
  aplicarSlidesExtrasNoDisplay(normalizarSlidesExtras(snapshot.val()), "Firebase");
}

function normalizarSlidesExtras(slides) {
  if (!slides) return [];
  if (Array.isArray(slides)) return slides;
  // Firebase pode gravar array como objeto; ordenar chaves evita ordem errada.
  return Object.keys(slides)
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    })
    .map((k) => slides[k])
    .filter((item) => item != null);
}

function aplicarSlidesExtrasNoDisplay(slidesArray, origem = "sincronizacao") {
  console.log(`📥 Aplicando ${slidesArray.length} slides extras (${origem})`);

  // Preserva o slide realmente visivel para evitar saltos por estado defasado.
  const slidesAntes = Array.from(document.querySelectorAll(".slide"));
  const indiceAtivoNoDom = slidesAntes.findIndex((s) => s.classList.contains("active"));
  const slideVisivelAntes = indiceAtivoNoDom >= 0 ? indiceAtivoNoDom : slideAtual;

  const slidesContainer = document.getElementById("slides-container");
  if (!slidesContainer) {
    console.error("❌ Container #slides-container não encontrado!");
    return;
  }

  // Remover slides extras antigos (mantém apenas os padrão)
  const todosSlides = document.querySelectorAll(".slide");
  todosSlides.forEach((s, i) => {
    if (i >= SLIDES_PADRAO) s.remove();
  });

  totalSlides = SLIDES_PADRAO;
  TEMPOS.splice(SLIDES_PADRAO);

  // ⚠️ REMOVIDO: Não mais usar dadosParaSalvar
  // Os slides agora vêm APENAS do Firebase
  
  slidesArray.forEach((slideData) => {
    const novoSlide = document.createElement("div");
    novoSlide.className = "slide";
    const duracao = parseInt(slideData.duracao) || 10;
    novoSlide.setAttribute("data-duration", duracao);

    // 🎥 Slide de vídeo
    if (slideData.tipo === "video" && slideData.url) {
      novoSlide.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;position:absolute;top:0;left:0;z-index:2;">
          <video 
            src="${slideData.url}" 
            crossorigin="anonymous"
            style="width:100%;height:100%;object-fit:contain;" 
            playsinline
            muted
            preload="metadata"
            class="video-slide">
          </video>
        </div>
      `;
    }
    // 🖼️ Slide de imagem
    else if (slideData.tipo === "imagem" && slideData.imagem) {
      novoSlide.innerHTML = `<img src="${slideData.imagem}" crossorigin="anonymous" alt="Slide adicionado" class="imagem-tela-cheia" style="width:100%;height:100%;object-fit:fill;position:absolute;top:0;left:0;z-index:2;">`;
    }
    // 📝 Slide de texto
    else if (slideData.tipo === "texto") {
      novoSlide.style.background = slideData.background || "";
      novoSlide.innerHTML = slideData.html || "";
    }

    slidesContainer.appendChild(novoSlide);
    totalSlides++;
    TEMPOS.push(duracao * 1000);
  });

  // ⚠️ REMOVIDO: Não mais salvar no localStorage
  // Os slides agora vêm APENAS do Firebase (libnotify/slidesExtras)
  // Salvar aqui causava: QuotaExceededError + duplicação de dados
  console.log(`📥 ${slidesArray.length} slides carregados do Firebase (sem cache local)`);

  // 🔧 FIX BUG 1: Reaplica o slide ativo depois de reconstruir o DOM
  // Necessário para sincronizar indicador desde o slide 1
  slideAtual = Math.min(Math.max(slideVisivelAntes, 0), Math.max(totalSlides - 1, 0));
  
  // 🔄 Atualizar indicador ANTES de chamar mostrarSlide para garantir sincronização
  document.getElementById("total-slides").textContent = totalSlides;
  document.getElementById("slide-numero").textContent = slideAtual + 1;
  
  // DOM novo: forçar mesmo índice a passar por reinício de vídeo/timer coerente
  ultimoIndiceSlideExibido = null;
  
  // ⚠️ IMPORTANTE: Chamar mostrarSlide para garantir que o slide 1 esteja
  // sincronizado corretamente desde a primeira carga do Firebase
  mostrarSlide(slideAtual);

  console.log(`✅ ${slidesArray.length} slides extras carregados (total: ${totalSlides} | indicador atualizado)`);
}

// ──────────────────────────────────────────────
// �📡 ESCUTAR COMANDOS DO ADMIN EM TEMPO REAL
// ──────────────────────────────────────────────
const comandoRef = ref(db, "libnotify/comando");

onValue(
  comandoRef,
  (snapshot) => {
    try {
      const data = snapshot.val();
      if (!data) return;

      // 🔧 FIX BUG 2: Ignorar comandos antigos para evitar reexecução de áudio
      // Registra o timestamp da primeira vez que o listener é configurado
      // e ignora qualquer comando anterior a esse momento
      if (!window._timestampInicioListenerComando) {
        window._timestampInicioListenerComando = Date.now();
        console.log("🎯 Timestamp do início do listener de comandos registrado");
      }
      
      if (data.timestamp && data.timestamp < window._timestampInicioListenerComando) {
        console.log(`⏭️ Comando antigo ignorado (${data.tipo}) — anterior ao início da sessão`);
        return;
      }

      // Verificar origem do comando
      if (data.source === "preview-admin") {
        statusEl.textContent = "🔗 Sincronizado com Admin";
      } else {
        statusEl.textContent = "🔴 Admin ao vivo";
      }
      statusEl.classList.add("conectado");

      const tipo = data.tipo;
      console.log("📡 Comando recebido:", data);

      const comandoControle =
        tipo === "irParaSlide" || tipo === "pausar" || tipo === "retomar";
      if (comandoControle && !adminOnline) {
        console.log(`ℹ️ Comando ${tipo} ignorado: nenhum admin online`);
        return;
      }

      // 🔄 Verificar se sincronização está ativa para "irParaSlide"
      if (tipo === "irParaSlide" && typeof data.indice === "number") {
        // Se sincronização está DESATIVADA, ignorar comando de mudança de slide
        
        const idx = data.indice;
        if (idx >= 0 && idx < totalSlides) {
          slideAtual = idx;
          mostrarSlide(slideAtual);
          console.log(`📺 ✅ SYNC ON: Admin exibindo slide ${idx + 1}`);
        } else {
          console.warn(`⚠️ irParaSlide: Índice ${idx} fora do intervalo (0-${totalSlides - 1})`);
        }
      } else if (tipo === "pausar") {
        clearTimeout(timerAtual);
        clearInterval(timerContador);
        document.querySelectorAll(".slide video").forEach((v) => v.pause());
        console.log("⏸️ Admin: apresentação pausada");
      } else if (tipo === "retomar") {
        resetarTimer();
        sincronizarVideosNosSlides(false);
        console.log("▶️ Admin: apresentação retomada");
      } else if (tipo === "tocarSom") {
        tocarSom();
        console.log("🔔 Admin: som de atenção acionado");
      } else if (tipo === "deletarSlide") {
        // ℹ️ Ignorado: o listener slidesExtrasRef cuida da remoção com debounce.
        // Processar aqui causava race condition (flash 1/8 → 1/5).
        console.log("ℹ️ Comando deletarSlide ignorado — listener slidesExtrasRef já sincronizou");
      } else if (tipo === "atualizarSlides") {
        console.log(
          "ℹ️ Comando atualizarSlides ignorado no nó comando — slides vêm só de libnotify/slidesExtras (evita reaplicar lista antiga ao reconectar)."
        );
      }

      setTimeout(() => {
        statusEl.classList.add("oculto");
      }, 4000);
    } catch (errListener) {
      console.error("❌ ERRO NO LISTENER DE COMANDOS:", errListener);
      console.log("🔄 Listener continua ativo, tentará novamente no próximo comando");
      // ⚠️ IMPORTANTE: NÃO rethrow - deixa o listener vivo para próximos comandos
    }
  },
  (error) => {
    console.error("❌ Firebase erro:", error);
    statusEl.textContent = "❌ Firebase desconectado";
    statusEl.classList.add("erro");
  },
);

// Conexão bem sucedida
const connRef = ref(db, ".info/connected");
onValue(connRef, (snap) => {
  if (snap.val() === true) {
    statusEl.textContent = "🟢 Conectado ao Firebase";
    statusEl.classList.add("conectado");
    statusEl.classList.remove("oculto");
    setTimeout(() => statusEl.classList.add("oculto"), 3000);
  }
});

// ================================================================
// � FUNÇÃO PARA TOCAR SOM DE ATENÇÃO
// ================================================================
function tocarSom() {
  const audio = document.getElementById("som-atencao");
  if (audio) {
    audio.currentTime = 0; // Resetar para o início
    audio.play().catch((err) => {
      console.warn("⚠️ Erro ao tocar áudio:", err);
    });
    console.log("🔔 Som de atenção tocado");
  } else {
    console.warn("⚠️ Elemento de áudio não encontrado");
  }
}

// ================================================================
// �🌐 EXPORTAR FUNÇÕES PARA ESCOPO GLOBAL (type="module" fix)
// ================================================================
// Quando o script é carregado com type="module", as funções ficam
// no escopo do módulo e não são acessíveis do onclick no HTML.
// Precisamos expor tudo ao window para que funcione.

// Navegação
window.anteriorSlide = anteriorSlide;
window.proximoSlide = proximoSlide;

// Admin
window.abrirAdmin = function() {
  // Verificar se está rodando como PWA
  const isPWA = window.matchMedia('(display-mode: fullscreen)').matches || 
                window.matchMedia('(display-mode: standalone)').matches ||
                navigator.standalone === true;
  
  if (isPWA) {
    // Se está em PWA, navega para admin.html (abre no PWA do admin se instalado)
    window.location.href = 'admin.html';
  } else {
    // Se está em navegador normal, abre em nova aba
    window.open('admin.html', '_blank');
  }
};

// Fullscreen
window.alternarTelaCheia = alternarTelaCheia;

// Modo Kiosk (Biblioteca Google)
window.abrirModoGoogleFullscreen = abrirModoGoogleFullscreen;
window.sairModoGoogleFullscreen = sairModoGoogleFullscreen;

// Áudio
window.tocarSom = tocarSom;

console.log("✅ Funções essenciais exportadas para escopo global");

// =======================================
// 🔧 SERVICE WORKER REGISTRATION
// =======================================
function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then((registration) => {
          console.log('✅ Service Worker registrado:', registration);
          
          // Detectar updates disponíveis
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                console.log('🔄 Nova versão do Service Worker disponível!');
                // Notificar usuário sobre update se necessário
              }
            });
          });
        })
        .catch((err) => {
          console.warn('⚠️ Erro ao registrar Service Worker:', err);
        });
    });
  }
}

// Registrar ao carregar
registrarServiceWorker();
