# AGP: iluminación degradada al pasar el cursor

Investigación del 3 de noviembre de 2026. Alcance: viabilidad y propuesta visual; sin implementación ni prueba visual.

## Estado actual comprobado

En [analysis-view.tsx](../../src/components/analysis-view.tsx), el AGP usa `ComposedChart` de Recharts. Solo P50 tiene una línea explícita, con color según el nivel de glucosa. P5–P95 y P25–P75 se dibujan como áreas sin contorno (`stroke="none"`). Los datos individuales P5, P25, P50, P75 y P95 ya existen en [metrics.ts](../../src/lib/metrics.ts). No hace falta recalcular percentiles ni cambiar el servidor.

La versión instalada comprobada es Recharts 3.8.1; `package.json` declara `^3.6.0`. Sus tipos locales exportan `usePlotArea`, `useActiveTooltipCoordinate` y `getRelativeCoordinate`.

## Propuesta recomendada

Una **franja de iluminación vertical que sigue horizontalmente al cursor**: los cinco percentiles ganan definición en la hora señalada y el énfasis se desvanece hacia ambos lados. La franja no necesita pintar el fondo: solo revela tramos de las curvas. Esto permite comparar la dispersión de todos los percentiles a la misma hora.

Como alternativa, un **halo radial centrado en X/Y** ilumina únicamente los tramos físicamente cercanos al puntero. Se parece más a una linterna, pero puede dejar sin iluminar P5 o P95 si están muy separados verticalmente. Ambas opciones son técnicamente viables; la preferencia visual todavía debe validarse.

## Implementación propuesta

- Mantener las bandas existentes y agregar contornos suaves para P5/P25/P75/P95, con el mismo `type="monotone"`, `connectNulls={false}` y datos. Superponer una capa más intensa que solo aparezca cerca del cursor. La API de [Line](https://recharts.github.io/en-US/api/Line/) admite trazos e interpolación.
- Usar una máscara SVG con un degradado horizontal de opacidad: transparente en los extremos y visible en el centro. Definir `gradientUnits="userSpaceOnUse"`, `maskUnits="userSpaceOnUse"` y `maskContentUnits="userSpaceOnUse"` para compartir coordenadas entre curvas, incluso si sus alturas son distintas. SVG permite aplicar degradados a trazos, y las máscaras permiten graduar su visibilidad. [SVG: degradados](https://www.w3.org/TR/SVG2/pservers.html), [CSS Masking](https://www.w3.org/TR/css-masking-1/#MaskElement).
- Aplicar la máscara a una copia de P50 con su degradado de color original: así aumenta su presencia sin perder los colores que indican niveles de glucosa. Para los demás contornos, conservar los colores de sus bandas.
- Leer la geometría con [usePlotArea](https://recharts.github.io/en-US/api/usePlotArea/). Para seguimiento continuo, obtener coordenadas locales con [getRelativeCoordinate](https://recharts.github.io/en-US/api/getRelativeCoordinate/) y limitar el efecto al área de datos. Comprobar que el `currentTarget` de la captura coincide con el sistema de coordenadas del SVG. Una alternativa sencilla es [useActiveTooltipCoordinate](https://recharts.github.io/en-US/api/useActiveTooltipCoordinate/), aunque el foco puede saltar entre bloques de 30 minutos en lugar de seguir continuamente el puntero.
- La capa decorativa debe usar `pointer-events="none"` para no interferir con el tooltip. Además, excluir las series decorativas del contenido del tooltip y desactivar sus puntos activos. El comportamiento de eventos está definido por [SVG pointer-events](https://www.w3.org/TR/SVG2/interact.html#PointerEventsProperty).

## Rendimiento y cuidado visual

Recomendación de ingeniería, pendiente de medición: aislar el seguimiento del puntero del resto de Análisis y actualizar solo la posición del degradado, como máximo una vez por cuadro si fuera necesario. Empezar sin desenfoque; una línea algo más gruesa y opaca puede dar suficiente luminosidad sin filtros adicionales. Generar identificadores únicos de máscara/degradado para evitar colisiones entre instancias.

El efecto debe ser complementario: conservar la lectura actual, tooltip y navegación por teclado. No depender de hover para transmitir valores. En pantallas táctiles, mantener el comportamiento actual inicialmente; si se incorpora el efecto al arrastrar, comprobar que no impide desplazar la página. Evitar animación autónoma y respetar la preferencia de movimiento reducido si se añaden transiciones.

## Validación pendiente

Probar visualmente en temas claro/oscuro, bordes del día, huecos de datos, distintos tamaños y escalado del navegador; confirmar que los contornos coinciden con las bandas y no aparecen entradas duplicadas en el tooltip. La viabilidad está respaldada por APIs existentes; la intensidad, anchura y suavidad requieren un prototipo para confirmar el resultado estético.

## Implementación local — 3 de noviembre de 2026

Implementada la franja vertical con una máscara SVG compartida por cinco líneas decorativas. El seguimiento usa coordenadas del SVG y actualiza solamente el degradado y su visibilidad, sin estado React por movimiento. El efecto se limita al área de datos, desaparece al salir y no se activa con eventos táctiles. Las series decorativas no participan del tooltip y todos los identificadores SVG del AGP son únicos por instancia.

Validado en navegador con datos sintéticos en tema oscuro: aparecen los cinco contornos con desvanecimiento lateral, el tooltip conserva sus valores y la máscara vuelve a opacidad cero al salir. Pasan la comprobación de tipos, el lint de los dos componentes modificados y 38 pruebas existentes. El lint general falla con 93 errores y 11 advertencias en archivos ajenos al cambio (scripts y work, entre otros). Revisión independiente de estándares y de cumplimiento: sin hallazgos. La validación visual adicional en tema claro, dispositivos táctiles reales y datos con huecos queda pendiente. Sin publicación remota.
