/**
 * eventos.js — InventarioKSC
 * Módulo de Eventos: Crear, Ver, Historial.
 * Compatible con rol administrador y auxiliar.
 */

const API = '/api';

// ─── Estado global ───────────────────────────────────────────────────────────
let rolUsuario        = null;
let productosInv      = [];          // cache de todo el inventario
let checklistBuilder  = [];          // items en construcción al crear evento
let catFilterActiva   = 'taller';    // filtro activo en "Agregar más"
let eventosActivos    = [];          // cache de eventos activos
let eliminandoItem    = null;        // {eventoId, itemId, nombre, cantidad}
let terminandoId      = null;        // id del evento que se va a terminar
let editandoId        = null;        // id del evento que se está editando
let agregandoItemEvId = null;        // id del evento al que se agrega un item

// ─── Utilidades ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, tipo = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast toast-${tipo} show`;
    setTimeout(() => t.classList.remove('show'), 3200);
}

function abrirModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}

function showAlert(id, msg, tipo = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `form-alert ${tipo} visible`;
}

function hideAlert(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.className = 'form-alert';
}

function formatFecha(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatFechaLarga(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr + 'T12:00:00')
            .toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return formatFecha(dateStr); }
}

// ─── Sesión y sidebar ────────────────────────────────────────────────────────
async function initSession() {
    try {
        const res  = await fetch(`${API}/auth/me`);
        const data = await res.json();
        if (!data.ok) { window.location.href = '/'; return; }

        rolUsuario = data.usuario.rol;
        document.getElementById('sidebarNombre').textContent = data.usuario.nombre;
        document.getElementById('sidebarRol').textContent =
            rolUsuario === 'administrador' ? 'Administrador' : 'Auxiliar';

        // Nav Inventario
        document.getElementById('navInventario').addEventListener('click', () => {
            window.location.href = rolUsuario === 'administrador' ? '/inventario.html' : '/auxiliar.html';
        });

        // Dropdown: Gestión de usuarios (solo admin) y Actualizar contraseña
        if (rolUsuario === 'administrador') {
            const btnGestion = document.getElementById('btnAdminUsuariosEv');
            btnGestion.style.display = '';
            btnGestion.addEventListener('click', () => {
                window.location.href = '/inventario';
            });
        }
        document.getElementById('btnCambiarPassEv').addEventListener('click', () => {
            userDropdown.classList.remove('open');
            document.getElementById('formCambiarPassEv').reset();
            document.getElementById('modalPassEvAlert').className = 'form-alert';
            abrirModal('modalPassEv');
        });
        document.getElementById('btnCerrarModalPassEv').addEventListener('click', () => cerrarModal('modalPassEv'));

        document.getElementById('formCambiarPassEv').addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertEl = document.getElementById('modalPassEvAlert');
            alertEl.className = 'form-alert';
            const oldP = document.getElementById('oldPassEv').value;
            const newP = document.getElementById('newPassEv').value;
            if (newP.length < 6) {
                alertEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres';
                alertEl.className = 'form-alert error visible'; return;
            }
            const btn = e.submitter; btn.disabled = true; btn.textContent = 'Actualizando…';
            try {
                const res  = await fetch(`${API}/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword: oldP, newPassword: newP })
                });
                const data = await res.json();
                if (!data.ok) {
                    alertEl.textContent = data.mensaje || 'Error al actualizar contraseña';
                    alertEl.className = 'form-alert error visible';
                } else {
                    cerrarModal('modalPassEv');
                    showToast('Contraseña actualizada correctamente');
                }
            } catch (_) {
                alertEl.textContent = 'Error de conexión';
                alertEl.className = 'form-alert error visible';
            } finally { btn.disabled = false; btn.textContent = 'Actualizar'; }
        });

        // Logout
        document.getElementById('btnLogoutDrop').addEventListener('click', async () => {
            sessionStorage.removeItem('stockAlertShown');
            await fetch(`${API}/auth/logout`, { method: 'POST' });
            window.location.href = '/';
        });

        // User dropdown
        const userDropdown = document.getElementById('userDropdown');
        userDropdown.addEventListener('click', () => userDropdown.classList.toggle('open'));
        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target)) userDropdown.classList.remove('open');
        });

        // Sidebar toggle
        const sidebar = document.getElementById('sidebar');
        const overlay  = document.getElementById('sidebarOverlay');
        const toggleFn = () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('visible');
            document.querySelector('.dashboard').classList.toggle('sidebar-collapsed');
        };
        document.getElementById('btnToggleSidebar').addEventListener('click', toggleFn);
        document.getElementById('btnCerrarSidebar').addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
    } catch (_) { window.location.href = '/'; }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
    const container    = document.getElementById('tabsContainer');
    const paneCrear    = document.getElementById('paneCrear');
    const paneVer      = document.getElementById('paneVer');
    const paneHistorial = document.getElementById('paneHistorial');

    // Construir tabs según rol
    const tabs = rolUsuario === 'administrador'
        ? [
            { id: 'tabCrear',    label: 'Crear Evento', pane: 'crear'    },
            { id: 'tabVer',      label: 'Ver Eventos',  pane: 'ver'      },
            { id: 'tabHistorial',label: 'Historial',    pane: 'historial'},
          ]
        : [
            { id: 'tabVer',      label: 'Ver Eventos',  pane: 'ver'      },
            { id: 'tabHistorial',label: 'Historial',    pane: 'historial'},
          ];

    container.innerHTML = tabs.map(t =>
        `<button class="tab-btn${t.pane === 'ver' ? ' active' : ''}" id="${t.id}"
                 data-pane="${t.pane}" role="tab"
                 aria-selected="${t.pane === 'ver'}">${t.label}</button>`
    ).join('');

    const panesMap = { crear: paneCrear, ver: paneVer, historial: paneHistorial };

    // Estado inicial
    Object.values(panesMap).forEach(p => p.classList.remove('active'));
    paneVer.classList.add('active');

    function activarTab(paneName) {
        container.querySelectorAll('.tab-btn').forEach(btn => {
            const active = btn.dataset.pane === paneName;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', String(active));
        });
        Object.entries(panesMap).forEach(([key, pane]) => {
            pane.classList.toggle('active', key === paneName);
        });
        if (paneName === 'historial') loadHistorial();
        if (paneName === 'ver')       loadEventosActivos();
        if (paneName === 'crear')     resetCrearEvento();
    }

    // Exponer para uso externo
    window._activarTab = activarTab;

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn[data-pane]');
        if (btn) activarTab(btn.dataset.pane);
    });
}

// ─── Cargar inventario ────────────────────────────────────────────────────────
async function loadProductos() {
    try {
        const res  = await fetch(`${API}/inventario`);
        const data = await res.json();
        if (data.ok) productosInv = data.data;
    } catch (_) {}
}

// ─── Ver Eventos ─────────────────────────────────────────────────────────────
async function loadEventosActivos() {
    try {
        const res  = await fetch(`${API}/eventos/activos`);
        const data = await res.json();
        if (data.ok) { eventosActivos = data.data; renderEventosActivos(); }
    } catch (_) { showToast('Error al cargar eventos', 'error'); }
}

function renderEventosActivos() {
    const container = document.getElementById('listaEventosActivos');
    if (!eventosActivos.length) {
        container.innerHTML = `
        <div class="eventos-empty card" style="padding:40px;">
            <span class="material-symbols-outlined">event_busy</span>
            <p>No hay eventos activos.</p>
            ${rolUsuario === 'administrador'
                ? `<button class="btn-save" style="margin-top:16px;"
                       onclick="window._activarTab('crear')">+ Crear primer evento</button>`
                : ''}
        </div>`;
        return;
    }
    container.innerHTML = `<div class="eventos-grid">${
        eventosActivos.map(ev => buildEventoCard(ev)).join('')
    }</div>`;
}

function buildEventoCard(ev) {
    const esAdmin = rolUsuario === 'administrador';

    const checklistRows = ev.checklist.map(item => `
        <tr>
            <td>${escapeHtml(item.producto_nombre)}</td>
            <td>${escapeHtml(item.categoria)}</td>
            <td>${escapeHtml(item.unidad_medida)}</td>
            <td>
                <div class="qty-control" data-evento-id="${ev.id}" data-item-id="${item.id}">
                    <span class="qty-val">${Math.round(item.cantidad)}</span>
                    <div class="qty-edit-zone"
                        style="display:none;align-items:center;gap:4px;">
                        <input type="number" class="qty-input" value="${Math.round(item.cantidad)}"
                            min="1" step="1"
                            style="width:70px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;" />
                        <button class="btn-save-qty" title="Guardar"
                            style="background:none;border:none;cursor:pointer;color:var(--olive);">
                            <span class="material-symbols-outlined" style="font-size:1rem;">check</span>
                        </button>
                        <button class="btn-cancel-qty" title="Cancelar"
                            style="background:none;border:none;cursor:pointer;color:var(--red-alert);">
                            <span class="material-symbols-outlined" style="font-size:1rem;">close</span>
                        </button>
                    </div>
                    <button class="btn-edit-qty btn-action" title="Editar cantidad"
                        style="padding:3px 6px;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">edit</span>
                    </button>
                </div>
            </td>
            <td>
                <button class="btn-action btn-delete btn-del-item"
                    data-evento-id="${ev.id}" data-item-id="${item.id}"
                    data-nombre="${escapeHtml(item.producto_nombre)}"
                    data-cantidad="${item.cantidad}"
                    title="Eliminar del checklist">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">remove_circle</span>
                </button>
            </td>
        </tr>`).join('');

    const checklistHTML = ev.checklist.length
        ? `<div class="table-wrapper"
               style="border:1px solid var(--border);border-radius:var(--radius-sm);">
             <table>
               <thead style="background:var(--bg-main);">
                 <tr>
                   <th>Producto</th><th>Etiqueta</th><th>Unidad</th>
                   <th>Cantidad</th><th></th>
                 </tr>
               </thead>
               <tbody>${checklistRows}</tbody>
             </table>
           </div>`
        : `<p style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:16px 0;">
               El checklist está vacío.</p>`;

    return `
    <div class="evento-card" data-evento-id="${ev.id}">
        <div class="evento-card-header">
            <div class="evento-card-info">
                <div class="evento-nombre">${escapeHtml(ev.nombre)}</div>
                <div class="evento-meta">
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">calendar_today</span>
                        ${formatFechaLarga(ev.fecha)}
                    </span>
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">person</span>
                        ${escapeHtml(ev.responsable)}
                    </span>
                </div>
            </div>
            <div class="evento-card-actions">
                ${esAdmin ? `
                <button class="btn-action btn-edit btn-editar-evento"
                    data-id="${ev.id}" title="Editar datos del evento">
                    <span class="material-symbols-outlined" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn-terminar btn-terminar-evento" data-id="${ev.id}">
                    <span class="material-symbols-outlined"
                        style="font-size:0.9rem;vertical-align:middle;">task_alt</span>
                    Terminar
                </button>` : ''}
            </div>
        </div>
        <div class="evento-checklist">
            <div class="checklist-header">
                <span>Checklist</span>
                <button class="btn-action btn-edit btn-agregar-item-ev"
                    data-id="${ev.id}"
                    style="padding:4px 10px;font-size:0.8rem;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">add</span>
                    Agregar
                </button>
            </div>
            ${checklistHTML}
        </div>
    </div>`;
}

// Reemplaza solo la card afectada sin recargar todo
function rerenderCard(ev) {
    const cardEl = document.querySelector(`[data-evento-id="${ev.id}"]`);
    if (!cardEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildEventoCard(ev);
    cardEl.replaceWith(tmp.firstElementChild);
}

// ─── Delegación de eventos en Ver Eventos ─────────────────────────────────────
document.getElementById('listaEventosActivos').addEventListener('click', async (e) => {
    // Editar evento (admin)
    const btnEdit = e.target.closest('.btn-editar-evento');
    if (btnEdit) { abrirEditarEvento(Number(btnEdit.dataset.id)); return; }

    // Terminar evento (admin)
    const btnTerm = e.target.closest('.btn-terminar-evento');
    if (btnTerm) { abrirTerminarEvento(Number(btnTerm.dataset.id)); return; }

    // Agregar item al checklist
    const btnAgregar = e.target.closest('.btn-agregar-item-ev');
    if (btnAgregar) { abrirAgregarItem(Number(btnAgregar.dataset.id)); return; }

    // Activar edición de cantidad
    const btnEditQty = e.target.closest('.btn-edit-qty');
    if (btnEditQty) {
        const ctrl = btnEditQty.closest('.qty-control');
        ctrl.querySelector('.qty-val').style.display = 'none';
        btnEditQty.style.display = 'none';
        const zone = ctrl.querySelector('.qty-edit-zone');
        zone.style.display = 'flex';
        zone.querySelector('.qty-input').focus();
        return;
    }

    // Cancelar edición de cantidad
    const btnCancelQty = e.target.closest('.btn-cancel-qty');
    if (btnCancelQty) {
        const ctrl = btnCancelQty.closest('.qty-control');
        ctrl.querySelector('.qty-edit-zone').style.display = 'none';
        ctrl.querySelector('.qty-val').style.display = '';
        ctrl.querySelector('.btn-edit-qty').style.display = '';
        return;
    }

    // Guardar cantidad
    const btnSaveQty = e.target.closest('.btn-save-qty');
    if (btnSaveQty) {
        const ctrl      = btnSaveQty.closest('.qty-control');
        const eventoId  = Number(ctrl.dataset.eventoId);
        const itemId    = Number(ctrl.dataset.itemId);
        const newQty    = parseInt(ctrl.querySelector('.qty-input').value, 10);
        if (!newQty || newQty <= 0) { showToast('La cantidad debe ser mayor a 0', 'error'); return; }
        btnSaveQty.disabled = true;
        try {
            const res  = await fetch(`${API}/eventos/${eventoId}/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad: newQty })
            });
            const data = await res.json();
            if (!data.ok) { showToast(data.mensaje || 'Error al actualizar', 'error'); }
            else {
                showToast('Cantidad actualizada');
                const ev = eventosActivos.find(e => e.id === eventoId);
                if (ev) {
                    const item = ev.checklist.find(i => i.id === itemId);
                    if (item) item.cantidad = newQty;
                    rerenderCard(ev);
                }
                await loadProductos();
            }
        } catch (_) { showToast('Error de conexión', 'error'); }
        finally { btnSaveQty.disabled = false; }
        return;
    }

    // Eliminar item del checklist
    const btnDel = e.target.closest('.btn-del-item');
    if (btnDel) {
        eliminandoItem = {
            eventoId:  Number(btnDel.dataset.eventoId),
            itemId:    Number(btnDel.dataset.itemId),
            nombre:    btnDel.dataset.nombre,
            cantidad:  btnDel.dataset.cantidad
        };
        document.getElementById('msgEliminarItem').textContent =
            `¿Eliminar "${eliminandoItem.nombre}" del checklist? ` +
            `Se devolverán ${Math.round(eliminandoItem.cantidad)} al inventario.`;
        abrirModal('modalEliminarItem');
        return;
    }
});

// ─── Historial ────────────────────────────────────────────────────────────────
async function loadHistorial() {
    try {
        const res  = await fetch(`${API}/eventos/historial`);
        const data = await res.json();
        const tbody = document.getElementById('tbodyHistorial');
        if (!data.ok || !data.data.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">
                No hay eventos en el historial.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.data.map(ev => `
            <tr>
                <td>${escapeHtml(ev.nombre)}</td>
                <td>${formatFecha(ev.fecha)}</td>
                <td>${escapeHtml(ev.responsable)}</td>
                <td>${ev.terminado_en || '—'}</td>
            </tr>`).join('');
    } catch (_) { showToast('Error al cargar historial', 'error'); }
}

// ─── Crear Evento — Step 1 ────────────────────────────────────────────────────
function resetCrearEvento() {
    document.getElementById('formEventoInfo').reset();
    document.getElementById('stepInfo').style.display = '';
    document.getElementById('stepChecklist').style.display = 'none';
    hideAlert('alertCrear');
    checklistBuilder = [];
    catFilterActiva  = 'taller';
}

document.getElementById('formEventoInfo').addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert('alertCrear');
    const nombre      = document.getElementById('eventoNombre').value.trim();
    const fecha       = document.getElementById('eventoFecha').value;
    const responsable = document.getElementById('eventoResponsable').value.trim();
    if (!nombre || !fecha || !responsable) {
        showAlert('alertCrear', 'Todos los campos son obligatorios');
        return;
    }
    document.getElementById('summNombre').textContent      = nombre;
    document.getElementById('summFecha').textContent       = formatFechaLarga(fecha);
    document.getElementById('summResponsable').textContent = responsable;
    document.getElementById('stepInfo').style.display     = 'none';
    document.getElementById('stepChecklist').style.display = '';
    iniciarChecklistBuilder();
});

document.getElementById('btnVolverInfo').addEventListener('click', () => {
    document.getElementById('stepInfo').style.display     = '';
    document.getElementById('stepChecklist').style.display = 'none';
});

document.getElementById('btnCancelarInfo').addEventListener('click',      () => window._activarTab('ver'));
document.getElementById('btnCancelarChecklist').addEventListener('click', () => window._activarTab('ver'));

// ─── Crear Evento — Step 2 (Checklist Builder) ────────────────────────────────
function iniciarChecklistBuilder() {
    // Pre-cargar productos con es_evento = 1
    checklistBuilder = productosInv
        .filter(p => p.es_evento)
        .map(p => ({
            producto_id:   p.id,
            nombre:        p.nombre,
            categoria:     p.categoria,
            unidad_medida: p.unidad_medida,
            cantidad:      1,
            stock:         Number(p.cantidad)
        }));

    // Reset filtro de categoría
    catFilterActiva = 'taller';
    document.querySelectorAll('.cat-filter').forEach((btn, i) => {
        btn.classList.toggle('active', i === 0);
    });

    renderChecklistBuilder();
    renderPanelAgregarMas();
}

// Filtros de categoría en "Agregar más" (se setean una vez al cargar el DOM)
document.querySelectorAll('.cat-filter').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.cat-filter').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        catFilterActiva = this.dataset.cat;
        renderPanelAgregarMas();
    });
});

function renderChecklistBuilder() {
    const tbody = document.getElementById('tbodyChecklist');
    const count = document.getElementById('countChecklist');
    count.textContent = `${checklistBuilder.length} producto${checklistBuilder.length !== 1 ? 's' : ''}`;

    if (!checklistBuilder.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">
            No hay productos en el checklist.</td></tr>`;
        return;
    }

    tbody.innerHTML = checklistBuilder.map(item => `
        <tr data-pid="${item.producto_id}">
            <td>${escapeHtml(item.nombre)}</td>
            <td>${escapeHtml(item.categoria)}</td>
            <td>${escapeHtml(item.unidad_medida)}</td>
            <td style="color:${item.stock <= 0 ? 'var(--red-alert)' : 'var(--text-dark)'};">
                ${item.stock}${item.stock <= 0 ? ' <span style="font-size:0.75rem;">(sin stock)</span>' : ''}
            </td>
            <td>
                <input type="number" class="qty-builder-input" data-pid="${item.producto_id}"
                    value="${item.cantidad}" min="1" max="${item.stock}" step="1"
                    style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;"
                    ${item.stock <= 0 ? 'disabled' : ''} />
            </td>
            <td>
                <button class="btn-action btn-delete btn-quitar-builder"
                    data-pid="${item.producto_id}" title="Quitar del checklist">
                    <span class="material-symbols-outlined" style="font-size:1rem;">close</span>
                </button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.qty-builder-input').forEach(input => {
        input.addEventListener('change', function () {
            const pid  = Number(this.dataset.pid);
            const item = checklistBuilder.find(i => i.producto_id === pid);
            if (item) item.cantidad = parseInt(this.value, 10) || 1;
        });
    });

    tbody.querySelectorAll('.btn-quitar-builder').forEach(btn => {
        btn.addEventListener('click', function () {
            const pid = Number(this.dataset.pid);
            checklistBuilder = checklistBuilder.filter(i => i.producto_id !== pid);
            renderChecklistBuilder();
            renderPanelAgregarMas();
        });
    });
}

function renderPanelAgregarMas() {
    const idsEnChecklist = new Set(checklistBuilder.map(i => i.producto_id));
    const filtrados = productosInv.filter(p => {
        if (idsEnChecklist.has(p.id)) return false;
        if (catFilterActiva === 'taller')   return !!p.es_taller;
        if (catFilterActiva === 'evento')   return !!p.es_evento;
        return !!p.es_producto;
    });

    const tbody = document.getElementById('tbodyAgregarMas');
    if (!filtrados.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted);">
            No hay más productos disponibles en esta categoría.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(p => `
        <tr>
            <td>${escapeHtml(p.nombre)}</td>
            <td>${escapeHtml(p.categoria)}</td>
            <td>${escapeHtml(p.unidad_medida)}</td>
            <td style="color:${Number(p.cantidad) <= 0 ? 'var(--red-alert)' : ''};">${p.cantidad}</td>
            <td>
                <input type="number" id="qmas-${p.id}" value="1"
                    min="1" max="${p.cantidad}" step="1"
                    style="width:70px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;"
                    ${Number(p.cantidad) <= 0 ? 'disabled' : ''} />
            </td>
            <td>
                <button class="btn-action btn-edit btn-add-mas" data-pid="${p.id}"
                    title="Agregar al checklist"
                    ${Number(p.cantidad) <= 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">add</span>
                </button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-add-mas').forEach(btn => {
        btn.addEventListener('click', function () {
            const pid     = Number(this.dataset.pid);
            const prod    = productosInv.find(p => p.id === pid);
            const qInput  = document.getElementById(`qmas-${pid}`);
            const cantidad = parseInt(qInput?.value, 10) || 1;
            if (!prod) return;
            checklistBuilder.push({
                producto_id:   prod.id,
                nombre:        prod.nombre,
                categoria:     prod.categoria,
                unidad_medida: prod.unidad_medida,
                cantidad,
                stock: Number(prod.cantidad)
            });
            renderChecklistBuilder();
            renderPanelAgregarMas();
        });
    });
}

document.getElementById('btnFinalizarEvento').addEventListener('click', async () => {
    hideAlert('alertChecklist');
    if (!checklistBuilder.length) {
        showAlert('alertChecklist', 'El checklist no puede estar vacío');
        return;
    }
    for (const item of checklistBuilder) {
        if (item.cantidad <= 0) {
            showAlert('alertChecklist', `La cantidad de "${item.nombre}" debe ser mayor a 0`);
            return;
        }
        if (item.cantidad > item.stock) {
            showAlert('alertChecklist',
                `Stock insuficiente para "${item.nombre}" (disponible: ${item.stock})`);
            return;
        }
    }

    const btn = document.getElementById('btnFinalizarEvento');
    btn.disabled = true; btn.textContent = 'Creando evento…';

    const payload = {
        nombre:      document.getElementById('eventoNombre').value.trim(),
        fecha:       document.getElementById('eventoFecha').value,
        responsable: document.getElementById('eventoResponsable').value.trim(),
        items:       checklistBuilder.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad }))
    };

    try {
        const res  = await fetch(`${API}/eventos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertChecklist', data.mensaje || 'Error al crear el evento');
        } else {
            showToast('Evento creado exitosamente');
            resetCrearEvento();
            window._activarTab('ver');
            await Promise.all([loadEventosActivos(), loadProductos()]);
        }
    } catch (_) {
        showAlert('alertChecklist', 'Error de conexión. Intenta de nuevo.');
    } finally {
        btn.disabled = false; btn.textContent = 'Crear Evento';
    }
});

// ─── Editar Info del Evento (Admin) ──────────────────────────────────────────
function abrirEditarEvento(id) {
    const ev = eventosActivos.find(e => e.id === id);
    if (!ev) return;
    editandoId = id;
    document.getElementById('editEventoId').value           = id;
    document.getElementById('editEventoNombre').value       = ev.nombre;
    document.getElementById('editEventoFecha').value        = ev.fecha;
    document.getElementById('editEventoResponsable').value  = ev.responsable;
    hideAlert('alertEditarEvento');
    abrirModal('modalEditarEvento');
}

document.getElementById('btnCerrarEditarEvento').addEventListener('click',   () => cerrarModal('modalEditarEvento'));
document.getElementById('btnCancelarEditarEvento').addEventListener('click', () => cerrarModal('modalEditarEvento'));

document.getElementById('formEditarEvento').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alertEditarEvento');
    const payload = {
        nombre:      document.getElementById('editEventoNombre').value.trim(),
        fecha:       document.getElementById('editEventoFecha').value,
        responsable: document.getElementById('editEventoResponsable').value.trim()
    };
    if (!payload.nombre || !payload.fecha || !payload.responsable) {
        showAlert('alertEditarEvento', 'Todos los campos son obligatorios');
        return;
    }
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
        const res  = await fetch(`${API}/eventos/${editandoId}/info`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertEditarEvento', data.mensaje || 'Error al actualizar');
        } else {
            const ev = eventosActivos.find(e => e.id === editandoId);
            if (ev) {
                ev.nombre = payload.nombre;
                ev.fecha  = payload.fecha;
                ev.responsable = payload.responsable;
                rerenderCard(ev);
            }
            cerrarModal('modalEditarEvento');
            showToast('Evento actualizado correctamente');
        }
    } catch (_) { showAlert('alertEditarEvento', 'Error de conexión'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; editandoId = null; }
});

// ─── Terminar Evento (Admin) ──────────────────────────────────────────────────
function abrirTerminarEvento(id) {
    const ev = eventosActivos.find(e => e.id === id);
    if (!ev) return;
    terminandoId = id;
    hideAlert('alertTerminar');

    const tbody = document.getElementById('tbodyTerminar');
    tbody.innerHTML = ev.checklist.length
        ? ev.checklist.map(item => `
            <tr>
                <td><input type="checkbox" class="chk-devolver" data-item-id="${item.id}" checked /></td>
                <td>
                    ${escapeHtml(item.producto_nombre)}
                    <br><span style="font-size:0.75rem;color:var(--text-muted);">
                        ${escapeHtml(item.categoria)}</span>
                </td>
                <td style="text-align:right;font-size:0.88rem;">
                    ${Math.round(item.cantidad)} ${escapeHtml(item.unidad_medida)}
                </td>
                <td>
                    <input type="number" class="input-devolver" data-item-id="${item.id}"
                        value="${Math.round(item.cantidad)}" min="0" max="${Math.round(item.cantidad)}" step="1"
                        style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;" />
                </td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">
               El checklist está vacío.</td></tr>`;

    document.getElementById('checkTodosDevolver').checked = true;
    document.getElementById('checkTodosDevolver').onchange = function () {
        document.querySelectorAll('.chk-devolver').forEach(cb => { cb.checked = this.checked; });
    };
    abrirModal('modalTerminarEvento');
}

document.getElementById('btnCerrarTerminarEvento').addEventListener('click',   () => cerrarModal('modalTerminarEvento'));
document.getElementById('btnCancelarTerminarEvento').addEventListener('click', () => cerrarModal('modalTerminarEvento'));

document.getElementById('btnConfirmarTerminar').addEventListener('click', async () => {
    const retornos = [];
    document.querySelectorAll('.chk-devolver:checked').forEach(cb => {
        const itemId = Number(cb.dataset.itemId);
        const qty    = parseInt(
            document.querySelector(`.input-devolver[data-item-id="${itemId}"]`)?.value || 0, 10
        );
        if (qty > 0) retornos.push({ item_id: itemId, cantidad_retorno: qty });
    });

    const btn = document.getElementById('btnConfirmarTerminar');
    btn.disabled = true; btn.textContent = 'Terminando…';
    try {
        const res  = await fetch(`${API}/eventos/${terminandoId}/terminar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retornos })
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertTerminar', data.mensaje || 'Error al terminar el evento', 'error');
        } else {
            cerrarModal('modalTerminarEvento');
            showToast('Evento terminado y guardado en historial');
            await Promise.all([loadEventosActivos(), loadProductos()]);
        }
    } catch (_) { showAlert('alertTerminar', 'Error de conexión', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Terminar evento definitivamente'; terminandoId = null; }
});

// ─── Eliminar Item del Checklist ──────────────────────────────────────────────
document.getElementById('btnConfirmarEliminarItem').addEventListener('click', async () => {
    if (!eliminandoItem) return;
    const btn = document.getElementById('btnConfirmarEliminarItem');
    btn.disabled = true; btn.textContent = 'Eliminando…';
    try {
        const res  = await fetch(
            `${API}/eventos/${eliminandoItem.eventoId}/items/${eliminandoItem.itemId}`,
            { method: 'DELETE' }
        );
        const data = await res.json();
        if (!data.ok) { showToast(data.mensaje || 'Error al eliminar', 'error'); }
        else {
            showToast('Producto eliminado del checklist');
            cerrarModal('modalEliminarItem');
            const ev = eventosActivos.find(e => e.id === eliminandoItem.eventoId);
            if (ev) {
                ev.checklist = ev.checklist.filter(i => i.id !== eliminandoItem.itemId);
                rerenderCard(ev);
            }
            await loadProductos();
        }
    } catch (_) { showToast('Error de conexión', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Sí, eliminar'; eliminandoItem = null; }
});

document.getElementById('btnCancelarEliminarItem').addEventListener('click', () => {
    cerrarModal('modalEliminarItem');
    eliminandoItem = null;
});

// ─── Agregar Item a Evento Existente ─────────────────────────────────────────
function abrirAgregarItem(eventoId) {
    agregandoItemEvId = eventoId;
    hideAlert('alertAgregarItem');
    document.getElementById('buscarItemAgregar').value = '';
    renderTablaAgregarItem('');
    abrirModal('modalAgregarItem');
}

function renderTablaAgregarItem(query) {
    const ev           = eventosActivos.find(e => e.id === agregandoItemEvId);
    const idsPresentes = new Set((ev?.checklist || []).map(i => i.producto_id));
    const q            = query.toLowerCase();
    const disponibles  = productosInv.filter(p =>
        !idsPresentes.has(p.id) &&
        (p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
    );
    const tbody = document.getElementById('tbodyAgregarItem');
    if (!disponibles.length) {
        tbody.innerHTML = `<tr><td colspan="5"
            style="text-align:center;padding:16px;color:var(--text-muted);">
            No hay productos disponibles.</td></tr>`;
        return;
    }
    tbody.innerHTML = disponibles.map(p => `
        <tr>
            <td>${escapeHtml(p.nombre)}</td>
            <td>${escapeHtml(p.categoria)}</td>
            <td style="color:${Number(p.cantidad) <= 0 ? 'var(--red-alert)' : ''};">${p.cantidad}</td>
            <td>
                <input type="number" id="qai-${p.id}" value="1"
                    min="1" max="${p.cantidad}" step="1"
                    style="width:70px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;"
                    ${Number(p.cantidad) <= 0 ? 'disabled' : ''} />
            </td>
            <td>
                <button class="btn-action btn-edit btn-add-a-ev" data-pid="${p.id}"
                    title="Agregar" ${Number(p.cantidad) <= 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">add</span>
                </button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-add-a-ev').forEach(btn => {
        btn.addEventListener('click', async function () {
            const pid     = Number(this.dataset.pid);
            const cantidad = parseInt(document.getElementById(`qai-${pid}`)?.value, 10) || 1;
            this.disabled = true;
            hideAlert('alertAgregarItem');
            try {
                const res  = await fetch(`${API}/eventos/${agregandoItemEvId}/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ producto_id: pid, cantidad })
                });
                const data = await res.json();
                if (!data.ok) {
                    showAlert('alertAgregarItem', data.mensaje || 'Error al agregar');
                    this.disabled = false;
                } else {
                    showToast('Producto agregado al checklist');
                    const ev   = eventosActivos.find(e => e.id === agregandoItemEvId);
                    const prod = productosInv.find(p => p.id === pid);
                    if (ev && prod) {
                        ev.checklist.push({
                            id:              data.id,
                            producto_id:     pid,
                            producto_nombre: prod.nombre,
                            categoria:       prod.categoria,
                            unidad_medida:   prod.unidad_medida,
                            cantidad
                        });
                        rerenderCard(ev);
                    }
                    await loadProductos();
                    renderTablaAgregarItem(document.getElementById('buscarItemAgregar').value);
                }
            } catch (_) {
                showAlert('alertAgregarItem', 'Error de conexión');
                this.disabled = false;
            }
        });
    });
}

document.getElementById('buscarItemAgregar').addEventListener('input', function () {
    renderTablaAgregarItem(this.value);
});

document.getElementById('btnCerrarAgregarItem').addEventListener('click',       () => cerrarModal('modalAgregarItem'));
document.getElementById('btnCerrarAgregarItemFooter').addEventListener('click', () => cerrarModal('modalAgregarItem'));

// ─── Cierre modales por clic en overlay ──────────────────────────────────────
['modalEditarEvento', 'modalTerminarEvento', 'modalEliminarItem', 'modalAgregarItem'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
        if (e.target.id === id) cerrarModal(id);
    });
});

// ─── Inicialización ───────────────────────────────────────────────────────────
(async () => {
    await initSession();
    await loadProductos();
    setupTabs();
    await loadEventosActivos();
})();
