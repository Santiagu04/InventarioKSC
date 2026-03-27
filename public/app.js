/**
 * app.js — InventarioKSC
 * Lógica frontend del panel Administrador:
 * gestión de inventario (CRUD), pestañas, búsqueda y alertas de stock.
 */

const API = '/api';

// ─── Estado global ───────────────────────────────────────────────────────────
let productosGlobal = [];   // Cache completa de productos
let modoEdicion = false; // false = alta nueva, true = edición

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Muestra un toast en la esquina inferior derecha */
function showToast(msg, tipo = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast toast-${tipo} show`;
    setTimeout(() => t.classList.remove('show'), 3200);
}

/** Formatea un número como precio COP */
function formatPrecio(v) {
    return '$' + Number(v).toLocaleString('es-CO');
}

/**
 * Aplica el color de fondo a una fila <tr> según nivel de stock.
 * - cantidad = 0      → rojo suave (row-critical)
 * - cantidad ≤ min    → naranja suave (row-low-stock)
 * - cantidad > min    → sin color (row-ok)
 */
function applyRowColor(tr, cantidad, stockMin) {
    const qty = Number(cantidad);
    const min = Number(stockMin);
    tr.classList.remove('row-ok', 'row-low-stock', 'row-critical');
    if (qty === 0) tr.classList.add('row-critical');
    else if (qty <= min) tr.classList.add('row-low-stock');
    else tr.classList.add('row-ok');
}

/** Actualiza el contador del pie de tabla */
function updateFooter(lista) {
    const total = lista.length;
    const alerta = lista.filter(p =>
        Number(p.cantidad) <= Number(p.stock_minimo)
    ).length;
    document.getElementById('totalProductos').textContent = `Total productos: ${total}`;
    document.getElementById('enAlerta').textContent = `En alerta: ${alerta}`;
}

// ─── Tabla de inventario ──────────────────────────────────────────────────────

/** Renderiza la tabla con la lista de productos dada */
function renderTabla(lista) {
    const tbody = document.getElementById('tbodyInventario');

    if (!lista.length) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <span style="font-size:2rem">📭</span>
            <p>No hay productos en el inventario.</p>
          </div>
        </td>
      </tr>`;
        updateFooter([]);
        return;
    }

    tbody.innerHTML = lista.map(p => `
    <tr data-id="${p.id}" data-qty="${p.cantidad}" data-min="${p.stock_minimo}">
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.categoria)}</td>
      <td>${Number(p.cantidad).toLocaleString('es-CO')}</td>
      <td>${escapeHtml(p.unidad_medida)}</td>
      <td>${Number(p.stock_minimo).toLocaleString('es-CO')}</td>
      <td class="col-precio">${formatPrecio(p.precio)}</td>
      <td>
        <button class="btn-action btn-edit" data-id="${p.id}" title="Editar">Editar</button>
        <button class="btn-action btn-delete" data-id="${p.id}" title="Eliminar">Eliminar</button>
      </td>
    </tr>
  `).join('');

    // Aplicar colores de fila
    lista.forEach(p => {
        const tr = tbody.querySelector(`tr[data-id="${p.id}"]`);
        if (tr) applyRowColor(tr, p.cantidad, p.stock_minimo);
    });

    updateFooter(lista);

    // Listeners de botones
    tbody.querySelectorAll('.btn-edit').forEach(btn =>
        btn.addEventListener('click', () => abrirModalEdicion(Number(btn.dataset.id)))
    );
    tbody.querySelectorAll('.btn-delete').forEach(btn =>
        btn.addEventListener('click', () => abrirModalEliminar(Number(btn.dataset.id)))
    );
}

/** Escapa HTML para prevenir XSS */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Carga de inventario ──────────────────────────────────────────────────────

async function loadInventario() {
    try {
        const res = await fetch(`${API}/inventario`);
        const data = await res.json();
        if (!data.ok) throw new Error('Error al obtener inventario');
        productosGlobal = data.data;
        renderTabla(productosGlobal);
        // Reaplicar filtro si hay texto en el buscador
        const q = document.getElementById('buscador').value.trim().toLowerCase();
        if (q) filtrarTabla(q);
    } catch (err) {
        console.error(err);
        showToast('No se pudo cargar el inventario', 'error');
    }
}

/** Filtra localmente por nombre o categoría */
function filtrarTabla(q) {
    const filtrados = productosGlobal.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
    );
    renderTabla(filtrados);
}

// ─── Sesión de usuario ────────────────────────────────────────────────────────

async function initSession() {
    try {
        const res = await fetch(`${API}/auth/me`);
        const data = await res.json();
        if (!data.ok) { window.location.href = '/'; return; }
        // Guardia de rol: si es auxiliar, redirige
        if (data.usuario.rol !== 'administrador') {
            window.location.href = '/auxiliar.html'; return;
        }
        document.getElementById('sidebarNombre').textContent = data.usuario.nombre;
    } catch (_) { window.location.href = '/'; }
}

// ─── Pestañas ─────────────────────────────────────────────────────────────────

function setupTabs() {
    const tabAgregar = document.getElementById('tabAgregar');
    const tabVer = document.getElementById('tabVer');
    const paneAdd = document.getElementById('paneAgregar');
    const paneVer = document.getElementById('paneVer');

    function activarTab(tab) {
        [tabAgregar, tabVer].forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        [paneAdd, paneVer].forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        if (tab === tabAgregar) { paneAdd.classList.add('active'); }
        else { paneVer.classList.add('active'); loadInventario(); }
    }

    tabAgregar.addEventListener('click', () => activarTab(tabAgregar));
    tabVer.addEventListener('click', () => activarTab(tabVer));

    // El botón "+ Agregar Producto" de la cabecera abre la pestaña Agregar
    document.getElementById('btnAbrirFormulario').addEventListener('click', () => {
        resetFormAlta();
        activarTab(tabAgregar);
    });

    // Cancelar en formulario de alta vuelve a Ver Inventario
    document.getElementById('btnCancelarForm').addEventListener('click', () => {
        activarTab(tabVer);
    });
}

// ─── Formulario de alta ───────────────────────────────────────────────────────

function resetFormAlta() {
    const form = document.getElementById('productForm');
    form.reset();
    document.getElementById('productoId').value = '';
    hideFormAlert('formAlert');
    form.querySelectorAll('input, select').forEach(el => el.classList.remove('error'));
}

function showFormAlert(id, msg, tipo = 'error') {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = `form-alert ${tipo} visible`;
}

function hideFormAlert(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.className = 'form-alert';
}

/** Valida que todos los campos del formulario tengan valor */
function validarCampos(campos) {
    let valido = true;
    campos.forEach(({ el }) => {
        const v = el.value.trim();
        if (!v && v !== '0') {
            el.classList.add('error');
            valido = false;
        } else {
            el.classList.remove('error');
        }
    });
    return valido;
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormAlert('formAlert');

    const campos = [
        { el: document.getElementById('nombre') },
        { el: document.getElementById('categoria') },
        { el: document.getElementById('cantidad') },
        { el: document.getElementById('unidad_medida') },
        { el: document.getElementById('stock_minimo') },
        { el: document.getElementById('precio') },
    ];

    if (!validarCampos(campos)) {
        showFormAlert('formAlert', 'Por favor completa todos los campos requeridos');
        return;
    }

    const payload = {
        nombre: document.getElementById('nombre').value.trim(),
        categoria: document.getElementById('categoria').value,
        cantidad: document.getElementById('cantidad').value,
        unidad_medida: document.getElementById('unidad_medida').value,
        stock_minimo: document.getElementById('stock_minimo').value,
        precio: document.getElementById('precio').value,
    };

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
        const res = await fetch(`${API}/inventario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!data.ok) {
            if (data.code === 'NOMBRE_DUPLICADO') {
                document.getElementById('nombre').classList.add('error');
                showFormAlert('formAlert', 'Ya existe un producto con ese nombre');
            } else {
                showFormAlert('formAlert', data.mensaje || 'Error al guardar el producto');
            }
            return;
        }

        showFormAlert('formAlert', '✅ Producto registrado exitosamente', 'success');
        await loadInventario();
        resetFormAlta();
        // Ir a Ver Inventario tras 1s
        setTimeout(() => {
            document.getElementById('tabVer').click();
        }, 1200);
        showToast('Producto registrado exitosamente');
    } catch (_) {
        showFormAlert('formAlert', 'Error de conexión. Intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar producto';
    }
});

// ─── Modal de edición ─────────────────────────────────────────────────────────

function abrirModalEdicion(id) {
    const producto = productosGlobal.find(p => p.id === id);
    if (!producto) return;

    document.getElementById('editId').value = producto.id;
    document.getElementById('editNombre').value = producto.nombre;
    document.getElementById('editCategoria').value = producto.categoria;
    document.getElementById('editUnidad').value = producto.unidad_medida;
    document.getElementById('editCantidad').value = producto.cantidad;
    document.getElementById('editStockMin').value = producto.stock_minimo;
    document.getElementById('editPrecio').value = producto.precio;
    hideFormAlert('modalAlert');

    abrirModal('modalEdicion');
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormAlert('modalAlert');

    const campos = [
        { el: document.getElementById('editNombre') },
        { el: document.getElementById('editCategoria') },
        { el: document.getElementById('editCantidad') },
        { el: document.getElementById('editUnidad') },
        { el: document.getElementById('editStockMin') },
        { el: document.getElementById('editPrecio') },
    ];

    if (!validarCampos(campos)) {
        showFormAlert('modalAlert', 'Por favor completa todos los campos requeridos');
        return;
    }

    const id = document.getElementById('editId').value;
    const payload = {
        nombre: document.getElementById('editNombre').value.trim(),
        categoria: document.getElementById('editCategoria').value,
        cantidad: document.getElementById('editCantidad').value,
        unidad_medida: document.getElementById('editUnidad').value,
        stock_minimo: document.getElementById('editStockMin').value,
        precio: document.getElementById('editPrecio').value,
    };

    const btn = e.submitter;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    try {
        const res = await fetch(`${API}/inventario/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!data.ok) {
            if (data.code === 'NOMBRE_DUPLICADO') {
                document.getElementById('editNombre').classList.add('error');
                showFormAlert('modalAlert', 'Ya existe un producto con ese nombre');
            } else {
                showFormAlert('modalAlert', data.mensaje || 'Error al actualizar');
            }
            return;
        }

        cerrarModal('modalEdicion');
        await loadInventario();
        showToast('Producto actualizado correctamente');
    } catch (_) {
        showFormAlert('modalAlert', 'Error de conexión. Intenta de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    }
});

// ─── Modal de eliminación ─────────────────────────────────────────────────────

let productoAEliminar = null;

function abrirModalEliminar(id) {
    const producto = productosGlobal.find(p => p.id === id);
    productoAEliminar = id;
    document.getElementById('confirmMsg').textContent =
        `¿Estás seguro de que deseas eliminar "${producto ? producto.nombre : 'este producto'}"? Esta acción no se puede deshacer.`;
    abrirModal('modalEliminar');
}

document.getElementById('btnConfirmarEliminar').addEventListener('click', async () => {
    if (!productoAEliminar) return;
    const btn = document.getElementById('btnConfirmarEliminar');
    btn.disabled = true;
    btn.textContent = 'Eliminando…';

    try {
        const res = await fetch(`${API}/inventario/${productoAEliminar}`, { method: 'DELETE' });
        const data = await res.json();

        if (!data.ok) { showToast(data.mensaje || 'Error al eliminar', 'error'); return; }

        cerrarModal('modalEliminar');
        productoAEliminar = null;
        await loadInventario();
        showToast('Producto eliminado correctamente');
    } catch (_) {
        showToast('Error de conexión al eliminar', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sí, eliminar';
    }
});

// ─── Control de modales ───────────────────────────────────────────────────────

function abrirModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}

// Botones de cierre de modales
document.getElementById('btnCerrarModal').addEventListener('click', () => cerrarModal('modalEdicion'));
document.getElementById('btnCancelarEdit').addEventListener('click', () => cerrarModal('modalEdicion'));
document.getElementById('btnCancelarEliminar').addEventListener('click', () => cerrarModal('modalEliminar'));

// Cerrar modal al hacer clic afuera
['modalEdicion', 'modalEliminar'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        if (e.target.id === id) cerrarModal(id);
    });
});

// ─── Buscador ─────────────────────────────────────────────────────────────────

document.getElementById('buscador').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    filtrarTabla(q);
});

// ─── Logout ───────────────────────────────────────────────────────────────────

document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST' });
    window.location.href = '/';
});

// ─── Inicialización ───────────────────────────────────────────────────────────

(async () => {
    await initSession();
    setupTabs();
    await loadInventario();
})();
