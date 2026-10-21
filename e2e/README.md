# Prueba de punta a punta del circuito (entorno local)

Corre el circuito entre sesiones contra una base local: PGlite con **todas las migraciones del repo** (RLS y funciones
reales), los datos de la demo y cuatro usuarios (Administración/Gerencia, Compras, Jefe de planta, Operario). No usa
la base real ni escribe en `supabase/`.

1. Base local (queda escuchando en `:54321`; la primera línea que imprime son los usuarios):

   ```sh
   npx tsx --tsconfig tsconfig.json e2e/pg-local.mts > /tmp/pg.out &
   ```

2. App apuntando a esa base:

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock-key npx next build
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock-key npx next start -p 3100 &
   ```

3. Prueba (necesita `playwright-core` instalado aparte y un Chromium):

   ```sh
   USERS="$(head -1 /tmp/pg.out)" CHROMIUM_PATH=/ruta/a/chromium node e2e/circuito.mjs
   ```

Imprime cada eslabón como `PASA` o `FALLA`. La base local se modifica al correr: para repetir, reiniciar el paso 1.

## Modo demostración (sin base para los datos)

La base local solo hace falta para el login (el middleware pide sesión). Después, todo corre en el navegador:

```sh
USERS="$(head -1 /tmp/pg.out)" CHROMIUM_PATH=/ruta/a/chromium node e2e/demo-persistencia.mjs
USERS="$(head -1 /tmp/pg.out)" CHROMIUM_PATH=/ruta/a/chromium MODE=despues OUT=docs/capturas-ux/demo/despues/ node e2e/demo-capturas.mjs
```

Para las capturas "antes", levantar la versión anterior en otro puerto y pasar `BASE=http://localhost:3101 MODE=antes`.
