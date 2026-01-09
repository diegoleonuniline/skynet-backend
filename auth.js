// ========================================
// SKYNET - AUTENTICACIÓN
// ========================================

const API = "https://skynet-backend-a47423108e2a.herokuapp.com";

// Verificar si hay sesión activa
function verificarSesion() {
  const token = localStorage.getItem("token");
  const usuario = localStorage.getItem("usuario");
  
  if (!token || !usuario) {
    window.location.href = "/skynet-frontend/";
    return null;
  }
  
  return JSON.parse(usuario);
}

// Cerrar sesión
function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "/skynet-frontend/";
}

// Obtener token para peticiones
function obtenerToken() {
  return localStorage.getItem("token");
}

// Headers para peticiones autenticadas
function headersAuth() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + obtenerToken()
  };
}

// Petición GET autenticada
async function fetchGet(endpoint) {
  const r = await fetch(API + endpoint, {
    method: "GET",
    headers: headersAuth()
  });
  return r.json();
}

// Petición POST autenticada
async function fetchPost(endpoint, data) {
  const r = await fetch(API + endpoint, {
    method: "POST",
    headers: headersAuth(),
    body: JSON.stringify(data)
  });
  return r.json();
}

// Petición PUT autenticada
async function fetchPut(endpoint, data) {
  const r = await fetch(API + endpoint, {
    method: "PUT",
    headers: headersAuth(),
    body: JSON.stringify(data)
  });
  return r.json();
}

// Petición DELETE autenticada
async function fetchDelete(endpoint) {
  const r = await fetch(API + endpoint, {
    method: "DELETE",
    headers: headersAuth()
  });
  return r.json();
}

// Cargar datos del usuario en el header
function cargarUsuarioHeader() {
  const usuario = verificarSesion();
  if (!usuario) return;
  
  const nombreEl = document.getElementById("usuarioNombre");
  const rolEl = document.getElementById("usuarioRol");
  
  if (nombreEl) nombreEl.textContent = usuario.usuario;
  if (rolEl) rolEl.textContent = usuario.rol?.nombre || usuario.rol?.clave || "Usuario";
}

// Formatear moneda
function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(valor || 0);
}

// Formatear fecha
function formatoFecha(fecha) {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Iniciales de nombre
function obtenerIniciales(nombre, apellido) {
  const n = nombre ? nombre.charAt(0).toUpperCase() : '';
  const a = apellido ? apellido.charAt(0).toUpperCase() : '';
  return n + a || '??';
}

// Toggle sidebar en móvil
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('open');
}
