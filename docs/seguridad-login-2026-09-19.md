# Revisión de seguridad de acceso — 19 de septiembre de 2026

## Estado

Correcciones implementadas y verificadas localmente. No publicadas. No se modificó la base remota, el cron ni las credenciales reales. Los cambios previos de glucemia manual se conservaron.

El incidente documentado en `incidente-login-2026-09-19.md` confirma que producción volvió a una versión anterior porque falta el esquema multiusuario. Esta revisión no vuelve a verificar el esquema remoto. Publicar este árbol sin completar el corte de `multiusuario.md` rompería el login. Las protecciones locales no demuestran protección de producción.

## Hallazgos y correcciones

- El formulario omitía el método HTTP: el envío HTML nativo podía usar GET y transportar email/contraseña en la URL. Se declara POST a una ruta fija, que sin JavaScript rechaza el envío con una explicación sin leer ni reflejar el cuerpo. No se reprodujo una filtración real de una contraseña del usuario. Ver un cuerpo POST en las herramientas de desarrollo no implica que sea público: HTTPS protege el transporte, pero el navegador y el servidor reciben el contenido.
- Se retira la lectura/persistencia de `gluco_session` desde JavaScript. Al abrir la página se descarta la cookie antigua y se consulta al servidor para restaurar una identidad validada. Las cookies internas HttpOnly, Secure en producción y SameSite=Lax ya existían y se conservan. El marcador en memoria no es un token de autenticación. Los campos de credenciales se vacían al enviar, también si el intento falla.
- Login explícito ya no conserva silenciosamente la cuenta previamente abierta. Se elimina la doble autenticación del mismo intento.
- Logout renueva primero un access token vencido para poder revocar la sesión y siempre limpia cookies, incluso si falla la operación remota. La interfaz limpia los datos locales aunque el servidor devuelva error. Supabase puede mantener válido un access token emitido hasta su expiración; no se implementa una lista de revocación de JWT.
- Los clientes LibreLinkUp de Next y Edge validan la región como una etiqueta alfanumérica dentro del dominio fijo `libreview.io`. Se bloquean redirecciones HTTP automáticas, se limita la cantidad de redirecciones JSON y se agrega timeout. Se codifica el paciente al construir una ruta. Esto evita reenviar contraseñas/cabeceras a destinos arbitrarios mediante una región manipulada o redirección HTTP.
- Los errores del proveedor no se propagan literalmente al navegador; las API y acciones solo exponen errores de autenticación controlados o mensajes genéricos. Se eliminan logs de errores crudos de las consultas revisadas. Las condiciones legales pendientes deben resolverse en LibreLinkUp, sin aceptación automática por la aplicación.
- El proxy exige origen exacto para escrituras, rechaza origen ausente/null/cruzado y añade `private, no-store`. Los parámetros sensibles en URL provocan redirección a una URL limpia. Esto no borra historial/logs generados antes de recibir la solicitud.
- Se agregan Referrer-Policy sin referencia, bloqueo de iframes, nosniff, HSTS en producción y restricciones CSP para formularios, objetos y URL base. La CSP es parcial, no una política completa de scripts basada en nonce.
- La sincronización devuelve 503 antes de autenticar si falta configuración: ya no admite la cadena `Bearer undefined`. La pausa de importaciones se respeta después de validar el bearer.
- Next 16.3.5, React 19.3.0, Supabase JS 2.116.0 y js-cookie 3.0.8; dependencias transitivas actualizadas y lockfile conservado. `pnpm audit --prod` pasó de 48 avisos (2 críticos) a cero avisos conocidos. Esto no equivale a ausencia de todas las vulnerabilidades.

## Validación

- `pnpm test:security`: 26 pruebas aprobadas (sesión, identidad, logout, integración, sincronización, redirecciones, origen y envío nativo).
- `scripts/test-manual-glucose.cjs`: 4 pruebas aprobadas para comprobar conservación del trabajo previo.
- `bash scripts/test-multiuser.sh`: migraciones y consultas reales en PostgreSQL 16 desechable; RLS, separación de cuentas, RPC, backfill, preservación y rollback aprobados. El error de unicidad del último caso es intencional y verifica el rollback.
- `pnpm build`: compilación y TypeScript aprobados.
- Lint focalizado de proxy, rutas, autenticación y configuración aprobado. El lint de la página y cliente histórico contiene incidencias preexistentes; no se declara lint global limpio.
- HTTP local sobre el build: rutas clínicas e integraciones sin sesión/token devuelven 401 con no-store; escrituras cruzadas, null o sin origen devuelven 403; fallback POST devuelve 400 sin secretos; parámetros sensibles redirigen sin query.
- Navegador local: formulario conservado visualmente y DOM con método POST y destino fijo. No se probó un login real con dos cuentas en producción.

## Activación pendiente

Se necesita el corte coordinado ya descrito en `multiusuario.md`: backup restaurable, pausa de importaciones, esquema y propietarios con evidencia, tokens de integración asociados, publicación coordinada de web/Edge y prueba real con dos cuentas. No desactivar RLS ni volver a la autenticación con identidad suministrada por el navegador para evitar este requisito.

No se auditó el contenido de logs/historial externos ni se rotaron credenciales. Si se confirma que una contraseña estuvo en una URL, debe cambiarse en LibreLinkUp y revisarse el historial/logs afectados. Falta evaluar y activar limitación distribuida de intentos de login en el despliegue; un contador en memoria no protegería todas las instancias serverless.

## Referencias

- [Sesiones, cookies y caché de Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Aviso de seguridad de Next sobre optimización AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
- [Convención Proxy de Next](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
