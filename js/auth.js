// ========================================
// SKYNET - AUTENTICACIÓN Y UTILIDADES
// ========================================

const API = "https://skynet-backend-a47423108e2a.herokuapp.com";

// ========================================
// SESIÓN
// ========================================

function verificarSesion() {
  const token = localStorage.getItem("token");
  const usuario = localStorage.getItem("usuario");
  
  if (!token || !usuario) {
    window.location.href = "/skynet-frontend/";
    return null;
  }
  
  return JSON.parse(usuario);
}

function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
  window.location.href = "/skynet-frontend/";
}

function obtenerToken() {
  return localStorage.getItem("token");
}

function headersAuth() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + obtenerToken()
  };
}

// ========================================
// PETICIONES HTTP
// ========================================

async function fetchGet(endpoint) {
  const r = await fetch(API + endpoint, {
    method: "GET",
    headers: headersAuth()
  });
  return r.json();
}

async function fetchPost(endpoint, data) {
  const r = await fetch(API + endpoint, {
    method: "POST",
    headers: headersAuth(),
    body: JSON.stringify(data)
  });
  return r.json();
}

async function fetchPut(endpoint, data) {
  const r = await fetch(API + endpoint, {
    method: "PUT",
    headers: headersAuth(),
    body: JSON.stringify(data)
  });
  return r.json();
}

async function fetchDelete(endpoint) {
  const r = await fetch(API + endpoint, {
    method: "DELETE",
    headers: headersAuth()
  });
  return r.json();
}

// ========================================
// USUARIO HEADER
// ========================================

function cargarUsuarioHeader() {
  const usuario = verificarSesion();
  if (!usuario) return;
  
  const nombreEl = document.getElementById("usuarioNombre");
  const rolEl = document.getElementById("usuarioRol");
  const avatarEl = document.querySelector(".header__user-avatar");
  
  if (nombreEl) nombreEl.textContent = usuario.usuario;
  if (rolEl) rolEl.textContent = usuario.rol?.nombre || usuario.rol?.clave || "Usuario";
  if (avatarEl) avatarEl.textContent = usuario.usuario?.charAt(0).toUpperCase() || "U";
}

// ========================================
// FORMATO
// ========================================

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(valor || 0);
}

function formatoFecha(fecha) {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function obtenerIniciales(nombre, apellido) {
  const n = nombre ? nombre.charAt(0).toUpperCase() : '';
  const a = apellido ? apellido.charAt(0).toUpperCase() : '';
  return n + a || '??';
}

// ========================================
// SIDEBAR MÓVIL
// ========================================

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('open');
}

// ========================================
// SISTEMA DE TOASTS
// ========================================

function crearContenedorToasts() {
  let contenedor = document.getElementById('toast-container');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'toast-container';
    contenedor.className = 'toast-container';
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

function toast(mensaje, tipo = 'info', duracion = 4000) {
  const contenedor = crearContenedorToasts();
  
  const iconos = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };
  
  const titulos = {
    success: 'Éxito',
    error: 'Error',
    warning: 'Advertencia',
    info: 'Información'
  };
  
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast--${tipo}`;
  toastEl.innerHTML = `
    <div class="toast__icon">
      <span class="material-symbols-outlined">${iconos[tipo]}</span>
    </div>
    <div class="toast__content">
      <p class="toast__title">${titulos[tipo]}</p>
      <p class="toast__message">${mensaje}</p>
    </div>
    <button class="toast__close" onclick="cerrarToast(this)">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;
  
  contenedor.appendChild(toastEl);
  
  // Auto cerrar
  if (duracion > 0) {
    setTimeout(() => {
      cerrarToastElemento(toastEl);
    }, duracion);
  }
  
  return toastEl;
}

function cerrarToast(btn) {
  const toastEl = btn.closest('.toast');
  cerrarToastElemento(toastEl);
}

function cerrarToastElemento(toastEl) {
  if (!toastEl) return;
  toastEl.classList.add('hiding');
  setTimeout(() => {
    toastEl.remove();
  }, 300);
}

// Funciones de acceso rápido
function toastExito(mensaje) {
  return toast(mensaje, 'success');
}

function toastError(mensaje) {
  return toast(mensaje, 'error', 6000);
}

function toastAdvertencia(mensaje) {
  return toast(mensaje, 'warning', 5000);
}

function toastInfo(mensaje) {
  return toast(mensaje, 'info');
}

// ========================================
// MODAL DE CONFIRMACIÓN
// ========================================

function confirmar(opciones) {
  return new Promise((resolve) => {
    const {
      titulo = '¿Estás seguro?',
      mensaje = '',
      tipo = 'warning', // warning, danger, success
      textoConfirmar = 'Confirmar',
      textoCancelar = 'Cancelar',
      colorConfirmar = 'primary' // primary, danger, success
    } = opciones;
    
    const iconos = {
      warning: 'warning',
      danger: 'delete_forever',
      success: 'check_circle'
    };
    
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'confirm-modal-overlay';
    
    overlay.innerHTML = `
      <div class="modal modal--sm">
        <div class="modal__body confirm-modal">
          <div class="confirm-modal__icon confirm-modal__icon--${tipo}">
            <span class="material-symbols-outlined">${iconos[tipo]}</span>
          </div>
          <h3 class="confirm-modal__title">${titulo}</h3>
          <p class="confirm-modal__message">${mensaje}</p>
          <div class="confirm-modal__actions">
            <button class="btn btn-secondary" id="confirm-cancel">${textoCancelar}</button>
            <button class="btn btn-${colorConfirmar}" id="confirm-ok">${textoConfirmar}</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Mostrar con animación
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });
    
    // Eventos
    const btnCancelar = overlay.querySelector('#confirm-cancel');
    const btnConfirmar = overlay.querySelector('#confirm-ok');
    
    function cerrar(resultado) {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
      }, 200);
      resolve(resultado);
    }
    
    btnCancelar.addEventListener('click', () => cerrar(false));
    btnConfirmar.addEventListener('click', () => cerrar(true));
    
    // Cerrar con ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        cerrar(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// ========================================
// LOADING EN BOTONES
// ========================================

function btnLoading(btn, loading = true) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Procesando...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
}
