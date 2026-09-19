# GlucoData: migración multiusuario — 14 de septiembre de 2026

## Estado real

Implementación realizada en `/Users/jose/Code/GlucoDataHandler/glucodata-web`, sobre un árbol de trabajo inicialmente limpio. **La migración NO fue aplicada al proyecto remoto ni se desplegó la web o la Edge Function.** No se modificaron las mediciones ni los eventos de producción. Se creó y eliminó una identidad temporal de Supabase Auth para verificar su API; no contenía datos clínicos.

El usuario confirmó que el legado pertenece a una sola cuenta. La sesión guardada de LibreLinkUp se validó mediante `/llu/connections`: tiene un único paciente conectado y coincide con el patient_id almacenado. Esa combinación permite preparar la asignación a la cuenta externa guardada, sin inferirla del primer login. La activación remota sigue pendiente por las limitaciones operativas indicadas abajo. Aplicar solo el SQL o solo la web no es compatible con la versión anterior: requiere el cambio coordinado descrito abajo. No hay commit ni push.

## Arquitectura encontrada y problemas confirmados

Proyecto Supabase confirmado contra `.env.local` y `supabase/config.json`: `hmmasbpshowkdifbiuki`.

- Login mediante LibreLinkUp, con token y `userId` guardados en una cookie accesible a JavaScript.
- Acciones del servidor con `service_role`, y filtros por `patient_id`; no existía identidad interna. Además podían utilizar credenciales globales del entorno si el llamador no proporcionaba credenciales.
- `glucose_measurements` ya distinguía pacientes, pero su política `read_glucose_measurements` permitía SELECT con `using (true)` a `anon` y `authenticated`.
- `provider_sessions` tenía una sola fila `librelinkup`. Su columna `user_id` era el identificador externo de LibreLinkUp, **no** un UUID propio. Se conserva sin reinterpretar ni convertir.
- `glucose_target_config` permitía acceso anónimo a una configuración global `default`.
- Eventos, alimentos, porciones, relaciones e insulinas tenían aislamiento por paciente implementado en rutas con `service_role`, sin políticas por cuenta.
- `/api/latest` consultaba lecturas de todos los pacientes; `/api/history` elegía el paciente de la última medición global. El token de integración no tenía propietario.
- La función activa `sync-glucose`, versión 2, tenía `verify_jwt=false`. La implementación del repositorio utilizaba una sesión global y credenciales globales de respaldo.

Inventario de solo lectura, observado durante esta revisión (las mediciones continúan cambiando por sincronización):

| Tabla | Filas observadas | Evidencia de propietario |
| --- | ---: | --- |
| glucose_measurements | 69.276 | Un patient_id; ninguna identidad interna |
| events | 96 | Un patient_id; autor de cuenta no registrado |
| foods | 1 | Un patient_id; autor de cuenta no registrado |
| meal_items | 2 | Vínculos a eventos y alimentos |
| event_links | 0 | Sin filas |
| patient_insulins | 0 | Sin filas |
| glucose_target_config | 1 | Configuración global sin propietario |
| provider_sessions | 1 | Cuenta externa guardada; no demuestra autoría histórica |

Un único paciente no prueba una única cuenta: varias personas pueden seguir al mismo paciente. No se asignó el legado al primer usuario que se autentique.

## Modelo implementado

Migración: `supabase/migrations/20260914135143_internal_users.sql`.

- `app_users.id`: UUID de Supabase Auth, relacionado con `auth.users`. `librelink_user_id` único asocia la identidad externa, confirmada mediante login con credenciales.
- `user_patients`: asociación explícita entre cuenta interna y paciente obtenido de LibreLinkUp. Mantiene el primer paciente como selección actual, igual que el flujo anterior.
- `user_provider_sessions`: una sesión de proveedor por cuenta, con cuenta externa y paciente asociados mediante claves foráneas. Acceso exclusivo del servidor. No se guardan contraseñas de LibreLinkUp.
- `integration_tokens`: SHA-256 del token y asociación fija a cuenta y paciente. No se guarda el token en texto plano en esta tabla.
- `legacy_ownership_assignments`: evidencia y cantidades de cada asignación histórica.
- `user_id` en mediciones, eventos, alimentos, porciones, relaciones, insulinas y límites. Las filas previas quedan con NULL hasta el backfill explícito; RLS las oculta.
- Unicidad de mediciones por `(user_id, patient_id, timestamp)`; insulinas por cuenta/paciente; límites por `(user_id, id)`.
- Claves foráneas compuestas impiden enlazar eventos o alimentos de otra cuenta, incluso si comparten paciente. Las restricciones previas también se conservan cuando no entran en conflicto.
- RLS por `auth.uid()` y pertenencia a `user_patients`. `USING` y `WITH CHECK` impiden leer datos ajenos o reasignar el propietario. Los defaults usan `auth.uid()`.
- Se revocan privilegios de PUBLIC/anon sobre los datos y se eliminan las políticas anteriores en las tablas afectadas. Identidades y asociaciones solo pueden escribirse desde el servidor.
- Las funciones de composición de comidas e insulinas siguen siendo `SECURITY INVOKER`: usan los permisos de la sesión y los defaults de las tablas.

No se crea una base física por usuario ni se añaden servicios pagos. Los costos de almacenamiento, autenticación y ejecuciones crecen con el uso; no se calculó una estimación de consumo.

## Autenticación y compatibilidad

`src/lib/server/user-auth.ts`:

1. El usuario sigue ingresando sus credenciales de LibreLinkUp.
2. Solo una respuesta satisfactoria del proveedor crea o localiza la identidad interna. Los headers `X-Libre-User-Id`, tokens del navegador y argumentos antiguos nunca se usan para decidir el propietario.
3. La identidad de Supabase usa un email interno aleatorio bajo `.invalid`; no se envía correo ni se reutiliza la contraseña de LibreLinkUp. La asociación persistente es el identificador externo, no el email.
4. El servidor genera y consume un enlace de autenticación mediante las APIs administrativas de Supabase, obteniendo una sesión normal de Supabase Auth.
5. Tokens de acceso y renovación se guardan en cookies HttpOnly, SameSite=Lax y Secure en producción. Los tokens de LibreLinkUp permanecen en el servidor.
6. `getUser` valida la sesión; si el acceso vence se usa el refresh token. Las consultas clínicas usan la clave pública y el JWT del usuario, por lo que `service_role` no elude RLS en esas consultas.
7. Las operaciones de paciente revalidan que LibreLinkUp mantenga el acceso al paciente guardado. No se toma otro paciente silenciosamente.
8. Logout revoca la sesión de renovación, borra cookies y recarga la interfaz. Como en Supabase estándar, un access token ya emitido puede seguir válido hasta expirar; no se implementó una lista propia de revocación inmediata de JWT.

**Las cookies antiguas requieren un nuevo login.** Se conserva un marcador no secreto de sesión para los componentes existentes. Los parámetros antiguos de acciones se conservan por compatibilidad, pero no autorizan consultas.

`src/app/actions.ts`: elimina credenciales globales como acceso implícito; aplica RLS a históricos y monitor; claves de caché incluyen usuario; escritura de lecturas por propietario; el gráfico histórico del proveedor se guarda también cuando no hay lectura reciente. `GLUCO_IMPORTS_PAUSED=true` permite establecer la identidad sin importar lecturas durante el backfill.

`src/lib/server/event-auth.ts` y rutas de eventos/alimentos/insulinas: usan la sesión interna y el cliente sujeto a RLS. No confían en headers de identidad suministrados por el cliente.

`src/app/api/patient/targets/route.ts`: lectura y actualización autenticadas de límites por cuenta, con validación de orden y rango. `src/app/page.tsx` reemplaza la escritura anónima directa, deja de importar la cookie global de límites, limpia datos al cambiar de sesión y descarta respuestas antiguas del monitor/histórico. El resto de la presentación se conserva.

`src/lib/server/integration-auth.ts`, `/api/latest` y `/api/history`: resuelven el hash del token y filtran SIEMPRE por cuenta y paciente. Un token sin asociación recibe 401, en lugar de elegir datos globales. Si falta el esquema o falla almacenamiento se devuelve 503.

`supabase/functions/sync-glucose/index.ts`: recorre sesiones por cuenta con paginación; verifica el paciente; escribe `user_id`; aísla fallos de cada proveedor; no usa credenciales globales de respaldo; exige un bearer del servidor o `GLUCO_SYNC_SECRET`. No registra tokens ni valores de glucosa. Una sesión LibreLinkUp vencida requiere nuevo login de esa cuenta. No se creó ni cambió el cron remoto.

## Backfill y datos inciertos

`scripts/backfill-user.sql` requiere `app_user_id`, `patient_id` y una descripción de evidencia. Se ejecuta después de crear la identidad, con importaciones pausadas.

- Solo asigna filas sin propietario del paciente confirmado, en seis tablas clínicas.
- Comprueba que la cuenta ya esté asociada al paciente.
- Bloquea escrituras concurrentes a esas tablas durante la transacción; espera de bloqueo limitada a 5 segundos.
- Conserva IDs, timestamps, valores, notas y relaciones. Calcula huellas del contenido anterior y posterior excluyendo únicamente `user_id`.
- Un conflicto de unicidad aborta todo; no borra ni sobreescribe lecturas para resolverlo.
- Registra evidencia y cantidades. No asigna el legado de otros pacientes.

`scripts/backfill-targets.sql` exige evidencia separada para asignar la antigua configuración global. No sustituye una configuración existente de la cuenta: un conflicto aborta.

`scripts/bind-integration.sql` asocia un hash SHA-256 a cuenta/paciente. Se puede conservar el token actual de escritorio/extensión una vez confirmado su propietario; si ya pertenece a otra cuenta, aborta. No envíes el token ni contraseñas al chat.

Confirmación recibida del usuario: «pertenecen a un solo usuario». Se verificó en vivo que la sesión guardada accede al único paciente de las mediciones. Para la migración de esta instalación, esa confirmación es la evidencia de propiedad del conjunto legado, incluida su configuración e integración actuales. No hay evidencia fila por fila de autoría previa: el esquema nunca la registró. Debe consignarse esta confirmación en el recibo de backfill. La sesión antigua sigue conservada; la nueva identidad se debe provisionar de forma controlada para esa asociación comprobada.

## Validación realizada

- Migraciones completas ejecutadas en un contenedor PostgreSQL 16 aislado, con esquema base de pruebas que reproduce las columnas y restricciones observadas. El helper `auth.uid()` se simula mediante claims de sesión; no es una instancia completa de Supabase local.
- `scripts/test-multiuser.sh`: dos cuentas con un paciente compartido y mismo timestamp; separación de lecturas y configuración; RPCs de comidas e insulinas; rechazo de propietario falsificado, reasignación, paciente no vinculado, relaciones cruzadas y accesos anónimos; actualización/borrado propio; conservación de legado; backfill correcto y rollback ante conflicto; asignación de límites y token.
- `node --test scripts/test-user-auth.cjs`: 8 pruebas de autenticación y token de integración, con dependencias simuladas.
- Prueba real de Supabase Auth: createUser, generateLink, verifyOtp, getUser, refreshSession y limpieza de la identidad temporal. Sin cambios de esquema ni datos clínicos remotos.
- TypeScript y build de Next.js.
- ESLint de los módulos de servidor, acciones y rutas nuevas: sin errores. La página conserva su deuda anterior de lint; comparación antes/después: 39 errores y 9 avisos, sin incremento.
- HTTP local con `pnpm dev`: `/` devuelve 200; eventos, límites y latest sin sesión devuelven 401.
- `git diff --check`.

No verificado todavía: login real de LibreLinkUp con el flujo completo sobre el esquema migrado, navegación autenticada de dos cuentas reales, ejecución remota de la nueva Edge Function, cron e integraciones después del cambio. No se declara la producción migrada.

El asesor remoto informó políticas ausentes en las tablas de eventos (corresponde al diseño anterior de acceso exclusivo del servidor), y avisos de funciones ajenas a GlucoData y de `btree_gist` en public. No se alteraron esos objetos ajenos. Referencias del asesor: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [funciones SECURITY DEFINER accesibles](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Limitaciones operativas verificadas

- El host directo PostgreSQL del proyecto resuelve a IPv6; desde el contenedor de respaldo devolvió `Network unreachable`.
- `supabase link --project-ref hmmasbpshowkdifbiuki` devolvió `LegacyLinkProjectStatusError`: la cuenta de la CLI no tiene privilegios para consultar ese endpoint. El conector MCP sí pudo consultar esquema, inventario y asesores; son rutas de acceso distintas.
- Se obtuvo el host del pooler desde la configuración de la CLI, pero el intento de `pg_dump` no llegó a producir un respaldo verificable y se canceló. No se da un archivo vacío por backup.
- La CLI de Vercel no produjo un enlace individual de proyecto verificable en este intento. La referencia de repositorio existente identifica `glucodata-web`.
- El cron remoto sigue activo con su programación original cada cinco minutos. No se pausó porque no comenzó el cambio remoto.

Se dejó la versión productiva sin modificar. Antes de activar falta disponer de un respaldo recuperable y verificar el canal de despliegue coordinado. No es un rechazo de aprobación automática: son resultados de conectividad y permisos de las herramientas utilizadas.

## Activación pendiente, en orden

1. Usar la confirmación recibida y la asociación LibreLinkUp/paciente validada. Tomar snapshot privado de esquema y datos de las tablas afectadas; comprobar el proyecto `hmmasbpshowkdifbiuki`. No se creó un backup remoto en esta ejecución porque no se aplicaron cambios productivos.
2. Programar una ventana breve; pausar el cron y poner la web anterior en mantenimiento para evitar escrituras mientras se cambian restricciones.
3. Aplicar la migración transaccional. Desplegar la web nueva con `GLUCO_IMPORTS_PAUSED=true`. Mantener el cron pausado.
4. Iniciar sesión con la cuenta confirmada; esto crea identidad, asociación y sesión de proveedor, pero no importa mediciones con la bandera activa. Obtener el UUID interno de esa asociación.
5. Ejecutar el backfill con evidencia explícita; verificar conteos y huellas, y que no se modificó ningún dato fuera del paciente confirmado. Asignar límites únicamente si fueron confirmados.
6. Asociar el hash del token existente a cuenta/paciente, o emitir uno nuevo si se solicita. Comprobar `/api/latest` y `/api/history` con ese token y rechazo de uno inválido.
7. Desplegar la Edge Function nueva, configurar el secreto del cron y probar una ejecución. Quitar `GLUCO_IMPORTS_PAUSED`, reanudar cron y comprobar lecturas recientes e historial con el navegador.
8. Validar dos cuentas, logout/login, eventos, comidas, insulinas y límites. Ejecutar asesores sobre el esquema remoto ya migrado.

### Recuperación

La migración SQL es transaccional: un fallo antes del commit revierte sus cambios. El backfill también lo es. Con el esquema ya confirmado, **no volver a desplegar solo la web anterior**: sus sesiones, restricciones y consultas no son compatibles con el modelo nuevo. Mantener mantenimiento y cron pausado, conservar una copia de las escrituras nuevas y restaurar de forma coordinada el snapshot de las tablas afectadas y las versiones previas de web/función. No ejecutar DROP CASCADE ni un rollback destructivo sobre identidades nuevas. Se prioriza corregir hacia adelante si ya ingresaron usuarios nuevos.

## Referencias técnicas

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
