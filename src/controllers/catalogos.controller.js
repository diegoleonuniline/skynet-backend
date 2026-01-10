const db = require('../config/database');
const { logActividad, getClientIp, response } = require('../utils/helpers');

const catalogoMap = {
    'roles': 'cat_roles',
    'estados': 'cat_estados',
    'ciudades': 'cat_ciudades',
    'colonias': 'cat_colonias',
    'zonas': 'cat_zonas',
    'bancos': 'cat_bancos',
    'metodos-pago': 'cat_metodos_pago',
    'conceptos-cobro': 'cat_conceptos_cobro',
    'cargos-tipo': 'cat_cargos_tipo',
    'tarifas': 'cat_tarifas',
    'estatus-cliente': 'cat_estatus_cliente',
    'estatus-servicio': 'cat_estatus_servicio',
    'tipo-equipo': 'cat_tipo_equipo',
    'marcas-equipo': 'cat_marcas_equipo',
    'modelos-equipo': 'cat_modelos_equipo',
    'motivos-cancelacion': 'cat_motivos_cancelacion',
    'permisos': 'cat_permisos'
};

const getSimpleCatalog = async (tabla) => {
    const [rows] = await db.query(
        `SELECT * FROM ${tabla} WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nombre`
    );
    return rows;
};

const getRoles = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_roles');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getEstados = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_estados');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getCiudades = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT c.*, e.nombre as estado FROM cat_ciudades c
             LEFT JOIN cat_estados e ON c.estado_id = e.id
             WHERE c.is_active = 1 AND c.deleted_at IS NULL ORDER BY c.nombre`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getCiudadesByEstado = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_ciudades WHERE estado_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY nombre`,
            [req.params.estadoId]
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getColonias = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT col.*, c.nombre as ciudad FROM cat_colonias col
             LEFT JOIN cat_ciudades c ON col.ciudad_id = c.id
             WHERE col.is_active = 1 AND col.deleted_at IS NULL ORDER BY col.nombre`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getColoniasByCiudad = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_colonias WHERE ciudad_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY nombre`,
            [req.params.ciudadId]
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getZonas = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_zonas');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getBancos = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_bancos');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getMetodosPago = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_metodos_pago');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getConceptosCobro = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_conceptos_cobro WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nombre`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getCargosTipo = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_cargos_tipo WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nombre`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getTarifas = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_tarifas WHERE is_active = 1 AND deleted_at IS NULL ORDER BY monto`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getEstatusCliente = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_estatus_cliente WHERE is_active = 1 AND deleted_at IS NULL`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getEstatusServicio = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_estatus_servicio WHERE is_active = 1 AND deleted_at IS NULL`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getTipoEquipo = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_tipo_equipo');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getMarcasEquipo = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_marcas_equipo');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getModelosEquipo = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT m.*, ma.nombre as marca, t.nombre as tipo
             FROM cat_modelos_equipo m
             LEFT JOIN cat_marcas_equipo ma ON m.marca_id = ma.id
             LEFT JOIN cat_tipo_equipo t ON m.tipo_equipo_id = t.id
             WHERE m.is_active = 1 AND m.deleted_at IS NULL ORDER BY m.nombre`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getModelosByMarca = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_modelos_equipo WHERE marca_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY nombre`,
            [req.params.marcaId]
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

const getMotivosCancelacion = async (req, res, next) => {
    try {
        const data = await getSimpleCatalog('cat_motivos_cancelacion');
        response.success(res, data);
    } catch (error) { next(error); }
};

const getPermisos = async (req, res, next) => {
    try {
        const [data] = await db.query(
            `SELECT * FROM cat_permisos WHERE is_active = 1 AND deleted_at IS NULL ORDER BY modulo, accion`
        );
        response.success(res, data);
    } catch (error) { next(error); }
};

// CRUD Genérico
const create = async (req, res, next) => {
    try {
        const { catalogo } = req.params;
        const tabla = catalogoMap[catalogo];

        if (!tabla) {
            return response.error(res, 'Catálogo no válido', 400);
        }

        const campos = Object.keys(req.body);
        const valores = Object.values(req.body);

        campos.push('created_by');
        valores.push(req.userId);

        const [result] = await db.query(
            `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`,
            valores
        );

        await logActividad(req.userId, 'CREAR', 'CATALOGOS', `${catalogo}: ${result.insertId}`, getClientIp(req));

        response.success(res, { id: result.insertId }, 'Registro creado', 201);
    } catch (error) {
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const { catalogo, id } = req.params;
        const tabla = catalogoMap[catalogo];

        if (!tabla) {
            return response.error(res, 'Catálogo no válido', 400);
        }

        const campos = Object.keys(req.body);
        const valores = Object.values(req.body);

        campos.push('updated_by');
        valores.push(req.userId);
        valores.push(id);

        await db.query(
            `UPDATE ${tabla} SET ${campos.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
            valores
        );

        await logActividad(req.userId, 'ACTUALIZAR', 'CATALOGOS', `${catalogo}: ${id}`, getClientIp(req));

        response.success(res, null, 'Registro actualizado');
    } catch (error) {
        next(error);
    }
};

const deleteCatalogo = async (req, res, next) => {
    try {
        const { catalogo, id } = req.params;
        const tabla = catalogoMap[catalogo];

        if (!tabla) {
            return response.error(res, 'Catálogo no válido', 400);
        }

        await db.query(
            `UPDATE ${tabla} SET is_active = 0, deleted_at = NOW(), deleted_by = ? WHERE id = ?`,
            [req.userId, id]
        );

        await logActividad(req.userId, 'ELIMINAR', 'CATALOGOS', `${catalogo}: ${id}`, getClientIp(req));

        response.success(res, null, 'Registro eliminado');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRoles, getEstados, getCiudades, getCiudadesByEstado,
    getColonias, getColoniasByCiudad, getZonas, getBancos,
    getMetodosPago, getConceptosCobro, getCargosTipo, getTarifas,
    getEstatusCliente, getEstatusServicio, getTipoEquipo,
    getMarcasEquipo, getModelosEquipo, getModelosByMarca,
    getMotivosCancelacion, getPermisos,
    create, update, delete: deleteCatalogo
};
