<script setup lang="ts">
/**
 * Flow: "reciduca" — alta de donante con la forma de paso de Reciduca.
 *
 * URL: /flow/reciduca
 *
 * Este flujo existe como **segundo ejemplo** dentro del repo (la entrega
 * para Techo se hace con `/flow/alta`). Demuestra dos cosas que la
 * arquitectura tiene que poder absorber sin reescribir steps:
 *
 *   1. Orden diferente de pasos: acá el monto va PRIMERO (paso 1), después
 *      los datos personales (paso 2), y al final el método de pago + DNI
 *      (paso 3). Es la forma que tiene Reciduca en `debi-forms`.
 *
 *   2. Validador distinto para identificación: usa `CUIT_OR_DNI` (acepta
 *      7-11 dígitos), no solo DNI estricto.
 *
 * Como el Contact recién se puede crear cuando hay nombre/email (paso 2),
 * el `onStepAdvance` dispara la creación en `stepIndex === 2`, no en 1.
 * Esto muestra que el hook anti-abandono es per-flow, no global.
 *
 * Si el cliente quiere quitar este flujo, basta con borrar este archivo y
 * `server/api/flow/reciduca.post.ts`. La ruta /flow/reciduca deja de existir
 * en el próximo deploy y nada más se rompe.
 */
import { computed, ref } from "vue";
import MultiStepFlow from "~/components/flow/MultiStepFlow.vue";
import PersonalDataStep, {
  type PersonalData,
} from "~/components/steps/PersonalDataStep.vue";
import AmountStep, {
  type AmountData,
} from "~/components/steps/AmountStep.vue";
import PaymentMethodStep, {
  type PaymentData,
} from "~/components/steps/PaymentMethodStep.vue";
import IdentificationStep, {
  type IdentificationData,
} from "~/components/steps/IdentificationStep.vue";
import FieldText from "~/components/fields/FieldText.vue";
import { useFlowState } from "~/composables/useFlowState";
import { transformBirthDateToISO } from "~/composables/formatters";

useHead({ title: "Vos también sos protagonista - Reciduca" });

const route = useRoute();
const campaign = computed(() => {
  const q = route.query.campaign;
  return Array.isArray(q) ? String(q[0] ?? "") : String(q ?? "");
});

interface ReciducaState {
  amount: AmountData;
  personal: PersonalData;
  phoneFixed: string;
  payment: PaymentData;
  ident: IdentificationData;
}

const state = useFlowState<ReciducaState>({
  amount: { value: null, frequency: "Mensual" },
  personal: {
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    phone: "",
    country: "",
    province: "",
  },
  phoneFixed: "",
  payment: { token: null },
  ident: { number: "" },
});

const contactId = ref<string | null>(null);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

async function onStepAdvance(stepIndex: number) {
  // We can only create the Contact after step 2, where we collect the
  // donor's name + email. Step 1 only has amount/frequency.
  if (stepIndex !== 2) return;
  errorMessage.value = null;
  const res = await $fetch<{
    error: boolean;
    message?: string;
    data?: { contactId: string };
  }>("/api/flow/reciduca", {
    method: "POST",
    body: {
      stage: "personal",
      personal: {
        ...state.value.personal,
        birthDate: state.value.personal.birthDate
          ? transformBirthDateToISO(state.value.personal.birthDate)
          : undefined,
      },
      phoneFixed: state.value.phoneFixed || null,
      campaign: campaign.value || null,
    },
  });
  if (res.error) {
    throw new Error(
      res.message ?? "No pudimos guardar tus datos. Intentá de nuevo.",
    );
  }
  if (res.data?.contactId) contactId.value = res.data.contactId;
}

async function onSubmit() {
  errorMessage.value = null;
  if (!contactId.value) {
    errorMessage.value =
      "Perdimos la referencia a tu contacto. Recargá la página y volvé a intentar.";
    return;
  }
  if (!state.value.payment.token) {
    errorMessage.value = "Completá los datos de tu tarjeta o CBU.";
    return;
  }
  isSubmitting.value = true;
  try {
    const res = await $fetch<{ error: boolean; message?: string }>(
      "/api/flow/reciduca",
      {
        method: "POST",
        body: {
          stage: "finalize",
          contactId: contactId.value,
          amount: state.value.amount.value,
          frequency: state.value.amount.frequency,
          paymentMethodToken: state.value.payment.token,
          dni: state.value.ident.number,
          campaign: campaign.value || null,
        },
      },
    );
    if (res.error) {
      throw new Error(
        res.message ?? "No pudimos completar tu donación. Intentá de nuevo.",
      );
    }
    successMessage.value = "¡Gracias por sumarte a Reciduca!";
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "No pudimos completar tu donación.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl p-6">
    <header class="mb-8 space-y-2">
      <h1 class="text-2xl font-semibold text-foreground">
        Vos También Sos Protagonista
      </h1>
      <p class="text-base leading-relaxed text-muted-foreground">
        Apadriná a un/a joven con una beca mensual y ayudanos a transformar
        su futuro a través de la educación.
      </p>
    </header>

    <div
      v-if="successMessage"
      class="rounded-xl bg-emerald-50 p-6 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      <p class="text-base font-semibold">{{ successMessage }}</p>
    </div>

    <MultiStepFlow
      v-else
      :steps="3"
      action-label="Donar ahora"
      next-label="Continuar"
      :is-submitting="isSubmitting"
      :is-submitted="!!successMessage"
      :on-step-advance="onStepAdvance"
      @submit="onSubmit"
    >
      <template #step-1>
        <AmountStep
          v-model="state.amount"
          :step-index="1"
          title="Elegí tu aporte"
          description="Tu donación cubre parte de una beca anual."
          :presets="[
            { value: 76600, label: '$76.600 — Apadriná un/a joven' },
            { value: 38300, label: '$38.300 — Media beca' },
            { value: 19150, label: '$19.150 — 25% de beca' },
            { value: 7660, label: '$7.660 — 10% de beca' },
          ]"
          :frequencies="[
            { value: 'Mensual', label: 'Todos los meses' },
            { value: 'Única vez', label: 'Por única vez' },
          ]"
          :min-amount="2300"
          :disabled="isSubmitting"
        />
      </template>

      <template #step-2>
        <PersonalDataStep
          v-model="state.personal"
          :step-index="2"
          title="Tus datos"
          description="Vamos a usarlos solo para registrar tu donación."
          :include-country="false"
          :include-province="false"
          :include-birth-date="true"
          :disabled="isSubmitting"
        />
        <FieldText
          :model-value="state.phoneFixed"
          label="Teléfono fijo (opcional)"
          placeholder="1156345456"
          inputmode="tel"
          autocomplete="tel"
          :disabled="isSubmitting"
          @update:model-value="(v: string) => (state.phoneFixed = v)"
        />
      </template>

      <template #step-3>
        <PaymentMethodStep
          v-model="state.payment"
          :step-index="3"
          :disabled="isSubmitting"
        />
        <IdentificationStep
          v-model="state.ident"
          :step-index="3"
          mode="CUIT_OR_DNI"
          label="DNI o CUIT"
          placeholder="23554134"
          :disabled="isSubmitting"
        />
      </template>
    </MultiStepFlow>

    <p v-if="errorMessage" class="mt-6 text-sm text-red-600" role="alert">
      {{ errorMessage }}
    </p>
  </main>
</template>
