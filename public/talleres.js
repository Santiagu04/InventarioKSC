/**
 * talleres.js — InventarioKSC
 * Módulo de Talleres: Crear, Ver, Historial.
 * Compatible con rol administrador y auxiliar.
 */

const API = '/api';

// ─── Descripciones predeterminadas por tipo ──────────────────────────────────
const DESCRIPCIONES_TALLER = {
    'Trazando':
        'Recorrido por la cadena y trazabilidad del café: desde la finca hasta la taza. ' +
        'Se explica el origen, las variedades, los procesos, el impacto social y ambiental, ' +
        'y tips de cómo reconocer cafés de calidad.\n' +
        'Incluye: Muestras de varios pasos del proceso del café, cata básica, conversación guiada.\n' +
        'Duración: 2 horas.',

    'Métodos de preparación':
        'Experiencia teórico práctica sobre diferentes herramientas para preparar café. ' +
        'Desde su historia, demostración en vivo, guía práctica y degustación. ' +
        'Se debe escoger mínimo 2 métodos.\n' +
        'Opciones:\n' +
        '• Prensa Francesa.\n• Moka italiana.\n• V60.\n• Melita.\n• Aeropress.\n• Máquina Espresso.\n' +
        'Duración: 1 a 3 horas.',

    'Cataciones sensoriales':
        'Talleres de exploración sensorial, reconocimiento en boca, rueda de sabores, perfiles de sabor.\n' +
        'Incluye: Degustación sensorial con frutas, cata de café, material educativo.\n' +
        'Duración: 2 horas.',

    'Bebidas a base de café':
        'En este taller conoceremos las distintas preparaciones y bebidas más conocidas en las cafeterías, ' +
        'su historia, tips, degustación, práctica.\n' +
        'Incluye: Insumos para las preparaciones, degustaciones.\n' +
        'Duración: 2 a 4 horas.',

    'Aprovechamiento de residuos':
        'Taller de sostenibilidad y creatividad en torno a varios de los residuos de la industria del café. ' +
        'Incluye práctica y charla sobre economía circular.\n' +
        'Subtemas:\n' +
        '• Papel artesanal con cáscara de café.\n• Macetas con borra de café.\n' +
        '• Abono con borra y residuos del café.\n• Pacas biodigestoras con cisco del café.\n' +
        'Duración: 2 a 4 horas.',

    'Tour comuna 1': ''
};

// ─── Estado global ───────────────────────────────────────────────────────────
let rolUsuario          = null;
let productosInv        = [];
let checklistBuilder    = [];
let catFilterActiva     = 'taller';
let talleresActivos     = [];
let eliminandoItem      = null;
let terminandoId        = null;
let editandoId          = null;
let agregandoItemTallId = null;

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

// ─── Autocompletar descripción al cambiar tipo ────────────────────────────────
function bindDescripcionAuto(selectId, textareaId) {
    const sel = document.getElementById(selectId);
    const ta  = document.getElementById(textareaId);
    if (!sel || !ta) return;
    sel.addEventListener('change', () => {
        ta.value = DESCRIPCIONES_TALLER[sel.value] ?? '';
    });
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

        // Nav Eventos
        document.getElementById('navEventos').addEventListener('click', () => {
            window.location.href = '/eventos';
        });

        // Dropdown: Gestión de usuarios (solo admin)
        if (rolUsuario === 'administrador') {
            const btnGestion = document.getElementById('btnAdminUsuariosTal');
            btnGestion.style.display = '';
            btnGestion.addEventListener('click', () => {
                window.location.href = '/inventario';
            });
        }

        // Dropdown: Actualizar contraseña
        const userDropdown = document.getElementById('userDropdown');
        document.getElementById('btnCambiarPassTal').addEventListener('click', () => {
            userDropdown.classList.remove('open');
            document.getElementById('formCambiarPassTal').reset();
            document.getElementById('modalPassTalAlert').className = 'form-alert';
            abrirModal('modalPassTal');
        });
        document.getElementById('btnCerrarModalPassTal').addEventListener('click', () => cerrarModal('modalPassTal'));

        document.getElementById('formCambiarPassTal').addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertEl = document.getElementById('modalPassTalAlert');
            alertEl.className = 'form-alert';
            const oldP = document.getElementById('oldPassTal').value;
            const newP = document.getElementById('newPassTal').value;
            if (newP.length < 6) {
                alertEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres';
                alertEl.className = 'form-alert error visible'; return;
            }
            const btn = e.submitter; btn.disabled = true; btn.textContent = 'Actualizando…';
            try {
                const r    = await fetch(`${API}/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword: oldP, newPassword: newP })
                });
                const d = await r.json();
                if (!d.ok) {
                    alertEl.textContent = d.mensaje || 'Error al actualizar contraseña';
                    alertEl.className = 'form-alert error visible';
                } else {
                    cerrarModal('modalPassTal');
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

        // User dropdown toggle
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
    const container     = document.getElementById('tabsContainer');
    const paneCrear     = document.getElementById('paneCrear');
    const paneVer       = document.getElementById('paneVer');
    const paneHistorial = document.getElementById('paneHistorial');

    const tabs = rolUsuario === 'administrador'
        ? [
            { id: 'tabCrear',    label: 'Crear Taller', pane: 'crear'    },
            { id: 'tabVer',      label: 'Ver Talleres', pane: 'ver'      },
            { id: 'tabHistorial',label: 'Historial',    pane: 'historial'},
          ]
        : [
            { id: 'tabVer',      label: 'Ver Talleres', pane: 'ver'      },
            { id: 'tabHistorial',label: 'Historial',    pane: 'historial'},
          ];

    container.innerHTML = tabs.map(t =>
        `<button class="tab-btn${t.pane === 'ver' ? ' active' : ''}" id="${t.id}"
                 data-pane="${t.pane}" role="tab"
                 aria-selected="${t.pane === 'ver'}">${t.label}</button>`
    ).join('');

    const panesMap = { crear: paneCrear, ver: paneVer, historial: paneHistorial };

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
        if (paneName === 'ver')       loadTalleresActivos();
        if (paneName === 'crear')     resetCrearTaller();
    }

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

// ─── Ver Talleres ─────────────────────────────────────────────────────────────
async function loadTalleresActivos() {
    try {
        const res  = await fetch(`${API}/talleres/activos`);
        const data = await res.json();
        if (data.ok) { talleresActivos = data.data; renderTalleresActivos(); }
    } catch (_) { showToast('Error al cargar talleres', 'error'); }
}

function renderTalleresActivos() {
    const container = document.getElementById('listaTalleresActivos');
    if (!talleresActivos.length) {
        container.innerHTML = `
        <div class="eventos-empty card" style="padding:40px;">
            <span class="material-symbols-outlined">school</span>
            <p>No hay talleres activos.</p>
            ${rolUsuario === 'administrador'
                ? `<button class="btn-save" style="margin-top:16px;"
                       onclick="window._activarTab('crear')">+ Crear primer taller</button>`
                : ''}
        </div>`;
        return;
    }
    container.innerHTML = `<div class="eventos-grid">${
        talleresActivos.map(t => buildTallerCard(t)).join('')
    }</div>`;
}

function buildTallerCard(taller) {
    const esAdmin = rolUsuario === 'administrador';

    const checklistRows = taller.checklist.map(item => `
        <tr>
            <td>${escapeHtml(item.producto_nombre)}</td>
            <td>${escapeHtml(item.categoria)}</td>
            <td>${escapeHtml(item.unidad_medida)}</td>
            <td>
                <div class="qty-control" data-taller-id="${taller.id}" data-item-id="${item.id}">
                    <span class="qty-val">${Math.round(item.cantidad)}</span>
                    <div class="qty-edit-zone" style="display:none;align-items:center;gap:4px;">
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
                    data-taller-id="${taller.id}" data-item-id="${item.id}"
                    data-nombre="${escapeHtml(item.producto_nombre)}"
                    data-cantidad="${Math.round(item.cantidad)}"
                    title="Eliminar del checklist">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">remove_circle</span>
                </button>
            </td>
        </tr>`).join('');

    const checklistHTML = taller.checklist.length
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

    const notasHTML = taller.notas
        ? `<div style="font-size:0.82rem;color:var(--text-muted);font-style:italic;margin-top:6px;">
               <span class="material-symbols-outlined" style="font-size:0.85rem;vertical-align:middle;">notes</span>
               ${escapeHtml(taller.notas)}</div>`
        : '';

    return `
    <div class="evento-card" data-taller-id="${taller.id}">
        <div class="evento-card-header">
            <div class="evento-card-info">
                <div class="evento-nombre">${escapeHtml(taller.tipo_taller)}</div>
                <div class="evento-meta">
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">calendar_today</span>
                        ${formatFechaLarga(taller.fecha)}
                    </span>
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">location_on</span>
                        ${escapeHtml(taller.lugar)}
                    </span>
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">person</span>
                        ${escapeHtml(taller.responsable)}
                    </span>
                    <span>
                        <span class="material-symbols-outlined"
                            style="font-size:0.9rem;vertical-align:middle;">group</span>
                        ${taller.num_asistentes} asistentes
                    </span>
                </div>
                ${notasHTML}
            </div>
            <div class="evento-card-actions">
                ${esAdmin ? `
                <button class="btn-action btn-edit btn-editar-taller"
                    data-id="${taller.id}" title="Editar datos del taller">
                    <span class="material-symbols-outlined" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn-terminar btn-terminar-taller" data-id="${taller.id}">
                    <span class="material-symbols-outlined"
                        style="font-size:0.9rem;vertical-align:middle;">task_alt</span>
                    Terminar
                </button>` : ''}
            </div>
        </div>
        <div class="evento-checklist">
            <div class="checklist-header">
                <span>Checklist</span>
                <button class="btn-action btn-edit btn-agregar-item-tal"
                    data-id="${taller.id}"
                    style="padding:4px 10px;font-size:0.8rem;display:flex;align-items:center;gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">add</span>
                    Agregar
                </button>
            </div>
            ${checklistHTML}
        </div>
    </div>`;
}

function rerenderCard(taller) {
    const cardEl = document.querySelector(`[data-taller-id="${taller.id}"]`);
    if (!cardEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildTallerCard(taller);
    cardEl.replaceWith(tmp.firstElementChild);
}

// ─── Delegación de eventos en Ver Talleres ────────────────────────────────────
document.getElementById('listaTalleresActivos').addEventListener('click', async (e) => {
    const btnEdit = e.target.closest('.btn-editar-taller');
    if (btnEdit) { abrirEditarTaller(Number(btnEdit.dataset.id)); return; }

    const btnTerm = e.target.closest('.btn-terminar-taller');
    if (btnTerm) { abrirTerminarTaller(Number(btnTerm.dataset.id)); return; }

    const btnAgregar = e.target.closest('.btn-agregar-item-tal');
    if (btnAgregar) { abrirAgregarItem(Number(btnAgregar.dataset.id)); return; }

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

    const btnCancelQty = e.target.closest('.btn-cancel-qty');
    if (btnCancelQty) {
        const ctrl = btnCancelQty.closest('.qty-control');
        ctrl.querySelector('.qty-edit-zone').style.display = 'none';
        ctrl.querySelector('.qty-val').style.display = '';
        ctrl.querySelector('.btn-edit-qty').style.display = '';
        return;
    }

    const btnSaveQty = e.target.closest('.btn-save-qty');
    if (btnSaveQty) {
        const ctrl     = btnSaveQty.closest('.qty-control');
        const tallerId = Number(ctrl.dataset.tallerId);
        const itemId   = Number(ctrl.dataset.itemId);
        const newQty   = parseInt(ctrl.querySelector('.qty-input').value, 10);
        if (!newQty || newQty <= 0) { showToast('La cantidad debe ser mayor a 0', 'error'); return; }
        btnSaveQty.disabled = true;
        try {
            const res  = await fetch(`${API}/talleres/${tallerId}/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad: newQty })
            });
            const data = await res.json();
            if (!data.ok) { showToast(data.mensaje || 'Error al actualizar', 'error'); }
            else {
                showToast('Cantidad actualizada');
                const t = talleresActivos.find(t => t.id === tallerId);
                if (t) {
                    const item = t.checklist.find(i => i.id === itemId);
                    if (item) item.cantidad = newQty;
                    rerenderCard(t);
                }
                await loadProductos();
            }
        } catch (_) { showToast('Error de conexión', 'error'); }
        finally { btnSaveQty.disabled = false; }
        return;
    }

    const btnDel = e.target.closest('.btn-del-item');
    if (btnDel) {
        eliminandoItem = {
            tallerId: Number(btnDel.dataset.tallerId),
            itemId:   Number(btnDel.dataset.itemId),
            nombre:   btnDel.dataset.nombre,
            cantidad: btnDel.dataset.cantidad
        };
        document.getElementById('msgEliminarItem').textContent =
            `¿Eliminar "${eliminandoItem.nombre}" del checklist? ` +
            `Se devolverán ${eliminandoItem.cantidad} al inventario.`;
        abrirModal('modalEliminarItem');
        return;
    }
});

// ─── Historial ────────────────────────────────────────────────────────────────
async function loadHistorial() {
    try {
        const res  = await fetch(`${API}/talleres/historial`);
        const data = await res.json();
        const tbody = document.getElementById('tbodyHistorial');
        if (!data.ok || !data.data.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">
                No hay talleres en el historial.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.data.map(t => `
            <tr>
                <td>${escapeHtml(t.tipo_taller)}</td>
                <td>${formatFecha(t.fecha)}</td>
                <td>${escapeHtml(t.lugar)}</td>
                <td>${escapeHtml(t.responsable)}</td>
                <td>${t.num_asistentes}</td>
                <td>${t.terminado_en || '—'}</td>
            </tr>`).join('');
    } catch (_) { showToast('Error al cargar historial', 'error'); }
}

// ─── Crear Taller — Step 1 ────────────────────────────────────────────────────
function resetCrearTaller() {
    document.getElementById('formTallerInfo').reset();
    document.getElementById('tallerDescripcion').value = '';
    document.getElementById('stepInfo').style.display     = '';
    document.getElementById('stepChecklist').style.display = 'none';
    hideAlert('alertCrear');
    checklistBuilder = [];
    catFilterActiva  = 'taller';
}

document.getElementById('formTallerInfo').addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert('alertCrear');
    const tipo        = document.getElementById('tallerTipo').value;
    const asistentes  = parseInt(document.getElementById('tallerAsistentes').value, 10);
    const lugar       = document.getElementById('tallerLugar').value.trim();
    const fecha       = document.getElementById('tallerFecha').value;
    const responsable = document.getElementById('tallerResponsable').value.trim();

    if (!tipo || !asistentes || asistentes < 1 || !lugar || !fecha || !responsable) {
        showAlert('alertCrear', 'Completa todos los campos obligatorios');
        return;
    }

    document.getElementById('summTipo').textContent       = tipo;
    document.getElementById('summFecha').textContent      = formatFechaLarga(fecha);
    document.getElementById('summLugar').textContent      = lugar;
    document.getElementById('summResponsable').textContent = responsable;
    document.getElementById('summAsistentes').textContent = asistentes;

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

// ─── Crear Taller — Step 2 (Checklist Builder) ────────────────────────────────
function iniciarChecklistBuilder() {
    checklistBuilder = productosInv
        .filter(p => p.es_taller)
        .map(p => ({
            producto_id:   p.id,
            nombre:        p.nombre,
            categoria:     p.categoria,
            unidad_medida: p.unidad_medida,
            cantidad:      1,
            stock:         Number(p.cantidad)
        }));

    catFilterActiva = 'taller';
    document.querySelectorAll('.cat-filter').forEach((btn, i) => {
        btn.classList.toggle('active', i === 0);
    });

    renderChecklistBuilder();
    renderPanelAgregarMas();
}

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
        if (catFilterActiva === 'taller')  return !!p.es_taller;
        if (catFilterActiva === 'evento')  return !!p.es_evento;
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

document.getElementById('btnFinalizarTaller').addEventListener('click', async () => {
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

    const btn = document.getElementById('btnFinalizarTaller');
    btn.disabled = true; btn.textContent = 'Creando taller…';

    const payload = {
        tipo_taller:    document.getElementById('tallerTipo').value,
        descripcion:    document.getElementById('tallerDescripcion').value,
        num_asistentes: parseInt(document.getElementById('tallerAsistentes').value, 10),
        lugar:          document.getElementById('tallerLugar').value.trim(),
        fecha:          document.getElementById('tallerFecha').value,
        responsable:    document.getElementById('tallerResponsable').value.trim(),
        notas:          document.getElementById('tallerNotas').value.trim() || null,
        items:          checklistBuilder.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad }))
    };

    try {
        const res  = await fetch(`${API}/talleres`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertChecklist', data.mensaje || 'Error al crear el taller');
        } else {
            showToast('Taller creado exitosamente');
            resetCrearTaller();
            window._activarTab('ver');
            await Promise.all([loadTalleresActivos(), loadProductos()]);
        }
    } catch (_) {
        showAlert('alertChecklist', 'Error de conexión. Intenta de nuevo.');
    } finally {
        btn.disabled = false; btn.textContent = 'Crear Taller';
    }
});

// ─── Editar Info del Taller (Admin) ──────────────────────────────────────────
function abrirEditarTaller(id) {
    const t = talleresActivos.find(t => t.id === id);
    if (!t) return;
    editandoId = id;
    document.getElementById('editTallerId').value            = id;
    document.getElementById('editTallerTipo').value          = t.tipo_taller;
    document.getElementById('editTallerDescripcion').value   = t.descripcion || DESCRIPCIONES_TALLER[t.tipo_taller] || '';
    document.getElementById('editTallerAsistentes').value    = t.num_asistentes;
    document.getElementById('editTallerLugar').value         = t.lugar;
    document.getElementById('editTallerFecha').value         = t.fecha;
    document.getElementById('editTallerResponsable').value   = t.responsable;
    document.getElementById('editTallerNotas').value         = t.notas || '';
    hideAlert('alertEditarTaller');
    abrirModal('modalEditarTaller');
}

document.getElementById('btnCerrarEditarTaller').addEventListener('click',   () => cerrarModal('modalEditarTaller'));
document.getElementById('btnCancelarEditarTaller').addEventListener('click', () => cerrarModal('modalEditarTaller'));

document.getElementById('formEditarTaller').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('alertEditarTaller');
    const payload = {
        tipo_taller:    document.getElementById('editTallerTipo').value,
        descripcion:    document.getElementById('editTallerDescripcion').value,
        num_asistentes: parseInt(document.getElementById('editTallerAsistentes').value, 10),
        lugar:          document.getElementById('editTallerLugar').value.trim(),
        fecha:          document.getElementById('editTallerFecha').value,
        responsable:    document.getElementById('editTallerResponsable').value.trim(),
        notas:          document.getElementById('editTallerNotas').value.trim() || null
    };
    if (!payload.tipo_taller || !payload.num_asistentes || !payload.lugar || !payload.fecha || !payload.responsable) {
        showAlert('alertEditarTaller', 'Completa todos los campos obligatorios');
        return;
    }
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
        const res  = await fetch(`${API}/talleres/${editandoId}/info`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertEditarTaller', data.mensaje || 'Error al actualizar');
        } else {
            const t = talleresActivos.find(t => t.id === editandoId);
            if (t) {
                Object.assign(t, payload);
                rerenderCard(t);
            }
            cerrarModal('modalEditarTaller');
            showToast('Taller actualizado correctamente');
        }
    } catch (_) { showAlert('alertEditarTaller', 'Error de conexión'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; editandoId = null; }
});

// ─── Terminar Taller (Admin) ──────────────────────────────────────────────────
function abrirTerminarTaller(id) {
    const t = talleresActivos.find(t => t.id === id);
    if (!t) return;
    terminandoId = id;
    hideAlert('alertTerminar');

    const tbody = document.getElementById('tbodyTerminar');
    tbody.innerHTML = t.checklist.length
        ? t.checklist.map(item => `
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
    abrirModal('modalTerminarTaller');
}

document.getElementById('btnCerrarTerminarTaller').addEventListener('click',   () => cerrarModal('modalTerminarTaller'));
document.getElementById('btnCancelarTerminarTaller').addEventListener('click', () => cerrarModal('modalTerminarTaller'));

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
        const res  = await fetch(`${API}/talleres/${terminandoId}/terminar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retornos })
        });
        const data = await res.json();
        if (!data.ok) {
            showAlert('alertTerminar', data.mensaje || 'Error al terminar');
        } else {
            cerrarModal('modalTerminarTaller');
            showToast('Taller terminado correctamente');
            talleresActivos = talleresActivos.filter(t => t.id !== terminandoId);
            renderTalleresActivos();
            await loadProductos();
            terminandoId = null;
        }
    } catch (_) { showAlert('alertTerminar', 'Error de conexión'); }
    finally { btn.disabled = false; btn.textContent = 'Terminar taller definitivamente'; }
});

// ─── Confirmar eliminar item ──────────────────────────────────────────────────
document.getElementById('btnConfirmarEliminarItem').addEventListener('click', async () => {
    if (!eliminandoItem) return;
    const btn = document.getElementById('btnConfirmarEliminarItem');
    btn.disabled = true;
    try {
        const res  = await fetch(`${API}/talleres/${eliminandoItem.tallerId}/items/${eliminandoItem.itemId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!data.ok) {
            showToast(data.mensaje || 'Error al eliminar', 'error');
        } else {
            showToast('Producto eliminado del checklist');
            const t = talleresActivos.find(t => t.id === eliminandoItem.tallerId);
            if (t) {
                t.checklist = t.checklist.filter(i => i.id !== eliminandoItem.itemId);
                rerenderCard(t);
            }
            await loadProductos();
            cerrarModal('modalEliminarItem');
            eliminandoItem = null;
        }
    } catch (_) { showToast('Error de conexión', 'error'); }
    finally { btn.disabled = false; }
});

document.getElementById('btnCancelarEliminarItem').addEventListener('click', () => cerrarModal('modalEliminarItem'));

// ─── Agregar Item a Taller Existente ──────────────────────────────────────────
function abrirAgregarItem(tallerId) {
    agregandoItemTallId = tallerId;
    hideAlert('alertAgregarItem');
    document.getElementById('buscarItemAgregar').value = '';
    renderTablaAgregarItem('');
    abrirModal('modalAgregarItem');
}

document.getElementById('buscarItemAgregar').addEventListener('input', function () {
    renderTablaAgregarItem(this.value);
});

function renderTablaAgregarItem(query) {
    const t            = talleresActivos.find(t => t.id === agregandoItemTallId);
    const idsPresentes = new Set((t?.checklist || []).map(i => i.producto_id));
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
                <button class="btn-action btn-edit btn-add-a-tal" data-pid="${p.id}"
                    title="Agregar" ${Number(p.cantidad) <= 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined" style="font-size:0.9rem;">add</span>
                </button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-add-a-tal').forEach(btn => {
        btn.addEventListener('click', async function () {
            const pid      = Number(this.dataset.pid);
            const cantidad = parseInt(document.getElementById(`qai-${pid}`)?.value, 10) || 1;
            this.disabled  = true;
            hideAlert('alertAgregarItem');
            try {
                const res  = await fetch(`${API}/talleres/${agregandoItemTallId}/items`, {
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
                    const taller = talleresActivos.find(t => t.id === agregandoItemTallId);
                    const prod   = productosInv.find(p => p.id === pid);
                    if (taller && prod) {
                        taller.checklist.push({
                            id:              data.id,
                            producto_id:     pid,
                            producto_nombre: prod.nombre,
                            categoria:       prod.categoria,
                            unidad_medida:   prod.unidad_medida,
                            cantidad
                        });
                        rerenderCard(taller);
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

document.getElementById('btnCerrarAgregarItem').addEventListener('click',       () => cerrarModal('modalAgregarItem'));
document.getElementById('btnCerrarAgregarItemFooter').addEventListener('click', () => cerrarModal('modalAgregarItem'));

// ─── Arranque ─────────────────────────────────────────────────────────────────
(async () => {
    await initSession();
    bindDescripcionAuto('tallerTipo',     'tallerDescripcion');
    bindDescripcionAuto('editTallerTipo', 'editTallerDescripcion');
    setupTabs();
    await Promise.all([loadProductos(), loadTalleresActivos()]);
})();
