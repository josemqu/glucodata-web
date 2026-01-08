# Gluco Badge (Chrome Extension)

## Requisitos

- App Next.js corriendo (o desplegada) con el endpoint: `GET /api/latest`
- Variable de entorno en el servidor:

`GLUCO_API_TOKEN=...`

## Instalar en Chrome (unpacked)

1. Abrí `chrome://extensions`
2. Activá **Developer mode**
3. Click en **Load unpacked**
4. Seleccioná la carpeta: `glucodata-web/chrome-extension`

## Configurar

1. En la extensión, abrí **Options**
2. Seteá:

- API URL: `http://localhost:3000/api/latest` (o tu dominio)
- API Token: el mismo que `GLUCO_API_TOKEN`
- Refresco: en segundos

## Notas

- El badge se inyecta en todas las páginas (excepto páginas especiales tipo `chrome://`).
- La flecha se mapea desde `trend` (1..5) igual que tu UI web.
