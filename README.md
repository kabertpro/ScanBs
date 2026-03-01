# VeriBs — Verificador de Billetes Bolivianos

Aplicación web estática (PWA) para verificar si un billete boliviano (Bs10, Bs20, Bs50) figura en los rangos de series declaradas sin valor legal por el Banco Central de Bolivia.

## Archivos

```
boliviano-checker/
├── index.html          ← Punto de entrada principal
├── styles.css          ← Estilos (dark theme, mobile-first)
├── app.js              ← Lógica + datos embebidos
├── manifest.json       ← Config PWA
├── service-worker.js   ← Cache offline
└── icons/              ← Íconos PWA (agregar manualmente)
    ├── icon-192.png
    └── icon-512.png
```

## Uso

1. Abre `index.html` en cualquier navegador moderno, **o**
2. Sube los archivos a cualquier hosting estático (GitHub Pages, Netlify, etc.)

## Íconos PWA

Para activar la instalación como app nativa, crea la carpeta `icons/` con dos imágenes:
- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

Puedes usar cualquier imagen cuadrada de la bandera de Bolivia o el logo del BCB.

## Funcionalidades

- ✅ Modo manual (offline completo)
- ✅ Modo escáner con OCR (requiere internet para Tesseract.js CDN)
- ✅ Historial de consultas (localStorage)
- ✅ Vibración en resultado inválido
- ✅ Instalable como PWA
- ✅ Cache offline via Service Worker

## Aviso Legal

Verificación referencial basada en datos oficiales del Banco Central de Bolivia.
