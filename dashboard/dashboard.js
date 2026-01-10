// ========================================
// SKYNET - DASHBOARD JS
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  cargarUsuarioHeader();
  cargarEstadisticas();
  cargarUltimosPagos();
  cargarDeudores();
});

async function cargarEstadisticas() {
  try {
    const data = await fetchGet('/api/dashboard/estadisticas');
    
    if (data.ok) {
      const stats = data.estadisticas;
      document.getElementById('totalActivos').textContent = stats.clientesActivos || 0;
      document.getElementById('totalCancelados').textContent = stats.clientesCancelados || 0;
      document.getElementById('totalDeudores').textContent = stats.clientesDeudores || 0;
      document.getElementById('totalIngresos').textContent = formatoMoneda(stats.ingresosMes || 0);
    }
  } catch (err) {
    console.error('Error cargando estadísticas:', err);
  }
}

async function cargarUltimosPagos() {
  try {
    const data = await fetchGet('/api/pagos?limite=5');
    const tbody = document.getElementById('tablaPagos');
    
    if (!data.ok || !data.pagos?.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Sin pagos recientes</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.pagos.map(p => `
      <tr>
        <td>
          <div class="table__avatar">
            <div class="table__avatar-circle table__avatar-circle--blue">
              ${obtenerIniciales(p.cliente_nombre, p.cliente_apellido)}
            </div>
            <span class="table__avatar-name">${p.cliente_nombre || ''} ${p.cliente_apellido || ''}</span>
          </div>
        </td>
        <td class="font-semibold">${formatoMoneda(p.monto)}</td>
        <td><span class="badge badge--pagado">Pagado</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando pagos:', err);
    document.getElementById('tablaPagos').innerHTML = '<tr><td colspan="3" class="text-center">Sin pagos</td></tr>';
  }
}

async function cargarDeudores() {
  try {
    const data = await fetchGet('/api/clientes?estado=suspendido&limite=5');
    const tbody = document.getElementById('tablaDeudores');
    
    if (!data.ok || !data.clientes?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sin clientes con adeudo</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.clientes.map(c => `
      <tr>
        <td>
          <div class="table__avatar">
            <div class="table__avatar-circle table__avatar-circle--purple">
              ${obtenerIniciales(c.nombre, c.apellido_paterno)}
            </div>
            <span class="table__avatar-name">${c.nombre} ${c.apellido_paterno || ''}</span>
          </div>
        </td>
        <td>${c.telefono || '-'}</td>
        <td>${c.ciudad_nombre || '-'}</td>
        <td class="font-semibold">${formatoMoneda(c.saldo_pendiente)}</td>
        <td><span class="badge badge--deudor">Deudor</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="verCliente('${c.id}')">
            <span class="material-symbols-outlined">visibility</span>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando deudores:', err);
    document.getElementById('tablaDeudores').innerHTML = '<tr><td colspan="6" class="text-center">Sin datos</td></tr>';
  }
}

function verCliente(id) {
  window.location.href = `/skynet-frontend/clientes/detalle.html?id=${id}`;
}
