/**
 * app.js — InventarioKSC
 * Lógica frontend del panel Administrador:
 * gestión de inventario (CRUD), pestañas, búsqueda y alertas de stock.
 */

const API = '/api';

// ─── Estado global ───────────────────────────────────────────────────────────
let productosGlobal = [];   // Cache completa de productos
let modoEdicion = false;    // false = alta nueva, true = edición
let mySessionUser = null;   // Datos del usuario en sesión
let sortActual = 'default'; // Criterio de ordenamiento activo

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
function applyRowColor(tr, cantidad, stockMin, categoria) {
    // Si no es Insumo, no aplicar colores de alerta
    if (categoria !== 'Insumos') {
        tr.classList.add('row-ok');
        return;
    }
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
        p.categoria === 'Insumos' && Number(p.cantidad) <= Number(p.stock_minimo)
    ).length;
    document.getElementById('totalProductos').textContent = `Total productos: ${total}`;
    document.getElementById('enAlerta').textContent = `En alerta: ${alerta}`;
}

/** Comprueba productos bajo stock mínimo y abre el modal */
function checkLowStock() {
    // Si ya se mostró en esta sesión, no repetir
    if (sessionStorage.getItem('stockAlertShown')) return;

    const lowStock = productosGlobal.filter(p =>
        p.categoria === 'Insumos' && Number(p.cantidad) <= Number(p.stock_minimo)
    );
    if (lowStock.length > 0) {
        const listEl = document.getElementById('lowStockList');
        listEl.innerHTML = lowStock.map(p => `
            <div class="low-stock-item">
                <span class="low-stock-name">${escapeHtml(p.nombre)}</span>
                <span class="low-stock-val">${p.cantidad} ${escapeHtml(p.unidad_medida)}</span>
            </div>
        `).join('');

        abrirModal('modalStockAlert');
        sessionStorage.setItem('stockAlertShown', 'true');
    }
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
            <span class="material-symbols-outlined" style="font-size: 2.5rem; color: var(--text-muted)">inbox_customize</span>
            <p>No hay productos en el inventario.</p>
          </div>
        </td>
      </tr>`;
        updateFooter([]);
        return;
    }

    tbody.innerHTML = lista.map(p => {
        let categBadge = [];
        if (p.es_taller) categBadge.push('<span class="ubicacion-badge">Taller</span>');
        if (p.es_evento) categBadge.push('<span class="ubicacion-badge secondary">Evento</span>');
        if (p.es_producto) categBadge.push('<span class="ubicacion-badge info">Producto</span>');
        const categHtml = categBadge.length ? categBadge.join(' ') : '<span style="color:var(--text-muted); font-size: 0.85rem;">—</span>';

        const stockMinTexto = p.categoria === 'Insumos' ? p.stock_minimo : '<span style="color:var(--text-muted)">—</span>';

        return `
    <tr data-id="${p.id}" data-qty="${p.cantidad}" data-min="${p.stock_minimo}">
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.categoria)}</td>
      <td>${categHtml}</td>
      <td>${p.cantidad}</td>
      <td>${escapeHtml(p.unidad_medida)}</td>
      <td>${stockMinTexto}</td>
      <td>
        <button class="btn-action btn-edit" data-id="${p.id}" title="Editar">Editar</button>
        <button class="btn-action btn-delete" data-id="${p.id}" title="Eliminar">Eliminar</button>
      </td>
    </tr>`;
    }).join('');

    // Aplicar colores de fila
    lista.forEach(p => {
        const tr = tbody.querySelector(`tr[data-id="${p.id}"]`);
        if (tr) applyRowColor(tr, p.cantidad, p.stock_minimo, p.categoria);
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
        const q = document.getElementById('buscador').value.trim().toLowerCase();
        if (q) {
            filtrarTabla(q);
        } else {
            renderTabla(ordenarProductos(productosGlobal));
        }
    } catch (err) {
        console.error(err);
        showToast('No se pudo cargar el inventario', 'error');
    }
}

/** Ordena una lista de productos según el criterio activo */
function ordenarProductos(lista) {
    const copia = [...lista];
    switch (sortActual) {
        case 'nombre_asc':
            return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        case 'etiqueta':
            return copia.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'));
        case 'categoria': {
            const prioridad = p => p.es_taller ? 0 : p.es_evento ? 1 : p.es_producto ? 2 : 3;
            return copia.sort((a, b) => prioridad(a) - prioridad(b));
        }
        case 'stock_alerta': {
            const enAlerta = p =>
                p.categoria === 'Insumos' && Number(p.cantidad) <= Number(p.stock_minimo);
            return copia.sort((a, b) => {
                const aA = enAlerta(a), bA = enAlerta(b);
                if (aA && !bA) return -1;
                if (!aA && bA) return 1;
                return 0;
            });
        }
        default:
            return copia;
    }
}

/** Filtra localmente por nombre o categoría */
function filtrarTabla(q) {
    let filtrados = productosGlobal.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
    );
    renderTabla(ordenarProductos(filtrados));
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
        mySessionUser = data.usuario;
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
    document.getElementById('stockMinGroupAlta').style.display = 'none';
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
        { el: document.getElementById('unidad_medida') }
    ];

    const isInsumo = document.getElementById('categoria').value === 'Insumos';
    if (isInsumo) {
        campos.push({ el: document.getElementById('stock_minimo') });
    }

    if (!validarCampos(campos)) {
        showFormAlert('formAlert', 'Por favor completa todos los campos requeridos');
        return;
    }

    const payload = {
        nombre: document.getElementById('nombre').value.trim(),
        categoria: document.getElementById('categoria').value,
        cantidad: document.getElementById('cantidad').value,
        unidad_medida: document.getElementById('unidad_medida').value,
        stock_minimo: isInsumo ? document.getElementById('stock_minimo').value : 0,
        es_taller: document.getElementById('es_taller').checked ? 1 : 0,
        es_evento: document.getElementById('es_evento').checked ? 1 : 0,
        es_producto: document.getElementById('es_producto').checked ? 1 : 0,
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

        showFormAlert('formAlert', 'Producto registrado exitosamente', 'success');
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
    document.getElementById('editTaller').checked = !!producto.es_taller;
    document.getElementById('editEvento').checked = !!producto.es_evento;
    document.getElementById('editProducto').checked = !!producto.es_producto;

    const isInsumo = producto.categoria === 'Insumos';
    document.getElementById('stockMinGroupEdit').style.display = isInsumo ? 'block' : 'none';

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
    ];

    const isInsumo = document.getElementById('editCategoria').value === 'Insumos';
    if (isInsumo) {
        campos.push({ el: document.getElementById('editStockMin') });
    }

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
        stock_minimo: isInsumo ? document.getElementById('editStockMin').value : 0,
        es_taller: document.getElementById('editTaller').checked ? 1 : 0,
        es_evento: document.getElementById('editEvento').checked ? 1 : 0,
        es_producto: document.getElementById('editProducto').checked ? 1 : 0,
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
['modalEdicion', 'modalEliminar', 'modalStockAlert', 'modalToggleUsuario', 'modalEliminarUsuario'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        if (e.target.id === id) cerrarModal(id);
    });
});

// Sidebar Toggle Logic
const btnToggle = document.getElementById('btnToggleSidebar');
const btnCerrarSide = document.getElementById('btnCerrarSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

const toggleSidebar = () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
    // Para escritorio toggleable:
    document.querySelector('.dashboard').classList.toggle('sidebar-collapsed');
};

if (btnToggle) btnToggle.addEventListener('click', toggleSidebar);
if (btnCerrarSide) btnCerrarSide.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

// Listeners Stock Alert
document.getElementById('btnCerrarStockAlert')?.addEventListener('click', () => cerrarModal('modalStockAlert'));
document.getElementById('btnEntendidoStock')?.addEventListener('click', () => cerrarModal('modalStockAlert'));
// ─── Buscador ─────────────────────────────────────────────────────────────────

document.getElementById('buscador').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    filtrarTabla(q);
});

document.getElementById('ordenador').addEventListener('change', function () {
    sortActual = this.value;
    const q = document.getElementById('buscador').value.toLowerCase().trim();
    if (q) {
        filtrarTabla(q);
    } else {
        renderTabla(ordenarProductos(productosGlobal));
    }
});

// ─── Dropdown Usuario ───────────────────────────────────────────────────────────

const userDropdown = document.getElementById('userDropdown');
if (userDropdown) {
    userDropdown.addEventListener('click', () => userDropdown.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target)) userDropdown.classList.remove('open');
    });
}

// ─── Logout ───────────────────────────────────────────────────────────────────

const doLogout = async () => {
    sessionStorage.removeItem('stockAlertShown'); // Limpiar para que la próxima vez vuelva a salir
    await fetch(`${API}/auth/logout`, { method: 'POST' });
    window.location.href = '/';
};
const btnLogout = document.getElementById('btnLogout');
const btnLogoutDrop = document.getElementById('btnLogoutDrop');
if (btnLogout) btnLogout.addEventListener('click', doLogout);
if (btnLogoutDrop) btnLogoutDrop.addEventListener('click', doLogout);

// ─── Gestión de Usuarios ────────────────────────────────────────────────────────

let usuariosCache = [];

document.getElementById('btnAdminUsuarios').addEventListener('click', () => {
    abrirModal('modalUsuarios');
    loadUsuarios();
});

document.getElementById('btnCerrarModalUsuarios').addEventListener('click', () => {
    cerrarModal('modalUsuarios');
});

async function loadUsuarios() {
    try {
        const res = await fetch(`${API}/usuarios`);
        const data = await res.json();
        const tbody = document.getElementById('tbodyUsuarios');

        if (!data.ok) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red-alert)">Error al cargar usuarios</td></tr>`;
            return;
        }

        usuariosCache = data.data;

        if (usuariosCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay usuarios registrados</td></tr>`;
            return;
        }

        tbody.innerHTML = usuariosCache.map(u => `
            <tr style="${!u.activo ? 'opacity: 0.55;' : ''}">
                <td style="padding: 10px; border-bottom: 1px solid var(--border)">${escapeHtml(u.nombre)}${!u.activo ? ' <span style="font-size:0.75rem;color:var(--red-alert);font-weight:600;">(deshabilitado)</span>' : ''}</td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border)">${escapeHtml(u.correo)}</td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border)"><span style="text-transform: capitalize; font-size: 0.8rem; background: var(--bg-main); padding: 2px 6px; border-radius: 4px;">${escapeHtml(u.rol)}</span></td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap;">
                    <button class="btn-action btn-edit" onclick="abrirModalEditUsuario(${u.id})" title="Editar Usuario">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem">edit</span>
                    </button>
                    <button class="btn-action" style="color: ${u.activo ? 'var(--olive)' : 'var(--text-muted)'}; border-color: ${u.activo ? 'var(--olive)' : 'var(--border)'};" onclick="confirmarToggleUsuario(${u.id})" title="${u.activo ? 'Deshabilitar usuario' : 'Habilitar usuario'}">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem">${u.activo ? 'power_settings_new' : 'power_off'}</span>
                    </button>
                    <button class="btn-action btn-delete" onclick="confirmarEliminarUsuario(${u.id})" title="Eliminar Usuario">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem">person_remove</span>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (_) {
        document.getElementById('tbodyUsuarios').innerHTML = `<tr><td colspan="4" style="text-align:center;">Error de conexión</td></tr>`;
    }
}

document.getElementById('formCrearUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormAlert('modalUsuariosAlert');

    const payload = {
        nombre: document.getElementById('newUserName').value.trim(),
        correo: document.getElementById('newUserEmail').value.trim(),
        contrasena: document.getElementById('newUserPass').value,
        rol: document.getElementById('newUserRol').value
    };

    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = 'Creando...';

    try {
        const res = await fetch(`${API}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!data.ok) {
            showFormAlert('modalUsuariosAlert', data.mensaje || 'Error al crear usuario', 'error');
        } else {
            showFormAlert('modalUsuariosAlert', 'Usuario creado exitosamente', 'success');
            document.getElementById('formCrearUsuario').reset();
            loadUsuarios(); // Recargar tabla
            showToast('Nuevo perfil de usuario creado');
        }
    } catch (_) {
        showFormAlert('modalUsuariosAlert', 'Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear Perfil';
    }
});

// ─── Toggle Deshabilitar/Habilitar Usuario ────────────────────────────────────

let usuarioToggleId = null;

window.confirmarToggleUsuario = (id) => {
    const user = usuariosCache.find(u => u.id === id);
    if (!user) return;
    usuarioToggleId = id;
    const estaActivo = !!user.activo;
    document.getElementById('toggleUsuarioTitulo').textContent =
        estaActivo ? '¿Deshabilitar usuario?' : '¿Habilitar usuario?';
    document.getElementById('toggleUsuarioMsg').textContent =
        estaActivo
            ? `"${user.nombre}" no podrá iniciar sesión hasta ser habilitado nuevamente.`
            : `"${user.nombre}" podrá volver a iniciar sesión.`;
    document.getElementById('toggleUsuarioIcon').textContent =
        estaActivo ? 'power_settings_new' : 'power_off';
    document.getElementById('toggleUsuarioIcon').style.color =
        estaActivo ? 'var(--red-alert)' : 'var(--olive)';
    abrirModal('modalToggleUsuario');
};

document.getElementById('btnConfirmarToggle').addEventListener('click', async () => {
    if (!usuarioToggleId) return;
    const btn = document.getElementById('btnConfirmarToggle');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
        const res = await fetch(`${API}/usuarios/${usuarioToggleId}/toggle`, { method: 'PATCH' });
        const data = await res.json();
        if (!data.ok) {
            showToast(data.mensaje || 'Error al cambiar estado', 'error');
        } else {
            showToast(data.mensaje);
            cerrarModal('modalToggleUsuario');
            loadUsuarios();
        }
    } catch (_) {
        showToast('Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar';
        usuarioToggleId = null;
    }
});

document.getElementById('btnCancelarToggle').addEventListener('click', () => {
    cerrarModal('modalToggleUsuario');
    usuarioToggleId = null;
});

// ─── Eliminar Usuario ─────────────────────────────────────────────────────────

let usuarioEliminarId = null;

window.confirmarEliminarUsuario = (id) => {
    const user = usuariosCache.find(u => u.id === id);
    if (!user) return;
    usuarioEliminarId = id;
    document.getElementById('eliminarUsuarioMsg').textContent =
        `¿Estás seguro de que deseas eliminar a "${user.nombre}"? Esta acción no se puede deshacer.`;
    abrirModal('modalEliminarUsuario');
};

document.getElementById('btnConfirmarEliminarUsuario').addEventListener('click', async () => {
    if (!usuarioEliminarId) return;
    const btn = document.getElementById('btnConfirmarEliminarUsuario');
    btn.disabled = true;
    btn.textContent = 'Eliminando…';
    try {
        const res = await fetch(`${API}/usuarios/${usuarioEliminarId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.ok) {
            showToast(data.mensaje || 'Error al eliminar', 'error');
        } else {
            showToast('Usuario eliminado correctamente');
            cerrarModal('modalEliminarUsuario');
            loadUsuarios();
        }
    } catch (_) {
        showToast('Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sí, eliminar';
        usuarioEliminarId = null;
    }
});

document.getElementById('btnCancelarEliminarUsuario').addEventListener('click', () => {
    cerrarModal('modalEliminarUsuario');
    usuarioEliminarId = null;
});

// ─── Lógica Editar Usuario (Admin) ───
window.abrirModalEditUsuario = (id) => {
    const user = usuariosCache.find(u => u.id === id);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.nombre;
    document.getElementById('editUserEmail').value = user.correo;
    document.getElementById('editUserPass').value = '';
    document.getElementById('editUserRol').value = user.rol;

    hideFormAlert('modalEditarUsuarioAlert');
    abrirModal('modalEditarUsuario');
};

document.getElementById('btnCerrarModalEditarUsuario').addEventListener('click', () => cerrarModal('modalEditarUsuario'));

document.getElementById('formEditarUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    const id = document.getElementById('editUserId').value;

    const payload = {
        nombre: document.getElementById('editUserName').value.trim(),
        correo: document.getElementById('editUserEmail').value.trim(),
        rol: document.getElementById('editUserRol').value,
        contrasena: document.getElementById('editUserPass').value
    };

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const res = await fetch(`${API}/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!data.ok) {
            showFormAlert('modalEditarUsuarioAlert', data.mensaje || 'Error al actualizar usuario', 'error');
        } else {
            showToast('Usuario actualizado exitosamente');
            cerrarModal('modalEditarUsuario');
            loadUsuarios();
        }
    } catch (_) {
        showFormAlert('modalEditarUsuarioAlert', 'Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar cambios';
    }
});

// ─── Modal Cambiar Contraseña propia (Admin) ───
document.getElementById('btnAdminCambiarPass').addEventListener('click', () => {
    document.getElementById('formCambiarPass').reset();
    hideFormAlert('modalPassAlert');
    abrirModal('modalPass');
});
document.getElementById('btnCerrarModalPass').addEventListener('click', () => cerrarModal('modalPass'));
document.getElementById('modalPass').addEventListener('click', (e) => {
    if (e.target.id === 'modalPass') cerrarModal('modalPass');
});

document.getElementById('formCambiarPass').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    const actual = document.getElementById('oldPass').value;
    const nueva = document.getElementById('newPass').value;

    if (!actual || !nueva) {
        return showFormAlert('modalPassAlert', 'Completa ambos campos', 'error');
    }

    btn.disabled = true;
    btn.textContent = 'Actualizando...';

    try {
        const res = await fetch(`${API}/usuarios/me/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actual, nueva })
        });
        const data = await res.json();

        if (!data.ok) {
            showFormAlert('modalPassAlert', data.mensaje || 'Error al cambiar contraseña', 'error');
        } else {
            showToast('Contraseña actualizada correctamente', 'success');
            cerrarModal('modalPass');
        }
    } catch (_) {
        showFormAlert('modalPassAlert', 'Error de conexión', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Actualizar';
    }
});

// ─── Inicialización ───────────────────────────────────────────────────────────

(async () => {
    // Listeners para stock mínimo condicional
    document.getElementById('categoria')?.addEventListener('change', (e) => {
        const isInsumo = e.target.value === 'Insumos';
        const group = document.getElementById('stockMinGroupAlta');
        if (group) group.style.display = isInsumo ? 'block' : 'none';
        if (!isInsumo) document.getElementById('stock_minimo').value = '0';
    });
    document.getElementById('editCategoria')?.addEventListener('change', (e) => {
        const isInsumo = e.target.value === 'Insumos';
        const group = document.getElementById('stockMinGroupEdit');
        if (group) group.style.display = isInsumo ? 'block' : 'none';
        if (!isInsumo) document.getElementById('editStockMin').value = '0';
    });

    await initSession();
    setupTabs();
    await loadInventario();
    checkLowStock();
})();
