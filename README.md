# LDC · Cotizador Pricing

App de Pricing (React + Vite + Supabase) para cotizaciones marítimas y carga masiva
de costos de naviera desde el Excel maestro.

## Desarrollo
1. `npm install`
2. Copia `.env.example` a `.env` (ya trae el proyecto Supabase de LDC).
3. `npm run dev`

## Deploy (Vercel)
- Repo nuevo en GitHub → import en Vercel.
- Variables de entorno en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Framework: Vite. Build: `npm run build`. Output: `dist`.

## Supabase — correr una vez (SQL Editor), en orden
1. `supabase_ldc_full_setup.sql`
2. `surcharges_catalog.sql`
3. `navieras_catalog.sql`
4. `cotizaciones_surcharges_addon.sql`
5. `cotizaciones_commodity_addon.sql`
6. `cotizaciones_basis_addon.sql`

Auth: Email OTP activado, confirmación de correo desactivada.
Roles en `allowed_users` (admin / pricing / sales).
