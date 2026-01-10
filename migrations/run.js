require('dotenv').config();
const mysql = require('mysql2/promise');

const migrations = `
-- =====================================================
-- CATÁLOGOS (Sin ENUM, todo por catálogo)
-- =====================================================

CREATE TABLE IF NOT EXISTS cat_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_usuario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_cliente (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_servicio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_instalacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_cargo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_estados_pago (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_tipos_cargo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_tipos_pago (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_ciudades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cat_colonias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ciudad_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ciudad_id) REFERENCES cat_ciudades(id)
);

CREATE TABLE IF NOT EXISTS cat_tarifas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  velocidad_mbps INT,
  descripcion VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  updated_by INT
);

-- =====================================================
-- USUARIOS DEL SISTEMA
-- =====================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  email VARCHAR(100),
  telefono VARCHAR(20),
  rol_id INT NOT NULL,
  estado_id INT NOT NULL,
  ultimo_acceso TIMESTAMP NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  updated_by INT,
  FOREIGN KEY (rol_id) REFERENCES cat_roles(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_usuario(id)
);

-- =====================================================
-- CLIENTES (Persona)
-- =====================================================

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_cliente VARCHAR(20) UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  telefono_principal VARCHAR(20) NOT NULL,
  telefono_secundario VARCHAR(20),
  email VARCHAR(100),
  calle VARCHAR(150),
  numero_exterior VARCHAR(20),
  numero_interior VARCHAR(20),
  colonia_id INT,
  codigo_postal VARCHAR(10),
  referencias TEXT,
  ine_frente_url VARCHAR(500),
  ine_reverso_url VARCHAR(500),
  estado_id INT NOT NULL,
  notas TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (colonia_id) REFERENCES cat_colonias(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_cliente(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- SERVICIOS (Lo que se cobra - Tarifa asignada)
-- =====================================================

CREATE TABLE IF NOT EXISTS servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  tarifa_id INT NOT NULL,
  precio_mensual DECIMAL(10,2) NOT NULL,
  dia_corte INT DEFAULT 10,
  fecha_inicio DATE NOT NULL,
  fecha_cancelacion DATE,
  motivo_cancelacion TEXT,
  estado_id INT NOT NULL,
  ip_asignada VARCHAR(45),
  notas TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (tarifa_id) REFERENCES cat_tarifas(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_servicio(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- INSTALACIONES (Evento)
-- =====================================================

CREATE TABLE IF NOT EXISTS instalaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  servicio_id INT NOT NULL,
  fecha_programada DATE NOT NULL,
  fecha_realizada DATE,
  hora_inicio TIME,
  hora_fin TIME,
  tecnico_id INT,
  costo_instalacion DECIMAL(10,2) DEFAULT 0,
  estado_id INT NOT NULL,
  observaciones TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  FOREIGN KEY (tecnico_id) REFERENCES usuarios(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_instalacion(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- EQUIPOS (Asignados al servicio, no al cliente)
-- =====================================================

CREATE TABLE IF NOT EXISTS equipos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  servicio_id INT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  mac_address VARCHAR(50),
  ip VARCHAR(45),
  ssid VARCHAR(100),
  password_wifi VARCHAR(100),
  numero_serie VARCHAR(100),
  notas TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- CARGOS (Lo que el cliente DEBE)
-- =====================================================

CREATE TABLE IF NOT EXISTS cargos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  servicio_id INT NOT NULL,
  tipo_cargo_id INT NOT NULL,
  concepto VARCHAR(255) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  monto_pagado DECIMAL(10,2) DEFAULT 0,
  saldo DECIMAL(10,2) NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  periodo_mes INT,
  periodo_anio INT,
  estado_id INT NOT NULL,
  notas TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (servicio_id) REFERENCES servicios(id),
  FOREIGN KEY (tipo_cargo_id) REFERENCES cat_tipos_cargo(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_cargo(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- PAGOS (Lo que el cliente PAGA)
-- =====================================================

CREATE TABLE IF NOT EXISTS pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  numero_recibo VARCHAR(50) UNIQUE,
  monto_total DECIMAL(10,2) NOT NULL,
  tipo_pago_id INT NOT NULL,
  fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  referencia VARCHAR(100),
  estado_id INT NOT NULL,
  notas TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  updated_by INT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (tipo_pago_id) REFERENCES cat_tipos_pago(id),
  FOREIGN KEY (estado_id) REFERENCES cat_estados_pago(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

-- =====================================================
-- PAGO DETALLE (Cómo un pago cubre cargos)
-- =====================================================

CREATE TABLE IF NOT EXISTS pago_detalles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pago_id INT NOT NULL,
  cargo_id INT NOT NULL,
  monto_aplicado DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pago_id) REFERENCES pagos(id),
  FOREIGN KEY (cargo_id) REFERENCES cargos(id)
);

-- =====================================================
-- SALDO A FAVOR
-- =====================================================

CREATE TABLE IF NOT EXISTS saldos_favor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  monto_original DECIMAL(10,2) NOT NULL,
  monto_disponible DECIMAL(10,2) NOT NULL,
  pago_origen_id INT,
  fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (pago_origen_id) REFERENCES pagos(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id)
);

-- =====================================================
-- HISTORIAL DE CAMBIOS (Auditoría)
-- =====================================================

CREATE TABLE IF NOT EXISTS historial_cambios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tabla_afectada VARCHAR(100) NOT NULL,
  registro_id INT NOT NULL,
  campo_modificado VARCHAR(100) NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  tipo_operacion VARCHAR(20) NOT NULL,
  usuario_id INT NOT NULL,
  ip_usuario VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- =====================================================
-- ÍNDICES PARA RENDIMIENTO
-- =====================================================

CREATE INDEX idx_clientes_numero ON clientes(numero_cliente);
CREATE INDEX idx_clientes_estado ON clientes(estado_id);
CREATE INDEX idx_clientes_colonia ON clientes(colonia_id);
CREATE INDEX idx_servicios_cliente ON servicios(cliente_id);
CREATE INDEX idx_servicios_estado ON servicios(estado_id);
CREATE INDEX idx_cargos_servicio ON cargos(servicio_id);
CREATE INDEX idx_cargos_estado ON cargos(estado_id);
CREATE INDEX idx_cargos_vencimiento ON cargos(fecha_vencimiento);
CREATE INDEX idx_pagos_cliente ON pagos(cliente_id);
CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX idx_historial_tabla ON historial_cambios(tabla_afectada, registro_id);

-- =====================================================
-- DATOS INICIALES DE CATÁLOGOS
-- =====================================================

INSERT INTO cat_roles (nombre, descripcion) VALUES 
('Administrador', 'Acceso total al sistema'),
('Empleado', 'Acceso limitado - registro y consulta básica'),
('Tecnico', 'Acceso a instalaciones y equipos');

INSERT INTO cat_estados_usuario (nombre, descripcion) VALUES 
('Activo', 'Usuario activo'),
('Inactivo', 'Usuario inactivo'),
('Bloqueado', 'Usuario bloqueado por seguridad');

INSERT INTO cat_estados_cliente (nombre, descripcion) VALUES 
('Activo', 'Cliente activo'),
('Inactivo', 'Cliente inactivo'),
('Suspendido', 'Cliente suspendido por adeudo'),
('Cancelado', 'Cliente dado de baja');

INSERT INTO cat_estados_servicio (nombre, descripcion) VALUES 
('Activo', 'Servicio activo'),
('Suspendido', 'Servicio suspendido'),
('Cancelado', 'Servicio cancelado'),
('Pendiente', 'Pendiente de instalación');

INSERT INTO cat_estados_instalacion (nombre, descripcion) VALUES 
('Programada', 'Instalación programada'),
('En Proceso', 'Instalación en proceso'),
('Completada', 'Instalación completada'),
('Cancelada', 'Instalación cancelada'),
('Reprogramada', 'Instalación reprogramada');

INSERT INTO cat_estados_cargo (nombre, descripcion) VALUES 
('Pendiente', 'Cargo pendiente de pago'),
('Parcial', 'Cargo parcialmente pagado'),
('Pagado', 'Cargo completamente pagado'),
('Cancelado', 'Cargo cancelado'),
('Vencido', 'Cargo vencido');

INSERT INTO cat_estados_pago (nombre, descripcion) VALUES 
('Aplicado', 'Pago aplicado correctamente'),
('Cancelado', 'Pago cancelado'),
('Pendiente', 'Pago pendiente de aplicar');

INSERT INTO cat_tipos_cargo (nombre, descripcion) VALUES 
('Instalación', 'Cargo por instalación'),
('Mensualidad', 'Cargo mensual del servicio'),
('Prorrateo', 'Cargo por días proporcionales'),
('Reconexión', 'Cargo por reconexión'),
('Equipo', 'Cargo por equipo'),
('Otro', 'Otro tipo de cargo');

INSERT INTO cat_tipos_pago (nombre, descripcion) VALUES 
('Efectivo', 'Pago en efectivo'),
('Transferencia', 'Transferencia bancaria'),
('Tarjeta', 'Pago con tarjeta'),
('Deposito', 'Depósito bancario'),
('Otro', 'Otro método de pago');
`;

async function runMigrations() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USUARIO,
      password: process.env.DB_CONTRASENA,
      database: process.env.DB_NOMBRE,
      multipleStatements: true
    });

    console.log('Conectado a la base de datos');
    console.log('Ejecutando migraciones...');
    
    await connection.query(migrations);
    
    console.log('Migraciones completadas exitosamente');
    
    // Crear usuario admin por defecto
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    await connection.query(`
      INSERT IGNORE INTO usuarios (username, password_hash, nombre_completo, rol_id, estado_id, created_by)
      VALUES ('admin', ?, 'Administrador del Sistema', 1, 1, 1)
    `, [passwordHash]);
    
    console.log('Usuario admin creado (usuario: admin, password: admin123)');
    
  } catch (error) {
    console.error('Error en migraciones:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

runMigrations();
