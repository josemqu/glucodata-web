# Borrador: acelerar las visualizaciones de Análisis

Estado: pendiente de revisión del usuario antes de publicar en GitHub con `ready-for-agent`.

## Problem Statement

Las visualizaciones de Análisis tardan demasiado en estar disponibles. La espera afecta tanto a la entrada a la vista como a la navegación entre períodos y modos. El usuario quiere una mejora perceptible y una demostración local antes de avanzar con una entrega.

La revisión del código muestra que Perfil borra los resultados al iniciar cada consulta y recorre el historial en páginas secuenciales. Año consulta páginas por lotes y vuelve a solicitar el resumen al montarse. Ambos disponen de caché en memoria del servidor con vigencia de diez minutos. Todavía no se midió cuánto aporta cada etapa a la demora: estas observaciones son candidatas a optimización, no causas demostradas.

## Solution

Mostrar antes las visualizaciones de Perfil y Año y recuperar rápidamente los resultados válidos ya consultados. Mantener una navegación fluida, estados de actualización claros y todos los datos necesarios para calcular el período completo.

Medir antes y después en una compilación de producción ejecutada localmente. Propuesta de aceptación, pendiente de aprobación:

- Reducir al menos un 50% la mediana del tiempo hasta una visualización útil en las cargas sin caché cuyo valor inicial supere un segundo, para cada escenario representativo seleccionado antes de optimizar.
- Mostrar un período o año disponible en caché del cliente en un máximo de 200 ms de mediana, sin esperar otra consulta de red.
- Si una carga inicial ya tarda un segundo o menos, conservar ese nivel y documentar su resultado; no atribuir la mejora de la primera carga a reutilizar datos de una ejecución previa.
- Mantener idénticos los resultados para los mismos datos, umbrales y zona horaria.

## User Stories

1. Como usuario, quiero abrir Análisis más rápido para consultar mis tendencias sin una espera prolongada.
2. Como usuario, quiero ver pronto el Perfil de 7 días para revisar mi situación reciente.
3. Como usuario, quiero consultar 14 días con rapidez para comparar un período más amplio.
4. Como usuario, quiero consultar 30 días con rapidez para reconocer tendencias mensuales.
5. Como usuario, quiero consultar 90 días con rapidez para revisar tendencias de largo plazo.
6. Como usuario, quiero regresar a un período ya consultado inmediatamente para comparar ventanas sin repetir la espera.
7. Como usuario, quiero volver desde Monitor a Análisis y recuperar los resultados vigentes para continuar donde estaba.
8. Como usuario, quiero abrir Año más rápido para explorar mi historial anual.
9. Como usuario, quiero cambiar de año con una respuesta rápida para comparar mi evolución.
10. Como usuario, quiero volver a un año ya consultado rápidamente para retomar su exploración.
11. Como usuario, quiero alternar entre Perfil y Año sin perder resultados reutilizables para explorar con fluidez.
12. Como usuario, quiero que los controles respondan durante la carga para poder cambiar mi selección.
13. Como usuario, quiero que la última selección determine lo mostrado aunque las consultas terminen fuera de orden.
14. Como usuario, quiero distinguir los resultados en actualización para interpretar correctamente su vigencia.
15. Como usuario, quiero que los períodos sin datos se identifiquen correctamente para no confundirlos con una carga pendiente.
16. Como usuario, quiero un error claro y una forma de volver a intentar cuando una consulta falla.
17. Como usuario, quiero conservar la precisión de TIR, GMI, CV, promedio y percentiles al acelerar la vista.
18. Como usuario, quiero que se mantengan los días y horas de mi zona horaria para interpretar los gráficos correctamente.
19. Como usuario, quiero que los cambios de objetivos se reflejen correctamente sin reutilizar cálculos incompatibles.
20. Como usuario, quiero que las nuevas lecturas y correcciones aparezcan tras actualizar los datos para evitar resultados obsoletos.
21. Como usuario, quiero que el historial usado sea completo incluso en períodos grandes para confiar en el análisis.
22. Como usuario, quiero mantener los tooltips y la navegación desde un día del resumen anual hasta Monitor.
23. Como usuario de móvil, quiero que la vista responda con fluidez en una pantalla pequeña.
24. Como usuario, quiero que al cerrar sesión se descarte la información reutilizable de mi sesión para proteger mis datos.
25. Como responsable de la aplicación, quiero ver la mejora funcionando en local y sus mediciones para decidir si cumple el objetivo.

## Implementation Decisions

- Optimizar los dos modos existentes de Análisis: Perfil y Año. Conservar sus controles y significado actual.
- Medir el recorrido completo desde la selección hasta gráficos con datos correctos, dimensiones estables y tooltips utilizables; registrar por separado obtención de datos, cálculo, transferencia y renderizado cuando sea posible.
- Aprovechar las interfaces actuales de consulta histórica y resumen anual. Elegir los cambios del servidor a partir de mediciones; no presuponer que paralelizar o trasladar agregaciones es la solución.
- Reutilizar resultados completos y vigentes por identidad autenticada, paciente, período o año, zona horaria y configuración relevante de objetivos. Evitar consultas simultáneas equivalentes.
- Limitar el tamaño y la vigencia de la caché. La caché del cliente no debe extender la vigencia efectiva de un resultado ya envejecido en el servidor. Descartar entradas incompatibles tras cambios de sesión, paciente, objetivos, zona horaria o modificaciones relevantes de lecturas.
- Al volver a una selección con resultados válidos, mostrarlos sin bloquear por la red. Si se muestran resultados previos durante una actualización, identificar su selección y estado; nunca presentarlos como pertenecientes al nuevo período.
- Mantener la protección existente frente a respuestas obsoletas y extenderla donde haga falta, incluyendo el cierre de sesión durante una consulta.
- Evitar cálculos, transferencias y trabajo de renderizado redundantes cuando la medición muestre que contribuyen a la demora. Mantener el comportamiento de movimiento reducido.
- Conservar la consulta de todas las páginas, el aislamiento entre usuarios y pacientes y los cálculos actuales. Una consulta incompleta o fallida no puede convertirse en un resultado exitoso ni guardarse en caché como tal.
- Si la evidencia requiere cambios de esquema o de contrato, documentarlos y revisar su alcance antes de aplicarlos; esta especificación no presupone migraciones.

## Testing Decisions

- Usar como punto principal de prueba la vista de Análisis en el navegador: entrar, seleccionar períodos, alternar modos, cambiar de año y volver a selecciones consultadas. Verificar comportamiento visible, precisión y tiempos; evitar pruebas acopladas a hooks, mapas internos o número de renders.
- Reutilizar las pruebas existentes de la acción de historial como cobertura de integridad: todas las páginas de 7, 14, 30 y 90 días, exclusión de lecturas ajenas o fuera del período, error en una página posterior y período vacío. Ampliarlas solo para riesgos introducidos.
- Comprobar equivalencia de los resultados de Perfil y Año con el mismo conjunto de lecturas, incluyendo límites del período, medianoche local, huecos y objetivos personalizados.
- Cubrir selección rápida con respuestas fuera de orden, expiración e invalidación, error y reintento, y cierre de sesión con una consulta pendiente.
- Medir con una compilación de producción servida localmente, el mismo navegador, equipo, viewport, datos y condiciones de red antes y después. Fijar los datos y el instante de referencia para que una ventana móvil no cambie entre ejecuciones.
- Elegir antes de optimizar escenarios representativos de Perfil y Año, incluyendo 90 días y un año con historial abundante. Registrar volumen de lecturas, estado de caché de cliente y servidor y al menos cinco repeticiones por escenario; publicar mediana y rango observado.
- Separar caché vacía, caché del servidor disponible y regreso con caché del cliente. Los datos sintéticos sirven para una reproducción controlada, pero deben identificarse; una prueba con consultas simuladas no demuestra una mejora del servidor real.
- Mostrar la aplicación local al usuario y entregar una tabla antes/después, evidencia de navegación y comandos de reproducción. Si no hay acceso a una sesión autenticada o a datos representativos, declarar esa parte pendiente y no afirmar validación completa.
- Comprobar escritorio y un viewport móvil, ausencia de errores de consola, gráficos utilizables y navegación anual a Monitor.

## Out of Scope

- Cambiar fórmulas, umbrales clínicos, colores o interpretación de métricas.
- Cambiar la fuente de datos o el funcionamiento de la sincronización con el proveedor.
- Rediseñar Análisis o añadir nuevas visualizaciones.
- Recortar lecturas para acelerar cálculos o mostrar resultados parciales como definitivos.
- Optimizar otras vistas salvo lo estrictamente necesario para navegar hacia Análisis y volver.
- Desplegar a producción como parte de la prueba local.

## Further Notes

La petición original es que las visualizaciones de Análisis carguen mucho más rápido. El usuario pidió revisar el borrador antes de continuar y ver la prueba en local. Los objetivos numéricos de este borrador son una propuesta de aceptación, no mediciones ya obtenidas.

La implementación aún no comenzó. Tras aprobar este borrador se publicará la especificación en GitHub con `ready-for-agent`. La implementación debe leer las guías de la versión instalada de Next.js antes de escribir código.
