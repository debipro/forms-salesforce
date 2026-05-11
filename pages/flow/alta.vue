<script setup lang="ts">
/**
 * Flow: "alta" — Techo donor onboarding.
 *
 * URL: /flow/alta
 *
 * Mirrors the legacy 2-step `pages/form/techo.vue` from `debi-forms`:
 *   Step 1 — personal data (name, surname, DOB, email, phone, country, prov)
 *   Step 2 — amount + frequency, payment method, DNI, terms + "¿Ya sos donante?"
 *
 * The anti-cart-abandonment pattern from debi-forms is preserved:
 * `onStepAdvance` POSTs the personal data after step 1 so the Contact is
 * created in Salesforce even if the donor never reaches the payment step.
 *
 * To customize: change colors in `assets/css/main.css`, edit copy here,
 * change the preset amounts, swap which steps you include. Adding a new
 * field is one of:
 *   - drop a `<FieldText>` next to a step (no engine knowledge needed),
 *   - or create a new file in `components/steps/` and import it.
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
import AcceptanceStep, {
  type AcceptanceData,
} from "~/components/steps/AcceptanceStep.vue";
import FieldSelect from "~/components/fields/FieldSelect.vue";
import { useFlowState } from "~/composables/useFlowState";
import { transformBirthDateToISO } from "~/composables/formatters";

useHead({ title: "Sumate a TECHO" });

const route = useRoute();
const campaign = computed(() => {
  const q = route.query.campaign;
  return Array.isArray(q) ? String(q[0] ?? "") : String(q ?? "");
});

interface AltaState {
  personal: PersonalData;
  amount: AmountData;
  payment: PaymentData;
  ident: IdentificationData;
  accept: AcceptanceData;
  alreadyDonor: string;
}

const state = useFlowState<AltaState>({
  personal: {
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    phone: "",
    country: "Argentina",
    province: "",
  },
  amount: { value: null, frequency: "Mensual" },
  payment: { token: null },
  ident: { number: "" },
  accept: { tyc: false },
  alreadyDonor: "",
});

const contactId = ref<string | null>(null);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const alreadyDonorError = ref<string | null>(null);

async function onStepAdvance(stepIndex: number) {
  if (stepIndex !== 1) return;
  errorMessage.value = null;
  const res = await $fetch<{
    error: boolean;
    message?: string;
    data?: { contactId: string };
  }>("/api/flow/alta", {
    method: "POST",
    body: {
      stage: "personal",
      personal: {
        ...state.value.personal,
        birthDate: transformBirthDateToISO(state.value.personal.birthDate),
      },
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
  alreadyDonorError.value = null;
  if (!state.value.alreadyDonor) {
    alreadyDonorError.value = "Contanos si ya sos donante de TECHO.";
    return;
  }
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
      "/api/flow/alta",
      {
        method: "POST",
        body: {
          stage: "finalize",
          contactId: contactId.value,
          amount: state.value.amount.value,
          frequency: state.value.amount.frequency,
          paymentMethodToken: state.value.payment.token,
          dni: state.value.ident.number,
          alreadyDonor: state.value.alreadyDonor,
          campaign: campaign.value || null,
        },
      },
    );
    if (res.error) {
      throw new Error(
        res.message ?? "No pudimos completar tu alta. Intentá de nuevo.",
      );
    }
    successMessage.value = "¡Gracias por sumarte a TECHO!";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "No pudimos completar tu alta.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl p-6">
    <header class="mb-8 space-y-2">
      <h1 class="text-2xl font-semibold text-foreground">
        Sumate a TECHO
      </h1>
      <p class="text-base leading-relaxed text-muted-foreground">
        Tu donación nos ayuda a construir, en conjunto con familias de
        comunidades populares, mejores condiciones de vida en barrios
        afectados por la pobreza.
      </p>
    </header>

    <div v-if="successMessage" class="rounded-xl bg-emerald-50 p-6 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
      <p class="text-base font-semibold">{{ successMessage }}</p>
      <p class="mt-1 text-sm">
        Recibirás un email con los detalles de tu donación.
      </p>
    </div>

    <MultiStepFlow
      v-else
      :steps="2"
      action-label="Donar"
      next-label="Continuar"
      :is-submitting="isSubmitting"
      :is-submitted="!!successMessage"
      :on-step-advance="onStepAdvance"
      @submit="onSubmit"
    >
      <template #step-1>
        <PersonalDataStep
          v-model="state.personal"
          :step-index="1"
          title="Empezá con tus datos"
          description="Vamos a usarlos solo para registrar tu donación."
          :include-country="true"
          :include-province="true"
          :disabled="isSubmitting"
        />
      </template>

      <template #step-2>
        <AmountStep
          v-model="state.amount"
          :step-index="2"
          title="Elegí cuánto y cómo"
          description="Tu donación llega entera al programa de Techo."
          :presets="[12000, 18000, 25000]"
          :frequencies="[
            { value: 'Mensual', label: 'Todos los meses' },
            { value: 'Única vez', label: 'Por única vez' },
          ]"
          :disabled="isSubmitting"
        />

        <PaymentMethodStep
          v-model="state.payment"
          :step-index="2"
          :disabled="isSubmitting"
        />

        <IdentificationStep
          v-model="state.ident"
          :step-index="2"
          mode="DNI"
          label="DNI"
          placeholder="23554134"
          :disabled="isSubmitting"
        />

        <AcceptanceStep
          v-model="state.accept"
          :step-index="2"
          terms-url="https://drive.google.com/file/d/1-rbt7KG32tIBssGh7sbvU99oVq2vhKFH/view"
          terms-label="términos y condiciones"
          :disabled="isSubmitting"
        >
          <template #extra>
            <FieldSelect
              :model-value="state.alreadyDonor"
              label="¿Ya sos donante de TECHO?"
              :options="[
                { value: 'SI', label: 'Sí' },
                { value: 'NO', label: 'No' },
              ]"
              required
              :error="alreadyDonorError"
              :disabled="isSubmitting"
              @update:model-value="
                (v) => {
                  state.alreadyDonor = String(v ?? '');
                  alreadyDonorError = null;
                }
              "
            />
          </template>
        </AcceptanceStep>
      </template>
    </MultiStepFlow>

    <p v-if="errorMessage" class="mt-6 text-sm text-red-600" role="alert">
      {{ errorMessage }}
    </p>
  </main>
</template>
