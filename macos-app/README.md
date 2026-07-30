# GlucoBadge para macOS

Badge nativo y flotante que muestra la última glucemia y su tendencia usando el
endpoint `/api/latest` de GlucoData.

El icono utiliza una gota roja minimalista sobre una base neutra redondeada,
siguiendo el lenguaje visual de los iconos modernos de macOS.

## Funciones incluidas

- Ventana sin bordes, arrastrable y siempre al frente.
- Visible en todos los escritorios.
- Visible sobre aplicaciones en pantalla completa de forma predeterminada.
- Interruptor para desactivar la aparición sobre pantalla completa.
- Menú en la barra superior de macOS.
- Token almacenado en el Keychain.
- Inicio automático al iniciar sesión en macOS, configurable.
- Actualización automática configurable.
- Tres tamaños con padding uniforme: Normal, Compacto y Mini.
- Aviso visual cuando el dato tiene más de 15 minutos.

## Ejecutar durante el desarrollo

Requiere macOS 13 o posterior y las Command Line Tools de Apple:

```bash
cd macos-app
swift run GlucoBadge
```

## Crear la aplicación

El script genera `dist.noindex/GlucoBadge.app`, firmado localmente para poder abrirlo
desde Finder:

```bash
chmod +x scripts/build-app.sh
./scripts/build-app.sh
```

Al abrirse por primera vez, elegí **Configuración…** desde el icono de gota en
la barra superior. Ingresá:

1. La URL completa del endpoint, por ejemplo
   `https://tu-dominio.com/api/latest`.
2. El mismo valor configurado como `GLUCO_API_TOKEN` en el servidor.
3. Presioná **Guardar y probar**.

El badge recuerda la última posición donde fue arrastrado.
