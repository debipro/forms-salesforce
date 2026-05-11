# Cómo agregar un flow nuevo

> **Regla simple**: **cada flow es un archivo dentro de `pages/flow/`**.
> Para agregar un flow, creás un `.vue` ahí. Si el flow necesita guardar
> datos en Salesforce, agregás también su endpoint en `server/api/flow/`.

## Anatomía de un flow

Un flow tiene 2 archivos:

```
pages/flow/<nombre>.vue              ← el front (lo que ve el donante)
server/api/flow/<nombre>.post.ts     ← el back (qué hace cuando submitea)
```

Si tu flow recibe un parámetro en la URL (como el `oppId` del flow de
"actualizar donación"), lo metés en una subcarpeta:

```
pages/flow/<nombre>/[<param>].vue
server/api/flow/<nombre>/[<param>].post.ts
```

Esto es lo único raro. El resto es Vue normal.

## Ejemplos en este repo

| Flow | Archivo | URL final |
|---|---|---|
| Alta de Techo (entrega oficial) | `pages/flow/alta.vue` | `/flow/alta` |
| Alta de Reciduca (ejemplo) | `pages/flow/reciduca.vue` | `/flow/reciduca` |
| Actualizar donación por link | `pages/flow/actualizar-donacion/[oppId].vue` | `/flow/actualizar-donacion/<oppId>` |

Borrar un flow es borrar su archivo. Vercel deploya solo.

## Cómo se arma uno desde cero

Cada flow combina **steps** (pasos del wizard). Hay 5 steps reutilizables
en `components/steps/`:

| Step | Para qué sirve | Datos que captura |
|---|---|---|
| `PersonalDataStep` | Datos del donante | nombre, apellido, fecha de nacimiento, email, celular, país, provincia |
| `AmountStep` | Monto + frecuencia | monto (con presets opcionales) + "mensual" o "única vez" |
| `PaymentMethodStep` | Tarjeta o CBU vía Debi | token de pago tokenizado |
| `IdentificationStep` | DNI / CUIT / CUIL | número de documento (con validación según `mode`) |
| `AcceptanceStep` | Términos y condiciones | checkbox + extras opcionales (slot `#extra`) |

Y un orquestador de pasos: `components/flow/MultiStepFlow.vue` que se
encarga del indicador visual, navegación atrás/siguiente, y validación al
avanzar.

### Receta mínima: un flow nuevo en 30 líneas

Supongamos que querés agregar un flow de "upgrade" que solo le pide al
donante un monto nuevo y un método de pago:

```vue
<!-- pages/flow/upgrade/[oppId].vue -->
<script setup lang="ts">
import { ref } from "vue";
import AmountStep, { type AmountData } from "~/components/steps/AmountStep.vue";
import PaymentMethodStep, { type PaymentData } from "~/components/steps/PaymentMethodStep.vue";
import { useFlowState } from "~/composables/useFlowState";

const route = useRoute();
const oppId = String(route.params.oppId);

const state = useFlowState({
  amount: { value: null, frequency: "Mensual" } as AmountData,
  payment: { token: null } as PaymentData,
});

const amountRef = ref<InstanceType<typeof AmountStep> | null>(null);
const paymentRef = ref<InstanceType<typeof PaymentMethodStep> | null>(null);
const ok = ref<string | null>(null);

async function submit() {
  if (!(await amountRef.value?.validate())?.ok) return;
  if (!(await paymentRef.value?.validate())?.ok) return;
  await $fetch(`/api/flow/upgrade/${oppId}`, {
    method: "POST",
    body: { amount: state.value.amount.value, paymentMethodToken: state.value.payment.token },
  });
  ok.value = "Listo!";
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl p-6 space-y-6">
    <AmountStep ref="amountRef" v-model="state.amount" :presets="[10000, 20000, 30000]" />
    <PaymentMethodStep ref="paymentRef" v-model="state.payment" />
    <button @click="submit">Actualizar</button>
    <p v-if="ok">{{ ok }}</p>
  </main>
</template>
```

Más el endpoint:

```ts
// server/api/flow/upgrade/[oppId].post.ts
import { submitFlow } from "~/server/utils/salesforce";

export default defineEventHandler(async (event) => {
  const oppId = getRouterParam(event, "oppId")!;
  const body = await readBody(event);
  return submitFlow({
    oppId,
    amount: body.amount,
    paymentMethodToken: body.paymentMethodToken,
  });
});
```

Listo. `/flow/upgrade/<oppId>` queda vivo.

## Si necesitás un wizard de varios pasos

Envolvé los steps en `<MultiStepFlow :steps="N">` y dividilos en slots
`#step-1`, `#step-2`, etc. Mirá `pages/flow/alta.vue` (2 pasos) o
`pages/flow/reciduca.vue` (3 pasos) como referencia.

El orquestador descubre solo los steps usando un sistema de registro
(`useFlowStep` adentro de cada step), así que **no necesitás template
refs**. Solo tenés que decir `:step-index="N"` en cada step para indicar
a qué paso pertenece.

### Bonus: POST por paso (anti-abandono)

`MultiStepFlow` acepta un `:on-step-advance="..."` que se dispara después
de que un paso valida y antes de pasar al siguiente. Usalo para postear
datos parciales al server (por ejemplo, crear el Contact en Salesforce
después de capturar nombre + email, incluso si el donante abandona antes
de pagar).

Mirá `pages/flow/alta.vue` para ver cómo se conecta.

## Si querés un campo que ningún step ofrece

Tenés dos opciones:

1. **Lo más rápido**: agregalo en línea en el flow page usando los
   primitivos en `components/fields/` (`FieldText`, `FieldSelect`,
   `FieldButtonGroup`, `FieldCheckbox`). Vinculá el valor con
   `v-model="state.<key>"`. No hace falta tocar ningún step.

2. **Si lo vas a reusar**: creá un step nuevo en `components/steps/<MiStep>.vue`
   siguiendo la forma de los existentes. El contrato es: props
   `modelValue` + `stepIndex`, `defineExpose({ validate })`, y llamar a
   `useFlowStep({ stepIndex, validate })` en `<script setup>`.

## Si tu flow no usa Salesforce

El backend de cada flow es código tuyo en `server/api/flow/<nombre>.post.ts`.
Si querés mandar los datos a otro lado (Mailchimp, una API custom, etc.),
escribilo ahí. `server/utils/salesforce.ts` está como utilidad
preparmada, pero no es obligatorio usarla.

## Quitar un flow

Borrá los dos archivos (`pages/flow/<nombre>.vue` y
`server/api/flow/<nombre>.post.ts`). Listo, la ruta desaparece en el
próximo deploy.
