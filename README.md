# GlucoData Web

Aplicación web (Next.js) para visualizar y gestionar datos de glucosa sincronizados desde LibreLinkUp hacia Supabase.

## Stack

- Next.js 16
- React 19
- TypeScript
- TailwindCSS
- Supabase (Postgres + Edge Functions)

## Requisitos

- Node.js (recomendado: 20+)
- npm
- Proyecto Supabase (URL + anon key para el frontend)
- Supabase CLI (para deploy de Edge Functions y secrets)

## Desarrollo local

1. Instalar dependencias

```bash
npm install
```

1. Variables de entorno

Crear `.env.local` (no se commitea) con:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

1. Levantar el servidor

```bash
npm run dev
```

Abrí `http://localhost:3000`.

## Supabase

### Base de datos

La app usa tablas en el schema `public`. Algunas relevantes:

- `glucose_measurements`
- `provider_sessions`

### Edge Function: `sync-glucose`

Código en `supabase/functions/sync-glucose/index.ts`.

#### Secrets requeridos

Estos secrets deben configurarse en el proyecto de Supabase (no van en el repo):

- `LIBRE_EMAIL`
- `LIBRE_PASSWORD`

#### Deploy

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set LIBRE_EMAIL="..." LIBRE_PASSWORD="..."
supabase functions deploy sync-glucose --no-verify-jwt
```

### Ejecución periódica (cron)

Si querés que `sync-glucose` corra automáticamente, podés programarlo en el proyecto con `pg_cron` + `pg_net`.

Ejemplo (cada 5 minutos) en SQL Editor:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'sync_glucose_every_5min',
    '*/5 * * * *',
    $$
    select net.http_get('https://<project-ref>.supabase.co/functions/v1/sync-glucose');
    $$
  );
```

## Scripts

- `npm run dev`: servidor de desarrollo
- `npm run build`: build
- `npm start`: servidor de producción
- `npm run lint`: lint

### Despliegue

La aplicación se puede desplegar en Vercel.

## Troubleshooting

- **Edge Function error `permission denied for schema public`**
  - Asegurar GRANTs sobre `public` para `service_role` (y roles que correspondan).
- **Restore de DB falla con `uuid has no default operator class for gist`**
  - Habilitar `btree_gist` en el destino: `create extension if not exists btree_gist;`.
