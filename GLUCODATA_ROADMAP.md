# Glucodata Web — Roadmap de Producto y Seguimiento de Features

> Documento vivo para mantener dentro del repositorio `glucodata-web` y permitir que Codex Work revise qué funcionalidades existen, cuáles faltan y cuál es el estado actual del proyecto.

**Fecha inicial:** 2026-08-22
**Estado:** Living roadmap
**Principio de producto:** **Evento → Contexto → Respuesta glucémica**

---

## 1. Objetivo

Evolucionar Glucodata desde un visor de glucosa/CGM conectado al backend no oficial de LibreLink hacia una plataforma personal que permita:

- Registrar comidas, dosis de insulina, ejercicio, medicación, notas y otros eventos.
- Mostrar esos eventos sobre el mismo eje temporal que las lecturas CGM.
- Asociar automáticamente la glucosa anterior y posterior a cada evento.
- Calcular métricas descriptivas de respuesta glucémica.
- Comparar eventos y comidas repetidas.
- Detectar patrones históricos personales.
- Mantener claramente separada la observación de datos de cualquier recomendación terapéutica.

### Capacidad existente asumida

La aplicación actual ya dispone de una integración funcional con el backend/API no oficial de LibreLink para obtener y visualizar datos CGM.

**Este roadmap debe extender esa implementación, no reemplazarla.**

---

## 2. Reglas para Codex Work

Al trabajar sobre este proyecto:

1. Revisar este archivo antes de planificar cambios relacionados con las features descriptas.
2. Inspeccionar el código existente antes de asumir que una feature no está implementada.
3. Actualizar el estado de cada feature cuando corresponda.
4. No marcar una feature como `DONE` solamente porque existe código parcial.
5. Cuando una feature esté terminada, agregar una breve referencia a los componentes, rutas, migraciones o módulos principales involucrados.
6. Mantener compatibilidad con la integración LibreLink existente salvo que exista una razón explícita para modificarla.
7. Priorizar una arquitectura donde adquisición CGM, eventos y analytics estén desacoplados.
8. No implementar recomendaciones automáticas de dosis de insulina como parte de este roadmap.

### Estados

- `TODO` — no implementado.
- `IN PROGRESS` — implementación activa o parcial.
- `BLOCKED` — requiere una decisión/dependencia.
- `DONE` — implementado y validado.
- `DEFERRED` — explícitamente postergado.

---

# 3. Arquitectura conceptual

```text
┌───────────────────────────┐
│        LibreLink          │
│ CGM / glucose acquisition │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│          Glucose          │
│ readings / trends / stats │
└─────────────┬─────────────┘
              │
              │
┌─────────────▼─────────────┐
│          Events           │
│ meals / insulin / sport   │
│ medication / notes / etc. │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│         Analytics         │
│ response / comparison /   │
│ patterns / aggregation    │
└───────────────────────────┘
```

La adquisición de datos desde LibreLink **no debe quedar acoplada a la lógica de eventos**.

---

# 4. Modelo general de eventos

Todos los datos contextuales ingresados por el usuario deben compartir una abstracción común: `event`.

## Tabla `events`

Campos sugeridos:

```text
id
user_id
type
occurred_at
ended_at
title
notes
metadata JSONB
created_at
updated_at
```

Tipos iniciales:

```text
meal
insulin
exercise
medication
sleep
health
note
other
```

`ended_at` es opcional y resulta especialmente útil para ejercicio, sueño y otros eventos con duración.

### Ejemplo: insulina

```json
{
  "type": "insulin",
  "occurred_at": "2026-08-22T12:57:00-03:00",
  "title": "Fiasp",
  "metadata": {
    "units": 6,
    "insulin_type": "rapid",
    "insulin_name": "Fiasp"
  }
}
```

### Ejemplo: comida

```json
{
  "type": "meal",
  "occurred_at": "2026-08-22T13:02:00-03:00",
  "title": "Almuerzo",
  "metadata": {
    "carbs_g": 64,
    "protein_g": 32,
    "fat_g": 18
  }
}
```

---

# 5. Modelo de alimentos

Los alimentos deben normalizarse independientemente de `events` para poder reutilizarlos y comparar comidas históricas.

## Tabla `foods`

```text
id
user_id
name
serving_size
serving_unit
carbs_g
protein_g
fat_g
calories
favorite
created_at
updated_at
```

## Tabla `meal_items`

```text
id
event_id
food_id
quantity
carbs_g
protein_g
fat_g
calories
```

Los valores nutricionales de `meal_items` deben conservar una copia de los valores utilizados al momento de registrar la comida. De esa forma, editar posteriormente un alimento no altera el histórico.

---

# 6. Relaciones entre eventos

## Tabla `event_links`

```text
id
parent_event_id
related_event_id
relation_type
created_at
```

Relaciones previstas:

```text
meal_insulin
correction
post_meal_exercise
pre_meal_exercise
related
```

Ejemplo:

```text
🍽 Almuerzo 13:02
├── 💉 Fiasp 6 U · 12:57
└── 🚶 Caminata · 14:20–15:05
```

Inicialmente las relaciones pueden ser manuales. Posteriormente la aplicación puede sugerir asociaciones por proximidad temporal.

---

# 7. Timeline y gráfico CGM

El gráfico de glucosa debe convertirse en el elemento central para visualizar glucosa + contexto.

Ejemplo conceptual:

```text
180 ┤                      ╭───╮
160 ┤                 ╭────╯   ╰────
140 ┤       ╭─────────╯
120 ┤───────╯
100 ┤
    └──────────────────────────────
     12    13    14    15    16

           🍽️ 💉
           │   │
           │   └ 6 U Fiasp
           └ Almuerzo · 64 g CH
```

Marcadores previstos:

```text
🍽 comida
💉 insulina
🏃 ejercicio
💊 medicación
😴 sueño
🤒 salud/contexto
📝 nota
```

Los eventos con duración, especialmente ejercicio, deben representarse como intervalos y no únicamente como puntos.

---

# 8. Registro rápido de eventos

Debe existir un botón global `+` accesible desde las principales pantallas.

Opciones iniciales:

```text
💉 Insulina
🍽 Comida
🏃 Ejercicio
💊 Medicación
📝 Nota
```

La carga debe requerir la menor cantidad posible de interacción.

## Insulina

Campos mínimos:

- Tipo.
- Producto/nombre.
- Unidades.
- Fecha/hora.
- Nota opcional.

Tipos previstos:

```text
rapid
short
intermediate
long
ultra_long
other
```

Permitir presets de dosis frecuentes cuando resulte útil.

## Ejercicio

Campos:

- Tipo.
- Inicio.
- Fin o duración.
- Intensidad.
- Comentario opcional.

Intensidad:

```text
low
medium
high
```

---

# 9. Registro de comidas

## V1 — Macros manuales

Permitir registrar:

- Nombre/comida.
- Fecha/hora.
- Carbohidratos.
- Proteínas.
- Grasas.
- Calorías opcionales.
- Notas.

## V2 — Alimentos individuales

Ejemplo:

```text
Almuerzo

Milanesa            1 unidad
Puré de papa         180 g
Ensalada             120 g

────────────────────────
CH             64 g
Proteínas      35 g
Grasas         21 g
```

## V3 — Comidas reutilizables

Permitir favoritos y comidas frecuentes:

```text
⭐ Mis comidas

Milanesa + puré
Desayuno habitual
Pizza
Hamburguesa casera
Pasta
```

Debe ser posible duplicar una comida histórica y modificar cantidades.

---

# 10. Ventanas de análisis

Cada evento puede definir una ventana temporal de análisis sobre las lecturas CGM existentes.

Valores iniciales sugeridos:

| Evento | Antes | Después |
|---|---:|---:|
| Comida | 30 min | 4 h |
| Insulina rápida | 30 min | 6 h |
| Ejercicio | 60 min | 6 h |

Estas ventanas deben ser configurables en la implementación y no quedar hardcodeadas en componentes UI.

No duplicar las lecturas CGM por evento.

Conceptualmente:

```sql
glucose.timestamp BETWEEN
event.occurred_at - analysis_window_before
AND
event.occurred_at + analysis_window_after
```

---

# 11. Métricas de respuesta glucémica

## `event_analysis`

Puede utilizarse una tabla/cache de métricas derivadas:

```text
event_id
analysis_version
window_start
window_end
baseline_glucose
peak_glucose
nadir_glucose
glucose_delta
time_to_peak
glucose_1h
glucose_2h
glucose_3h
glucose_4h
avg_glucose
time_in_range
time_above_range
time_below_range
calculated_at
```

La implementación debe contemplar datos CGM faltantes.

No asumir que siempre existe exactamente una lectura en +1 h, +2 h, etc. Definir una política consistente de interpolación o lectura más cercana.

---

# 12. Pantalla de respuesta a un evento

Ejemplo:

```text
Almuerzo
22 Ago · 13:02

🍝 64 g CH
💉 6 U Fiasp

────────────────────────

Glucosa inicial       112 mg/dL
Pico                  174 mg/dL
Δ máximo              +62 mg/dL

Tiempo al pico        1 h 37 min

+1 h                  149 mg/dL
+2 h                  171 mg/dL
+3 h                  138 mg/dL
+4 h                  121 mg/dL
```

Debe incluir una curva centrada temporalmente en el evento.

```text
180 │              ╭────╮
160 │          ╭───╯    ╰──
140 │     ╭────╯
120 │─────╯
100 │
    └──────────────────────
       0   1h   2h   3h   4h
```

Los eventos relacionados también deben poder aparecer sobre esta curva.

---

# 13. Comparación histórica

Permitir seleccionar eventos comparables y normalizar las curvas con:

```text
t = 0 → momento del evento principal
```

Ejemplos de comparaciones futuras:

```text
Pizza — distintas ocasiones

Pizza + 6 U
vs.
Pizza + 7 U

Pasta + ejercicio posterior
vs.
Pasta sin ejercicio posterior
```

La comparación debe mostrar:

- Curvas individuales.
- Curva promedio.
- Baseline.
- Pico.
- Delta.
- Tiempo al pico.
- TIR durante la ventana.
- Cantidad de observaciones.

---

# 14. Insights descriptivos

Ejemplos:

> Las últimas 7 veces que registraste esta comida, el pico promedio fue +54 mg/dL.

> En los registros donde hubo una caminata dentro de los 90 minutos posteriores, el pico observado fue en promedio 19 mg/dL menor.

Los insights deben:

- indicar tamaño de muestra;
- ser trazables a los eventos utilizados;
- evitar lenguaje causal cuando solamente existe correlación;
- evitar recomendaciones automáticas de tratamiento.

---

# 15. Historial y búsqueda

Crear una vista cronológica de eventos.

Ejemplo:

```text
Hoy

13:02 🍽 Almuerzo
       64 g CH
       +62 mg/dL máximo

12:57 💉 Fiasp
       6 U

08:15 🍽 Desayuno
       38 g CH

Ayer

21:10 🍽 Cena
21:05 💉 Fiasp · 5 U
```

Filtros previstos:

- Fecha.
- Tipo de evento.
- Alimento.
- Comida.
- Carbohidratos.
- Tipo de insulina.
- Unidades.
- Tags.

---

# 16. Tags y contexto

Permitir tags libres asociados a eventos.

Ejemplos:

```text
#restaurant
#pizza
#desayuno
#trabajo
#finDeSemana
#enfermo
#alcohol
```

Los tags deben ser utilizables posteriormente como filtros y dimensiones analíticas.

---

# 17. API interna sugerida

La implementación concreta debe adaptarse a la arquitectura actual del repositorio.

Endpoints conceptuales:

```http
GET    /api/events
POST   /api/events
GET    /api/events/:id
PATCH  /api/events/:id
DELETE /api/events/:id

GET    /api/events/:id/glucose
GET    /api/events/:id/analysis

GET    /api/foods
POST   /api/foods
PATCH  /api/foods/:id
DELETE /api/foods/:id

GET    /api/analytics/event-comparison
```

Ejemplo de filtros:

```http
GET /api/events?type=meal&from=2026-08-01&to=2026-08-31
```

---

# 18. Roadmap de implementación

## Fase 0 — Auditoría de la app existente

**Estado: `DONE`**

- [x] Revisar arquitectura actual de `glucodata-web`.
- [x] Documentar stack frontend/backend.
- [x] Identificar dónde se persisten actualmente las lecturas CGM.
- [x] Identificar componentes del gráfico actual.
- [x] Identificar sistema de autenticación/usuarios.
- [x] Identificar esquema y migraciones de base de datos.
- [x] Identificar endpoints existentes relacionados con LibreLink.
- [x] Confirmar qué componentes existentes pueden reutilizarse.
- [x] Registrar decisiones arquitectónicas relevantes en este documento.

### Resultado esperado

Un breve bloque `Estado actual de arquitectura` agregado al final de este documento.

---

## Fase 1 — Event Foundation

**Estado: `IN PROGRESS`**

### Base de datos

- [x] Crear modelo/tabla `events`.
- [x] Crear migración.
- [x] Definir tipos de eventos.
- [x] Implementar `occurred_at`.
- [x] Implementar `ended_at`.
- [x] Implementar metadata específica por tipo.
- [x] Implementar permisos/RLS adecuados por paciente mediante API server-only validada con LibreLink.

### Backend

- [x] Crear evento.
- [x] Leer evento.
- [x] Listar eventos.
- [x] Editar evento.
- [x] Eliminar evento.
- [x] Filtrar por rango temporal.
- [x] Filtrar por tipo.

### Frontend

- [x] Botón global `+`.
- [x] Selector de tipo de evento.
- [x] Formulario de insulina.
- [x] Formulario de comida básica.
- [x] Formulario de ejercicio.
- [x] Formulario de nota.
- [x] Edición de eventos.
- [x] Eliminación de eventos.

### Timeline

- [x] Mostrar eventos del día.
- [ ] Sincronizar timeline con rango temporal del gráfico cuando corresponda.
- [ ] Abrir detalle al seleccionar un evento.

### CGM Chart

- [x] Mostrar marcador de comida.
- [x] Mostrar marcador de insulina.
- [x] Mostrar intervalo de ejercicio.
- [x] Mostrar otros tipos de eventos.
- [ ] Tooltip/resumen del evento.
- [ ] Navegar al detalle desde el gráfico.

### Criterio de finalización

La aplicación permite registrar comida, insulina y ejercicio y ver esos eventos correctamente posicionados sobre el gráfico CGM existente.

---

## Fase 2 — Meal Tracking

**Estado: `TODO`**

- [ ] Crear tabla/modelo `foods`.
- [ ] Crear tabla/modelo `meal_items`.
- [ ] Crear migraciones.
- [ ] CRUD de alimentos.
- [ ] Buscador de alimentos propios.
- [ ] Favoritos.
- [ ] Agregar múltiples alimentos a una comida.
- [ ] Calcular macros totales.
- [ ] Conservar snapshot nutricional en `meal_items`.
- [ ] Duplicar comida histórica.
- [ ] Comidas frecuentes.
- [ ] Plantillas/favoritos de comidas.
- [ ] Búsqueda por nombre de comida/alimento.

### Criterio de finalización

Una comida puede construirse con alimentos reutilizables y volver a registrarse posteriormente con mínima interacción.

---

## Fase 3 — Event Analytics

**Estado: `IN PROGRESS`**

### Asociación CGM

- [x] Crear servicio para obtener lecturas alrededor de un evento.
- [x] Configurar ventanas según tipo.
- [x] Resolver gaps de CGM mediante cobertura explícita, conteo de gaps y duración máxima computable de 15 minutos por tramo.
- [x] Definir política de lectura: baseline = última lectura previa dentro de 10 minutos; hitos posteriores = nearest-reading dentro de ±10 minutos; fuera del margen se devuelve `null`.
- [x] Evitar duplicación innecesaria de datos.

### Métricas

- [x] Baseline.
- [x] Peak.
- [x] Nadir.
- [x] Delta máximo.
- [x] Tiempo al pico.
- [x] Glucosa +1 h.
- [x] Glucosa +2 h.
- [x] Glucosa +3 h.
- [x] Glucosa +4 h.
- [x] Glucosa promedio.
- [x] Time in Range.
- [x] Time Above Range.
- [x] Time Below Range.
- [x] Versionar algoritmo de análisis (`event-response-v1`).

### UI

- [x] Pantalla `Event Response` integrada en el panel de eventos.
- [x] Curva centrada en el evento.
- [x] Marcadores de eventos relacionados.
- [x] Resumen de métricas.
- [x] Estado de análisis incompleto cuando aún no pasó toda la ventana temporal.

### Criterio de finalización

Al abrir una comida registrada, Glucodata muestra automáticamente su curva de glucosa y las principales métricas descriptivas posteriores.

---

## Fase 4 — Event Relationships

**Estado: `DONE`**

- [x] Crear `event_links`.
- [x] Vincular insulina con comida.
- [x] Vincular ejercicio con comida.
- [x] Marcar correcciones.
- [x] UI para revisar y desvincular relaciones.
- [x] Sugerir relaciones por proximidad temporal.
- [x] Permitir aceptar/rechazar sugerencias.
- [x] Mostrar eventos relacionados en detalle y gráficos.

---

## Fase 5 — Comparación histórica

**Estado: `TODO`**

- [ ] Seleccionar múltiples eventos.
- [ ] Normalizar curvas a `t=0`.
- [ ] Overlay de curvas.
- [ ] Curva promedio.
- [ ] Comparar baseline.
- [ ] Comparar delta.
- [ ] Comparar pico.
- [ ] Comparar tiempo al pico.
- [ ] Comparar TIR.
- [ ] Mostrar tamaño de muestra.
- [ ] Comparar una misma comida.
- [ ] Comparar por dosis de insulina.
- [ ] Comparar ejercicio vs. no ejercicio.
- [ ] Filtrar por tags/contexto.

---

## Fase 6 — Insights

**Estado: `TODO`**

- [ ] Crear motor de agregaciones históricas.
- [ ] Detectar comidas repetidas.
- [ ] Generar resumen de respuesta promedio.
- [ ] Detectar diferencias asociadas a ejercicio.
- [ ] Detectar diferencias asociadas a dosis registradas.
- [ ] Mostrar tamaño de muestra.
- [ ] Mostrar eventos fuente.
- [ ] Evitar inferencias causales injustificadas.
- [ ] Evitar recomendaciones terapéuticas automáticas.

---

## Fase 7 — Contexto adicional

**Estado: `DEFERRED`**

Features candidatas:

- [ ] Medicación.
- [ ] Sueño.
- [ ] Enfermedad.
- [ ] Estrés.
- [ ] Alcohol.
- [ ] Tags avanzados.
- [ ] Importación de otras fuentes de salud.
- [ ] Correlaciones con contexto.

---

## Fase 8 — Insulin on Board / modelos avanzados

**Estado: `DEFERRED`**

Posible evolución futura:

- Curvas farmacodinámicas configurables.
- Estimación informativa de insulina activa (IOB).
- Visualización de actividad estimada de insulina.

Esta fase requiere diseño y validación separados.

**No debe convertirse automáticamente en un recomendador de dosis.**

---

# 19. MVP recomendado

La primera versión útil debe limitarse a estas diez capacidades:

- [x] `events` + migración de DB.
- [x] CRUD genérico de eventos.
- [x] Formularios de comida, insulina y ejercicio.
- [x] Botón global `+`.
- [x] Marcadores de eventos sobre el gráfico CGM existente.
- [x] Timeline diario.
- [x] Pantalla de detalle del evento.
- [x] Consulta de CGM `-30 min / +4 h` para comidas.
- [x] Baseline, peak, Δpeak y valores +1/+2/+3 h.
- [x] Mini gráfico de respuesta glucémica.

**Milestone:** `MVP Event Response`

Cuando estos diez puntos estén validados, actualizar este milestone a `DONE`.

---

# 20. Decisiones de producto

## DP-001 — Glucodata no es solamente un registro de insulina

La unidad conceptual principal es:

```text
EVENTO
   ↓
CONTEXTO
   ↓
RESPUESTA GLUCÉMICA
```

Esto permite analizar bajo el mismo modelo comidas, insulina, ejercicio, sueño, enfermedad y futuros tipos de eventos.

**Estado:** `ACCEPTED`

---

## DP-002 — LibreLink continúa siendo la fuente CGM

La nueva funcionalidad no debe intentar escribir comidas, dosis u otros eventos dentro de LibreLink.

Glucodata mantiene su propio registro contextual.

**Estado:** `ACCEPTED`

---

## DP-003 — No duplicar CGM por evento

Los eventos deben consultar las lecturas CGM existentes mediante timestamp.

Las métricas derivadas sí pueden persistirse/cachearse cuando resulte conveniente.

**Estado:** `ACCEPTED`

---

## DP-004 — Observación ≠ recomendación terapéutica

Permitido:

> Con esta comida el pico promedio registrado fue +62 mg/dL.

Fuera del alcance inicial:

> La próxima vez deberías aplicarte 7 U.

**Estado:** `ACCEPTED`

---

# 21. Backlog de ideas

No implementar automáticamente estas ideas sin evaluar prioridad.

- [ ] Fotos de comidas.
- [ ] Estimación nutricional desde fotografía.
- [ ] Barcode scanner.
- [ ] Base nutricional externa.
- [ ] Importación desde Apple Health / Health Connect.
- [ ] PWA/offline event logging.
- [ ] Notificaciones para completar contexto.
- [ ] Detección automática de posibles comidas no registradas.
- [ ] Detección automática de ejercicio.
- [ ] Exportación CSV/JSON.
- [ ] Reporte PDF.
- [ ] Vista semanal de patrones.
- [ ] Heatmap hora/día.
- [ ] Comparación días laborales vs. fines de semana.
- [ ] Dashboard de comidas frecuentes.
- [ ] Tags automáticos.
- [ ] Búsqueda semántica del historial.

---

# 22. Estado actual de arquitectura

```text
Última revisión: 2026-08-22
Commit revisado: b18bdcc

Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, componentes UI propios basados en Radix/shadcn.
Backend: Server Actions para LibreLink/analytics y Route Handlers en src/app/api. Edge Function sync-glucose para sincronización periódica.
Database: Supabase Postgres. glucose_measurements conserva CGM por patient_id; glucose_target_config conserva umbrales. Migraciones en supabase/migrations.
Authentication: La web usa una sesión LibreLink guardada en cookie del navegador; no existe Supabase Auth. Las rutas de eventos validan esa sesión contra LibreLink y fuerzan el patient_id activo.
CGM integration: LibreLinkUpClient obtiene conexión, lectura actual y gráfico; getLatestGlucoseAction persiste y consulta glucose_measurements sin acoplarla a eventos.
Chart library: Recharts (ComposedChart) en src/app/page.tsx; Swift Charts en el cliente macOS separado.
Deployment: Next.js/Vercel según metadatos del repositorio; Supabase aloja Postgres y la Edge Function.

Componentes reutilizables:
src/app/page.tsx (monitor y gráfico CGM), src/components/ui/*, src/components/analysis-view.tsx,
src/lib/librelink.ts, src/app/api/history/route.ts, src/lib/metrics.ts y configuración de targets existente.

Deuda técnica relevante:
page.tsx concentra adquisición, estado, navegación y gráfico; faltan tipos en varios flujos y el lint global ya contiene errores previos.
La cookie gluco_session es accesible desde JavaScript y no reemplaza una identidad Supabase; los eventos deben continuar entrando por API server-only.
glucose_target_config y glucose_measurements tienen políticas anon históricas que merecen una auditoría de seguridad separada.

Observaciones:
La adquisición CGM y los eventos permanecen desacoplados. events referencia patient_id y consulta glucose_measurements por tiempo en futuras fases; no duplica lecturas.
```

---

# 23. Registro de progreso

Codex debe agregar entradas breves cuando complete milestones o realice cambios estructurales relevantes.

Formato:

```text
YYYY-MM-DD — [FASE/MILESTONE]

Estado:
Cambios:
Archivos/componentes principales:
Migraciones:
Tests/validación:
Pendientes:
```

### Entradas

2026-08-22 — [FASE 0 / FASE 1 EVENT FOUNDATION]

Estado: Fase 0 DONE; Fase 1 IN PROGRESS.
Cambios: auditoría de arquitectura; modelo y CRUD de eventos; registro rápido; timeline diario; marcadores de comida/insulina/notas e intervalos de ejercicio sobre el CGM.
Archivos/componentes principales: `src/lib/events.ts`, `src/lib/server/event-auth.ts`, `src/app/api/events`, `src/components/event-center.tsx`, `src/app/page.tsx`.
Migraciones: `20260822201903_event_foundation.sql` (aplicada y verificada en el proyecto destino `hmmasbpshowkdifbiuki`).
Tests/validación: `pnpm build` exitoso; ESLint focalizado de los módulos nuevos exitoso; `git diff --check` exitoso. El lint global sigue fallando por deuda previa del repositorio.
Pendientes: aplicar/verificar migración en Supabase; QA visual con sesión real; tooltip/navegación desde gráfico y sincronización explícita timeline-rango.

2026-08-22 — [MVP EVENT RESPONSE / ANÁLISIS INICIAL]

Estado: Implementado y con esquema remoto validado; pendiente QA del flujo UI con sesión LibreLink real.
Cambios: endpoint de análisis por evento; ventanas configurables por tipo; baseline previo y política nearest-reading ±10 min para hitos; curva centrada en `t=0`; pico, nadir, delta, tiempo al pico y valores +1/+2/+3/+4 h; estado temporal de ventana incompleta.
Archivos/componentes principales: `src/lib/event-analysis.ts`, `src/app/api/events/[id]/analysis/route.ts`, `src/components/event-center.tsx`.
Migraciones: sin migraciones adicionales. `20260822201903_event_foundation.sql` aplicada mediante conexión directa y registrada como `applied` en el historial remoto.
Tests/validación: TypeScript, ESLint focalizado y build exitosos. Esquema remoto con RLS activo, cero grants para `anon/authenticated`, CRUD transitorio completo y cero filas residuales; solicitud PostgREST con anon rechazada con HTTP 401 / `42501`.
Pendientes: QA visual y CRUD mediante la UI con sesión LibreLink real; versionar/ampliar métricas (promedio y TIR) antes de completar Fase 3. El historial remoto conserva dos migraciones históricas que no están presentes en este checkout (`20260203210154`, `20260204225920`) y deben reconciliarse por separado, sin reparación automática.

2026-08-22 — [FASE 1 / MIGRACIÓN REMOTA]

Estado: Migración aplicada y verificada.
Cambios: creación remota de `public.events`, índices por paciente/fecha y paciente/tipo/fecha, RLS y grants server-only.
Archivos/componentes principales: `supabase/migrations/20260822201903_event_foundation.sql`.
Migraciones: `20260822201903` registrada como aplicada en destino.
Tests/validación: RLS `true`; grants browser `0`; service_role con SELECT/INSERT/UPDATE/DELETE; 3 índices; 6 constraints; CRUD create/read/update/delete exitoso y limpieza confirmada; acceso anon denegado.
Pendientes: validar endpoints y panel con una sesión LibreLink activa; reconciliar las dos migraciones remotas históricas ausentes del checkout.

2026-08-23 — [FASE 3 / CALIDAD Y MÉTRICAS DE RESPUESTA]

Estado: Análisis descriptivo ampliado; Fase 3 IN PROGRESS.
Cambios: promedio ponderado por tiempo; TIR/TAR/TBR usando targets configurados y normalizados a la unidad efectiva; cobertura observada; interrupciones centrales y de borde; estados good/partial/insufficient; versión `event-response-v1`; detalle reorganizado con calidad, supresión de agregados insuficientes, rangos e hitos horarios.
Archivos/componentes principales: `src/lib/event-analysis.ts`, `src/app/api/events/[id]/analysis/route.ts`, `src/components/event-center.tsx`.
Migraciones: sin cambios.
Tests/validación: casos determinísticos de cuatro horas con muestreo cada cinco minutos validaron promedio, cobertura 100%, cero interrupciones, calidad good y suma TBR+TIR+TAR = 100%; TypeScript, ESLint focalizado y build exitosos.
Pendientes: marcadores de eventos relacionados; QA visual con sesión LibreLink real; convertir los casos determinísticos en una suite persistente y ampliar cobertura parcial.

2026-08-23 — [FASE 4 / EVENT RELATIONSHIPS]

Estado: Relaciones automáticas y revisión manual implementadas; Fase 4 IN PROGRESS por correcciones manuales pendientes.
Cambios: modelo server-only de relaciones; sugerencias comida-insulina y comida-ejercicio por cercanía temporal; aceptación, descarte y desvinculación desde el detalle; eventos vinculados visibles sobre la curva.
Archivos/componentes principales: `src/lib/events.ts`, `src/app/api/events/[id]/links/route.ts`, `src/app/api/events/[id]/analysis/route.ts`, `src/components/event-center.tsx`.
Migraciones: `20260823035018_event_relationships.sql` y `20260823035740_harden_event_relationships.sql` aplicadas y registradas en el destino remoto.
Tests/validación: ESLint focalizado, TypeScript, `git diff --check` y build exitosos; RLS activa, cero grants de navegador, CRUD transitorio completo, rechazo de relaciones entre pacientes, pares inversos y semánticas contradictorias, y acceso anon denegado con HTTP 401 / `42501`; cero filas residuales.
Pendientes: QA visual y de interacción con una sesión LibreLink real.

2026-08-23 — [FASE 4 / CLASIFICACIÓN DE CORRECCIONES]

Estado: Fase 4 DONE.
Cambios: una relación comida-insulina posterior puede reclasificarse explícitamente como corrección y revertirse a dosis de comida; la API conserva la validación de tipos y orden temporal, actualiza el único vínculo canónico y la UI mantiene el análisis visible mientras refresca sólo las relaciones.
Archivos/componentes principales: `src/components/event-center.tsx`, `src/app/api/events/[id]/links/route.ts`.
Migraciones: sin cambios.
Tests/validación: cambio remoto transitorio `meal_insulin` → `correction` validado con una única fila y limpieza por cascada confirmada; ESLint focalizado, TypeScript, `git diff --check` y build exitosos.
Pendientes: QA visual y de interacción con una sesión LibreLink real.

2026-08-23 — [UX / EDICIÓN Y CLASIFICACIÓN DEL EVENTO]

Estado: Implementado; pendiente QA con sesión LibreLink real.
Cambios: toda dosis de insulina puede clasificarse mediante un checkbox persistente como corrección o dosis habitual/asociada a comida, sin depender de una relación; el control está disponible tanto en el formulario como directamente en el detalle; el detalle incorpora una acción Editar; la curva de respuesta muestra un tooltip compacto con tiempo relativo, glucosa y estado; después de crear o editar, la UI abre naturalmente el detalle guardado.
Archivos/componentes principales: `src/lib/events.ts`, `src/components/event-center.tsx`, `src/app/api/events/[id]/route.ts`.
Migraciones: sin cambios; la clasificación se almacena como `metadata.dose_purpose`.
Tests/validación: actualización remota transitoria a `correction` con preservación del resto de metadata y cero residuos; detector de interfaz sin hallazgos, ESLint focalizado, TypeScript, `git diff --check` y build exitosos.
Pendientes: QA visual y de interacción con una sesión LibreLink activa.

2026-08-23 — [UX / ACCESO DIRECTO DESDE EL GRÁFICO]

Estado: Implementado; pendiente QA con datos y sesión LibreLink real.
Cambios: los marcadores de eventos del monitor ahora son seleccionables con mouse, touch y teclado y abren directamente `Event Response`, sin pasar por el formulario ni la pestaña de eventos; se agregó una indicación de uso en la leyenda, un estado de carga estable que evita mostrar transitoriamente el formulario y una franja superior exclusiva para que los indicadores no oculten la curva en valores altos.
Archivos/componentes principales: `src/app/page.tsx`, `src/components/event-center.tsx`.
Migraciones: sin cambios.
Tests/validación: TypeScript, ESLint del panel, `git diff --check` y build de producción exitosos.
Pendientes: comprobación visual e interactiva con una sesión LibreLink activa; el navegador integrado no estuvo disponible en esta ejecución.

---

# 24. Próxima acción recomendada

**Fase 0 — Auditoría de la app existente.**

Antes de implementar nuevas features, Codex debe inspeccionar `glucodata-web`, completar la sección **Estado actual de arquitectura** y contrastar el código existente contra la **Fase 1 — Event Foundation**.

Después debe proponer el conjunto mínimo de cambios para alcanzar el milestone:

**`MVP Event Response`**
