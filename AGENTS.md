# AGENTS.md — instrucciones para agentes que deployen este repo

Este archivo está pensado para vos, agente (Cursor, Vercel v0,
GitHub Copilot Chat, Claude, ChatGPT, etc.), cuando el usuario te pide
"ayudame a deployar este template en Vercel".

El usuario probablemente no sea técnico. **Asumí que tenés que hacer
todo el trabajo de configuración menos lo que requiere clicks
interactivos del usuario.** Cuando necesitás que el usuario haga algo
(loguearse a un servicio, copiar un valor de una pantalla), guialo paso
a paso.

---

## El flujo correcto, en orden

1. **Detectá si el usuario ya tiene el fork en GitHub.** Si no, dirigilo
   a tocar *"Fork"* en la página del template, eligiendo su usuario.
2. **Detectá si el usuario ya tiene cuenta en Vercel.** Si no, llevalo a
   <https://vercel.com/signup> y pedile que se loguee con GitHub para
   que Vercel pueda leer el fork.
3. **En Vercel: Add New → Project → seleccioná el fork.** Vercel detecta
   solo que es Nuxt 3.
4. **URL temporal**: sugerí algo simple como `techo.vercel.app` o
   `<nombre-org>-donaciones.vercel.app`. Explicá que el dominio final
   (`donar.techo.org`, etc.) se conecta después.
5. **Pedí las 5 variables de entorno y guardalas en el proyecto antes
   del primer deploy.** No deployees sin ellas: el sitio levanta pero
   los formularios responden con `"Falta la variable de entorno
   obligatoria: …"` en el primer submit.

---

## Cómo conseguir las 5 variables de entorno

### Las 3 de Salesforce — asistente OAuth de Debi

**No** intentes generar refresh tokens vos. Hay un asistente que lo hace
correctamente con PKCE y las URLs del Connected App ya autorizadas.

1. Abrí <https://forms.tc-cloud-partners.net/connect> (URL actual del
   asistente al momento de escribir este archivo).
2. Si esa URL no responde (404, timeout, etc.), buscá la URL actualizada
   en <https://debi.pro/docs> — el asistente puede mudarse y la doc
   siempre tiene la versión vigente.
3. En el asistente:
   - Pediúe al usuario elegir **Producción** o **Sandbox**:
     - **Producción** es lo correcto para casi todos los casos
       (`login.salesforce.com`).
     - **Sandbox** sólo si su Salesforce es de pruebas o la URL incluye
       `.sandbox.` (entonces `test.salesforce.com`).
   - El usuario va a hacer login en Salesforce y autorizar la app
     *"Debi Forms Onboarding"*. Vos no podés hacerlo por él.
   - La pantalla final muestra los **3 valores** (`SF_INSTANCE_URL`,
     `SF_REFRESH_TOKEN`, `SF_LOGIN_URL`). Decile al usuario que los
     copie a Vercel **antes de los 5 minutos** porque la pantalla
     expira (no se guardan en disco).

### Las 2 de Debi — dashboard

1. Pedile al usuario abrir <https://debi.pro/dashboard/developers>.
2. Si no tiene cuenta o no tiene API keys creadas, guialo a abrirlas.
   En general necesita estar autenticado y los valores aparecen sin
   más click.
3. `DEBI_PUBLIC_KEY` = el valor que empieza con `pk_live_*` (o
   `pk_test_*` si todavía está en testing). Es **público**, se puede
   commitear, no hay riesgo si se filtra.
4. `DEBI_SECRET_KEY` = el valor que empieza con `sk_live_*`. **Nunca
   pongas esto en el front, en un commit ni en logs.** Va sólo como
   variable de entorno del backend en Vercel.

---

## Errores típicos al deployar

- **`Falta la variable de entorno obligatoria: SF_INSTANCE_URL`**
  El usuario no completó la variable en Vercel. Mandá a
  Settings → Environment Variables y agregala. Redeploy.

- **`INVALID_FIELD: No such column 'Foo__c' on entity Contact`**
  El backend está apuntando a una org de Salesforce que **no tiene** ese
  campo personalizado. Pasa típicamente cuando se prueba el flow de
  Reciduca contra el SF de Techo. Soluciones:
  - Si era una prueba, ignoralo o cambiá las env vars al SF correcto.
  - Si la org real efectivamente no tiene ese campo, editá
    `server/api/flow/<flow>.post.ts` y remové / renombrá el campo en
    el `extra.<sobject>` correspondiente.

- **Falló el primer deploy en Vercel**
  Mirá los logs. Si dice "missing module debi-js", no es ese el
  problema — el SDK se carga por CDN, no por npm. Suele ser un import
  TS que quedó colgado en algún archivo. Buscá `from "debi-js"` y
  cambialo por `from "~/composables/useDebiClient"`.

---

## Después del deploy

Pedile al usuario que abra `https://<su-proyecto>.vercel.app/` para ver
el listado de flows. Animalo a hacer la **prueba de 5 minutos** descrita
en el `README.md` (sección 3) — un alta de prueba + una actualización
+ un par de curls — para que entienda qué hace cada parte del repo.

Si va a embeber los formularios en otro sitio con `<iframe>`, mirá
README sección 6.
