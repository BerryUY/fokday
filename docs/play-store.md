# Publicar FokDay en Google Play

Camino: **prueba cerrada con 12 personas durante 14 días** (Google lo exige a las cuentas personales nuevas) → **producción** (pública).

Todo lo que dice "vos" son claves o cuentas que solo vos podés crear. Ninguna clave secreta va en el código: las secretas se cargan en Supabase → Edge Functions → Secrets, y las públicas en `src/config.ts`.

---

## 1. Cuentas y claves (una sola vez)

### 1.1 Google Play Console
1. Cuenta de desarrollador en <https://play.google.com/console> (pago único de US$25 y verificación de identidad).
2. Crear la app: nombre **FokDay**, idioma **Español (Latinoamérica)**, **App**, **Gratis** (las suscripciones van dentro de una app gratis).
3. **Cuenta de comerciante** (Configuración → Perfil de pagos): necesaria para cobrar Pro. Uruguay está habilitado y Google paga en USD.
4. **Suscripciones** (Monetizar → Productos → Suscripciones): crear `fokday_pro` con dos planes base:
   - `mensual`: US$2,99 por mes;
   - `anual`: US$19,99 por año.
   - Opcional: una prueba gratis de 7 días en el anual.
   - Google convierte los precios a pesos uruguayos solo.

### 1.2 Google Cloud (para "Continuar con Google")
1. En <https://console.cloud.google.com>, en un proyecto nuevo, configurar la **pantalla de consentimiento OAuth** (externa, nombre FokDay, tu email de soporte).
2. Credenciales → Crear ID de cliente OAuth → **Aplicación web**. Guardá el *ID de cliente* y el *secreto*.
3. Crear otro ID de cliente → **Android**, paquete `uy.santiago.momentum`, con el **SHA-1** de:
   - la clave de EAS: `npx eas-cli@latest credentials -p android` → muestra el SHA-1;
   - la clave de firma de Play: Play Console → Prueba y lanzamiento → Configuración → Integridad de la app → Firma de apps.
   - Hacen falta los dos: uno para los APK de prueba y otro para lo que baja de Play.
4. En Supabase → Authentication → Sign In / Providers → **Google**: activarlo y pegar el ID de cliente web y el secreto. En "Authorized Client IDs" agregá también el ID web.
5. Pasame el **ID de cliente web** (es público): va en `src/config.ts` → `googleWebClientId`.

### 1.3 Supabase Auth (email y contraseña)
1. Authentication → Sign In / Providers → Email: dejá activado "Email", **apagá "Confirm email"** (Supabase solo manda mails a los miembros del equipo si no hay SMTP propio).
2. Para "Olvidé mi contraseña":
   - conectá un SMTP gratis (Brevo o Resend) en Authentication → Emails → SMTP Settings;
   - en la plantilla **Reset Password** poné el código: `Tu código para FokDay es {{ .Token }}`.
3. Authentication → Rate Limits: dejá los valores por defecto (frenan registros masivos).

### 1.4 RevenueCat (suscripciones)
1. Cuenta en <https://www.revenuecat.com>. Crear el proyecto FokDay y la app **Play Store** con el paquete `uy.santiago.momentum` y la **cuenta de servicio** de Play (la guía de RevenueCat explica cómo crearla).
2. Importar los productos de `fokday_pro` y crear:
   - el **entitlement `fokday_pro`** con los dos productos adentro (la app también acepta `pro`);
   - la **oferta `default`** con los paquetes *Monthly* y *Annual*.
3. Pasame la **clave pública de Android** (empieza con `goog_`): va en `src/config.ts` → `revenueCatAndroidKey`.
4. Cargá la **clave secreta** (Project settings → API keys → secret, empieza con `sk_`) en Supabase → Edge Functions → Secrets como `REVENUECAT_SECRET_KEY`. No me la pases.
5. **Testers de la beta con Pro gratis:** en RevenueCat → Customers, buscá a cada uno (su ID es el de su cuenta FokDay) → *Grant promotional entitlement* → `fokday_pro`. Otra opción: decime el email y lo marco como Pro desde la base.

### 1.5 AdMob (videos con premio)
1. Cuenta en <https://admob.google.com>, agregar la app Android (cuando ya esté en Play, o "no está publicada").
2. Crear una unidad **Recompensado** ("Premio": 1, "foto"). En la configuración avanzada activá la **verificación del lado del servidor** con esta URL:
   `https://eqvyjnhkhyqzwurdtumh.supabase.co/functions/v1/momentum/api/ads/reward`
3. Pasame el **ID de la app** (`ca-app-pub-…~…`) y el de la **unidad** (`ca-app-pub-…/…`). Son públicos:
   - el ID de la app va en `app.json` (plugin `react-native-google-mobile-ads`);
   - el de la unidad va en `src/config.ts`.
   - Hasta entonces la app usa los IDs de prueba de Google. **No publiques con los IDs de prueba.**
4. En AdMob → Privacidad y mensajes, creá el mensaje de consentimiento (GDPR) y el de los estados de EE. UU. La app los muestra sola cuando corresponde.
5. Agregá tu teléfono como **dispositivo de prueba** para no cobrar clics propios.

### 1.6 Gemini (IA)
Ya está la clave `GEMINI_API_KEY` en Supabase. Con usuarios pagos conviene activar la facturación del proyecto de Google AI Studio: cuesta centavos por foto y Google deja de usar las fotos para entrenar. Es el mismo proyecto de la clave, no hay que tocar código.

### 1.7 Páginas públicas
Publicá estas dos páginas en una dirección pública, por ejemplo GitHub Pages desde la carpeta `docs/`, o Netlify arrastrando la carpeta:
- `docs/privacidad.html`: política de privacidad.
- `docs/eliminar-cuenta.html`: cómo borrar la cuenta (Play lo pide).

Publicadas en https://fokday.vercel.app/privacidad.html y https://fokday.vercel.app/eliminar-cuenta.html (contacto: fokday.app@gmail.com).

---

## 2. Build y envío

```bash
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest submit -p android --profile production
```

- El perfil `production` genera un **.aab** y sube el `versionCode` solo. El envío va a la pista **alpha (prueba cerrada)** como borrador.
- La primera vez Play exige subir el .aab a mano: Prueba → Prueba cerrada → Crear versión.

## 3. Prueba cerrada (12 personas, 14 días seguidos)
- Prueba → Prueba cerrada → Testers: una lista con los emails de Google de al menos **12 personas**.
- Compartí el link de adhesión. Tienen que **aceptar e instalar**, y seguir anotadas los 14 días. Si alguien se va, el conteo puede reiniciarse.
- Pasados los 14 días, Play habilita **Producción**. Ahí pedís el acceso respondiendo unas preguntas sobre la prueba.

## 4. Ficha de la tienda

**Nombre (máx. 30, el que se busca en Play):** FokDay: Calorías y Gimnasio

**Descripción breve (máx. 80):**
Contá calorías con una foto, escaneá productos y anotá tu gym. Todo en una app.

**Descripción completa:**

FokDay junta en una sola app el contador de calorías, tu rutina de gimnasio y tus hábitos. Sin pasar de una app a otra.

📸 Calorías con una foto
Sacale una foto al plato y la IA estima calorías, proteína, carbohidratos y grasas. Si algo no cierra, corregís los valores. Gratis: 1 foto por día, y otra más mirando un video corto.

🔎 Escáner de código de barras
Escaneá el paquete y se cargan los nutrientes del producto. También podés anotar comidas a mano o repetir las que ya comiste.

🏋️ Rutinas de gimnasio
Armá tus rutinas por día, anotá series, repeticiones y pesos, y mirá cómo progresás. Más de 800 ejercicios con instrucciones en español. Cuando terminás, deslizás y listo.

⚖️ Peso y metas
Bajar, subir o mantenerte: seguí tu peso con metas intermedias y tu objetivo de calorías y proteína del día.

✅ Hábitos y tareas
Agua, creatina, caminatas y tu lista del día. Los recordatorios te avisan solo de lo que te falta.

🔒 Tus datos son tuyos
Funciona sin internet. Si querés, entrás con tu cuenta y se respaldan solos en la nube.

FokDay Pro: 20 fotos con IA por día sin videos, escáner de códigos ilimitado, resumen semanal con IA, estadísticas de 90 días e historial completo, progreso por ejercicio y temas de color.

Las calorías que estima la IA son aproximadas y no reemplazan el consejo de un profesional de la salud.

**Categoría:** Salud y bienestar
**Imágenes:** ícono 512×512 (sale de `assets/icon.png`), gráfico destacado de 1024×500 y de 2 a 8 capturas. Se arman con la skill `creativo-ig`.

## 5. Formularios de Play Console (respuestas sugeridas, revisalas)

- **Acceso a la app:** todo funciona sin cuenta. La cuenta es opcional y gratis. Para revisar Pro, dales a los revisores una cuenta de prueba con Pro activado.
- **Anuncios:** **Sí, contiene anuncios.** Son videos con premio opcionales, nunca banners ni pantallas completas.
- **Clasificación de contenido (IARC):**
  - sin violencia ni apuestas;
  - la biblioteca compartida tiene contenido de usuarios (nombres de comidas), anónimo y moderado por límites;
  - hay compras dentro de la app.
- **Público objetivo:** 18+. No está dirigida a niños, lo que además evita la política de familias por los anuncios.
- **Apps de salud:** seguimiento de actividad física y nutrición. No es un dispositivo médico.
- **Seguridad de los datos:**
  - **Recopilados:**
    - email y nombre (cuenta);
    - salud y actividad física: peso, comidas y entrenamientos, en los respaldos;
    - fotos (solo para el análisis, no se guardan);
    - compras (historial de la suscripción);
    - ID del dispositivo o de publicidad (AdMob, para los videos);
    - interacciones en la app: uso diario de la IA y del escáner.
  - **Compartidos:**
    - con Google (Gemini) para analizar fotos;
    - con Google (AdMob) para los videos;
    - con RevenueCat para validar compras;
    - con Open Food Facts, solo el número del código de barras.
  - **Cifrado en tránsito:** sí. **Se pueden borrar:** sí (desde la app y desde la web).
- **Política de privacidad:** la URL de `docs/privacidad.html`.
- **Eliminación de la cuenta:**
  - en la app: Ajustes → tu cuenta → Eliminar mi cuenta;
  - en la web: la URL de `docs/eliminar-cuenta.html`.
- **Declaración de ID de publicidad:** sí, la app usa el ID de publicidad (AdMob).

## 6. Antes de publicar (checklist final)
- [ ] IDs reales de AdMob (app y unidad), sin los de prueba.
- [ ] `googleWebClientId` y `revenueCatAndroidKey` en `src/config.ts`.
- [ ] `REVENUECAT_SECRET_KEY` cargada en Supabase.
- [ ] Email de contacto en las dos páginas, y las dos publicadas.
- [ ] Probado en el teléfono: entrar con Google y con email, comprar con una cuenta de prueba de licencias de Play, ver un video y que sume, escanear un producto.
- [ ] Capturas de la tienda.
