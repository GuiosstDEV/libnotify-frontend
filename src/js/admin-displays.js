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

  // ✅ FPS aumentado para 50 — prévia mais fluida no admin
  const FPS = 50;

  // ── Gradientes por classe de slide (espelha slides-padrao.css) ──
  // getComputedStyle NÃO devolve gradientes — usamos este mapa diretamente.
  const SLIDE_GRADIENTS = {
    "slide-1": { stops: ["#1a1f3a", "#141829", "#0a0e27"], angle: 135 },
    "slide-2": { stops: ["#1a2a3a", "#15253a", "#0a1520"], angle: 135 },
    "slide-3": { stops: ["#1a3a2a", "#152a25", "#0a1510"], angle: 135 },
    "slide-4": { stops: ["#2a1f1a", "#2a1f15", "#1a0f0a"], angle: 135 },
    "slide-5": { stops: ["#3a2a1a", "#3a2515", "#2a1808"], angle: 135 },
    "slide-6": { stops: ["#2a1a3a", "#251a35", "#180a25"], angle: 135 },
  };

  // ── Cores de texto por slide (espelha slides-padrao.css) ──
  const SLIDE_CORES = {
    "slide-1": { icone: "#ff4444", titulo: "#ffdd00", destaque: "#ff4444", texto: "#ffffff" },
    "slide-2": { icone: "#4da6ff", titulo: "#4da6ff", destaque: "#ffdd00", texto: "#e0e0e0" },
    "slide-3": { icone: "#44ff88", titulo: "#44ff88", destaque: "#ffdd00", texto: "#e0e0e0" },
    "slide-4": { icone: "#ffaa44", titulo: "#ffaa44", destaque: "#ff6644", texto: "#e0e0e0" },
    "slide-5": { icone: "#ff8866", titulo: "#ff8866", destaque: "#ffdd00", texto: "#e0e0e0" },
    "slide-6": { icone: "#c084fc", titulo: "#c084fc", destaque: "#ffdd00", texto: "#e0e0e0" },
  };

  let pc = null;
  let localStream = null;
  let offscreenCanvas = null;
  let offscreenLoopId = null;
  let unsubReq = null;
  let unsubAnswer = null;
  let unsubIceAdmin = null;
  let basePath = null;

  function log(...args)  { console.log("[webrtc-display]", ...args); }
  function warn(...args) { console.warn("[webrtc-display]", ...args); }

  function getDisplayId() {
    try { return localStorage.getItem("displayId") || null; } catch (_) { return null; }
  }

  function ref(path) { return window.firebase_ref(window.db, path); }

  // ── Marca <video>/<img> com crossOrigin para evitar canvas tainted ──
  function marcarCrossOriginAnonymous() {
    document.querySelectorAll("video, img").forEach((m) => {
      if (!m.crossOrigin) {
        try { m.crossOrigin = "anonymous"; } catch (_) {}
      }
    });
  }

  function tentarCapturarElemento(el) {
    try {
      if (el.tagName === "CANVAS") return el.captureStream(FPS);
      if (el.tagName === "VIDEO")  return el.captureStream(FPS);
    } catch (e) {
      warn("captureStream falhou em <" + el.tagName + ">:", e.name || e);
    }
    return null;
  }

  // Detecta classe "slide-N" do elemento
  function detectarClasseSlide(slideEl) {
    for (const cls of slideEl.classList) {
      if (/^slide-\d+$/.test(cls)) return cls;
    }
    return null;
  }

  // Desenha gradiente linear (substitui getComputedStyle que não devolve gradientes)
  function preencherFundoGradiente(ctx, w, h, config) {
    if (!config) {
      ctx.fillStyle = "#0a0e27";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const rad = (config.angle * Math.PI) / 180;
    const cx = w / 2, cy = h / 2;
    const len = Math.sqrt(w * w + h * h) / 2;
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len, cy + Math.sin(rad) * len
    );
    config.stops.forEach((cor, i) => grad.addColorStop(i / (config.stops.length - 1), cor));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Quebra texto em múltiplas linhas respeitando maxWidth
  function quebrarTexto(ctx, texto, maxWidth) {
    const palavras = texto.split(" ");
    const linhas = [];
    let linha = "";
    for (const p of palavras) {
      const teste = linha ? linha + " " + p : p;
      if (ctx.measureText(teste).width > maxWidth && linha) {
        linhas.push(linha);
        linha = p;
      } else {
        linha = teste;
      }
    }
    if (linha) linhas.push(linha);
    return linhas.length ? linhas : [texto];
  }

  function criarStreamDeCaptura() {
    marcarCrossOriginAnonymous();

    // 1) Canvas explicitamente apontado
    const sel = window.LIBNOTIFY_CAPTURE_SELECTOR;
    if (sel) {
      const el = document.querySelector(sel);
      if (el && el.tagName === "CANVAS") {
        const s = tentarCapturarElemento(el);
        if (s) { log("capturando canvas selecionado"); return s; }
      }
    }

    // 2) <video> do slide ativo (mesma origem ou CORS ok)
    const slideAtivo0 = document.querySelector(".slide.active");
    const videoAtivo  = slideAtivo0 ? slideAtivo0.querySelector("video") : null;
    if (videoAtivo && videoAtivo.videoWidth > 0) {
      const s = tentarCapturarElemento(videoAtivo);
      if (s) { log("capturando <video> do slide ativo"); return s; }
    }

    // 3) Offscreen canvas — renderiza slide pixel-a-pixel
    log(`usando offscreen canvas @${FPS}fps`);
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width  = window.innerWidth  || 1280;
    offscreenCanvas.height = window.innerHeight || 720;
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: false });
    let modoTextoSomente = false;

    // Escalas baseadas em 1920×1080 (resolução de referência)
    const BASE_W = 1920, BASE_H = 1080;
    function escala() {
      return Math.min(offscreenCanvas.width / BASE_W, offscreenCanvas.height / BASE_H);
    }
    function fs(tamanhoBase) { return Math.max(12, Math.round(tamanhoBase * escala())); }

    // ── Tela de aviso (fallback cross-origin) ──
    function desenharInfo() {
      const w = offscreenCanvas.width, h = offscreenCanvas.height;
      ctx.fillStyle = "#0b0b0b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `bold ${fs(28)}px sans-serif`;
      ctx.fillText("LibNotify — Display ao vivo", 30, 50);
      ctx.font = `${fs(16)}px sans-serif`;
      ctx.fillStyle = "#9ca3af";
      ctx.fillText("ID: " + (getDisplayId() || "—"), 30, 90);
      ctx.fillText(new Date().toLocaleString(), 30, 115);
      ctx.fillStyle = "#f59e0b";
      ctx.font = `${fs(14)}px sans-serif`;
      ctx.fillText("⚠ mídia cross-origin — preview visual indisponível", 30, 160);
    }

    // ── Renderiza slide ativo idêntico ao index.html ──
    function desenharSlideAtivo() {
      const w = offscreenCanvas.width, h = offscreenCanvas.height;

      const slideAtivo = document.querySelector(".slide.active");
      if (!slideAtivo) { desenharInfo(); return; }

      ctx.clearRect(0, 0, w, h);

      // ── A. Slide de vídeo ──
      const video = slideAtivo.querySelector("video");
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        const va = video.videoWidth / video.videoHeight, ca = w / h;
        let dw = w, dh = h, dx = 0, dy = 0;
        if (va > ca) { dh = w / va; dy = (h - dh) / 2; }
        else         { dw = h * va; dx = (w - dw) / 2; }
        ctx.drawImage(video, dx, dy, dw, dh);
        return;
      }

      // ── B. Slide de imagem ──
      const imgEl = slideAtivo.querySelector("img:not(.seta-icon):not(.icon-btn)");
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        const ia = imgEl.naturalWidth / imgEl.naturalHeight, ca = w / h;
        let dw = w, dh = h, dx = 0, dy = 0;
        if (ia > ca) { dh = w / ia; dy = (h - dh) / 2; }
        else         { dw = h * ia; dx = (w - dw) / 2; }
        ctx.drawImage(imgEl, dx, dy, dw, dh);
        return;
      }

      // ── C. Slide de texto — renderização fiel ao CSS do index ──
      const classeSlide = detectarClasseSlide(slideAtivo);
      const gradCfg  = SLIDE_GRADIENTS[classeSlide] || null;
      const cores    = SLIDE_CORES[classeSlide]     || { icone: "#fff", titulo: "#fff", destaque: "#ffdd00", texto: "#e0e0e0" };

      // Fundo com gradiente real (não depende de getComputedStyle)
      preencherFundoGradiente(ctx, w, h, gradCfg);

      // Círculo decorativo superior-direito (::before do CSS)
      const gDec = ctx.createRadialGradient(w, 0, 0, w, 0, Math.min(w, h) * 0.55);
      gDec.addColorStop(0, "rgba(255,255,255,0.04)");
      gDec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gDec;
      ctx.fillRect(0, 0, w, h);

      // Layout — mesmos critérios do .conteudo-wrapper (flexbox coluna centrado)
      const padX   = w * 0.06;
      const maxTW  = w - padX * 2;
      const cx     = w / 2;
      let   yPos   = h * 0.07;

      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      ctx.shadowBlur   = 0;

      // Ícone grande
      const iconEl = slideAtivo.querySelector(".icon-grande");
      if (iconEl) {
        const iconTxt = iconEl.textContent.trim();
        const iconSz  = fs(120);
        ctx.font      = `bold ${iconSz}px Arial, sans-serif`;
        ctx.fillStyle = cores.icone;
        ctx.shadowColor = cores.icone;
        ctx.shadowBlur  = 35;
        ctx.fillText(iconTxt, cx, yPos);
        ctx.shadowBlur = 0;
        yPos += iconSz * 1.25 + h * 0.02;
      }

      // Título principal
      const tituloEl = slideAtivo.querySelector(".titulo-principal");
      if (tituloEl) {
        const tSz = fs(80);
        ctx.font      = `900 ${tSz}px Arial, sans-serif`;
        ctx.fillStyle = cores.titulo;
        ctx.shadowColor = cores.titulo;
        ctx.shadowBlur  = 20;
        const lhs = quebrarTexto(ctx, tituloEl.textContent.trim(), maxTW);
        for (const l of lhs) { ctx.fillText(l, cx, yPos); yPos += tSz * 1.2; }
        ctx.shadowBlur = 0;
        yPos += h * 0.025;
      }

      // Card-info
      const cardEl = slideAtivo.querySelector(".card-info");
      if (cardEl) {
        const subtitulos  = [...cardEl.querySelectorAll(".subtitulo")];
        const destaque    = cardEl.querySelector(".mensagem-destaque");
        const descritivos = [...cardEl.querySelectorAll(".descritivo")];

        const subSz  = fs(48);
        const desSz  = fs(72);
        const dscSz  = fs(40);
        const padC   = h * 0.038;
        const gapL   = h * 0.013;

        // Estima altura do card antes de desenhar
        let cardH = padC * 2;
        cardH += subtitulos.length  * (subSz * 1.3 + gapL);
        if (destaque)  cardH += desSz * 1.35 + gapL;
        cardH += descritivos.length * (dscSz * 1.45 + gapL);

        const cardW = Math.min(maxTW * 0.95, w * 0.85);
        const cardX = (w - cardW) / 2;

        // Fundo do card (espelha .card-info)
        ctx.save();
        ctx.beginPath();
        const r = fs(20);
        if (ctx.roundRect) { ctx.roundRect(cardX, yPos, cardW, cardH, r); }
        else { ctx.rect(cardX, yPos, cardW, cardH); }
        ctx.fillStyle   = "rgba(255,255,255,0.07)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();

        let cy     = yPos + padC;
        const iW   = cardW - padC * 2;

        // Subtítulos
        ctx.font      = `600 ${subSz}px Arial, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 0;
        for (const sub of subtitulos) {
          const ls = quebrarTexto(ctx, sub.textContent.trim(), iW);
          for (const l of ls) { ctx.fillText(l, cx, cy); cy += subSz * 1.3; }
          cy += gapL;
        }

        // Mensagem destaque
        if (destaque) {
          ctx.font        = `900 ${desSz}px Arial, sans-serif`;
          ctx.fillStyle   = cores.destaque;
          ctx.shadowColor = cores.destaque;
          ctx.shadowBlur  = 32;
          const ls = quebrarTexto(ctx, destaque.textContent.trim(), iW);
          for (const l of ls) { ctx.fillText(l, cx, cy); cy += desSz * 1.3; }
          ctx.shadowBlur = 0;
          cy += gapL;
        }

        // Descritivos
        ctx.font      = `500 ${dscSz}px Arial, sans-serif`;
        ctx.fillStyle = cores.texto;
        for (const desc of descritivos) {
          // Suporta quebras com <br> (innerText já converte em \n)
          const linhasDesc = desc.innerText.trim().split("\n").map(l => l.trim()).filter(Boolean);
          for (const lt of linhasDesc) {
            const ls = quebrarTexto(ctx, lt, iW);
            for (const l of ls) { ctx.fillText(l, cx, cy); cy += dscSz * 1.4; }
          }
          cy += gapL;
        }
      }
    }

    // ── Loop de desenho ──
    function desenhar() {
      if (modoTextoSomente) { desenharInfo(); return; }

      // Responsividade: ajusta canvas ao tamanho atual da janela
      const nw = window.innerWidth  || 1280;
      const nh = window.innerHeight || 720;
      if (offscreenCanvas.width !== nw || offscreenCanvas.height !== nh) {
        offscreenCanvas.width  = nw;
        offscreenCanvas.height = nh;
        log(`📐 Canvas redimensionado → ${nw}×${nh}`);
      }

      try {
        desenharSlideAtivo();
      } catch (e) {
        warn("erro ao desenhar:", e.message);
        if (e.name === "SecurityError") {
          warn("canvas tainted — alternando para modo texto");
          modoTextoSomente = true;
        }
        desenharInfo();
      }
    }

    desenhar();
    offscreenLoopId = setInterval(desenhar, 1000 / FPS);
    return offscreenCanvas.captureStream(FPS);
  }

  // ─────────────────── WebRTC ───────────────────

  async function iniciarStream() {
    const displayId = getDisplayId();
    if (!displayId || !window.db) { warn("displayId/db ausente"); return; }
    basePath = `libnotify/webrtc/${displayId}`;

    encerrar(false);

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
      if (!ev.candidate) return;
      const c  = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
      const id = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      window.firebase_set(ref(`${basePath}/iceDisplay/${id}`), c);
    };

    pc.onconnectionstatechange = () => {
      log("connectionState:", pc.connectionState);
      window.firebase_update(ref(basePath), { status: pc.connectionState });
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) encerrar(true);
    };

    unsubIceAdmin = window.firebase_onValue(ref(`${basePath}/iceAdmin`), (snap) => {
      const v = snap.val() || {};
      Object.values(v).forEach(async (c) => {
        try { await pc.addIceCandidate(c); } catch (_) {}
      });
    });

    unsubAnswer = window.firebase_onValue(ref(`${basePath}/answer`), async (snap) => {
      const ans = snap.val();
      if (ans && pc && !pc.currentRemoteDescription) {
        try { await pc.setRemoteDescription(new RTCSessionDescription(ans)); }
        catch (e) { warn("setRemoteDescription erro", e); }
      }
    });

    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    await window.firebase_set(ref(`${basePath}/offer`), { type: offer.type, sdp: offer.sdp });
    await window.firebase_update(ref(basePath), {
      status: "streaming",
      width:  offscreenCanvas?.width  || localStream.getVideoTracks()[0]?.getSettings?.().width  || null,
      height: offscreenCanvas?.height || localStream.getVideoTracks()[0]?.getSettings?.().height || null,
      ts: Date.now(),
    });
    log(`✅ offer publicada @${FPS}fps`);
  }

  function encerrar(limparFirebase) {
    try { unsubAnswer   && unsubAnswer(); }   catch (_) {}
    try { unsubIceAdmin && unsubIceAdmin(); } catch (_) {}
    unsubAnswer = unsubIceAdmin = null;

    if (offscreenLoopId) { clearInterval(offscreenLoopId); offscreenLoopId = null; }
    offscreenCanvas = null;

    if (localStream)  { localStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); localStream = null; }
    if (pc)           { try { pc.close(); } catch (_) {} pc = null; }
    if (limparFirebase && basePath && window.db) {
      try { window.firebase_set(ref(basePath), null); } catch (_) {}
    }
  }

  // ─────────────────── Listener de requests ───────────────────

  function escutarPedidos() {
    const displayId = getDisplayId();
    if (!displayId || !window.db) {
      // Ainda não pronto — retry mais cedo (500ms)
      setTimeout(escutarPedidos, 500);
      return;
    }
    const path = `libnotify/webrtc/${displayId}/request`;
    if (typeof unsubReq === "function") { try { unsubReq(); } catch (_) {} }

    unsubReq = window.firebase_onValue(ref(path), (snap) => {
      const v = snap.val();
      if (!v) { if (pc) encerrar(true); return; }
      log("📥 request recebido:", v);
      iniciarStream().catch((e) => warn("falha ao iniciar stream:", e));
    });

    if (window.firebase_onDisconnect) {
      try { window.firebase_onDisconnect(ref(`libnotify/webrtc/${displayId}`)).remove(); } catch (_) {}
    }
    log(`👂 aguardando requests (displayId: ${displayId})`);
  }

  // ─────────────────── Boot ───────────────────
  // Aguarda window.db — pode demorar alguns segundos após o Firebase inicializar
  function init() {
    if (!window.db) { setTimeout(init, 500); return; }
    escutarPedidos();
  }

  window.addEventListener("beforeunload", () => encerrar(true));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  } else {
    setTimeout(init, 0);
  }

  window.libnotifyWebRTC = { iniciarStream, encerrar, escutarPedidos };
})();
