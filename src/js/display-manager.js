// ========================================
// 🖥️ GERENCIAMENTO DE DISPLAYS - LibNotify
// Sistema para controlar múltiplos displays remotamente
// ========================================

let displayId = null;
let nomeDisplay = null;
let heartbeatTimer = null;
let displayRef = null;
let db = null;
let deviceFingerprint = null;

// Flag que indica se este display já tem nome definido (evita fallback abrir painel)
let displayJaConfigurado = false;

/** Evita registrar display / listeners duas vezes (firebaseReady + fallback). */
let _displayManagerInitFeito = false;
let _unsubscribeComandosDisplay = null;

const NOME_DISPLAY_PENDENTE = "NOVO DISPLAY A SER CADASTRADO";

function nomeDisplayValido(n) {
  return (
    typeof n === "string" &&
    n.trim() !== "" &&
    n.trim() !== NOME_DISPLAY_PENDENTE
  );
}

/** Compatível com DataSnapshot.exists como função (SDK antigo) ou boolean (SDK novo). */
function snapshotExiste(snapshot) {
  if (!snapshot) return false;
  try {
    if (typeof snapshot.exists === "function") return snapshot.exists();
    if (typeof snapshot.exists === "boolean") return snapshot.exists;
  } catch (e) {
    /* ignora */
  }
  return snapshot.val() != null;
}

function obterNomeSalvoLocalmente() {
  try {
    const n = localStorage.getItem("displayNome");
    return nomeDisplayValido(n) ? n.trim() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Gera fingerprint único do device (para reconhecer mesma máquina)
 */
function gerarDeviceFingerprint() {
  const nav = navigator;
  const fingerprint = [
    nav.userAgent.substring(0, 50),
    nav.language,
    new Date().getTimezoneOffset(),
    screen.width + "x" + screen.height,
    screen.colorDepth,
    nav.hardwareConcurrency || "unknown"
  ].join("|");

  return btoa(fingerprint).substring(0, 20);
}

/**
 * Gera ou recupera ID único do display.
 * Salva em localStorage com fallback para sessionStorage.
 */
function gerarOuRecuperarDisplayId() {
  deviceFingerprint = gerarDeviceFingerprint();
  console.log(`🖥️ Device Fingerprint: ${deviceFingerprint}`);

  let id = null;
  let usandoLocalStorage = true;

  try {
    id = localStorage.getItem("displayId");
  } catch (e) {
    console.warn("⚠️ localStorage não disponível, usando sessionStorage");
    usandoLocalStorage = false;
  }

  if (!id) {
    try {
      if (usandoLocalStorage) {
        id = sessionStorage.getItem("displayId");
      }
    } catch (e) {
      console.warn("⚠️ sessionStorage também não disponível");
    }
  }

  if (!id) {
    id = `display-${deviceFingerprint}-${Date.now()}`;
    console.log(`🆕 Novo Display ID gerado: ${id}`);

    try {
      localStorage.setItem("displayId", id);
      localStorage.setItem("displayIdTimestamp", Date.now().toString());
    } catch (e) {
      console.warn("⚠️ Erro ao salvar em localStorage");
    }
    try {
      sessionStorage.setItem("displayId", id);
    } catch (e) {
      console.warn("⚠️ Erro ao salvar em sessionStorage");
    }
  } else {
    console.log(`♻️ Display ID recuperado: ${id}`);
  }

  displayId = id;
  limparDisplaysAntigos();

  console.log("📦 Storage:", {
    localStorage: {
      displayId: localStorage.getItem("displayId"),
      displayNome: localStorage.getItem("displayNome")
    },
    sessionStorage: {
      displayId: sessionStorage.getItem("displayId")
    }
  });

  return id;
}

/**
 * Remove IDs de display antigos do localStorage (> 7 dias)
 */
function limparDisplaysAntigos() {
  try {
    const chaves = Object.keys(localStorage);
    const agora = Date.now();
    const diasEmMs = 7 * 24 * 60 * 60 * 1000;

    let deletados = 0;
    chaves.forEach(chave => {
      if (chave.startsWith("displayId-") || chave.startsWith("displayNome-")) {
        const timestamp = localStorage.getItem(chave + "-timestamp");
        if (timestamp && (agora - parseInt(timestamp)) > diasEmMs) {
          localStorage.removeItem(chave);
          localStorage.removeItem(chave + "-timestamp");
          console.log(`🗑️ Removido display antigo: ${chave}`);
          deletados++;
        }
      }
    });

    if (deletados > 0) {
      console.log(`🧹 Limpeza: ${deletados} displays antigos removidos do localStorage`);
    }
  } catch (e) {
    console.warn("⚠️ Erro ao limpar displays antigos");
  }
}

/**
 * Define um nome amigável para o display e persiste no Firebase.
 * ✅ Usa firebase_update para atualizar apenas o campo "nome"
 *    sem sobrescrever outros campos (status, comando, etc.)
 */
function atualizarNomeNoFirebase(nome) {
  if (!window.firebase_update || !displayRef || !displayId) {
    return Promise.reject(new Error("Firebase ou displayRef indisponível"));
  }
  return window.firebase_update(displayRef, {
    nome,
    ultimaAtualizacao: Date.now(),
  });
}

function definirNomeDisplay(nome) {
  nomeDisplay = nome;
  displayJaConfigurado = true;

  try {
    localStorage.setItem("displayNome", nome);
  } catch (e) {
    console.warn("⚠️ Erro ao salvar nome no localStorage");
  }

  console.log(`🖥️ Display identificado como: "${nome}"`);

  if (window.firebase_update && displayRef && displayId) {
    console.log(`📤 Atualizando nome no Firebase: "${nome}"`);
    atualizarNomeNoFirebase(nome)
      .then(() => console.log(`✅ Nome atualizado no Firebase: ${nome}`))
      .catch((e) => {
        console.warn("⚠️ Erro ao atualizar nome, nova tentativa em 600ms:", e);
        setTimeout(() => {
          atualizarNomeNoFirebase(nome)
            .then(() => console.log(`✅ Nome atualizado (retry): ${nome}`))
            .catch((e2) =>
              console.error("❌ Erro ao atualizar nome do display (definitivo):", e2)
            );
        }, 600);
      });
  } else {
    console.warn(
      `⚠️ firebase_update ou displayRef não disponível — nome só no localStorage por agora`
    );
  }

  atualizarPainelDisplay();
}

/**
 * Renomeia o display via input do usuário e fecha o painel.
 */
function renomearDisplay(novoNome) {
  if (!novoNome || novoNome.trim() === "") {
    alert("⚠️ Por favor, digite um nome válido");
    return;
  }

  const nomeLimpo = novoNome.trim();
  console.log(`🔄 Iniciando rename para: ${nomeLimpo}`);

  definirNomeDisplay(nomeLimpo);

  const input = document.getElementById("display-nome-input");
  if (input) input.value = "";

  // Fechar painel após 1.5s
  setTimeout(() => {
    const painel = document.getElementById("display-config");
    if (painel) {
      painel.style.opacity = "0";
      painel.style.transition = "opacity 0.5s";
      setTimeout(() => {
        painel.style.display = "none";
        painel.style.opacity = "1";
        console.log(`✅ Painel fechado após rename`);
      }, 500);
    }
  }, 1500);

  console.log(`✅ Display renomeado para: "${nomeLimpo}"`);
}

/**
 * Atualiza painel visual do display
 */
function atualizarPainelDisplay() {
  const idEl = document.getElementById("display-id-valor");
  const nomeEl = document.getElementById("display-nome-input");
  const statusEl = document.getElementById("display-status");

  if (idEl) idEl.textContent = displayId || "N/A";
  if (nomeEl && !nomeEl.value) nomeEl.placeholder = `Nome do display (atual: ${obterNomeDisplay()})`;
  if (statusEl) statusEl.textContent = "🟢 Ativo";
}

/**
 * Recupera nome do display do localStorage
 */
function obterNomeDisplay() {
  try {
    return localStorage.getItem("displayNome") || "Display " + (displayId ? displayId.substr(0, 8) : "?");
  } catch (e) {
    console.warn("⚠️ Erro ao ler displayNome do localStorage");
    return "Display " + (displayId ? displayId.substr(0, 8) : "?");
  }
}

/**
 * Registra o display no Firebase e inicia listeners.
 * Deve ser chamado APÓS Firebase estar inicializado.
 */
function registrarDisplayNoFirebase(firebaseDb) {
  if (!firebaseDb || !displayId) {
    console.error("❌ Erro: Firebase ou displayId não disponível");
    return;
  }

  db = firebaseDb;

  try {
    displayRef = window.firebase_ref(db, `libnotify/displays/${displayId}`);
    console.log("📝 Registrando no Firebase em: libnotify/displays/" + displayId);

    window.firebase_get(displayRef).then((snapshot) => {
      const nomeLocal = obterNomeSalvoLocalmente();
      const painel = document.getElementById("display-config");

      if (snapshotExiste(snapshot)) {
        const dados = snapshot.val() || {};
        let nomeDoFirebase = dados.nome;

        console.log(`♻️ Display já existe no Firebase`);
        console.log(`   Nome no Firebase: ${nomeDoFirebase}`);

        // Firebase sem nome útil, mas já havia nome neste aparelho → restaurar e sincronizar
        if (!nomeDisplayValido(nomeDoFirebase) && nomeLocal) {
          nomeDoFirebase = nomeLocal;
          window
            .firebase_update(displayRef, {
              nome: nomeLocal,
              ultimaAtualizacao: Date.now(),
            })
            .catch((e) =>
              console.warn("⚠️ Não foi possível sincronizar nome local → Firebase:", e)
            );
        }

        nomeDisplay =
          nomeDisplayValido(nomeDoFirebase) ? nomeDoFirebase.trim() : nomeLocal || nomeDoFirebase;
        displayJaConfigurado = nomeDisplayValido(nomeDisplay);

        try {
          if (nomeDisplay) localStorage.setItem("displayNome", nomeDisplay);
        } catch (e) {
          console.warn("⚠️ Erro ao salvar nome no localStorage");
        }

      window.firebase_update(displayRef, {
        status: "ativo",
        ultimaAtualizacao: Date.now(),
      }).catch((e) => console.error("❌ Erro ao atualizar status:", e));

      // ✅ onDisconnect: Firebase marca inativo automaticamente mesmo se a aba fechar
      if (window.firebase_onDisconnect) {
        window.firebase_onDisconnect(displayRef).update({
          status: "inativo",
          ultimaAtualizacao: Date.now(),
        }).then(() => {
          console.log("🔌 onDisconnect registrado — status será marcado 'inativo' ao desconectar");
        }).catch(e => console.warn("⚠️ Erro ao registrar onDisconnect:", e));
      }

        if (displayJaConfigurado) {
          console.log("✅ Display já configurado — painel OCULTO");
          if (painel) painel.style.display = "none";
        } else {
          console.log("🎯 Nome ainda pendente — aguardando rename via admin");
          if (painel) painel.style.display = "none"; // painel de rename migrado para o admin
        }
      } else {
        // Nó ausente (nunca cadastrado ou foi apagado no Firebase) — reutilizar ID + nome local
        if (nomeLocal) {
          nomeDisplay = nomeLocal;
          displayJaConfigurado = true;
          try {
            localStorage.setItem("displayNome", nomeLocal);
          } catch (e) {
            /* ignora */
          }
          console.log(
            `♻️ Recriando nó no Firebase com nome do localStorage (mesmo displayId): ${nomeLocal}`
          );
          window
            .firebase_set(displayRef, {
              nome: nomeLocal,
              status: "ativo",
              ultimaAtualizacao: Date.now(),
              ua: navigator.userAgent.substr(0, 50),
            })
            .catch((e) => console.error("❌ Erro ao registrar display:", e));
          if (painel) painel.style.display = "none";
        } else {
          nomeDisplay = NOME_DISPLAY_PENDENTE;
          displayJaConfigurado = false;
          try {
            localStorage.setItem("displayNome", NOME_DISPLAY_PENDENTE);
          } catch (e) {
            console.warn("⚠️ Erro ao salvar nome no localStorage");
          }
          console.log(`🆕 Novo display — criando no Firebase com nome padrão`);
          window
            .firebase_set(displayRef, {
              nome: NOME_DISPLAY_PENDENTE,
              status: "ativo",
              ultimaAtualizacao: Date.now(),
              ua: navigator.userAgent.substr(0, 50),
            })
            .catch((e) => console.error("❌ Erro ao registrar display:", e));
          console.log("🎯 Novo display sem nome — renomeie pelo painel Admin");
          if (painel) painel.style.display = "none"; // rename agora é feito pelo admin
        }
      }

      // ✅ onDisconnect para todos os branches: Firebase marca inativo automaticamente
      if (window.firebase_onDisconnect) {
        window.firebase_onDisconnect(displayRef).update({
          status: "inativo",
          ultimaAtualizacao: Date.now(),
        }).catch(e => console.warn("⚠️ Erro ao registrar onDisconnect (else-branch):", e));
      }

      console.log(`✅ Display registrado no Firebase: ${displayId}`);
      console.log(`   Nome: ${nomeDisplay}`);

      iniciarHeartbeatDisplay();
      escutarComandosDisplay();
      escutarMudancasDoDisplay();   // 🆕 sincroniza nome quando admin renomeia

    }).catch(err => {
      console.error("❌ Erro ao verificar/registrar display:", err);
      // Rename agora é feito pelo admin — nenhum painel é exibido no index em caso de erro
    });

  } catch (error) {
    console.error("❌ Erro ao chamar Firebase functions:", error);
    // Rename agora é feito pelo admin — nenhum painel é exibido no index em caso de erro
  }
}

/**
 * Envia heartbeat periódico para manter display marcado como "ativo".
 * Intervalo: 30 segundos.
 */
function iniciarHeartbeatDisplay() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  atualizarStatusDisplay("ativo");

  heartbeatTimer = setInterval(() => {
    atualizarStatusDisplay("ativo");
  }, 30000);

  console.log("💓 Heartbeat iniciado — status será atualizado a cada 30s");
}

/**
 * Atualiza o status do display no Firebase.
 * ✅ FIX: usa firebase_update (PATCH) para NÃO sobrescrever o campo "nome".
 *    O firebase_set sem merge no Realtime Database apaga os outros campos.
 */
function atualizarStatusDisplay(status) {
  if (!displayRef) return;

  console.log(`💓 Heartbeat: atualizando status → "${status}" (nome preservado)`);

  window.firebase_update(displayRef, {
    status,
    ultimaAtualizacao: Date.now()
  }).then(() => {
    console.log(`✅ Status atualizado (nome intacto)`);
  }).catch(e => {
    console.warn("⚠️ Erro ao atualizar status:", e);
  });
}

/**
 * Remove o display do Firebase
 */
function deletarDisplayDoFirebase(idDisplay) {
  if (!window.db) {
    console.error("❌ Firebase não disponível para deletar");
    alert("❌ Erro: Firebase não está disponível");
    return;
  }

  if (!idDisplay || idDisplay.trim() === "") {
    console.error("❌ ID do display inválido");
    alert("❌ Erro: ID do display inválido");
    return;
  }

  console.log(`🗑️ Deletando display: ${idDisplay}`);

  const displayDeleteRef = window.firebase_ref(window.db, `libnotify/displays/${idDisplay}`);
  window.firebase_set(displayDeleteRef, null).then(() => {
    console.log(`✅ Display deletado do Firebase: ${idDisplay}`);
    alert(`✅ Display deletado com sucesso!`);
  }).catch(err => {
    console.error(`❌ Erro ao deletar display ${idDisplay}:`, err);
    alert(`❌ Erro ao deletar: ${err.message}`);
  });
}

/**
 * Escuta comandos específicos para este display.
 * Firebase path: libnotify/displays/{displayId}/comando
 */
function escutarComandosDisplay() {
  if (!db || !displayId) return;

  if (typeof _unsubscribeComandosDisplay === "function") {
    try {
      _unsubscribeComandosDisplay();
    } catch (e) {
      /* ignora */
    }
    _unsubscribeComandosDisplay = null;
  }

  // Registrar o momento exato em que este display conectou.
  // Qualquer comando com timestamp anterior a este momento é
  // um comando "antigo" que ainda está salvo no Firebase —
  // deve ser ignorado para evitar re-execução ao reconectar.
  const timestampConexao = Date.now();

  const comandoRef = window.firebase_ref(db, `libnotify/displays/${displayId}/comando`);

  _unsubscribeComandosDisplay = window.firebase_onValue(
    comandoRef,
    (snapshot) => {
      const comando = snapshot.val();
      if (!comando) return;

      // ✅ Ignorar comandos salvos antes desta sessão
      if (comando.timestamp && comando.timestamp < timestampConexao) {
        console.log(`⏭️ Comando antigo ignorado (${comando.tipo}) — anterior à conexão`);
        return;
      }

      console.log(`📡 Comando recebido para ${displayId}:`, comando.tipo);
      processarComandoDisplay(comando);
    },
    (error) => {
      console.warn("⚠️ Erro ao escutar comandos do display:", error);
    }
  );

  console.log(`🎧 Escutando comandos em: libnotify/displays/${displayId}/comando`);
}

/**
 * Processa comandos específicos do display
 */
function processarComandoDisplay(comando) {
  try {
    const { tipo, ...dados } = comando;

    switch (tipo) {
      case "abrirBiblioteca":
        console.log("📚 Abrindo biblioteca remotamente...");
        if (window.abrirModoGoogleFullscreen) {
          window.abrirModoGoogleFullscreen();
        }
        break;

      case "fecharBiblioteca":
        console.log("📚 Fechando biblioteca remotamente...");
        if (window.sairModoGoogleFullscreen) {
          window.sairModoGoogleFullscreen();
        }
        break;

      case "tocarSom":
        console.log("🔔 Tocando som de atenção remotamente...");
        const audio = document.getElementById("som-atencao");
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(e => console.warn("⚠️ Não foi possível tocar o som:", e));
        } else {
          console.warn("⚠️ Elemento #som-atencao não encontrado no DOM");
        }
        break;

      case "irParaSlide":
        console.log(`🎬 Ir para slide ${dados.indice + 1} remotamente...`);
        if (window.irParaSlideRemoto) {
          window.irParaSlideRemoto(dados.indice);
        }
        break;

      case "pausar":
        console.log("⏸️ Pausando remotamente...");
        if (window.pausarApresentacao) {
          window.pausarApresentacao();
        }
        break;

      case "retomar":
        console.log("▶️ Retomando remotamente...");
        if (window.retomarApresentacao) {
          window.retomarApresentacao();
        }
        break;

      default:
        console.warn(`⚠️ Comando desconhecido: ${tipo}`);
    }
  } catch (err) {
    console.error("❌ Erro ao processar comando:", err);
  }
}

/**
 * Limpa recursos ao desconectar
 */
function desconectarDisplay() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  // ✅ FIX: usar firebase_update para marcar inativo sem apagar o nome
  if (displayRef) {
    window.firebase_update(displayRef, {
      status: "inativo",
      ultimaAtualizacao: Date.now()
    }).catch(e => console.warn("⚠️ Erro ao marcar como inativo:", e));
  }

  console.log("👋 Display desconectado");
}

// Limpar ao fechar página
window.addEventListener("beforeunload", desconectarDisplay);

// ================================================================
// 🔧 INICIALIZAÇÃO COM LISTENERS DE UI
// ================================================================

function _inicializarListenersUI() {
  const renameBtn = document.getElementById("display-rename-btn");
  if (renameBtn) {
    renameBtn.addEventListener("click", () => {
      const input = document.getElementById("display-nome-input");
      if (input && input.value.trim()) {
        renomearDisplay(input.value);
      }
    });
  }

  const nomeInput = document.getElementById("display-nome-input");
  if (nomeInput) {
    nomeInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && nomeInput.value.trim()) {
        renomearDisplay(nomeInput.value);
      }
    });
  }
}

function _inicializarDisplayManager() {
  if (_displayManagerInitFeito) {
    console.warn("⚠️ display-manager: inicialização duplicada ignorada");
    return;
  }
  _displayManagerInitFeito = true;

  gerarOuRecuperarDisplayId();
  registrarDisplayNoFirebase(window.db);
  setTimeout(() => atualizarPainelDisplay(), 1000);
  _inicializarListenersUI();

  // O rename de display foi migrado para o painel Admin.
  // Nenhum painel de configuração é exibido no index.
}

// ════════════════════════════════════════════════════════════════
// 🆕 ESCUTA MUDANÇAS DO PRÓPRIO DISPLAY (sincronia com admin)
// Quando o admin renomeia remotamente, atualiza variável + cache
// local + UI sem precisar recarregar a página.
// ════════════════════════════════════════════════════════════════
let _unsubscribeNomeDisplay = null;

function escutarMudancasDoDisplay() {
  if (!db || !displayId) return;

  if (typeof _unsubscribeNomeDisplay === "function") {
    try { _unsubscribeNomeDisplay(); } catch (e) { /* ignora */ }
    _unsubscribeNomeDisplay = null;
  }

  const ref = window.firebase_ref(db, `libnotify/displays/${displayId}`);

  _unsubscribeNomeDisplay = window.firebase_onValue(
    ref,
    (snapshot) => {
      const dados = snapshot.val();
      if (!dados) return;

      // Sincronizar nome se o admin mudou remotamente
      if (nomeDisplayValido(dados.nome) && dados.nome !== nomeDisplay) {
        console.log(`🔄 Nome do display atualizado remotamente: "${dados.nome}"`);
        nomeDisplay = dados.nome;
        displayJaConfigurado = true;
        try {
          localStorage.setItem("displayNome", dados.nome);
        } catch (e) { /* ignora */ }
        atualizarPainelDisplay();
      }
    },
    (err) => console.warn("⚠️ Erro ao escutar mudanças do display:", err)
  );

  console.log(`🎧 Escutando mudanças em: libnotify/displays/${displayId}`);
}

// Exportar funções globais
window.gerarOuRecuperarDisplayId = gerarOuRecuperarDisplayId;
window.definirNomeDisplay = definirNomeDisplay;
window.obterNomeDisplay = obterNomeDisplay;
window.renomearDisplay = renomearDisplay;
window.atualizarPainelDisplay = atualizarPainelDisplay;
window.deletarDisplayDoFirebase = deletarDisplayDoFirebase;
window.registrarDisplayNoFirebase = registrarDisplayNoFirebase;
window.escutarComandosDisplay = escutarComandosDisplay;
window.escutarMudancasDoDisplay = escutarMudancasDoDisplay;
window.desconectarDisplay = desconectarDisplay;

console.log("✅ Módulo de gerenciamento de displays carregado");

// 🎧 AGUARDAR FIREBASE ESTAR PRONTO
window.addEventListener("firebaseReady", () => {
  console.log("🎯 Evento firebaseReady recebido — iniciando display manager");
  setTimeout(_inicializarDisplayManager, 500);
});

// Fallback: se Firebase já estava pronto antes deste script carregar
if (window.firebase_ref && window.db) {
  console.log("✅ Firebase já estava pronto — iniciando display manager direto");
  setTimeout(_inicializarDisplayManager, 500);
}
