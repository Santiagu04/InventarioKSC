-- ============================================================
-- InventarioKSC — Esquema de base de datos
-- Motor: MySQL 8+
-- ============================================================
-- Nota: es_taller, es_evento, es_producto, activo se agregan vía migración en db.js
-- Tablas talleres y talleres_items también se crean vía migración en db.js

CREATE DATABASE IF NOT EXISTS inventarioksc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventarioksc;

-- ------------------------------------------------------------
-- Tabla: usuarios
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(120)      NOT NULL,
  correo        VARCHAR(255)      NOT NULL,
  contrasena_hash VARCHAR(255)    NOT NULL,
  rol           ENUM('administrador','auxiliar') NOT NULL DEFAULT 'auxiliar',
  activo        TINYINT(1)        NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_correo (correo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: productos_insumos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos_insumos (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(255)  NOT NULL,
  categoria           VARCHAR(100)  NOT NULL,
  cantidad            DECIMAL(12,3) NOT NULL DEFAULT 0,
  unidad_medida       VARCHAR(50)   NOT NULL,
  precio              DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_minimo        DECIMAL(12,3) NOT NULL DEFAULT 0,
  ultima_actualizacion TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  creado_por          INT UNSIGNED  NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_nombre (nombre),
  CONSTRAINT fk_productos_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios (id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: eventos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(255)  NOT NULL,
  fecha         DATE          NOT NULL,
  responsable   VARCHAR(120)  NOT NULL,
  estado        ENUM('activo','terminado') NOT NULL DEFAULT 'activo',
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminado_en  TIMESTAMP     NULL,

  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla: eventos_items  (checklist por evento)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_items (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  evento_id     INT UNSIGNED    NOT NULL,
  producto_id   INT UNSIGNED    NOT NULL,
  cantidad      INT UNSIGNED    NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  UNIQUE KEY uq_evento_producto (evento_id, producto_id),
  CONSTRAINT fk_ei_evento
    FOREIGN KEY (evento_id) REFERENCES eventos (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ei_producto
    FOREIGN KEY (producto_id) REFERENCES productos_insumos (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;
