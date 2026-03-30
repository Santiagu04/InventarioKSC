# InventarioKSC 📦☕

Sistema de gestión de inventario interno para empresa de café de especialidad.  
Opera 100% digital: pedidos por WhatsApp, eventos corporativos y talleres de barismo.

## Tecnologías

| Capa | Herramienta |
|---|---|
| Frontend | HTML5, CSS3, JavaScript Vanilla |
| Backend | Node.js + Express.js |
| Base de datos | MySQL 8+ |
| Autenticación | express-session + bcrypt |

---

## Estructura del proyecto

```
inventarioksc/
├── public/
│   ├── index.html        ← Pantalla de login
│   ├── inventario.html   ← Panel Administrador
│   ├── auxiliar.html     ← Panel Auxiliar (solo lectura)
│   ├── styles.css        ← Estilos globales (paleta Pantone KSC)
│   └── app.js            ← Lógica frontend (CRUD, filtros, alertas)
├── routes/
│   ├── auth.js           ← Rutas de autenticación
│   └── inventario.js     ← Rutas CRUD de productos
├── controllers/
│   ├── authController.js
│   └── inventarioController.js
├── models/
│   └── db.js             ← Pool de conexiones MySQL
├── database/
│   ├── schema.sql        ← Creación de tablas
│   └── seed.sql          ← Datos de prueba (hashes reales de bcrypt)
├── server.js             ← Punto de entrada Express
├── package.json
└── .env.example          ← Plantilla de variables de entorno
```

---

## Instalación paso a paso

### 1. Clonar / descomprimir el proyecto

Coloca la carpeta `inventarioksc` en la ubicación deseada y abre una terminal dentro de ella.

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y edítalo con tus datos:

```bash
copy .env.example .env
```

Abre `.env` y ajusta los valores:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=tu_contraseña_mysql
DB_NAME=inventarioksc
PORT=3000
SESSION_SECRET=cambia_esto_por_una_cadena_aleatoria_larga
```

### 4. Crear la base de datos y las tablas

Conéctate a MySQL (por ejemplo con MySQL Workbench o la terminal):

```sql
source /ruta/completa/inventarioksc/database/schema.sql
```

### 5. Cargar los datos de prueba

```sql
source /ruta/completa/inventarioksc/database/seed.sql
```

Esto crea:
- **Administrador:** `admin@ksc.com` / `admin123`
- **Auxiliar:** `auxiliar@ksc.com` / `aux123`
- 4 productos de ejemplo (2 OK, 1 bajo stock, 1 crítico)

### 6. Iniciar el servidor

```bash
node server.js
```

O en modo desarrollo con recarga automática:

```bash
npm run dev
```

### 7. Abrir la aplicación

Visita [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## Credenciales de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@ksc.com | admin123 |
| Auxiliar | auxiliar@ksc.com | aux123 |

---

## Roles y permisos

| Función | Administrador | Auxiliar |
|---|:---:|:---:|
| Ver inventario | ✅ | ✅ |
| Buscar / filtrar | ✅ | ✅ |
| Agregar producto | ✅ | ❌ |
| Editar producto | ✅ | ❌ |
| Eliminar producto | ✅ | ❌ |

---

## Alertas de stock (colores de fila)

| Nivel | Condición | Color de fila |
|---|---|---|
| OK | cantidad > stock mínimo | Blanco |
| Bajo stock | cantidad ≤ stock mínimo (pero > 0) | Naranja suave |
| Crítico | cantidad = 0 | Rojo suave |

---

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DB_HOST` | Host de MySQL |
| `DB_PORT` | Puerto (default 3306) |
| `DB_USER` | Usuario de MySQL |
| `DB_PASS` | Contraseña de MySQL |
| `DB_NAME` | Nombre de la base de datos |
| `PORT` | Puerto del servidor Express (default 3000) |
| `SESSION_SECRET` | Clave secreta para firmar sesiones |
