-- ============================================================
-- InventarioKSC — Datos de prueba (seed)
-- Generado automáticamente con hashes reales de bcrypt
-- ============================================================

USE inventarioksc;

INSERT INTO usuarios (nombre, correo, contrasena_hash, rol) VALUES
(
  'Administrador KSC',
  'admin@ksc.com',
  '$2b$10$I4exnf.YZNbQfjixKB3tXupuppNxNUDMiNZp/umlX/Q6ib1qFV/6W',
  'administrador'
),
(
  'Auxiliar KSC',
  'auxiliar@ksc.com',
  '$2b$10$Cf2K7ek4/ThYI0uQPg1OReMPsqNIICqUISiJh9OxJxDyXx/qBZxYS',
  'auxiliar'
);

INSERT INTO productos_insumos (nombre, categoria, cantidad, unidad_medida, precio, stock_minimo, creado_por) VALUES
('Café Geisha 250g',   'Café',   45, 'Unidades', 35000, 10, 1),
('Café Etiopía 500g',  'Café',    8, 'Unidades', 52000, 10, 1),
('Filtros V60',        'Insumo',  0, 'Paquetes',  8000,  5, 1),
('Leche entera 1L',    'Insumo', 30, 'Litros',    4500,  8, 1);
