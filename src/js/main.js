/**
 * main.js - Entry point para Webpack
 * Importa todos os módulos da aplicação na ordem correta
 */

// Importar Firebase SDK (já instalado via npm)
import { initializeApp } from 'firebase/app';

// Importar módulos da aplicação na ordem correta
import './api-client.js';           // Client HTTP
import './display-manager.js';       // Manager de displays
import './renderizar-slides.js';     // Renderização de slides
import './index.js';                 // Lógica principal do index
import './admin.js';                 // Lógica do painel admin
import './video-display.js';         // Exibição de vídeos
import './webrtc-display.js';        // WebRTC para displays
import './webrtc-admin.js';          // WebRTC para admin
import './admin-displays.js';        // Admin de displays
import './admin-video.js';           // Admin de vídeos

console.log('✅ LibNotify Frontend carregado');
