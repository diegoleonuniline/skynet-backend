// ========================================
// SKYNET - CLIENTES JS
// ========================================

let paginaActual = 1;
const porPagina = 10;
let filtroEstado = 'todos';
let ciudades = [];
let colonias = [];
let planes = [];

document.addEventListener('DOMContentLoaded', () => {
  cargarUsuarioHeader();
  cargarCatalogos();
  cargarClientes();
  inicializarEventos();
});

function inicializarEventos() {
  // Tabs
  document.querySelectorAll('.tabs__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs__btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroEstado = btn.dataset.filtro;
      paginaActual = 1;
      cargarClientes();
    });
  });

  // Buscador
  let timeout;
  document.getElementById('buscadorGlobal')?.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      paginaActual = 1;
      cargarClientes();
    }, 300);
  });

  // Ciudad -> Colonias
  document.getElementById('ciudadId')?.addEventListener('change', (e) => {
    cargarColoniasPorCiudad(e.target.value);
  });

  // Plan -> Cuota
  document.getElementById('planId')?.addEventListener('change', (e) => {
    const plan = planes.find(p => p.id === e.target.value);
    if (plan) {
      document.getElementById('cuotaMensual').value = plan.precio_mensual;
    }
  });
}

// ========================================
// CATÁLOGOS
// ========================================

async function cargarCatalogos() {
  try {
    const [rCiudades, rPlanes] = await Promise.all([
      fetchGet('/api/catalogos/ciudades'),
      fetchGet('/api/catalogos/planes')
    ]);

    if (rCiudades.ok) {
      ciudades = rCiudades.ciudades;
      llenarSelect('ciudadId', ciudades, 'id', 'nombre');
      llenarSelect('filtroCiudad', ciudades, 'id', 'nombre', true);
      llenarSelect('nuevaColoniaCiudad', ciudades, 'id', 'nombre');
    }

    if (rPlanes.ok) {
      planes = rPlanes.planes;
      llenarSelect('planId', planes, 'id', 'nombre');
      llenarSelect('filtroPlan', planes, 'id', 'nombre', true);
    }
  } catch (err) {
    console.error('Error cargando catálogos:', err);
  }
}

function llenarSelect(id, datos, valorKey, textoKey, conTodos = false) {
  const select = document.getElementById(id);
  if (!select) return;
  
  let html = conTodos ? '<option value="">Todos</option>' : '<option value="">Seleccionar...</option>';
  datos.forEach(item => {
    html += `<option value="${item[valorKey]}">${item[textoKey]}</option>`;
  });
  select.innerHTML = html;
}

async function cargarColoniasPorCiudad(ciudadId) {
  const select = document.getElementById('coloniaId');
  
  if (!ciudadId) {
    select.innerHTML = '<option value="">Seleccionar...</option>';
    return;
  }

  try {
    const r = await fetchGet(`/api/catalogos/colonias?ciudad_id=${ciudadId}`);
    if (r.ok) {
      colonias = r.colonias;
      llenarSelect('coloniaId', colonias, 'id', 'nombre');
    }
  } catch (err) {
    console.error('Error cargando colonias:', err);
  }
}

// ========================================
// CLIENTES
// ========================================

async function cargarClientes() {
  const tbody = document.getElementById('tablaClientes');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando...</td></tr>';

  try {
    const busqueda = document.getElementById('buscadorGlobal')?.value || '';
    let url = `/api/clientes?pagina=${paginaActual}&limite=${porPagina}`;
    
    if (filtroEstado !== 'todos') url += `&estado=${filtroEstado}`;
    if (busqueda) url += `&busqueda=${encodeURIComponent(busqueda)}`;

    const data = await fetchGet(url);

    if (!data.ok || !data.clientes?.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron clientes</td></tr>';
      actualizarPaginacion(0, 0, 0);
      return;
    }

    tbody.innerHTML = data.clientes.map(c => `
      <tr>
        <td>
          <div class="table__avatar">
            <div class="table__avatar-circle table__avatar-circle--blue">
              ${obtenerIniciales(c.nombre, c.apellido_paterno)}
            </div>
            <span class="table__avatar-name">${c.nombre} ${c.apellido_paterno || ''} ${c.apellido_materno || ''}</span>
          </div>
        </td>
        <td>${c.telefono || '-'}</td>
        <td>${c.ciudad_nombre || '-'}</td>
        <td>${c.colonia_nombre || '-'}</td>
        <td><span class="badge badge--${c.estado}">${c.estado}</span></td>
        <td class="font-semibold">${formatoMoneda(c.cuota_mensual)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary" onclick="editarCliente('${c.id}')" title="Editar">
              <span class="material-symbols-outlined">edit</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    document.getElementById('totalClientes').textContent = data.total || data.clientes.length;
    actualizarPaginacion(data.paginaActual || paginaActual, data.porPagina || porPagina, data.total || data.clientes.length);
    generarBotonesPaginacion(data.totalPaginas || 1, data.paginaActual || paginaActual);

  } catch (err) {
    console.error('Error cargando clientes:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Error al cargar</td></tr>';
  }
}

function filtrarClientes() {
  paginaActual = 1;
  cargarClientes();
}

function actualizarPaginacion(pagina, porPag, total) {
  const inicio = total === 0 ? 0 : ((pagina - 1) * porPag) + 1;
  const fin = Math.min(pagina * porPag, total);
  
  document.getElementById('paginaInicio').textContent = inicio;
  document.getElementById('paginaFin').textContent = fin;
  document.getElementById('paginaTotal').textContent = total;
}

function generarBotonesPaginacion(totalPaginas, paginaActualNum) {
  const contenedor = document.getElementById('paginacionBtns');
  if (!contenedor) return;

  let html = `
    <button class="pagination__btn" onclick="irPagina(${paginaActualNum - 1})" ${paginaActualNum <= 1 ? 'disabled' : ''}>
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
  `;

  for (let i = 1; i <= Math.min(totalPaginas, 5); i++) {
    html += `<button class="pagination__btn ${i === paginaActualNum ? 'active' : ''}" onclick="irPagina(${i})">${i}</button>`;
  }

  if (totalPaginas > 5) {
    html += `<button class="pagination__btn" disabled>...</button>`;
    html += `<button class="pagination__btn" onclick="irPagina(${totalPaginas})">${totalPaginas}</button>`;
  }

  html += `
    <button class="pagination__btn" onclick="irPagina(${paginaActualNum + 1})" ${paginaActualNum >= totalPaginas ? 'disabled' : ''}>
      <span class="material-symbols-outlined">chevron_right</span>
    </button>
  `;

  contenedor.innerHTML = html;
}

function irPagina(pagina) {
  if (pagina < 1) return;
  paginaActual = pagina;
  cargarClientes();
}

function toggleFiltros() {
  document.getElementById('filtrosPanel').classList.toggle('hidden');
}

// ========================================
// MODAL CLIENTE
// ========================================

function abrirModalNuevo() {
  document.getElementById('modalTitulo').textContent = 'Nuevo Cliente';
  document.getElementById('formCliente').reset();
  document.getElementById('clienteId').value = '';
  document.getElementById('fechaInstalacion').value = new Date().toISOString().split('T')[0];
  document.getElementById('coloniaId').innerHTML = '<option value="">Seleccionar ciudad primero...</option>';
  document.getElementById('modalCliente').classList.add('active');
}

async function editarCliente(id) {
  try {
    const data = await fetchGet(`/api/clientes/${id}`);
    if (!data.ok) {
      toastError('Error al cargar cliente');
      return;
    }

    const c = data.cliente;
    document.getElementById('modalTitulo').textContent = 'Editar Cliente';
    document.getElementById('clienteId').value = c.id;
    document.getElementById('nombre').value = c.nombre || '';
    document.getElementById('apellidoPaterno').value = c.apellido_paterno || '';
    document.getElementById('apellidoMaterno').value = c.apellido_materno || '';
    document.getElementById('telefono').value = c.telefono || '';
    document.getElementById('telefonoSecundario').value = c.telefono_secundario || '';
    document.getElementById('email').value = c.email || '';
    document.getElementById('ciudadId').value = c.ciudad_id || '';
    
    if (c.ciudad_id) {
      await cargarColoniasPorCiudad(c.ciudad_id);
      document.getElementById('coloniaId').value = c.colonia_id || '';
    }
    
    document.getElementById('direccion').value = c.direccion || '';
    document.getElementById('referencia').value = c.referencia || '';
    document.getElementById('planId').value = c.plan_id || '';
    document.getElementById('cuotaMensual').value = c.cuota_mensual || '';
    document.getElementById('fechaInstalacion').value = c.fecha_instalacion?.split('T')[0] || '';

    document.getElementById('modalCliente').classList.add('active');
  } catch (err) {
    console.error('Error:', err);
    toastError('Error al cargar cliente');
  }
}

function cerrarModal() {
  document.getElementById('modalCliente').classList.remove('active');
}

async function guardarCliente() {
  const id = document.getElementById('clienteId').value;
  const btn = document.getElementById('btnGuardarCliente');
  
  const datos = {
    nombre: document.getElementById('nombre').value,
    apellido_paterno: document.getElementById('apellidoPaterno').value,
    apellido_materno: document.getElementById('apellidoMaterno').value,
    telefono: document.getElementById('telefono').value,
    telefono_secundario: document.getElementById('telefonoSecundario').value,
    email: document.getElementById('email').value,
    ciudad_id: document.getElementById('ciudadId').value,
    colonia_id: document.getElementById('coloniaId').value,
    direccion: document.getElementById('direccion').value,
    referencia: document.getElementById('referencia').value,
    plan_id: document.getElementById('planId').value,
    cuota_mensual: parseFloat(document.getElementById('cuotaMensual').value) || 0,
    fecha_instalacion: document.getElementById('fechaInstalacion').value
  };

  if (!datos.nombre || !datos.telefono || !datos.ciudad_id || !datos.colonia_id || !datos.direccion || !datos.plan_id) {
    toastAdvertencia('Completa todos los campos requeridos');
    return;
  }

  btnLoading(btn, true);

  try {
    let data;
    if (id) {
      data = await fetchPut(`/api/clientes/${id}`, datos);
    } else {
      data = await fetchPost('/api/clientes', datos);
    }

    btnLoading(btn, false);

    if (data.ok) {
      cerrarModal();
      cargarClientes();
      toastExito(id ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente');
    } else {
      toastError(data.mensaje || 'Error al guardar');
    }
  } catch (err) {
    console.error('Error:', err);
    btnLoading(btn, false);
    toastError('Error al guardar cliente');
  }
}

// ========================================
// MODAL CIUDAD
// ========================================

function abrirModalCiudad() {
  document.getElementById('nuevaCiudadNombre').value = '';
  document.getElementById('nuevaCiudadEstado').value = '';
  document.getElementById('modalCiudad').classList.add('active');
}

function cerrarModalCiudad() {
  document.getElementById('modalCiudad').classList.remove('active');
}

async function guardarCiudad() {
  const nombre = document.getElementById('nuevaCiudadNombre').value.trim();
  const estado = document.getElementById('nuevaCiudadEstado').value.trim();
  const btn = document.getElementById('btnGuardarCiudad');

  if (!nombre) {
    toastAdvertencia('El nombre de la ciudad es requerido');
    return;
  }

  btnLoading(btn, true);

  try {
    const data = await fetchPost('/api/catalogos/ciudades', { nombre, estado_republica: estado });

    btnLoading(btn, false);

    if (data.ok) {
      cerrarModalCiudad();
      await cargarCatalogos();
      if (data.ciudad?.id) {
        document.getElementById('ciudadId').value = data.ciudad.id;
        await cargarColoniasPorCiudad(data.ciudad.id);
      }
      toastExito('Ciudad creada correctamente');
    } else {
      toastError(data.mensaje || 'Error al crear ciudad');
    }
  } catch (err) {
    console.error('Error:', err);
    btnLoading(btn, false);
    toastError('Error al crear ciudad');
  }
}

// ========================================
// MODAL COLONIA
// ========================================

function abrirModalColonia() {
  document.getElementById('nuevaColoniaNombre').value = '';
  document.getElementById('nuevaColoniaCP').value = '';
  
  llenarSelect('nuevaColoniaCiudad', ciudades, 'id', 'nombre');
  const ciudadSeleccionada = document.getElementById('ciudadId').value;
  if (ciudadSeleccionada) {
    document.getElementById('nuevaColoniaCiudad').value = ciudadSeleccionada;
  }
  
  document.getElementById('modalColonia').classList.add('active');
}

function cerrarModalColonia() {
  document.getElementById('modalColonia').classList.remove('active');
}

async function guardarColonia() {
  const ciudadId = document.getElementById('nuevaColoniaCiudad').value;
  const nombre = document.getElementById('nuevaColoniaNombre').value.trim();
  const cp = document.getElementById('nuevaColoniaCP').value.trim();
  const btn = document.getElementById('btnGuardarColonia');

  if (!ciudadId || !nombre) {
    toastAdvertencia('Ciudad y nombre son requeridos');
    return;
  }

  btnLoading(btn, true);

  try {
    const data = await fetchPost('/api/catalogos/colonias', { 
      ciudad_id: ciudadId, 
      nombre, 
      codigo_postal: cp 
    });

    btnLoading(btn, false);

    if (data.ok) {
      cerrarModalColonia();
      await cargarColoniasPorCiudad(ciudadId);
      if (data.colonia?.id) {
        document.getElementById('coloniaId').value = data.colonia.id;
      }
      toastExito('Colonia creada correctamente');
    } else {
      toastError(data.mensaje || 'Error al crear colonia');
    }
  } catch (err) {
    console.error('Error:', err);
    btnLoading(btn, false);
    toastError('Error al crear colonia');
  }
}

// ========================================
// MODAL PLAN
// ========================================

function abrirModalPlan() {
  document.getElementById('nuevoPlanNombre').value = '';
  document.getElementById('nuevoPlanVelocidad').value = '';
  document.getElementById('nuevoPlanPrecio').value = '';
  document.getElementById('nuevoPlanInstalacion').value = '0';
  document.getElementById('nuevoPlanDescripcion').value = '';
  document.getElementById('modalPlan').classList.add('active');
}

function cerrarModalPlan() {
  document.getElementById('modalPlan').classList.remove('active');
}

async function guardarPlan() {
  const nombre = document.getElementById('nuevoPlanNombre').value.trim();
  const velocidad = parseInt(document.getElementById('nuevoPlanVelocidad').value) || 0;
  const precio = parseFloat(document.getElementById('nuevoPlanPrecio').value) || 0;
  const instalacion = parseFloat(document.getElementById('nuevoPlanInstalacion').value) || 0;
  const descripcion = document.getElementById('nuevoPlanDescripcion').value.trim();
  const btn = document.getElementById('btnGuardarPlan');

  if (!nombre || !velocidad || !precio) {
    toastAdvertencia('Nombre, velocidad y precio son requeridos');
    return;
  }

  btnLoading(btn, true);

  try {
    const data = await fetchPost('/api/catalogos/planes', { 
      nombre, 
      velocidad_mbps: velocidad,
      precio_mensual: precio,
      precio_instalacion: instalacion,
      descripcion
    });

    btnLoading(btn, false);

    if (data.ok) {
      cerrarModalPlan();
      await cargarCatalogos();
      if (data.plan?.id) {
        document.getElementById('planId').value = data.plan.id;
        document.getElementById('cuotaMensual').value = data.plan.precio_mensual;
      }
      toastExito('Plan creado correctamente');
    } else {
      toastError(data.mensaje || 'Error al crear plan');
    }
  } catch (err) {
    console.error('Error:', err);
    btnLoading(btn, false);
    toastError('Error al crear plan');
  }
}

// ========================================
// EXPORTAR
// ========================================

async function exportarCSV() {
  toastInfo('Preparando exportación...');
  // Implementar exportación
}
