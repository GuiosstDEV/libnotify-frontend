// ============================================================
// 🖥️ WEBRTC ADMIN (lado do painel)
// Inclua este script no admin.html (depois de admin.js):
//   <script src="webrtc-admin.js"></script>
//
// Uso a partir do admin.js:
//   <button onclick="abrirMonitorDisplay('<id>', '<nome>')">📺 Tela</button>
//
// Estrutura no Realtime DB usada (criada por este módulo):
//   libnotify/webrtc/{displayId}/
//       request   { from, ts }                 ← admin escreve
//       offer     { type, sdp }                ← display responde
//       answer    { type, sdp }                ← admin escreve
//       iceAdmin/{id}    candidatos do admin
//       iceDisplay/{id}  candidatos do display
//       status    string
// ============================================================
(function () {
  "use strict";

  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  let _sessao = null;

  function ref(path)   { return window.firebase_ref(window.db, path); }
  function log(...a)   { console.log("[webrtc-admin]", ...a); }

  // ─────────────────── Estilos do modal ───────────────────
  function garantirEstilos() {
    if (document.getElementById("monitor-display-styles")) return;
    const css = `
      .monitor-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.88);
        backdrop-filter: blur(8px);
        z-index: 99999; display: flex; align-items: center; justify-content: center;
        animation: monFade .18s ease-out;
      }
      @keyframes monFade { from { opacity:0; transform:scale(.97) } to { opacity:1; transform:scale(1) } }

      .monitor-conteudo {
        background: #111; color: #fff; border-radius: 14px;
        /* ✅ Responsivo: ocupa até 96vw / 96vh */
        width: min(980px, 96vw);
        max-height: 96vh;
        overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: 0 24px 72px rgba(0,0,0,.7);
      }

      .monitor-header {
        display: flex; align-items: center; gap: 10px;
        padding: 13px 18px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
        flex-shrink: 0;
      }
      .monitor-header h3 { margin: 0; font-size: 15px; flex: 1; font-weight: 600; }

      .monitor-pill {
        font-size: 11px; padding: 3px 9px; border-radius: 999px;
        background: #2a2a2a; color: #aaa; font-weight: 700; white-space: nowrap;
      }
      .monitor-pill.ok   { background: #064e3b; color: #6ee7b7; }
      .monitor-pill.warn { background: #78350f; color: #fcd34d; }
      .monitor-pill.err  { background: #7f1d1d; color: #fca5a5; }

      .monitor-fechar {
        background: transparent; color: #aaa; border: none; font-size: 22px;
        cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;
      }
      .monitor-fechar:hover { color: #fff; }

      /* ✅ Área de vídeo responsiva — mantém 16:9 mas nunca ultrapassa viewport */
      .monitor-video-wrap {
        background: #000;
        position: relative;
        width: 100%;
        /* aspect-ratio garante 16:9 até max-height dinâmico */
        aspect-ratio: 16 / 9;
        max-height: calc(96vh - 130px); /* reserva espaço para header + info + rodapé */
        overflow: hidden;
        flex-shrink: 0;
      }
      .monitor-video-wrap video {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: contain; /* ✅ mantém proporção do slide sem cortar */
        background: #000;
        display: block;
      }
      .monitor-video-wrap .placeholder {
        position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center;
        color: #888; font-size: 13px; gap: 8px;
        background: #000;
      }

      .monitor-info {
        padding: 10px 18px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 6px 14px;
        background: #161616; font-size: 12px; color: #ccc;
        flex-shrink: 0;
      }
      .monitor-info b { color: #fff; font-weight: 600; }

      .monitor-rodape {
        display: flex; gap: 8px; padding: 11px 18px;
        background: #1a1a1a; border-top: 1px solid #2a2a2a;
        justify-content: flex-end; flex-shrink: 0;
      }
      .monitor-btn {
        background: #2a2a2a; color: #fff; border: 1px solid #333; border-radius: 7px;
        padding: 8px 15px; font-size: 12px; cursor: pointer; font-weight: 600;
      }
      .monitor-btn:hover          { background: #333; }
      .monitor-btn.danger         { background: #7f1d1d; border-color: #991b1b; }
      .monitor-btn.danger:hover   { background: #991b1b; }
      .monitor-btn.primary        { background: #2563eb; border-color: #2563eb; }
      .monitor-btn.primary:hover  { background: #1d4ed8; }

      /* Indicador de FPS no canto do vídeo */
      .monitor-fps-badge {
        position: absolute; bottom: 8px; left: 10px; z-index: 5;
        background: rgba(0,0,0,0.6); color: #6ee7b7;
        font-size: 10px; font-weight: 700; padding: 2px 7px;
        border-radius: 99px; border: 1px solid rgba(110,231,183,.3);
        font-family: monospace; pointer-events: none;
        opacity: 0; transition: opacity .3s;
      }
      .monitor-video-wrap:hover .monitor-fps-badge { opacity: 1; }

      @media (max-width: 600px) {
        .monitor-conteudo { border-radius: 8px; }
        .monitor-info { grid-template-columns: 1fr 1fr; font-size: 11px; }
        .monitor-header h3 { font-size: 13px; }
      }
    `;
    const tag = document.createElement("style");
    tag.id = "monitor-display-styles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ─────────────────── Modal ───────────────────
  function criarModal(displayId, nome) {
    garantirEstilos();
    const modal = document.createElement("div");
    modal.className = "monitor-backdrop";
    modal.innerHTML = `
      <div class="monitor-conteudo" role="dialog" aria-modal="true" aria-label="Monitor ${escapeHtml(nome)}">
        <div class="monitor-header">
          <h3>📺 ${escapeHtml(nome || "Display")}</h3>
          <span class="monitor-pill" data-status>aguardando…</span>
          <button class="monitor-fechar" data-fechar title="Fechar (Esc)">×</button>
        </div>

        <div class="monitor-video-wrap">
          <video autoplay playsinline muted></video>
          <div class="placeholder" data-placeholder>⏳ solicitando preview do display…</div>
          <div class="monitor-fps-badge" data-fps>50fps</div>
        </div>

        <div class="monitor-info">
          <div><b>ID:</b> <span style="word-break:break-all;font-size:10px">${escapeHtml(displayId)}</span></div>
          <div><b>Resolução:</b> <span data-res>—</span></div>
          <div><b>Conexão:</b> <span data-ice>—</span></div>
          <div><b>Heartbeat:</b> <span data-hb>—</span></div>
        </div>

        <div class="monitor-rodape">
          <button class="monitor-btn" data-reconectar>🔄 Reconectar</button>
          <button class="monitor-btn danger" data-encerrar>⏹ Encerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("[data-fechar]").onclick   = fechar;
    modal.querySelector("[data-encerrar]").onclick = fechar;
    modal.querySelector("[data-reconectar]").onclick = reconectar;
    // Clique fora fecha
    modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    document.addEventListener("keydown", escListener);

    return modal;
  }

  function escListener(e) { if (e.key === "Escape") fechar(); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function setStatus(texto, classe) {
    if (!_sessao) return;
    const el = _sessao.modal.querySelector("[data-status]");
    el.textContent = texto;
    el.className = "monitor-pill " + (classe || "");
  }

  // ─────────────────── Contador de FPS real ───────────────────
  let _fpsFrames = 0, _fpsLast = Date.now(), _fpsRaf = null;

  function iniciarContadorFPS(videoEl, modal) {
    _fpsFrames = 0; _fpsLast = Date.now();

    function contar() {
      if (!_sessao) return;
      _fpsFrames++;
      const agora = Date.now();
      if (agora - _fpsLast >= 1000) {
        const badge = modal.querySelector("[data-fps]");
        if (badge) badge.textContent = `${_fpsFrames}fps`;
        _fpsFrames = 0; _fpsLast = agora;
      }
      _fpsRaf = requestAnimationFrame(contar);
    }
    _fpsRaf = requestAnimationFrame(contar);
  }

  // ─────────────────── Fluxo principal ───────────────────
  async function abrirMonitorDisplay(displayId, nome) {
    if (!window.db) { alert("Firebase não está configurado."); return; }
    if (_sessao) fechar(); // só uma sessão ativa

    const modal   = criarModal(displayId, nome);
    const videoEl = modal.querySelector("video");
    const basePath = `libnotify/webrtc/${displayId}`;

    _sessao = {
      displayId, basePath, modal, videoEl, pc: null,
      unsubOffer: null, unsubIceDisplay: null, unsubHb: null, hbInterval: null
    };

    // ── Heartbeat ──
    try {
      const hbRef = ref(`libnotify/displays/${displayId}/ultimaAtualizacao`);
      _sessao.unsubHb = window.firebase_onValue(hbRef, (snap) => {
        const v   = snap.val();
        const el  = modal.querySelector("[data-hb]");
        if (!v || !el) return;
        const seg = Math.floor((Date.now() - v) / 1000);
        el.textContent = seg < 60 ? `${seg}s atrás` : `${Math.floor(seg / 60)}min atrás`;
      });
    } catch (_) {}

    // Limpa resíduos de sessão anterior
    try { await window.firebase_set(ref(basePath), null); } catch (_) {}

    setStatus("solicitando…", "warn");

    // 1. Publica request
    await window.firebase_set(ref(`${basePath}/request`), {
      from: "admin", ts: Date.now()
    });

    // 2. Aguarda offer do display
    _sessao.unsubOffer = window.firebase_onValue(ref(`${basePath}/offer`), async (snap) => {
      const offer = snap.val();
      if (!offer || !_sessao || _sessao.pc) return;

      log("offer recebida — criando answer");
      setStatus("conectando…", "warn");

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      _sessao.pc = pc;

      // ✅ Garante que o vídeo inicia assim que a track chega
      pc.ontrack = (ev) => {
        log("track recebida");
        const stream = ev.streams[0];
        videoEl.srcObject = stream;

        // Força play (pode ser necessário em alguns browsers)
        const tryPlay = () => {
          videoEl.play().catch((err) => {
            log("play() bloqueado, tentando novamente:", err.message);
            setTimeout(tryPlay, 500);
          });
        };
        tryPlay();

        // Oculta placeholder
        const ph = modal.querySelector("[data-placeholder]");
        if (ph) ph.style.display = "none";

        // Inicia contador de FPS real
        iniciarContadorFPS(videoEl, modal);

        // Lê resolução real do vídeo
        videoEl.addEventListener("loadedmetadata", () => {
          const resEl = modal.querySelector("[data-res]");
          if (resEl && videoEl.videoWidth) {
            resEl.textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}`;
          }
        }, { once: true });
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const c  = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
        const id = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        window.firebase_set(ref(`${basePath}/iceAdmin/${id}`), c);
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        const iceEl = modal.querySelector("[data-ice]");
        if (iceEl) iceEl.textContent = st;
        if (st === "connected" || st === "completed") setStatus("ao vivo ✅", "ok");
        else if (st === "failed")       setStatus("falhou ❌", "err");
        else if (st === "disconnected") setStatus("desconectado ⚠", "warn");
      };

      // Candidatos do display → admin
      _sessao.unsubIceDisplay = window.firebase_onValue(ref(`${basePath}/iceDisplay`), (snap) => {
        const v = snap.val() || {};
        Object.values(v).forEach(async (c) => {
          try { await pc.addIceCandidate(c); } catch (_) {}
        });
      });

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await window.firebase_set(ref(`${basePath}/answer`), { type: answer.type, sdp: answer.sdp });
        log("answer publicada");
      } catch (e) {
        console.error("[webrtc-admin] erro ao criar answer:", e);
        setStatus("erro interno ❌", "err");
      }
    });
  }

  function reconectar() {
    if (!_sessao) return;
    const { displayId, modal } = _sessao;
    const nome = modal.querySelector("h3")?.textContent?.replace("📺 ", "") || "";
    fechar();
    setTimeout(() => abrirMonitorDisplay(displayId, nome), 600);
  }

  function fechar() {
    if (!_sessao) return;
    const { modal, pc, basePath, videoEl, unsubOffer, unsubIceDisplay, unsubHb } = _sessao;

    // Para contador FPS
    if (_fpsRaf) { cancelAnimationFrame(_fpsRaf); _fpsRaf = null; }

    try { unsubOffer      && unsubOffer(); }      catch (_) {}
    try { unsubIceDisplay && unsubIceDisplay(); } catch (_) {}
    try { unsubHb         && unsubHb(); }         catch (_) {}

    try { if (videoEl) { videoEl.srcObject = null; } } catch (_) {}
    try { if (pc) pc.close(); }                         catch (_) {}

    // Sinaliza ao display que encerre a transmissão
    try { window.firebase_set(ref(basePath), null); } catch (_) {}

    document.removeEventListener("keydown", escListener);
    if (modal?.parentNode) modal.parentNode.removeChild(modal);
    _sessao = null;
    log("sessão encerrada");
  }

  // Exporta globalmente
  window.abrirMonitorDisplay  = abrirMonitorDisplay;
  window.fecharMonitorDisplay = fechar;
})();
