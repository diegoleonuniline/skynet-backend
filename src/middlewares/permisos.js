const PERMISOS = {
  Administrador: {
    clientes: ['leer', 'crear', 'editar', 'eliminar'],
    servicios: ['leer', 'crear', 'editar', 'eliminar'],
    pagos: ['leer', 'crear', 'editar', 'eliminar', 'historial'],
    cargos: ['leer', 'crear', 'editar', 'eliminar'],
    equipos: ['leer', 'crear', 'editar', 'eliminar'],
    instalaciones: ['leer', 'crear', 'editar', 'eliminar'],
    usuarios: ['leer', 'crear', 'editar', 'eliminar'],
    reportes: ['leer'],
    catalogos: ['leer', 'crear', 'editar', 'eliminar']
  },
  Empleado: {
    clientes: ['leer', 'crear'],
    servicios: ['leer'],
    pagos: ['leer', 'crear'],
    cargos: ['leer'],
    equipos: ['leer'],
    instalaciones: ['leer'],
    usuarios: [],
    reportes: [],
    catalogos: ['leer']
  }
};

const getPermisosUsuario = (rol) => {
  return PERMISOS[rol] || PERMISOS.Empleado;
};

const checkPermiso = (modulo, accion) => {
  return (req, res, next) => {
    const rol = req.user?.rol_nombre || 'Empleado';
    const permisos = PERMISOS[rol] || PERMISOS.Empleado;
    
    if (permisos[modulo]?.includes(accion)) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'No tienes permiso para realizar esta acción'
    });
  };
};

const soloAdmin = (req, res, next) => {
  const rol = req.user?.rol_nombre;
  
  if (rol === 'Administrador') {
    return next();
  }
  
  return res.status(403).json({
    success: false,
    message: 'Solo administradores pueden realizar esta acción'
  });
};

module.exports = {
  PERMISOS,
  getPermisosUsuario,
  checkPermiso,
  soloAdmin
};
