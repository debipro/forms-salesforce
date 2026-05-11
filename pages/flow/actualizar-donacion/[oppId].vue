<script setup lang="ts">
/**
 * Flow: "actualizar-donacion"
 *
 * Self-service link the org emails to existing donors. Pre-loads the
 * Opportunity by `oppId` and lets them update the amount and/or save a
 * new payment method. Both fields are independently optional from the
 * donor's perspective: leaving the payment area blank means "amount-only
 * update".
 *
 * URL: /flow/actualizar-donacion/<id-de-oportunidad>
 *
 * Compose-by-step shape:
 *   - 1 visible step (no wizard chrome)
 *   - AmountStep  (custom amount, no presets, no frequency picker)
 *   - PaymentMethodStep (not required — `:required="false"`)
 *
 * If you want to turn this into a 2-step wizard, replace the inline layout
 * with `<MultiStepFlow :steps="2">` and split the children across
 * `#step-1` and `#step-2` slots.
 */
import { computed, onMounted, ref } from "vue";
import type { FlowRecord } from "~/server/utils/salesforce";
import AmountStep from "~/components/steps/AmountStep.vue";
import PaymentMethodStep from "~/components/steps/PaymentMethodStep.vue";
import type { AmountData } from "~/components/steps/AmountStep.vue";
import type { PaymentData } from "~/components/steps/PaymentMethodStep.vue";
import { formatAmountEsAR } from "~/composables/formatters";

useHead({ title: "Actualizá tu donación" });

const route = useRoute();
const oppId = computed(() => String(route.params.oppId));

const amountStepRef = ref<InstanceType<typeof AmountStep> | null>(null);
const paymentStepRef = ref<InstanceType<typeof PaymentMethodStep> | null>(null);

const isLoading = ref(true);
const isSubmitting = ref(false);
const record = ref<FlowRecord | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const amount = ref<AmountData>({ value: null, frequency: "" });
const payment = ref<PaymentData>({ token: null });

const previousQuota = computed(() => {
  const r = record.value;
  if (!r) return null;
  return r.recurringAmount ?? r.opportunityAmount ?? null;
});

const previousQuotaText = computed(() => {
  const q = previousQuota.value;
  if (q == null) return "";
  return formatAmountEsAR(q);
});

const canSavePaymentMethod = computed(
  () => record.value?.opportunityContactId != null,
);

async function load() {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;
  try {
    const json = await $fetch<{
      error: boolean;
      message?: string;
      data?: FlowRecord;
    }>(`/api/flow/actualizar-donacion/${oppId.value}`, { cache: "no-store" });
    if (json.error || !json.data) {
      throw new Error(
        json.message ||
          "No pudimos cargar tu información. Probá de nuevo en unos minutos.",
      );
    }
    record.value = json.data;
    amount.value = {
      value:
        json.data.recurringAmount ?? json.data.opportunityAmount ?? null,
      frequency: "",
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

async function handleSubmit() {
  if (!record.value) return;
  errorMessage.value = null;
  successMessage.value = null;

  const amountOk = await amountStepRef.value?.validate();
  if (!amountOk?.ok) return;

  const paymentOk = await paymentStepRef.value?.validate();
  if (!paymentOk?.ok) return;

  if (payment.value.token != null && !canSavePaymentMethod.value) {
    errorMessage.value =
      "Por el momento no podemos guardar un nuevo método de pago desde acá. " +
      "Podés actualizar el monto o escribirnos para que te ayudemos con el cobro.";
    return;
  }

  isSubmitting.value = true;
  try {
    const body: {
      amount: number;
      record: FlowRecord;
      paymentMethodToken?: typeof payment.value.token;
    } = {
      amount: amount.value.value as number,
      record: record.value,
    };
    if (payment.value.token) body.paymentMethodToken = payment.value.token;

    const json = await $fetch<{ error: boolean; message?: string }>(
      `/api/flow/actualizar-donacion/${oppId.value}`,
      { method: "POST", body },
    );
    if (json.error) {
      throw new Error(
        json.message || "No pudimos guardar los cambios. Probá de nuevo.",
      );
    }

    const parts = ["Listo: actualizamos el monto de tu donación."];
    if (payment.value.token) {
      parts.push("También registramos dónde querés que cobremos.");
    }
    successMessage.value = parts.join(" ");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "No pudimos guardar los cambios.";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="mx-auto w-full max-w-2xl p-6">
    <p v-if="isLoading" class="text-sm text-muted-foreground">
      Cargando tu información…
    </p>

    <p v-else-if="!record" class="text-sm text-red-600">
      {{
        errorMessage ||
        "No pudimos cargar esta página. Probá de nuevo más tarde."
      }}
    </p>

    <form v-else class="space-y-8" @submit.prevent="handleSubmit">
      <header class="space-y-3">
        <h1 class="text-xl font-semibold text-foreground">
          Actualizá tu donación
        </h1>
        <p class="text-base leading-relaxed text-foreground">
          Te invitamos a actualizar los datos de tu donación porque el cobro
          no se pudo completar. Por favor actualizalos para indicarnos
          dónde querés que cobremos.
        </p>
      </header>

      <AmountStep
        ref="amountStepRef"
        v-model="amount"
        title="Monto de tu cuota"
        :description="
          previousQuotaText
            ? `Tu cuota actual es ${previousQuotaText}. Podés mantenerla o ajustarla.`
            : 'Ingresá un monto que te resulte cómodo.'
        "
        :presets="[]"
        :frequencies="[]"
        :disabled="isSubmitting"
      />

      <p
        v-if="!canSavePaymentMethod"
        class="text-sm leading-relaxed text-muted-foreground"
      >
        Desde este enlace podés cambiar el monto. Si también necesitás
        actualizar tarjeta o CBU, escribinos y te acompañamos.
      </p>

      <PaymentMethodStep
        ref="paymentStepRef"
        v-model="payment"
        :required="false"
        :disabled="isSubmitting || !canSavePaymentMethod"
        description="Si querés cambiar tarjeta o CBU, completá los datos abajo. Si solo querés actualizar el monto, podés dejar esta parte en blanco y tocar Guardar."
      />

      <p v-if="errorMessage" class="text-sm text-red-600" role="alert">
        {{ errorMessage }}
      </p>
      <p
        v-if="successMessage"
        class="text-sm text-emerald-700 dark:text-emerald-400"
      >
        {{ successMessage }}
      </p>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {{ isSubmitting ? "Guardando..." : "Guardar cambios" }}
      </button>
    </form>
  </main>
</template>
