# forms-org — Formulario de donación (Debi + Salesforce)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdebipro%2Fforms-org&env=SF_INSTANCE_URL,SF_REFRESH_TOKEN,SF_LOGIN_URL,DEBI_PUBLIC_KEY,DEBI_SECRET_KEY&envDescription=Las%205%20variables%20que%20pid%C3%B3%20Debi.%20Para%20las%203%20de%20Salesforce%2C%20us%C3%A1%20el%20asistente%20de%20onboarding%20que%20te%20mande%20Debi.%20Para%20las%202%20de%20Debi%2C%20copialas%20de%20https%3A%2F%2Fdebi.pro%2Fdashboard%2Fdevelopers.&envLink=https%3A%2F%2Fgithub.com%2Fdebipro%2Fforms-org%23variables-de-entorno)

Template auto-deployable de un formulario para que los donantes actualicen
su monto y método de pago. Una vez configurado, vive en
`https://<tu-proyecto>.vercel.app/flow/<id-de-oportunidad>`.

---

## Si vas a usar Vercel v0 o Cursor

Pegale a la IA exactamente este texto:

> Tengo un fork del template `debipro/forms-org`. Ayudame a deployarlo en
> Vercel. Necesito configurar 5 variables de entorno: SF_INSTANCE_URL,
> SF_REFRESH_TOKEN, SF_LOGIN_URL, DEBI_PUBLIC_KEY y DEBI_SECRET_KEY.
> Para los 3 primeros tengo que pedir a Debi la URL del asistente de
> onboarding y seguir el flujo que ahí me indican. Para los 2 últimos
> tengo que ir a mi panel de desarrolladores en debi.pro y copiar el
> pk_live_* (publishable) y el sk_live_* (secret). Guiame paso a paso.

---

## Cómo deployar (manual, sin IA)

1. **Tocá el botón "Deploy with Vercel"** de arriba. Vercel te va a pedir
   forkear el repo en tu GitHub y te abre un formulario con 5 campos vacíos.
2. **Conseguí los 3 valores de Salesforce.** Pedile a Debi (a tu contacto
   o a soporte) la URL del **asistente de onboarding**. Cuando la abras, te
   logueás con tu Salesforce y la pantalla final te muestra estos 3 valores
   listos para copiar:
   - `SF_INSTANCE_URL`
   - `SF_REFRESH_TOKEN`
   - `SF_LOGIN_URL`
3. **Conseguí los 2 valores de Debi.** Andá a
   <https://debi.pro/dashboard/developers> y copiá:
   - `DEBI_PUBLIC_KEY` → el valor `pk_live_*` (publishable)
   - `DEBI_SECRET_KEY` → el valor `sk_live_*` (secret)
4. **Pegá los 5 valores en Vercel** y tocá **Deploy**.
5. A los ~2 minutos tu formulario está vivo en
   `https://<tu-proyecto>.vercel.app/flow/<id-de-oportunidad>`.

---

## Variables de entorno

Son **5 obligatorias** y no hay opcionales. Si te falta alguna, el
formulario no levanta.

| Variable | De dónde sale |
|---|---|
| `SF_INSTANCE_URL` | Asistente de onboarding de Debi |
| `SF_REFRESH_TOKEN` | Asistente de onboarding de Debi |
| `SF_LOGIN_URL` | Asistente de onboarding de Debi (`https://login.salesforce.com` para prod, `https://test.salesforce.com` para sandbox) |
| `DEBI_PUBLIC_KEY` | <https://debi.pro/dashboard/developers> → `pk_live_*` |
| `DEBI_SECRET_KEY` | <https://debi.pro/dashboard/developers> → `sk_live_*` |

> `DEBI_SECRET_KEY` no la usa ningún flujo todavía, pero se carga ahora
> para que los flujos futuros (que sí van a hablar con Debi desde el
> backend) no te pidan volver a tocar la configuración.

---

## Cómo personalizar después de deployar

Todo se cambia editando archivos directamente. **No hay archivo de
configuración** ni JSON especial: si querés cambiar algo, abrí el `.vue`
o el `.css` y editalo (con la ayuda de v0 / Cursor si querés).

| Querés cambiar… | Editá |
|---|---|
| Color primario / fondos | `assets/css/main.css` (`--primary`, `--background` y compañía) |
| Tipografía principal | `assets/css/main.css` (`--font-sans-stack`) y el `<link>` de Google Fonts en `nuxt.config.ts` |
| Textos / copys del formulario | los `.vue` en `components/` y `pages/` |
| Nombres API de campos en Salesforce | la constante `FIELD_MAP` en `server/utils/salesforce.ts` |
| Agregar un flujo nuevo | mirá [`add_a_flow.md`](./add_a_flow.md) |

---

## Desarrollo local (opcional)

Si querés correr el formulario en tu máquina antes de subirlo:

```bash
npm install
cp .env.example .env
# completá los 5 valores en .env
npm run dev
```

Abre <http://localhost:3001/flow/006XXXXXXXXXXXX> reemplazando el ID por
una oportunidad real de tu Salesforce.

> El puerto local es **3001**, no 3000. Esto es para que coexista con el
> asistente de onboarding central de Debi (también Nuxt 3) si lo corrés en
> paralelo.

---

## Cómo Debi te va a mandar mejoras

Este template **se entrega una vez**. Después de que lo deployás, el repo
es 100% tuyo. Debi no le pushea commits a tu fork.

Puede que Debi, ofrezca nuevas plantillas, que podrían ser **2-3 archivos** que publica en la documentación y que se podrían agregar al repositorio como un flow nuevo (típicamente
`pages/flow/<nombre>.vue` y `server/api/flow/<nombre>.post.ts`), modificar según preferencias, y luego commit, push y en caso de usar Vercel se auto-deploya.


---

## ¿Qué hace exactamente este formulario?

- **`GET /flow/:oppId`** → muestra al donante un formulario con su monto
  actual y los campos para ingresar tarjeta o CBU.
- **`POST /api/flow/:oppId`** →
  1. Tokeniza la tarjeta/CBU con Debi (la SDK lo hace en el navegador con
     `DEBI_PUBLIC_KEY`).
  2. Crea un registro `TCPagos__Payment_Method__c` en Salesforce con el
     token.
  3. Actualiza la Oportunidad con el monto nuevo y, si la oportunidad
     tiene una Donación recurrente vinculada, también la actualiza.

Las credenciales de Salesforce **nunca llegan al navegador**: se quedan
en el backend de Vercel.

---

## Archivos principales

```
.
├── pages/
│   ├── index.vue                 (landing simple)
│   └── flow/[oppId].vue          (página del donante)
├── components/
│   ├── FlowForm.vue              (formulario completo)
│   ├── PaymentMethodForm.vue     (subform de tarjeta/CBU + tokenización)
│   └── ThemeSwitcher.vue         (claro / oscuro / auto)
├── composables/
│   ├── useDebiClient.ts          (handle al SDK de Debi en el browser)
│   └── useThemePreference.ts     (storage del tema)
├── server/
│   ├── api/flow/[oppId].get.ts   (lectura de la oportunidad)
│   ├── api/flow/[oppId].post.ts  (envío del flujo)
│   └── utils/salesforce.ts       (jsforce + lógica de Salesforce)
├── assets/css/main.css           (tokens de colores y fuentes)
├── nuxt.config.ts
├── package.json
└── .env.example
```
