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

const checkPermiso = (modulo, accion) => {
  return (req, res, next) => {
    const rol = req.user?.rol_nombre || 'Empleado';
    const permisos = PERMISOS[rol] || PERMISOS.Empleado;
    if (permisos[modulo]?.includes(accion)) return next();
    return res.status(403).json({ success: false, message: 'Sin permiso' });
  };
};

const soloAdmin = (req, res, next) => {
  if (req.user?.rol_nombre === 'Administrador') return next();
  return res.status(403).json({ success: false, message: 'Solo administradores' });
};

module.exports = { PERMISOS, checkPermiso, soloAdmin };
