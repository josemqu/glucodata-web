# Inicio de sesión en producción — 19 de septiembre de 2026

## Causa confirmada

La publicación de las 10:06 ART (`dpl_C2BQEkxzEmTWgm3kU368MEDbumkd`, commit `d5ae54e`) introdujo `loginUser` con dependencia de `app_users`, `user_patients` y `user_provider_sessions`. La consulta remota de esquema confirmó que `app_users` y `user_provider_sessions` no existen, y que `glucose_measurements` no tiene `user_id`. La migración multiusuario no se había aplicado.

El error de PostgREST se lanza como objeto y `getLatestGlucoseAction` solo muestra `.message` para instancias de `Error`; por eso el usuario veía «No se pudo completar la consulta».

## Recuperación

Se restauró en Vercel la última publicación anterior, del 13 de septiembre: `dpl_2jJj1b29KLF3UWAL1wodQ7ojuTVj` (`glucodata-hmz89o8ml-josemqus-projects.vercel.app`). Vercel confirmó el rollback. No se migró ni modificó la base de datos, las identidades o el cron. Se conservó el trabajo local, incluida la glucemia manual.

Se recargó la pestaña de producción y se comprobó el formulario sin el error previo. El usuario confirmó luego: «Sí, pude entrar». Se verificó además HTTP 200 en el inicio y HTTP 401 en eventos sin sesión.

## Antes de publicar de nuevo

El checkout actual sigue conteniendo la autenticación multiusuario incompatible con el esquema remoto. No publicar este checkout como reparación aislada. Completar y verificar el corte coordinado de `docs/multiusuario.md`, o preparar una versión compatible independiente. El rollback recupera el comportamiento anterior; no constituye la activación de la migración ni publica la carga manual.
