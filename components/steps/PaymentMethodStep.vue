<script setup lang="ts">
/**
 * Wizard-aware wrapper around `PaymentMethodForm`. Adds:
 *   - a heading block (overridable via props/slots),
 *   - integration with `<MultiStepFlow>` via `useFlowStep`,
 *   - a `required` mode (alta flows tokenize at the end and cannot proceed
 *     without a payment method; self-service flows can leave it blank and
 *     update amount-only).
 *
 * The underlying `PaymentMethodForm` already owns the Debi SDK element
 * mount; this component does not duplicate that work. It only orchestrates
 * the moment of tokenization.
 */
import { reactive, ref } from "vue";
import PaymentMethodForm from "~/components/PaymentMethodForm.vue";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

export interface PaymentData {
  token: DebiPaymentToken | null;
}

const props = withDefaults(
  defineProps<{
    modelValue: PaymentData;
    stepIndex?: number;
    title?: string;
    description?: string;
    required?: boolean;
    disabled?: boolean;
  }>(),
  {
    stepIndex: 1,
    title: "Dónde querés que cobremos",
    description: "Ingresá los datos de tu tarjeta o CBU.",
    required: true,
    disabled: false,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: PaymentData] }>();

const paymentRef = ref<InstanceType<typeof PaymentMethodForm> | null>(null);
const errors = reactive<{ token: string | null }>({ token: null });

async function validate() {
  errors.token = null;
  try {
    const token = await paymentRef.value?.tokenizeIfApplicable();
    if (!token) {
      if (props.required) {
        errors.token = "Completá los datos de tarjeta o CBU.";
        return {
          ok: false,
          errors: { token: errors.token } as Record<string, string>,
        };
      }
      emit("update:modelValue", { token: null });
      return { ok: true, errors: {} };
    }
    emit("update:modelValue", { token });
    return { ok: true, errors: {} };
  } catch (error) {
    errors.token =
      error instanceof Error
        ? error.message
        : "No pudimos procesar los datos de pago. Revisalos e intentá de nuevo.";
    return {
      ok: false,
      errors: { token: errors.token } as Record<string, string>,
    };
  }
}

useFlowStep({
  stepIndex: props.stepIndex,
  validate,
});

defineExpose({ validate });
</script>

<template>
  <section class="space-y-3">
    <header class="space-y-1">
      <h2 class="text-sm font-semibold text-foreground">
        <slot name="title">{{ title }}</slot>
      </h2>
      <p class="text-sm leading-relaxed text-muted-foreground">
        <slot name="description">{{ description }}</slot>
      </p>
    </header>

    <PaymentMethodForm ref="paymentRef" :disabled="disabled" />

    <p v-if="errors.token" class="text-sm text-red-600" role="alert">
      {{ errors.token }}
    </p>
  </section>
</template>
