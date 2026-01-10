// Permisos por rol - Control desde backend
const PERMISOS = {
  Administrador: {
    clientes: ['crear', 'leer', 'editar', 'eliminar', 'historial'],
    servicios: ['crear', 'leer', 'editar', 'eliminar', 'historial'],
    instalaciones: ['crear', 'leer', 'editar', 'eliminar'],
    equipos: ['crear', 'leer', 'editar', 'eliminar'],
    cargos: ['crear', 'leer', 'editar', 'eliminar'],
    pagos: ['crear', 'leer', 'editar', 'eliminar', 'historial'],
    reportes: ['leer', 'exportar'],
    usuarios: ['crear', 'leer', 'editar', 'eliminar'],
    catalogos: ['crear', 'leer', 'editar', 'eliminar'],
    auditoria: ['leer']
  },
  Empleado: {
    clientes: ['crear', 'leer'],
    servicios: ['leer'],
    instalaciones: ['leer'],
    equipos: ['leer'],
    cargos: ['leer'],
    pagos: ['crear'],
    reportes: [],
    usuarios: [],
    catalogos: ['leer'],
    auditoria: []
  },
  Tecnico: {
    clientes: ['leer'],
    servicios: ['leer'],
    instalaciones: ['leer', 'editar'],
    equipos: ['crear', 'leer', 'editar'],
    cargos: [],
    pagos: [],
    reportes: [],
    usuarios: [],
    catalogos: ['leer'],
    auditoria: []
  }
};

const checkPermiso = (modulo, accion) => {
  return (req, res, next) => {
    const rol = req.user.rol_nombre;
    
    if (!PERMISOS[rol]) {
      return res.status(403).json({
        success: false,
        message: 'Rol no reconocido'
      });
    }
    
    const permisosModulo = PERMISOS[rol][modulo];
    
    if (!permisosModulo || !permisosModulo.includes(accion)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para realizar esta acción'
      });
    }
    
    next();
  };
};

const soloAdmin = (req, res, next) => {
  if (req.user.rol_nombre !== 'Administrador') {
    return res.status(403).json({
      success: false,
      message: 'Acceso restringido a administradores'
    });
  }
  next();
};

const getPermisosUsuario = (rol) => {
  return PERMISOS[rol] || {};
};

module.exports = {
  checkPermiso,
  soloAdmin,
  getPermisosUsuario,
  PERMISOS
};
