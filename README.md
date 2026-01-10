# Skynet ISP - Backend API

Sistema de gestión para proveedores de internet (ISP).

## 🚀 Despliegue

**URL Producción:** https://skynet-backend-a47423108e2a.herokuapp.com/

## 📋 Variables de Entorno (Heroku Config Vars)

```
DB_HOST=151.106.110.5
DB_NAME=u951308636_skynet
DB_PASSWORD=Le0n2018#
DB_PORT=3306
DB_USER=u951308636_skynet
JWT_SECRETO=skynet_secreto_2024_seguro
```

## 🔗 Endpoints

### Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Usuario actual |
| PUT | `/api/auth/cambiar-password` | Cambiar contraseña |

### Usuarios
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/usuarios` | Listar usuarios |
| GET | `/api/usuarios/:id` | Obtener usuario |
| POST | `/api/usuarios` | Crear usuario |
| PUT | `/api/usuarios/:id` | Actualizar usuario |
| DELETE | `/api/usuarios/:id` | Eliminar usuario |
| POST | `/api/usuarios/:id/zonas` | Asignar zonas |
| PUT | `/api/usuarios/:id/reset-password` | Reset password |

### Clientes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/clientes` | Listar clientes |
| GET | `/api/clientes/buscar?q=` | Buscar clientes |
| GET | `/api/clientes/:id` | Obtener cliente |
| POST | `/api/clientes` | Crear cliente |
| PUT | `/api/clientes/:id` | Actualizar cliente |
| DELETE | `/api/clientes/:id` | Eliminar cliente |
| POST | `/api/clientes/:id/ine` | Subir INE |
| GET | `/api/clientes/:id/ine` | Obtener INEs |
| GET | `/api/clientes/:id/notas` | Obtener notas |
| POST | `/api/clientes/:id/notas` | Agregar nota |
| GET | `/api/clientes/:id/historial` | Historial cambios |
| POST | `/api/clientes/:id/cancelar` | Cancelar cliente |
| POST | `/api/clientes/:id/reactivar` | Reactivar cliente |

### Servicios
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/servicios` | Listar servicios |
| GET | `/api/servicios/:id` | Obtener servicio |
| POST | `/api/servicios` | Crear servicio |
| PUT | `/api/servicios/:id` | Actualizar servicio |
| DELETE | `/api/servicios/:id` | Eliminar servicio |
| GET | `/api/servicios/:id/equipos` | Obtener equipos |
| POST | `/api/servicios/:id/equipos` | Agregar equipo |
| PUT | `/api/servicios/:id/equipos/:equipoId` | Actualizar equipo |
| DELETE | `/api/servicios/:id/equipos/:equipoId` | Retirar equipo |
| POST | `/api/servicios/:id/cambiar-tarifa` | Cambiar tarifa |
| POST | `/api/servicios/:id/suspender` | Suspender |
| POST | `/api/servicios/:id/reactivar` | Reactivar |
| POST | `/api/servicios/:id/cancelar` | Cancelar |

### Cargos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/cargos` | Listar cargos |
| GET | `/api/cargos/pendientes` | Cargos pendientes |
| GET | `/api/cargos/servicio/:servicioId` | Cargos por servicio |
| GET | `/api/cargos/:id` | Obtener cargo |
| POST | `/api/cargos` | Crear cargo |
| POST | `/api/cargos/generar-mensualidades` | Generar mensualidades |
| PUT | `/api/cargos/:id` | Actualizar cargo |
| DELETE | `/api/cargos/:id` | Eliminar cargo |
| POST | `/api/cargos/:id/cancelar` | Cancelar cargo |

### Pagos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/pagos` | Listar pagos |
| GET | `/api/pagos/servicio/:servicioId` | Pagos por servicio |
| GET | `/api/pagos/:id` | Obtener pago |
| POST | `/api/pagos` | Registrar pago |
| POST | `/api/pagos/:id/cancelar` | Cancelar pago |
| GET | `/api/pagos/:id/recibo` | Datos para recibo |

### Dashboard
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/dashboard/resumen` | Resumen general |
| GET | `/api/dashboard/grafico-ingresos` | Gráfico ingresos |
| GET | `/api/dashboard/grafico-servicios` | Gráfico servicios |
| GET | `/api/dashboard/proximos-vencer` | Próximos a vencer |
| GET | `/api/dashboard/actividad-reciente` | Actividad reciente |

### Reportes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/reportes/adeudos` | Reporte adeudos |
| GET | `/api/reportes/clientes-por-ciudad` | Clientes por ciudad |
| GET | `/api/reportes/clientes-por-zona` | Clientes por zona |
| GET | `/api/reportes/clientes-por-calle` | Clientes por calle |
| GET | `/api/reportes/ingresos` | Reporte ingresos |
| GET | `/api/reportes/cobranza` | Reporte cobranza |
| GET | `/api/reportes/altas-bajas` | Altas y bajas |
| GET | `/api/reportes/servicios-por-tarifa` | Por tarifa |
| GET | `/api/reportes/equipos` | Reporte equipos |

### Catálogos
| Método | Endpoint |
|--------|----------|
| GET | `/api/catalogos/roles` |
| GET | `/api/catalogos/estados` |
| GET | `/api/catalogos/ciudades` |
| GET | `/api/catalogos/ciudades/estado/:estadoId` |
| GET | `/api/catalogos/colonias` |
| GET | `/api/catalogos/colonias/ciudad/:ciudadId` |
| GET | `/api/catalogos/zonas` |
| GET | `/api/catalogos/bancos` |
| GET | `/api/catalogos/metodos-pago` |
| GET | `/api/catalogos/conceptos-cobro` |
| GET | `/api/catalogos/cargos-tipo` |
| GET | `/api/catalogos/tarifas` |
| GET | `/api/catalogos/estatus-cliente` |
| GET | `/api/catalogos/estatus-servicio` |
| GET | `/api/catalogos/tipo-equipo` |
| GET | `/api/catalogos/marcas-equipo` |
| GET | `/api/catalogos/modelos-equipo` |
| GET | `/api/catalogos/motivos-cancelacion` |
| GET | `/api/catalogos/permisos` |
| POST | `/api/catalogos/:catalogo` |
| PUT | `/api/catalogos/:catalogo/:id` |
| DELETE | `/api/catalogos/:catalogo/:id` |

### Historial
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/historial` | Todo el historial |
| GET | `/api/historial/tabla/:tabla` | Por tabla |
| GET | `/api/historial/registro/:tabla/:id` | Por registro |
| GET | `/api/historial/usuario/:usuarioId` | Por usuario |

## 🔐 Autenticación

Todas las rutas (excepto login) requieren header:
```
Authorization: Bearer <token>
```

## 📦 Estructura de Respuestas

**Éxito:**
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... }
}
```

**Paginado:**
```json
{
  "success": true,
  "message": "Datos obtenidos",
  "data": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description"
}
```

## 🛠️ Tech Stack

- Node.js 18.x
- Express.js
- MySQL (Hostinger)
- JWT Authentication
- bcryptjs
- multer (uploads)

## 📁 Estructura

```
skynet-backend/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── usuarios.controller.js
│   │   ├── clientes.controller.js
│   │   ├── servicios.controller.js
│   │   ├── cargos.controller.js
│   │   ├── pagos.controller.js
│   │   ├── catalogos.controller.js
│   │   ├── reportes.controller.js
│   │   ├── dashboard.controller.js
│   │   └── historial.controller.js
│   ├── middlewares/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── usuarios.routes.js
│   │   ├── clientes.routes.js
│   │   ├── servicios.routes.js
│   │   ├── cargos.routes.js
│   │   ├── pagos.routes.js
│   │   ├── catalogos.routes.js
│   │   ├── reportes.routes.js
│   │   ├── dashboard.routes.js
│   │   └── historial.routes.js
│   ├── utils/
│   │   └── helpers.js
│   └── index.js
├── uploads/
├── package.json
├── Procfile
└── README.md
```
