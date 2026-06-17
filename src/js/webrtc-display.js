// ============================================================
// 📡 WEBRTC DISPLAY (lado do player / TV)
// Inclua este script DEPOIS de display-manager.js no index.html:
//   <script src="webrtc-display.js"></script>
//
// Requer no escopo global (já existem no projeto):
//   window.db, window.firebase_ref, window.firebase_onValue,
//   window.firebase_set, window.firebase_update, window.firebase_remove (opcional),
//   window.firebase_onDisconnect
//
// Estrutura usada no Realtime DB:
//   libnotify/webrtc/{displayId}/
//       request   { from:"admin", ts }
//       offer     { sdp, type }
//       answer    { sdp, type }
//       iceDisplay/{push} { candidate, sdpMid, sdpMLineIndex }
//       iceAdmin/{push}   { candidate, sdpMid, sdpMLineIndex }
//       status    "idle" | "requested" | "streaming" | "closed"
// ============================================================
(function () {
  "use strict";

  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Você pode forçar o que será capturado definindo no index.html:
  //   window.LIBNOTIFY_CAPTURE_SELECTOR = "#meuCanvas";
  // Senão, tentamos canvas → video → fallback offscreen com <img>/<video> visível.
  const FPS = 15;

  let pc = null;
  let localStream = null;
  let offscreenCanvas = null;
  let offscreenLoopId = null;
  let unsubReq = null;
  let unsubAnswer = null;
  let unsubIceAdmin = null;
  let basePath = null;

  function log(...args) { console.log("[webrtc-display]", ...args); }
  function warn(...args) { console.warn("[webrtc-display]", ...args); }

  function getDisplayId() {
    try { return localStorage.getItem("displayId") || null; } catch (_) { return null; }
  }

  function ref(path) { return window.firebase_ref(window.db, path); }

  // ---------- captura ----------
  function obterCanvasOuVideoExistente() {
    const sel = window.LIBNOTIFY_CAPTURE_SELECTOR;
    if (sel) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.querySelector("canvas") || document.querySelector("video");
  }

  // Marca preventivamente toda <img>/<video> da página como crossOrigin="anonymous"
  // para que captureStream/drawImage não "tainte" o canvas. Só funciona para
  // mídias que ainda não foram carregadas — mídias já em cache continuam tainted.
  function marcarCrossOriginAnonymous() {
    const midas = document.querySelectorAll("video, img");
    log(`🔍 Encontrado ${midas.length} elemento(s) <video>/<img>`);
    midas.forEach((m) => {
      const tag = m.tagName;
      const src = m.src || (m.tagName === "VIDEO" ? "[video - múltiplas sources]" : "[img - sem src?]");
      const jaTemCors = m.crossOrigin;
      if (!m.crossOrigin) {
        try { 
          m.crossOrigin = "anonymous"; 
          log(`  ✓ ${tag}: crossOrigin="anonymous" aplicado (${src})`);
        } catch (e) { 
          warn(`  ✗ ${tag}: falha ao aplicar CORS:`, e.name);
        }
      } else {
        log(`  ℹ ${tag}: já tem crossOrigin="${jaTemCors}" (${src})`);
      }
    });
  }

  function tentarCapturarElemento(el) {
    try {
      if (el.tagName === "CANVAS") return el.captureStream(FPS);
      if (el.tagName === "VIDEO") return el.captureStream();
    } catch (e) {
      warn("captureStream falhou em <" + el.tagName + ">:", e.name || e);
    }
    return null;
  }

  function criarStreamDeCaptura() {
    marcarCrossOriginAnonymous();

    // 1) tenta canvas (sempre seguro, sem CORS)
    const canvas = (window.LIBNOTIFY_CAPTURE_SELECTOR && document.querySelector(window.LIBNOTIFY_CAPTURE_SELECTOR))
      || document.querySelector("canvas");
    if (canvas && canvas.tagName === "CANVAS") {
      log("capturando <canvas> existente");
      const s = tentarCapturarElemento(canvas);
      if (s) return s;
    }

    // 2) tenta <video> do slide ativo (só funciona se mesma origem ou CORS ok)
    const slideAtivo = document.querySelector(".slide.active");
    const video = slideAtivo ? slideAtivo.querySelector("video") : null;
    if (video && video.videoWidth > 0) {
      const s = tentarCapturarElemento(video);
      if (s) { log("capturando <video> do slide ativo"); return s; }
    }

    // 3) Fallback offscreen — renderiza slide ativo no canvas
    //    Se slide tiver video/img, desenha isso; senão, renderiza conteúdo de texto
    log("usando fallback offscreen canvas");
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = window.innerWidth || 1280;
    offscreenCanvas.height = window.innerHeight || 720;
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
    let modoTextoSomente = false;

    function desenharInfo() {
      ctx.fillStyle = "#0b0b0b";
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("LibNotify — Display ao vivo", 30, 50);
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText("ID: " + (getDisplayId() || "—"), 30, 80);
      ctx.fillText(new Date().toLocaleString(), 30, 102);
      const tit = document.title || "";
      if (tit) ctx.fillText("Página: " + tit.slice(0, 60), 30, 124);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "14px sans-serif";
      ctx.fillText("⚠ mídia cross-origin — preview visual indisponível", 30, 160);
      ctx.fillText("Adicione crossorigin=\"anonymous\" nas tags <video>/<img> do player.", 30, 180);
    }

    function desenharSlideAtivo() {
      try {
        const slideAtivo = document.querySelector(".slide.active");
        if (!slideAtivo) {
          desenharInfo();
          return;
        }

        // Limpa o canvas
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // Obtém as dimensões do slide
        const rect = slideAtivo.getBoundingClientRect();
        
        // 1️⃣ Procura por <video> dentro do slide
        const video = slideAtivo.querySelector("video");
        if (video && video.videoWidth > 0 && video.videoHeight > 0) {
          // Calcula proporção de aspecto
          const videoAspect = video.videoWidth / video.videoHeight;
          const canvasAspect = offscreenCanvas.width / offscreenCanvas.height;
          let drawWidth = offscreenCanvas.width;
          let drawHeight = offscreenCanvas.height;
          let x = 0, y = 0;
          
          if (videoAspect > canvasAspect) {
            // Vídeo mais largo que canvas
            drawHeight = offscreenCanvas.width / videoAspect;
            y = (offscreenCanvas.height - drawHeight) / 2;
          } else {
            // Vídeo mais estreito que canvas
            drawWidth = offscreenCanvas.height * videoAspect;
            x = (offscreenCanvas.width - drawWidth) / 2;
          }
          
          ctx.drawImage(video, x, y, drawWidth, drawHeight);
          return;
        }

        // 2️⃣ Procura por <img> dentro do slide
        const img = slideAtivo.querySelector("img");
        if (img && img.complete && img.naturalWidth > 0) {
          // Calcula proporção de aspecto
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const canvasAspect = offscreenCanvas.width / offscreenCanvas.height;
          let drawWidth = offscreenCanvas.width;
          let drawHeight = offscreenCanvas.height;
          let x = 0, y = 0;
          
          if (imgAspect > canvasAspect) {
            // Imagem mais larga que canvas
            drawHeight = offscreenCanvas.width / imgAspect;
            y = (offscreenCanvas.height - drawHeight) / 2;
          } else {
            // Imagem mais estreita que canvas
            drawWidth = offscreenCanvas.height * imgAspect;
            x = (offscreenCanvas.width - drawWidth) / 2;
          }
          
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
          return;
        }

        // 3️⃣ Se é slide de texto, renderiza igual ao do index
        // Desenha fundo cor do slide
        const bgColor = window.getComputedStyle(slideAtivo).backgroundColor || "#000";
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // Obtém elementos
        const iconEl = slideAtivo.querySelector(".icon-grande");
        const tituloEl = slideAtivo.querySelector(".titulo-principal");
        const cardInfoEl = slideAtivo.querySelector(".card-info");
        
        let yPos = offscreenCanvas.height * 0.15;
        const centerX = offscreenCanvas.width / 2;

        // Renderiza ícone (emoji ou símbolo)
        if (iconEl) {
          const iconText = iconEl.textContent.trim() || "●";
          ctx.font = "bold 120px Arial, sans-serif";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(iconText, centerX, yPos);
          yPos += 150;
        }

        // Renderiza título principal (grande e centralizado)
        if (tituloEl) {
          const titulo = tituloEl.textContent.trim();
          ctx.font = "bold 80px Arial, sans-serif";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          
          // Quebra linha se muito longo
          const maxWidth = offscreenCanvas.width - 100;
          const words = titulo.split(" ");
          let line = "";
          
          words.forEach(word => {
            const testLine = line + (line ? " " : "") + word;
            if (ctx.measureText(testLine).width > maxWidth && line) {
              ctx.fillText(line, centerX, yPos);
              yPos += 90;
              line = word;
            } else {
              line = testLine;
            }
          });
          if (line) ctx.fillText(line, centerX, yPos);
          yPos += 120;
        }

        // Renderiza conteúdo do card-info
        if (cardInfoEl) {
          const subtitulos = cardInfoEl.querySelectorAll(".subtitulo");
          const destaque = cardInfoEl.querySelector(".mensagem-destaque");
          const descritivo = cardInfoEl.querySelector(".descritivo");

          ctx.font = "bold 48px Arial, sans-serif";
          ctx.fillStyle = "#e5e7eb";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          // Subtítulos
          subtitulos.forEach(sub => {
            ctx.fillText(sub.textContent.trim(), centerX, yPos);
            yPos += 60;
          });

          // Mensagem em destaque (amarela/dourada)
          if (destaque) {
            ctx.font = "bold 72px Arial, sans-serif";
            ctx.fillStyle = "#fbbf24";
            const destaqueText = destaque.textContent.trim();
            ctx.fillText(destaqueText, centerX, yPos);
            yPos += 90;
          }

          // Descritivo (menor)
          if (descritivo) {
            ctx.font = "bold 40px Arial, sans-serif";
            ctx.fillStyle = "#e5e7eb";
            ctx.fillText(descritivo.textContent.trim(), centerX, yPos);
          }
        }

      } catch (e) {
        warn("erro ao desenhar slide ativo:", e.message);
        desenharInfo();
      }
    }

    function desenhar() {
      if (modoTextoSomente) { desenharInfo(); return; }
      
      // ⚡ Redimensiona canvas se a janela mudou (responsividade)
      const newWidth = window.innerWidth || 1280;
      const newHeight = window.innerHeight || 720;
      if (offscreenCanvas.width !== newWidth || offscreenCanvas.height !== newHeight) {
        offscreenCanvas.width = newWidth;
        offscreenCanvas.height = newHeight;
        log(`📐 Canvas redimensionado para ${newWidth}x${newHeight}`);
      }
      
      try {
        desenharSlideAtivo();
      } catch (e) {
        warn("canvas tainted por mídia cross-origin — caindo para modo texto");
        modoTextoSomente = true;
        desenharInfo();
      }
    }
    desenhar();
    offscreenLoopId = setInterval(desenhar, 1000 / FPS);
    return offscreenCanvas.captureStream(FPS);
  }

  // ---------- WebRTC ----------
  async function iniciarStream() {
    const displayId = getDisplayId();
    if (!displayId || !window.db) { warn("displayId/db ausente"); return; }
    basePath = `libnotify/webrtc/${displayId}`;

    encerrar(false); // limpa qualquer sessão anterior

    try {
      localStream = criarStreamDeCaptura();
    } catch (e) {
      warn("erro criando stream", e);
      window.firebase_update(ref(basePath), { status: "error", erro: String(e) });
      return;
    }

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        const c = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
        const id = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        window.firebase_set(ref(`${basePath}/iceDisplay/${id}`), c);
      }
    };

    pc.onconnectionstatechange = () => {
      log("connectionState:", pc.connectionState);
      window.firebase_update(ref(basePath), { status: pc.connectionState });
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        encerrar(true);
      }
    };

    // Escuta candidatos do admin
    unsubIceAdmin = window.firebase_onValue(
      ref(`${basePath}/iceAdmin`),
      (snap) => {
        const v = snap.val() || {};
        Object.values(v).forEach(async (c) => {
          try { await pc.addIceCandidate(c); } catch (e) { /* ignora */ }
        });
      }
    );

    // Escuta answer do admin
    unsubAnswer = window.firebase_onValue(ref(`${basePath}/answer`), async (snap) => {
      const ans = snap.val();
      if (ans && pc && !pc.currentRemoteDescription) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(ans));
          log("remoteDescription (answer) aplicada");
        } catch (e) { warn("setRemoteDescription erro", e); }
      }
    });

    // Cria offer e publica
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    await window.firebase_set(ref(`${basePath}/offer`), { type: offer.type, sdp: offer.sdp });
    await window.firebase_update(ref(basePath), {
      status: "streaming",
      width: offscreenCanvas?.width || (localStream.getVideoTracks()[0]?.getSettings?.().width) || null,
      height: offscreenCanvas?.height || (localStream.getVideoTracks()[0]?.getSettings?.().height) || null,
      ts: Date.now(),
    });
    log("offer publicada");
  }

  function encerrar(limparFirebase) {
    try { unsubAnswer && unsubAnswer(); } catch (_) {}
    try { unsubIceAdmin && unsubIceAdmin(); } catch (_) {}
    unsubAnswer = unsubIceAdmin = null;

    if (offscreenLoopId) { clearInterval(offscreenLoopId); offscreenLoopId = null; }
    offscreenCanvas = null;

    if (localStream) {
      localStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
      localStream = null;
    }
    if (pc) {
      try { pc.close(); } catch (_) {}
      pc = null;
    }
    if (limparFirebase && basePath && window.db) {
      try { window.firebase_set(ref(basePath), null); } catch (_) {}
    }
  }

  // ---------- listener da request ----------
  function escutarPedidos() {
    const displayId = getDisplayId();
    if (!displayId || !window.db) {
      // tenta de novo em 2s (db pode não estar pronto)
      setTimeout(escutarPedidos, 2000);
      return;
    }
    const path = `libnotify/webrtc/${displayId}/request`;
    if (typeof unsubReq === "function") { try { unsubReq(); } catch (_) {} }

    unsubReq = window.firebase_onValue(ref(path), (snap) => {
      const v = snap.val();
      if (!v) {
        // admin removeu request → encerra streaming se ainda estiver ativo
        if (pc) encerrar(true);
        return;
      }
      log("📥 request recebido:", v);
      iniciarStream().catch((e) => warn("falha iniciar stream", e));
    });

    // Limpa ao desconectar
    if (window.firebase_onDisconnect) {
      try {
        window.firebase_onDisconnect(ref(`libnotify/webrtc/${displayId}`)).remove();
      } catch (_) {}
    }
    log("👂 escutando pedidos de monitoramento");
  }

  // Boot
  function init() {
    if (!window.db) { setTimeout(init, 1000); return; }
    escutarPedidos();
  }

  window.addEventListener("beforeunload", () => encerrar(true));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expor para debug
  window.libnotifyWebRTC = { iniciarStream, encerrar, escutarPedidos };
})();
