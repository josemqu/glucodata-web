# Glucemia manual

Acceso: Registrar evento → Glucemia, o menú contextual del gráfico → Glucemia manual.

Campos: valor entero en mg/dL (1–1000, límite de formato; no es un rango objetivo clínico), fecha y hora local no futura, nota opcional. No convertir HI/LO en números. Se puede editar o eliminar desde los eventos del rango visible.

Persistencia: `events`, tipo `health`, metadata `measurement_type=capillary_glucose`, `source=blood_glucose_meter`, `unit=mg/dL`, `glucose_mg_dl`. Se usa la API existente y su autorización por paciente/usuario. No requiere migraciones nuevas. No escribe `glucose_measurements`, ni altera CGM, promedios o tiempo en rango. El gráfico muestra un marcador de evento con el valor en su tooltip; no interpola estas mediciones como curva de sensor.

Verificación: `node --test scripts/test-manual-glucose.cjs`; `bash scripts/test-multiuser.sh` incluye guardado, edición, eliminación y aislamiento de mediciones manuales en PostgreSQL temporal.

Resultado local (2026-09-19): 4 pruebas nuevas aprobadas, consultas PostgreSQL aprobadas, build aprobado y formulario revisado en navegador a 390×844 y escritorio con una API simulada. Crear 123 mg/dL y editar a 124 conservó fecha/nota, sin duplicación. La ruta temporal de QA fue eliminada. No se hicieron escrituras en el historial real ni despliegue. Las suites existentes de auth/sync arrojaron 5 fallos en archivos no modificados por esta funcionalidad (configuración ausente, pausa de imports, dos casos de logout y cambio de cuenta).
