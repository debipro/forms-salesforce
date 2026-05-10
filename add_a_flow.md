# Cómo agregar un flujo nuevo

Cuando Debi libera un flujo nuevo (por ejemplo "alta de nuevo donante"
o "donación única extra"), te va a mandar **2-3 archivos** por mail o
por la documentación. Para activarlos basta con dejarlos caer en tu fork
en la ruta correcta y commitear: Vercel deploya solo.

## Convención

Si el flujo se llama, por ejemplo, `new-donor-signup`, los archivos van a:

```
pages/flow/new-donor-signup.vue
server/api/flow/new-donor-signup.post.ts
```

Opcional, si el flujo trae componentes propios:

```
components/NewDonorSignupForm.vue
```

Una vez subidos, el flujo queda vivo en:

```
https://<tu-proyecto>.vercel.app/flow/new-donor-signup
```

Sin tocar `nuxt.config.ts`, sin agregar variables de entorno, sin
registrar nada en ningún lado. Nuxt 3 detecta los archivos por
filesystem-routing y los activa al siguiente deploy.

## Qué puede importar un flujo

Para que cada flujo viva con sus propias decisiones de UI/UX y no se
pisen entre sí, los archivos del flujo solo importan los **primitivos
compartidos**:

- `server/utils/salesforce.ts` — conexión a Salesforce y helpers comunes.
- `composables/useDebiClient.ts` — handle al SDK de Debi en el navegador.
- `components/PaymentMethodForm.vue` — subform de tarjeta/CBU si el flujo
  necesita tokenizar.

Cualquier otra cosa (estado, validación, copys, layout) vive dentro del
propio archivo del flujo.

## Sacar un flujo

Borrá los archivos del flujo y commiteá. La ruta deja de existir en el
próximo deploy.
