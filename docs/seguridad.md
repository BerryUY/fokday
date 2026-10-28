# Revisión de seguridad: FokDay 1.3.0 (28/10/2026)

## Qué se revisó y cómo
| Área | Prueba | Resultado |
|---|---|---|
| Claves expuestas | Búsqueda de patrones de claves (Supabase secret/service_role, Google `AIza…`, RevenueCat `sk_`, claves privadas) en todos los archivos versionados y en el bundle compilado de Android | Ninguna. En la app solo van valores públicos por diseño (URL y clave publicable de Supabase, IDs de cliente), centralizados en `src/config.ts` |
| Código de invitación | `git log --all` del archivo | Nunca estuvo en git |
| Base de datos | Acceso con la clave publicable a las 7 tablas por REST | Todas rechazadas (42501). RLS activo sin políticas, permisos revocados a `anon` y `authenticated` |
| Funciones SQL | Llamadas RPC con parámetros válidos | Todas rechazadas (42501) |
| Almacenamiento | Listar el bucket `backups` y los buckets | Vacío o sin acceso: bucket privado |
| API: autenticación | JWT falsos, tokens cortos o inventados, sin token | 401 en todas las rutas protegidas |
| Videos con premio | Firmas falsas, `user_id` con inyección, transacción repetida | 403, 400 y sin doble crédito (verificación ECDSA P-256 con las claves de Google; transacciones únicas en la base) |
| Límites diarios | 10 pedidos en paralelo con 2 fotos disponibles | Solo 2 pasan (reserva atómica en la base; se devuelve si falla) |
| Cuentas | 6 primeros pedidos simultáneos de una cuenta nueva | Un solo perfil |
| Tamaño de pedidos | Cuerpo de 5 MB | 413 |
| Datos en el teléfono | Sesión de la cuenta | En SecureStore (Keystore de Android), partida en fragmentos; no queda en archivos comunes ni en las copias de Android |
| Avisos de Supabase | Security y Performance advisors | Solo informativos: tablas sin políticas (a propósito) e índice nuevo todavía sin uso |
| Dependencias | `npm audit --omit=dev` | 3 "high" en `zod` dentro de `@expo/cli`, que es una herramienta de compilación y no va en el APK. Se resuelve con la próxima versión del SDK |

## Arreglos hechos en esta revisión
- **Carrera en los límites:** antes se leía el uso y después se sumaba. Ahora la base reserva el uso en un solo paso (`momentum_try_use`) y lo devuelve si la IA o la búsqueda fallan (`momentum_refund_use`).
- **Perfil duplicado:** dos primeros pedidos simultáneos de una cuenta podían intentar crear dos perfiles. Ahora gana uno y el otro lo reutiliza.
- **Videos:** se valida que `user_id` sea un UUID y que la transacción tenga un largo acotado antes de tocar la base.
- **Resumen semanal:** máximo 3 por día con Pro, para que nadie agote el cupo de IA compartido.
- **Caché de Pro:** un "no es Pro" se recuerda solo 30 s, así una compra nueva se nota enseguida.

## Riesgos que quedan (y qué hacer)
1. **Registro masivo de cuentas:** cualquiera puede crear cuentas con la clave publicable (es normal en Supabase). Cada cuenta tiene sus propios límites diarios de IA, así que muchas cuentas podrían gastar el cupo gratis de Gemini.
   - Mitigación actual: los límites de velocidad de Supabase Auth y `max_profiles` (1000).
   - Si pasa: activar el CAPTCHA de Supabase Auth (hCaptcha o Turnstile) o pasar Gemini al plan pago.
2. **Contraseñas:** la app exige 8 caracteres, pero conviene exigirlo también en el servidor: Supabase → Authentication → Sign In / Providers → Email → *Minimum password length* = 8. La protección contra contraseñas filtradas requiere el plan Pro de Supabase.
3. **IDs de prueba de AdMob:** hay que reemplazarlos antes de publicar (ver `docs/play-store.md`).
4. **Función `fokday-translate`:** quedó desactivada (responde 410). Borrala desde Supabase → Edge Functions si querés limpiar.
5. **Fotos en el plan gratis de Gemini:** Google puede usarlas para entrenar. Está declarado en la política de privacidad; se elimina al activar la facturación.
