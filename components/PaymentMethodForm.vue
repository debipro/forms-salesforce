<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  useDebiClient,
  type DebiClient,
  type DebiElement,
  type DebiElementState,
  type DebiPaymentToken,
} from "~/composables/useDebiClient";

defineProps<{
  disabled?: boolean;
}>();

const mountTarget = ref<HTMLDivElement | null>(null);
const errorMessage = ref<string | null>(null);
const isEmpty = ref(true);

let debi: DebiClient | null = null;
let paymentElement: DebiElement | null = null;

onMounted(() => {
  debi = useDebiClient();
  const elements = debi.elements({
    theme: {
      // Pull straight from the design tokens defined in assets/css/main.css
      // so the SDK inputs always match the rest of the form.
      primary: getCssVar("--primary") || "#16a34a",
      foreground: getCssVar("--foreground"),
      background: getCssVar("--background"),
      border: getCssVar("--input"),
      borderFocus: getCssVar("--ring") || getCssVar("--primary"),
      error: getCssVar("--destructive") || "#dc2626",
      borderRadius: getCssVar("--radius") || "6px",
      fontFamily: getCssVar("--font-sans-stack"),
    },
    locale: "es-AR",
  });
  paymentElement = elements.create("payment-method", {
    defaultType: "card",
    strict: true,
  });
  paymentElement.on("change", (state: DebiElementState) => {
    isEmpty.value = state.empty;
    errorMessage.value = state.error?.message ?? null;
  });
  if (mountTarget.value) paymentElement.mount(mountTarget.value);
});

onBeforeUnmount(() => {
  paymentElement?.unmount();
  paymentElement = null;
  debi = null;
});

/**
 * Imperative API exposed to the parent flow. Mirrors the previous contract:
 * - returns `undefined` when the user left the fields blank (amount-only save)
 * - throws when there is partial input that fails validation
 * - on success, returns a Debi-tokenized payment method
 */
async function tokenizeIfApplicable(): Promise<DebiPaymentToken | undefined> {
  if (!paymentElement || !debi) {
    throw new Error("El SDK de Debi todavía no está listo.");
  }
  if (isEmpty.value) return undefined;

  const { token, error } = await debi.confirmPaymentMethod(paymentElement);
  if (error) {
    errorMessage.value = error.message;
    throw new Error(error.message);
  }
  return token;
}

function getCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value;
}

defineExpose({ tokenizeIfApplicable });
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-base font-semibold text-foreground">
        Dónde querés que cobremos
      </h2>
      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
        Si querés cambiar tarjeta o CBU, completá los datos abajo. Si solo
        querés actualizar el monto, podés dejar esta parte en blanco y tocar
        Guardar.
      </p>
    </div>

    <!-- Debi mounts the entire payment-method UI here. We never touch card
         data ourselves; it goes straight from the SDK to debi.pro. -->
    <div
      ref="mountTarget"
      :aria-disabled="disabled || undefined"
      :class="['debi-form-mount', disabled && 'pointer-events-none opacity-60']"
    ></div>

    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
  </div>
</template>
