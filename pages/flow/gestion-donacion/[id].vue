<script setup lang="ts">
/**
 * Flow: "gestion-donacion" — Configurable donation management page.
 *
 * URL: /flow/gestion-donacion/<id>?mode=<mode>
 *
 * A single, configurable page that handles three use cases, each with a
 * different type of Salesforce ID:
 *
 *   - `update-recurring`: ID is a Recurring Donation (npe03__Recurring_Donation__c).
 *     Reactivates an existing closed/inactive RD. Payment method is optional.
 *
 *   - `convert-to-recurring`: ID is an Opportunity.
 *     Creates a new Recurring Donation from a one-time donation. Requires payment.
 *
 *   - `abandoned-cart`: ID is a TCPagos__Formulario_TC__c.
 *     Completes an incomplete form with missing payment data.
 *     The Salesforce Flow handles Contact/RD/Opp creation.
 *
 * Customization:
 *   - Edit `data/gestion-donacion-config.ts` to change titles, descriptions,
 *     button text, and success messages for each mode.
 *   - Edit the logo prop in FlowHeader below to use your organization's logo.
 *
 * ONG opt-in: This page is self-contained. ONGs can choose to use it by
 * linking to it from their communications. It doesn't affect other flows.
 */
import { computed, onMounted, ref } from "vue";
import type {
  UpdateRecurringRecord,
  ConvertToRecurringRecord,
  AbandonedCartRecord,
} from "~/server/utils/salesforce";
import AmountStep from "~/components/steps/AmountStep.vue";
import PaymentMethodStep from "~/components/steps/PaymentMethodStep.vue";
import FlowHeader from "~/components/flow/FlowHeader.vue";
import type { AmountData } from "~/components/steps/AmountStep.vue";
import type { PaymentData } from "~/components/steps/PaymentMethodStep.vue";
import { formatAmountEsAR } from "~/composables/formatters";
import {
  MODE_CONFIGS,
  FREQUENCY_OPTIONS,
  AMOUNT_PRESETS,
  DEFAULT_FREQUENCY,
  interpolate,
  interpolateContactEmail,
  interpolateOrgName,
  installmentPeriodToFrequency,
  type GestionMode,
} from "~/data/gestion-donacion-config";

definePageMeta({
  flowTitle: "Gestión de donación",
  flowDescription:
    "Página configurable para reactivar, convertir o completar donaciones. Soporta tres modos según el tipo de ID.",
});

// Union type for all possible record types
type GestionRecord =
  | UpdateRecurringRecord
  | ConvertToRecurringRecord
  | AbandonedCartRecord;

const runtimeConfig = useRuntimeConfig();
const contactEmail = computed(() =>
  String(runtimeConfig.public.orgContactEmail ?? "").trim(),
);
const orgName = computed(() =>
  String(runtimeConfig.public.orgName ?? "").trim(),
);

function fillCopy(template: string, firstName: string | null): string {
  return interpolateOrgName(interpolate(template, firstName), orgName.value);
}

const route = useRoute();
const recordId = computed(() => String(route.params.id));

// Get mode from query param, default to update-recurring
const mode = computed<GestionMode>(() => {
  const m = route.query.mode;
  const modeStr = Array.isArray(m) ? String(m[0] ?? "") : String(m ?? "");
  if (
    modeStr === "update-recurring" ||
    modeStr === "convert-to-recurring" ||
    modeStr === "abandoned-cart"
  ) {
    return modeStr;
  }
  return "update-recurring";
});

// Get config for current mode
const config = computed(() => MODE_CONFIGS[mode.value]);

// Set page title dynamically
useHead({
  title: computed(() => config.value.pageTitle),
});

// Component refs for validation
const amountStepRef = ref<InstanceType<typeof AmountStep> | null>(null);
const paymentStepRef = ref<InstanceType<typeof PaymentMethodStep> | null>(null);

// State
const isLoading = ref(true);
const isSubmitting = ref(false);
const record = ref<GestionRecord | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

// Form data
const amount = ref<AmountData>({ value: null, frequency: DEFAULT_FREQUENCY });
const payment = ref<PaymentData>({ token: null });

// Extract contact first name based on record type
const contactFirstName = computed((): string | null => {
  const r = record.value;
  if (!r) return null;

  // UpdateRecurringRecord and ConvertToRecurringRecord have contactFirstName
  if ("contactFirstName" in r) {
    return r.contactFirstName;
  }
  // AbandonedCartRecord has nombre
  if ("nombre" in r) {
    return r.nombre;
  }
  return null;
});

// Extract previous amount based on record type
const previousAmount = computed((): number | null => {
  const r = record.value;
  if (!r) return null;

  if ("recurringAmount" in r) {
    return r.recurringAmount;
  }
  if ("opportunityAmount" in r) {
    return r.opportunityAmount;
  }
  if ("monto" in r) {
    return r.monto;
  }
  return null;
});

const previousAmountText = computed(() => {
  const q = previousAmount.value;
  if (q == null) return "";
  return formatAmountEsAR(q);
});

// Interpolated content
const pageTitle = computed(() =>
  fillCopy(config.value.title, contactFirstName.value),
);

const pageDescription = computed(() =>
  fillCopy(config.value.description, contactFirstName.value),
);

const secondaryDescription = computed(() =>
  config.value.secondaryDescription
    ? fillCopy(config.value.secondaryDescription, contactFirstName.value)
    : null,
);

const finalSuccessMessage = computed(() =>
  fillCopy(config.value.successMessage, contactFirstName.value),
);

const amountTitle = computed(
  () => config.value.amountTitle || "Monto y frecuencia",
);

const amountDescription = computed(() => {
  if (config.value.amountDescription) {
    return fillCopy(config.value.amountDescription, contactFirstName.value);
  }
  return previousAmountText.value
    ? `Tu aporte actual es de $${previousAmountText.value}. Podés modificarlo si querés:`
    : "Elegí el monto y la frecuencia de tu donación.";
});

const presetsLabel = computed(
  () => config.value.presetsLabel ?? "Monto de la donación",
);

const frequencyLabel = computed(
  () => config.value.frequencyLabel ?? "Quiero donar",
);

const paymentTitle = computed(() => {
  if (config.value.paymentTitle) return config.value.paymentTitle;
  return config.value.paymentRequired
    ? "Método de pago"
    : "Actualizar método de pago (opcional)";
});

const paymentDescription = computed(() => {
  if (config.value.paymentDescription) return config.value.paymentDescription;
  return config.value.paymentRequired
    ? "Ingresá los datos de tu tarjeta o CBU."
    : "Si querés cambiar tu tarjeta o CBU, completá los datos abajo. Si no, dejalo vacío.";
});

const footerNote = computed(() => {
  const template = config.value.footerNote;
  if (!template) return "";
  return interpolateContactEmail(template, contactEmail.value);
});

const footerParts = computed(() => {
  const note = footerNote.value;
  const email = contactEmail.value;
  if (!note || !email || !note.includes(email)) {
    return { before: note, email: "", after: "" };
  }
  const [before, after] = note.split(email);
  return { before: before ?? "", email, after: after ?? "" };
});

// Frequency options for AmountStep. A single option hides the picker.
const frequencyOptions = computed(() => {
  if (config.value.showFrequency === false) {
    const value = amount.value.frequency || DEFAULT_FREQUENCY;
    return [{ value, label: value }];
  }
  return FREQUENCY_OPTIONS.map((f) => ({ value: f.value, label: f.label }));
});

// Load data from Salesforce
async function load() {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;

  try {
    const json = await $fetch<{
      error: boolean;
      message?: string;
      mode?: string;
      data?: GestionRecord;
    }>(`/api/flow/gestion-donacion/${recordId.value}?mode=${mode.value}`, {
      cache: "no-store",
    });

    if (json.error || !json.data) {
      throw new Error(
        json.message ||
          "No pudimos cargar tu información. Probá de nuevo en unos minutos.",
      );
    }

    record.value = json.data;

    // Pre-fill form based on record type
    const r = json.data;
    let prefilledAmount: number | null = null;
    let prefilledFrequency = DEFAULT_FREQUENCY;

    if ("recurringAmount" in r) {
      // UpdateRecurringRecord
      prefilledAmount = r.recurringAmount;
      prefilledFrequency = installmentPeriodToFrequency(
        r.recurringInstallmentPeriod,
      );
    } else if ("opportunityAmount" in r) {
      // ConvertToRecurringRecord
      prefilledAmount = r.opportunityAmount;
    } else if ("monto" in r) {
      // AbandonedCartRecord
      prefilledAmount = r.monto;
      if (r.frecuencia) {
        prefilledFrequency = r.frecuencia;
      }
    }

    amount.value = {
      value: prefilledAmount,
      frequency: prefilledFrequency,
    };
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "No pudimos cargar tu información.";
  } finally {
    isLoading.value = false;
  }
}

// Handle form submission
async function handleSubmit() {
  if (!record.value) return;
  errorMessage.value = null;
  successMessage.value = null;

  // Validate amount
  const amountOk = await amountStepRef.value?.validate();
  if (!amountOk?.ok) return;

  // Validate payment (tokenizes if needed)
  const paymentOk = await paymentStepRef.value?.validate();
  if (!paymentOk?.ok) return;

  // Check if payment is required but missing
  if (config.value.paymentRequired && !payment.value.token) {
    errorMessage.value =
      "Completá los datos de tu tarjeta o CBU para continuar.";
    return;
  }

  isSubmitting.value = true;

  try {
    const body: {
      mode: GestionMode;
      amount: number;
      frequency: string;
      record?: GestionRecord;
      paymentMethodToken?: typeof payment.value.token;
    } = {
      mode: mode.value,
      amount: amount.value.value as number,
      frequency: amount.value.frequency,
    };

    // Only send record for modes that use it to avoid re-fetching
    if (mode.value !== "abandoned-cart") {
      body.record = record.value;
    }

    if (payment.value.token) {
      body.paymentMethodToken = payment.value.token;
    }

    const json = await $fetch<{ error: boolean; message?: string }>(
      `/api/flow/gestion-donacion/${recordId.value}`,
      { method: "POST", body },
    );

    if (json.error) {
      throw new Error(
        json.message || "No pudimos guardar los cambios. Probá de nuevo.",
      );
    }

    successMessage.value = finalSuccessMessage.value;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "No pudimos guardar los cambios.";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
    <!-- Loading state -->
    <p v-if="isLoading" class="text-sm text-muted-foreground">
      Cargando tu información...
    </p>

    <!-- Error loading data -->
    <p v-else-if="!record" class="text-sm text-red-600">
      {{
        errorMessage ||
        "No pudimos cargar esta página. Probá de nuevo más tarde."
      }}
    </p>

    <!-- Success state -->
    <div
      v-else-if="successMessage"
      class="rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      <p class="text-sm font-semibold">{{ successMessage }}</p>
      <p class="mt-1 text-sm">
        Recibirás un email con los detalles de tu donación.
      </p>
    </div>

    <!-- Main form -->
    <form v-else class="space-y-5" @submit.prevent="handleSubmit">
      <!-- Header with logo support -->
      <!-- To add your logo: put the file in public/logos/ and add logo="/logos/your-logo.png" -->
      <FlowHeader :title="pageTitle">
        <p class="text-sm leading-relaxed text-muted-foreground">
          {{ pageDescription }}
        </p>
        <p
          v-if="secondaryDescription"
          class="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {{ secondaryDescription }}
        </p>
      </FlowHeader>

      <!-- Amount and frequency selection -->
      <AmountStep
        ref="amountStepRef"
        v-model="amount"
        :title="amountTitle"
        :description="amountDescription"
        :presets-label="presetsLabel"
        :frequency-label="frequencyLabel"
        :presets="AMOUNT_PRESETS"
        :frequencies="frequencyOptions"
        :disabled="isSubmitting"
      />

      <!-- Payment method section -->
      <PaymentMethodStep
        ref="paymentStepRef"
        v-model="payment"
        :required="config.paymentRequired"
        :disabled="isSubmitting"
        :title="paymentTitle"
        :description="paymentDescription"
      />

      <!-- Error message -->
      <p v-if="errorMessage" class="text-sm text-red-600" role="alert">
        {{ errorMessage }}
      </p>

      <!-- Submit button -->
      <button
        type="submit"
        :disabled="isSubmitting"
        class="w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {{ isSubmitting ? config.buttonLoadingText : config.buttonText }}
      </button>

      <p
        v-if="footerNote"
        class="text-sm leading-relaxed text-muted-foreground"
      >
        <template v-if="footerParts.email">{{ footerParts.before }}<a :href="`mailto:${footerParts.email}`" class="underline underline-offset-2">{{ footerParts.email }}</a>{{ footerParts.after }}</template>
        <template v-else>{{ footerNote }}</template>
      </p>
    </form>
  </main>
</template>
