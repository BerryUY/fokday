# FokDay · imágenes de Google Play

Todo lo que se ve adentro de los teléfonos son **capturas reales de la app** (versión web) con datos de ejemplo. No hay pantallas dibujadas.

## Qué subir a Play Console (Ficha de la tienda principal)

| Campo de Play | Archivo |
|---|---|
| Ícono de la app (512×512) | `output/play-icon-512.png` |
| Gráfico de funciones (1024×500) | `output/play-feature/01.png` |
| Capturas de pantalla del teléfono (en este orden) | `output/play-screenshots/01.png` … `06.png` |

Los textos de la ficha (título, descripción breve y completa) están en `../docs/play-store.md`, sección 4.

## Cómo regenerarlas

```bash
cd store-assets && npm i
npx jest -c store-assets/jest.demo.config.cjs   # desde la raíz del repo: arma demo/fokday-demo.json con fecha de hoy
npx expo start --web --port 8082                # desde la raíz, en otra terminal
export MSYS_NO_PATHCONV=1                        # solo en Git Bash
node scripts/app-session.mjs import             # importa el respaldo de ejemplo en un perfil de Chrome aparte (.app-profile)
node scripts/app-session.mjs shoot home /       # y así cada pantalla: comidas /comidas, entrenar /entrenar, progreso /progreso, peso /peso, historial /historial, pro /pro
node scripts/app-session.mjs session            # arranca la rutina del día y completa dos series (sesion.png)
node scripts/build-play.mjs
W=1080 H=1920 node scripts/render.mjs slides/play output/play-screenshots
W=1024 H=500 node scripts/render.mjs slides/feature output/play-feature
```

- `demo/demo-data.test.ts` arma el respaldo de ejemplo usando las mismas funciones de la app (persona ficticia "Sofía").
- `scripts/app-session.mjs` fija la hora en 16:45 para que el saludo y las comidas del día se vean normales, y usa un ancho de 412 px (Android típico).
- Dirección de arte: `research/art-direction.md`. Colores exactos de `src/theme/tokens.ts` y del logo (`src/brand/mark.ts`).
