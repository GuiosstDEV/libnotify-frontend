/**
 * api-client.js
 * Cliente HTTP para comunicação com o backend Node.js
 * Gerencia autenticação JWT e requisições à API
 */

const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Recupera o JWT armazenado no localStorage
 */
function getToken() {
  return localStorage.getItem('jwt_token');
}

/**
 * Armazena JWT e dados do usuário no localStorage
 */
function saveToken(token, perfil) {
  localStorage.setItem('jwt_token', token);
  localStorage.setItem('user_perfil', perfil);
  localStorage.setItem('login_time', new Date().toISOString());
}

/**
 * Remove JWT e dados do localStorage
 */
function clearToken() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user_perfil');
  localStorage.removeItem('login_time');
}

/**
 * Faz login com o backend
 * @param {string} perfil - 'admin' ou 'controlador'
 * @param {string} senha - Senha do usuário
 * @returns {Object} {token, perfil, expiresIn} ou erro
 */
async function login(perfil, senha) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ perfil, senha }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao fazer login');
    }

    // Armazenar token no localStorage
    saveToken(data.token, data.perfil);

    return {
      status: 'ok',
      token: data.token,
      perfil: data.perfil,
      expiresIn: data.expiresIn,
    };
  } catch (error) {
    console.error('❌ Erro ao fazer login:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

/**
 * Faz logout
 */
function logout() {
  clearToken();
  return {
    status: 'ok',
    message: 'Logout realizado com sucesso',
  };
}

/**
 * Recupera informações do usuário atual
 * @returns {Object} Dados do usuário ou erro
 */
async function getCurrentUser() {
  const token = getToken();

  if (!token) {
    return {
      status: 'error',
      message: 'Nenhum token encontrado. Faça login primeiro.',
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao recuperar usuário');
    }

    return {
      status: 'ok',
      user: data,
    };
  } catch (error) {
    console.error('❌ Erro ao recuperar usuário:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

/**
 * Verifica se usuário está autenticado
 * @returns {boolean}
 */
function isAuthenticated() {
  return !!getToken();
}

/**
 * Recupera perfil do usuário armazenado
 * @returns {string|null} 'admin', 'controlador' ou null
 */
function getUserPerfil() {
  return localStorage.getItem('user_perfil');
}

/**
 * Faz requisição HTTP genérica com JWT
 * Usado internamente para chamar outros endpoints
 * @param {string} endpoint - URL relativa (ex: '/slides')
 * @param {string} method - GET, POST, PUT, DELETE
 * @param {Object} body - Corpo da requisição (opcional)
 * @returns {Object} Resposta da API
 */
async function apiCall(endpoint, method = 'GET', body = null) {
  const token = getToken();

  if (!token) {
    return {
      status: 'error',
      message: 'Não autenticado. Faça login.',
    };
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Erro na requisição: ${response.status}`);
    }

    return {
      status: 'ok',
      data,
    };
  } catch (error) {
    console.error(`❌ Erro em ${method} ${endpoint}:`, error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

// ═══════════════════════════════════════
// Exportar funções para uso global
// ═══════════════════════════════════════
window.apiClient = {
  login,
  logout,
  getCurrentUser,
  isAuthenticated,
  getUserPerfil,
  apiCall,
  getToken,
  saveToken,
  clearToken,
};

console.log('✅ API Client carregado');
