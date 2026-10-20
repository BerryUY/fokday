# Momentum

Personal Android fitness tracker for one person: nutrition (with the plan from plancomidas.netlify.app built in), gym attendance, routines and live workouts, body weight toward 65 kg, statistics and history. Works fully offline; backs up to Neon PostgreSQL automatically when there is internet. All UI text is in Spanish (Uruguay).

## Architecture

```
Android app (Expo SDK 58, React Native, TypeScript, Expo Router)
 ├─ SQLite (expo-sqlite) ← primary database, every action is saved here first
 │   meals · meal_logs · routines · sessions · sets · attendance · weight · goals · notes …
 └─ Backup service (only when online)
      └─ HTTPS + personal token → Vercel Function (server/) → Neon PostgreSQL
```

- **Local-first.** Every screen reads and writes SQLite. Nothing waits on the network, and the app never needs the API to work.
- **Backups are full, versioned snapshots.** SQLite triggers bump a `local_revision` counter on every write. When it is ahead of the last backed-up revision and the phone is online, the app uploads a checksummed JSON snapshot of all tables. The server stores each one as a new version (keeps the last 60 by default).
- **No duplicates.** A retry reuses the same backup id and the server ignores ids it already has. Restores replace tables inside one transaction, so sync retries can never duplicate meal logs.
- **No silent overwrites.** Restoring is always a manual, confirmed action. It shows what the backup contains and warns if local changes would be lost. A local safety copy is written first. After a reinstall, automatic backups stay paused until you decide whether to restore the cloud backup or keep the phone's data.
- **Security.** No login UI. The API needs `Authorization: Bearer <MOMENTUM_API_TOKEN>`. The token lives in SecureStore on the phone and in Vercel env vars on the server. Database credentials never ship in the APK.

Decisions you may want to know about:
- **Backend: Vercel Functions** (the fallback you named) with Neon's HTTP driver. It's a small, well-documented setup on both free tiers.
- **Styling: no NativeWind.** It adds Babel/Metro configuration risk that I couldn't verify on a device for SDK 58. Instead there is a typed design-token system (`src/theme`) with dark and light palettes.
- **Charts: custom SVG on `react-native-svg`.** The line chart, bars, rings and heatmap are small components with touch-to-inspect. This gives full control of the look and adds no heavy chart dependency.
- **Dates** are stored as `YYYY-MM-DD` keys in America/Montevideo time, so a meal logged at 23:30 counts for that day, not the UTC one.

## Project layout

```
src/app/            screens (Expo Router). (tabs)/ = Inicio, Comidas, Entrenar, Progreso, Historial
src/components/     design system (ui/), charts, calendars, feature components
src/data/           SQLite repositories (meals, workouts, attendance, weight, stats, history…)
src/domain/         pure calculations (nutrition totals, streaks, weight progress)
src/db/             schema + migrations, seeding, database client
src/backup/         snapshot export/import, sync logic, background service, JSON/CSV files
src/data/catalog.ts the meal plan (16 meals + guidance) extracted from plancomidas.netlify.app
server/             backup API (Vercel Functions + Neon)
test/               Jest tests (run against a real SQLite engine)
```

## Development

Requirements: Node 20+ (tested with Node 24), npm.

```bash
npm install
npm test            # 57 tests: totals, portions, snapshots, streaks, migrations, backup/restore, offline, API
npm run typecheck
npx expo start      # dev server; needs a development build on the phone (see below), not Expo Go
npm run web         # quick UI preview in a browser (uses SQLite's web build)
```

The local database needs no setup. It is created on first launch, migrated with `PRAGMA user_version`, and seeded once with the meal catalog and your defaults: 57 kg start, 65 kg target, 2750 kcal, 115 g protein. Personal history starts empty.

To try native code on a phone during development: `npx eas-cli@latest build -p android --profile development`, install that APK, then run `npx expo start`.

## 1. Neon database

1. Create a free account at https://neon.tech and a new project (region: São Paulo, `sa-east-1`, is the closest to Uruguay).
2. In the project dashboard, open **Connect** and copy the connection string (`postgresql://…?sslmode=require`).
3. Creating tables is optional: the API creates `momentum_backups` on first use. To do it by hand, run `server/schema.sql` in Neon's SQL Editor.

## 2. Backup API (Vercel)

1. Generate your personal token. Keep it in a password manager; you'll need it again after reinstalling:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Deploy `server/`, either way:
   - **Dashboard:** push this repo to GitHub, then go to vercel.com → *Add New Project* → import it → set **Root Directory** to `server`.
   - **CLI:** `cd server && npx vercel@latest` (link a new project), then `npx vercel@latest deploy --prod`.
3. In Vercel → Project → *Settings → Environment Variables* (Production), add:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `MOMENTUM_API_TOKEN` | the token from step 1 (min. 32 characters) |
   | `MAX_BACKUPS` | optional, default `60` |
   Redeploy after adding them.
4. Check it: `curl -H "Authorization: Bearer <token>" https://<your-app>.vercel.app/api/status` should return `{"ok":true,"count":0,...}`.

Endpoints: `GET /api/status`, `GET /api/backups` (list), `POST /api/backups` (upload), `GET /api/backups/latest` or `/api/backups/<id>` (download).

## 3. Connect the app

In the app: **⚙ (Inicio) → Datos y respaldo → Configurar conexión**. Enter the URL (`https://<your-app>.vercel.app`) and the token, then tap **Probar y conectar**. From then on it backs up by itself:
- a few seconds after connectivity returns,
- when the app comes to the foreground,
- about 20 s after a change,
- every 15 minutes while it's open,
- and on demand with **Respaldar ahora**.

Failed uploads retry with backoff (30 s, 2 min, 10 min, 30 min) and never touch local data.

The same screen also has:
- **Exportar / Importar respaldo (JSON):** a full local backup that doesn't depend on Neon. It's validated with a checksum before anything is replaced.
- **Exportar CSV:** meals, weight, workout sets or attendance, for the last 30 or 90 days or everything.
- **Copias automáticas:** safety copies taken before any restore or reset (the last 5 are kept).
- **Borrar todos mis datos:** asks for confirmation twice and saves a safety copy first.

## 4. Build the APK

```bash
npx eas-cli@latest login                 # free Expo account
npx eas-cli@latest build -p android --profile preview
```

The `preview` (and `production`) profiles in `eas.json` produce an **APK**, not an AAB. The first build asks to create a project and an Android keystore: let EAS generate and keep it. When the build finishes, open the link on your phone, download the APK and install it. You'll need to allow *Install unknown apps* for your browser or file manager. Expo Go is not needed.

If you have a local Android SDK + JDK 17 and want to skip the cloud queue, `npm run build:apk:local` builds on your machine.

## Updating without losing data

- Always install new APKs **over** the existing app. Don't uninstall first: uninstalling deletes the app's SQLite database.
- Updates must be signed with the same key. EAS reuses the stored keystore automatically. Back it up once with `npx eas-cli@latest credentials -p android` → *Download keystore*.
- Bump `expo.android.versionCode` (and `version`) in `app.json` before each build.
- Schema changes are new entries in `src/db/schema.ts → MIGRATIONS`. Never edit a released migration. Each one runs once, inside a transaction. A failed migration leaves the previous version intact, and the app refuses to open a database written by a newer version.
- Catalog changes: add meals to `src/data/catalog.ts` with `since: <new CATALOG_VERSION>` and bump `CATALOG_VERSION`. Meals you edited or deleted are never overwritten or re-added.

## Restoring after reinstall or on a new phone

1. Install the APK and open **Ajustes → Datos y respaldo → Configurar conexión** with the same URL and token.
2. The app finds the backups in Neon and offers **Restaurar el último respaldo** (or *Mantener los datos de este teléfono*). Older versions are available under **Restaurar desde la nube**.
3. If the API isn't available, use **Importar respaldo (JSON)** with a file you exported.

## Free-tier notes (check current limits on each provider's pricing page)

- **Size:** each backup is a full snapshot. A year of heavy use is around 1–2 MB of JSON, and Postgres compresses large text values automatically. With 60 versions kept, that stays well within Neon's free storage. Lower `MAX_BACKUPS` if you ever get close.
- **Request limit:** Vercel limits function request bodies to about 4.5 MB. The API rejects anything over 4.4 MB with a clear message. That's many years of data away; if you ever hit it, export JSON locally and lower history in the app.
- **Cold starts:** Neon's free compute suspends when idle, so the first backup after a pause can take a few seconds. The app has a 45 s timeout and retries automatically.
- **When backups run:** only while the app is open or in the foreground; there is no background job when the app is closed. Opening the app once online is enough.

## Tests

`npm test` runs Jest in Node against a real SQLite engine (`node:sqlite`) using the same SQL as the app:

- `nutrition.test.ts`: daily totals, multiple meals per category, portions (0.5×–2×), manual corrections, historical snapshots after template edits, duplicating a day, missing days vs. zeros, goal versions, Montevideo day boundaries.
- `weight.test.ts`: progress without fake data, rolling average, weekly/monthly change, milestones, one entry per day.
- `attendance.test.ts`: streaks that respect training days, rest days, extra sessions, consistency, duplicate prevention, finishing/cancelling/deleting workouts, history surviving routine edits, progression.
- `migrations.test.ts`: fresh schema, idempotency, rollback on failure, newer-database guard, foreign keys, seed-once without overwriting edits.
- `backup.test.ts`: snapshot round-trip, tamper/foreign/newer/incomplete detection, atomic restore, offline behavior, failed uploads, retry without duplicates, reinstall restore, newer-local-data warning.
- `server.test.ts`: token checks, checksum validation, version pruning, and an end-to-end phone → API → new phone restore.
