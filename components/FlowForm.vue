<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { DebiPaymentToken } from "~/composables/useDebiClient";
import type { FlowRecord } from "~/server/utils/salesforce";
import PaymentMethodForm from "~/components/PaymentMethodForm.vue";

const props = defineProps<{
  oppId: string;
}>();

const paymentRef = ref<InstanceType<typeof PaymentMethodForm> | null>(null);
const isLoading = ref(true);
const record = ref<FlowRecord | null>(null);
const amountRaw = ref(""); // canonical decimal string, e.g. "1234.5"
const amountDisplay = ref(""); // what the input shows, e.g. "1234,5" while typing
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const previousQuota = computed(() => {
  const r = record.value;
  if (!r) return null;
  return r.recurringAmount ?? r.opportunityAmount ?? null;
});

const hasPreviousQuota = computed(() => {
  const q = previousQuota.value;
  return q != null && Number.isFinite(q) && q > 0;
});

const parsedAmount = computed(() => Number(amountRaw.value));

const isValidAmount = computed(() => {
  const n = parsedAmount.value;
  return Number.isFinite(n) && n > 0;
});

const previousQuotaFormatted = computed(() => {
  const q = previousQuota.value;
  if (q == null) return "";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(q);
});

function setAmountFromApi(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    amountRaw.value = "";
    amountDisplay.value = "";
    return;
  }
  amountRaw.value = String(value);
  amountDisplay.value = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function onAmountInput(event: Event) {
  const target = event.target as HTMLInputElement;
  // Allow only digits, dot, and comma. Drop everything else as the user types.
  const cleaned = target.value.replace(/[^\d.,]/g, "");
  amountDisplay.value = cleaned;
  // Convert "1.234,5" → "1234.5" so JS Number() can parse it.
  const normalized = cleaned.replaceAll(".", "").replace(",", ".");
  amountRaw.value = normalized;
}

async function load() {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;
  try {
    const json = await $fetch<{
      error: boolean;
      message?: string;
      data?: FlowRecord;
    }>(`/api/flow/${props.oppId}`, { cache: "no-store" });
    if (json.error || !json.data) {
      throw new Error(
        json.message ||
          "No pudimos cargar tu información. Probá de nuevo en unos minutos.",
      );
    }
    record.value = json.data;
    setAmountFromApi(
      json.data.recurringAmount ?? json.data.opportunityAmount ?? null,
    );
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
  errorMessage.value = null;
  successMessage.value = null;

  if (!record.value) return;
  if (!Number.isFinite(parsedAmount.value) || parsedAmount.value <= 0) {
    errorMessage.value = "Ingresá un monto válido mayor a cero.";
    return;
  }

  let paymentMethodToken: DebiPaymentToken | undefined;
  try {
    paymentMethodToken = await paymentRef.value?.tokenizeIfApplicable();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "No pudimos procesar los datos de pago. Revisalos e intentá de nuevo.";
    return;
  }

  if (paymentMethodToken != null && !record.value.opportunityContactId) {
    errorMessage.value =
      "Por el momento no podemos guardar un nuevo método de pago desde acá. Podés actualizar el monto o escribirnos para que te ayudemos con el cobro.";
    return;
  }

  isSubmitting.value = true;
  try {
    const body: {
      amount: number;
      record: FlowRecord;
      paymentMethodToken?: DebiPaymentToken;
    } = {
      amount: parsedAmount.value,
      record: record.value,
    };
    if (paymentMethodToken) body.paymentMethodToken = paymentMethodToken;

    const json = await $fetch<{ error: boolean; message?: string }>(
      `/api/flow/${props.oppId}`,
      {
        method: "POST",
        body,
      },
    );
    if (json.error) {
      throw new Error(
        json.message || "No pudimos guardar los cambios. Probá de nuevo.",
      );
    }

    const parts = ["Listo: actualizamos el monto de tu donación."];
    if (paymentMethodToken) {
      parts.push("También registramos dónde querés que cobremos.");
    }
    successMessage.value = parts.join(" ");
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
  <p v-if="isLoading" class="text-sm text-muted-foreground">
    Cargando tu información…
  </p>

  <p v-else-if="!record" class="text-sm text-red-600">
    {{
      errorMessage || "No pudimos cargar esta página. Probá de nuevo más tarde."
    }}
  </p>

  <form v-else class="space-y-8" @submit.prevent="handleSubmit">
    <header class="space-y-3">
      <h1 class="text-xl font-semibold text-foreground">
        Actualizá tu donación
      </h1>
      <p class="text-base leading-relaxed text-foreground">
        Te invitamos a actualizar los datos de tu donación porque el cobro no
        se pudo completar. Por favor actualizalos para indicarnos dónde querés
        que cobremos.
      </p>
    </header>

    <div class="space-y-3">
      <label
        class="block text-base font-semibold text-foreground"
        for="amount"
      >
        Monto de tu cuota
      </label>
      <p class="text-sm leading-relaxed text-muted-foreground">
        <template v-if="hasPreviousQuota">
          Tu cuota actual es
          <span class="font-medium text-foreground">
            {{ previousQuotaFormatted }}
          </span>. Podés mantenerla o ajustarla.
        </template>
        <template v-else>Ingresá un monto que te resulte cómodo.</template>
      </p>
      <input
        id="amount"
        :value="amountDisplay"
        :disabled="isSubmitting"
        inputmode="decimal"
        autocomplete="transaction-amount"
        class="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground"
        placeholder="1.000,00"
        @input="onAmountInput"
      />
    </div>

    <p
      v-if="!record.opportunityContactId"
      class="text-sm leading-relaxed text-muted-foreground"
    >
      Desde este enlace podés cambiar el monto. Si también necesitás actualizar
      tarjeta o CBU, escribinos y te acompañamos.
    </p>

    <PaymentMethodForm
      ref="paymentRef"
      :disabled="isSubmitting || !record.opportunityContactId"
    />

    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
    <p
      v-if="successMessage"
      class="text-sm text-emerald-700 dark:text-emerald-400"
    >
      {{ successMessage }}
    </p>

    <button
      type="submit"
      :disabled="isSubmitting || !isValidAmount"
      class="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      {{ isSubmitting ? "Guardando..." : "Guardar cambios" }}
    </button>
  </form>
</template>
