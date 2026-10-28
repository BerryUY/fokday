# FokDay

Formerly called Momentum. The internal identifiers keep that name on purpose (Android package `uy.santiago.momentum`, EAS slug, database file, backup format, the Supabase function and tables) so updates install over the old app and old backups still restore.

Android fitness tracker for a small group of people (the owner and friends): nutrition (with the plan from plancomidas.netlify.app built in), gym attendance, routines with per-day exercises, live workouts, free activities (walks, cycling), body weight toward a goal (up, down or maintain), optional trackers (water, creatine, carbs, fat, fiber, dairy), local reminders, statistics and history. A short step-by-step welcome sets each person up. Works fully offline; each person can back up to Supabase through their own profile. All UI text is in Spanish (Uruguay).

Publishing to Google Play (internal testing): see [docs/play-store.md](docs/play-store.md).

## Architecture

```
Android app (Expo SDK 58, React Native, TypeScript, Expo Router)
 ├─ SQLite (expo-sqlite) ← primary database, every action is saved here first
 │   meals · meal_logs · routines · sessions · sets · attendance · weight · goals · notes …
 └─ Backup service (only when online)
      └─ HTTPS + per-profile token → Supabase Edge Function `momentum` → Postgres (profiles, backup list) + private Storage (gzip snapshots)
```

- **Local-first.** Every screen reads and writes SQLite. Nothing waits on the network, and the app never needs the API to work.
- **Backups are full, versioned snapshots.** SQLite triggers bump a `local_revision` counter on every write. When it is ahead of the last backed-up revision and the phone is online, the app uploads a checksummed JSON snapshot of all tables. The server stores each one as a new version (keeps the last 60 by default).
- **No duplicates.** A retry reuses the same backup id and the server ignores ids it already has. Restores replace tables inside one transaction, so sync retries can never duplicate meal logs.
- **No silent overwrites.** Restoring is always a manual, confirmed action. It shows what the backup contains and warns if local changes would be lost. A local safety copy is written first. After a reinstall, automatic backups stay paused until you decide whether to restore the cloud backup or keep the phone's data.
- **Profiles and security.** No passwords. A person creates a profile with the owner's invite code (its SHA-256 lives in the `momentum_config` table); the server returns a secret token that the app keeps in SecureStore and shows once as the *código de recuperación*. The server stores only its SHA-256 hash, and every backup belongs to one profile, so nobody can read anyone else's backups. Database credentials never ship in the APK.

Decisions you may want to know about:
- **Backend: Supabase** (Edge Function + Postgres + Storage, one free project). Tables have RLS on with no policies and the bucket is private, so only the function's secret key reaches the data. Snapshots are stored gzip-compressed; each profile keeps its 3 newest backups plus one per day for a week. The app uploads when you leave it (at most hourly) and every 6 hours while open, so the server stays mostly idle.
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
supabase/           backup API (Edge Function `momentum`) and its SQL migration
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

## 1–2. Backup server (Supabase)

Already set up in the Supabase project `momentum` (`eqvyjnhkhyqzwurdtumh`, São Paulo). To recreate it elsewhere:

1. Create a Supabase project and run `supabase/migrations/*.sql` (SQL Editor or `supabase db push`).
2. Deploy the function with JWT verification off (the app sends its own token): `supabase functions deploy momentum --no-verify-jwt`.
3. Set the invite code: generate one (`node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))"`), keep it in `codigo-invitacion.txt` (git-ignored), and store only its hash:
   `insert into momentum_config values ('invite_code_sha256', '<sha256 hex>') on conflict (key) do update set value = excluded.value;`
   Changing the code later only affects new profiles.
4. Put `https://<project>.supabase.co/functions/v1/momentum` in `app.json` → `expo.extra.backupApiUrl` and build again.

AI food photo (free): create a key at https://aistudio.google.com/apikey (free tier, no card) and set it as the secret `GEMINI_API_KEY` in Supabase → Edge Functions → Secrets. It uses `gemini-3.8-flash` (`supabase/functions/momentum/gemini.ts`). On the free tier Google may use the photos to improve its products, so the privacy page says so. If Google's free quota runs out, the app says so and the person logs the meal by hand.

Optional paid alternative: `ANTHROPIC_API_KEY` (Claude, `ai.ts`) is used only when there is no Gemini key. Without either key the app answers "El análisis con IA todavía no está activado". Each profile gets `ai_daily_limit` analyses per day (default 30); photos are not stored. Every value the AI returns can be edited before saving.

The public food library (`momentum_public_foods`) never exposes who shared a food; deleting a profile removes what it shared.

Limits live in `momentum_config`: `max_profiles` (default 50) and `min_upload_interval_seconds` (default 60, a guard against a client stuck in a loop).

Endpoints under `/api/`: `POST profiles` (create, needs the invite code), `DELETE profiles/me` (delete profile and all backups), `POST profiles/me/token` (new recovery code), `GET status`, `GET backups`, `POST backups`, `GET backups/latest` or `backups/<id>`. Everything except creating a profile needs `Authorization: Bearer <profile token>`.

## 3. Connect the app

Either type the invite code on the last-but-one step of the welcome screen, or later in **⚙ (Inicio) → Datos y respaldo → Crear mi perfil o conectar → Soy nuevo**. The app creates the profile, shows the *código de recuperación* once (save it in a password manager) and from then on backs up by itself:
- a few seconds after connectivity returns,
- when the app comes to the foreground,
- about 20 s after a change,
- every 15 minutes while it's open,
- and on demand with **Respaldar ahora**.

Failed uploads retry with backoff (30 s, 2 min, 10 min, 30 min) and never touch local data.

The same screen also has:
- **Exportar / Importar respaldo (JSON):** a full local backup that doesn't depend on the server. It's validated with a checksum before anything is replaced.
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

1. Install the app and open **Ajustes → Datos y respaldo → Crear mi perfil o conectar → Ya tengo un perfil** with your *código de recuperación* (also on the welcome screen: *Ya tengo un respaldo*).
2. The app finds the backups in the cloud and offers **Restaurar el último respaldo** (or *Mantener los datos de este teléfono*). Older versions are available under **Restaurar desde la nube**.
3. If the API isn't available, use **Importar respaldo (JSON)** with a file you exported.

## Free-tier notes (check current limits on each provider's pricing page)

- **Size:** each backup is a full snapshot, stored gzip-compressed. A year of heavy use is a few MB of JSON before compression, and each profile keeps about 10 copies.
- **Supabase Free:** 500 MB database, 1 GB file storage, 5 GB egress and 500,000 Edge Function invocations per month; a project with no activity for a week is paused (unpause it from the dashboard). Check the current numbers on supabase.com/pricing.
- **Request limit:** the API rejects snapshots over 4.4 MB with a clear message. That's many years of data away.

## Tests

`npm test` runs Jest in Node against a real SQLite engine (`node:sqlite`) using the same SQL as the app:

- `nutrition.test.ts`: daily totals, multiple meals per category, portions (0.5×–2×), manual corrections, historical snapshots after template edits, duplicating a day, missing days vs. zeros, goal versions, Montevideo day boundaries.
- `weight.test.ts`: progress without fake data, rolling average, weekly/monthly change, milestones, one entry per day.
- `attendance.test.ts`: streaks that respect training days, rest days, extra sessions, consistency, duplicate prevention, finishing/cancelling/deleting workouts, history surviving routine edits, progression.
- `migrations.test.ts`: fresh schema, idempotency, rollback on failure, newer-database guard, foreign keys, seed-once without overwriting edits.
- `backup.test.ts`: snapshot round-trip, tamper/foreign/newer/incomplete detection, atomic restore, offline behavior, failed uploads, retry without duplicates, reinstall restore, newer-local-data warning.
- `server.test.ts`: invite-code signup, per-profile tokens (only hashes stored), private backups per profile, checksum validation, version pruning, and an end-to-end phone → API → new phone restore.
- `optional.test.ts`, `days-activities.test.ts`, `reminders.test.ts`, `onboarding.test.ts`: optional trackers, routine exercises by weekday, free activities, reminder planning and onboarding suggestions.
