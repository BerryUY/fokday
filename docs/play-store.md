# Publicar Momentum en Google Play (prueba interna)

La idea es que la usen solo conocidos: se publica en el **canal de prueba interna** de Play Console, que admite hasta 100 testers por invitación y no aparece en búsquedas.

## 1. Lo que tenés que hacer vos (una sola vez)

1. Crear la cuenta de desarrollador en <https://play.google.com/console> (pago único de US$25 y verificación de identidad).
2. Crear la app: nombre **Momentum**, idioma **Español (Latinoamérica)**, tipo **App**, **Gratis**.
3. El servidor ya está en Supabase y la app ya tiene su dirección. Completá tu email de contacto en `docs/privacidad.html` y publicala en una dirección pública (por ejemplo GitHub Pages desde la carpeta `docs/`, o Netlify arrastrando el archivo). Esa URL es la política de privacidad para Play.

## 2. Generar el paquete para la tienda

```bash
npx eas-cli@latest build -p android --profile production
```

El perfil `production` genera un **.aab** (lo que pide Play) y sube solo el `versionCode`. Se firma con la misma clave que las APK de prueba, así que las actualizaciones se instalan encima.

Para subirlo directo a la prueba interna (como borrador), después de crear la cuenta de servicio de Google Play que pide EAS:

```bash
npx eas-cli@latest submit -p android --profile production
```

La primera vez Play Console exige subir el .aab a mano (Prueba → Prueba interna → Crear versión). Después ya podés usar `eas submit`.

## 3. Ficha de la tienda

**Nombre:** Momentum

**Descripción breve (máx. 80):**
Comidas, entrenamientos y peso en un solo lugar. Simple, sin publicidad.

**Descripción completa:**

Momentum te ayuda a sostener tus hábitos de comida y entrenamiento sin complicarte.

• Comidas: registrá lo que comés con un toque, en porciones, y mirá calorías y proteína del día. Si querés, sumá carbohidratos, grasas, fibra o lácteos.
• Entrenamientos: armá tus rutinas con ejercicios por día (lunes piernas, martes pecho…), registrá series y pesos, y mirá tu progreso.
• Otras actividades: caminatas, bici, correr o fútbol también cuentan para tu racha.
• Peso: seguí tu camino hacia tu meta, ya sea subir, bajar o mantenerte, con hitos intermedios.
• Hábitos: agua y creatina del día, si los querés usar.
• Recordatorios: avisos para ir al gym, registrar comidas o tomar agua, a la hora que elijas.
• Tus datos son tuyos: todo funciona sin internet y podés exportarlo cuando quieras. Respaldo opcional en la nube.

Sin publicidad y sin rastreo.

**Categoría:** Salud y bienestar
**Imágenes:** ícono 512×512 (sale de `assets/icon.png`), gráfico destacado 1024×500 y de 2 a 8 capturas de teléfono. Se preparan con la skill `creativo-ig`, con la app ya terminada.

## 4. Formularios de Play Console (respuestas sugeridas)

Revisalas antes de enviar: las preguntas exactas pueden cambiar.

- **Acceso a la app:** todo es accesible sin cuenta; el respaldo en la nube es opcional y usa un código de invitación.
- **Anuncios:** no tiene anuncios.
- **Clasificación de contenido:** cuestionario IARC; la app no tiene violencia, apuestas ni contenido generado por otros usuarios.
- **Público objetivo:** mayores de 18 (o 13+); no está dirigida a niños.
- **Seguridad de los datos:**
  - Datos recopilados (solo si se activa el respaldo en la nube): nombre; salud y actividad física (peso, comidas, entrenamientos); preferencias de la app.
  - Finalidad: funcionalidad de la app (respaldo y recuperación). No se comparten con terceros.
  - Cifrado en tránsito: sí (HTTPS). El usuario puede pedir que se borren: sí.
- **Apps de salud:** si la consola pide la declaración de apps de salud, marcá seguimiento de actividad física y nutrición, y aclará que no es un dispositivo médico.
- **Política de privacidad:** la URL donde publiques `docs/privacidad.html`.
- **Eliminación de la cuenta:** desde la app, Ajustes → Datos y respaldo → Eliminar mi perfil de la nube; o por email al contacto de la política de privacidad.

## 5. Invitar a tus conocidos

Prueba → Prueba interna → Testers: creá una lista con sus emails de Google y compartí el link de adhesión. Lo abren desde el teléfono, aceptan y la instalan desde Play Store. Para la nube, pasales tu código de invitación (está en `codigo-invitacion.txt`, que no se sube a GitHub).

## Más adelante: plan pago

En apps de Play, las suscripciones o compras de funciones digitales tienen que cobrarse con la **facturación de Google Play** (Google se queda con un porcentaje; para suscripciones suele ser 15 %). Cobrar con Mercado Pago dentro de la app no está permitido para contenido digital, salvo programas especiales de facturación alternativa que dependen del país. Antes de implementarlo, conviene revisar la política vigente de Pagos de Google Play para Uruguay. El servidor ya guarda un campo `plan` por perfil para cuando llegue ese momento.
