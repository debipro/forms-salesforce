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
let themeObserver: MutationObserver | null = null;

onMounted(() => {
  debi = useDebiClient();

  const buildAppearance = () => ({
    theme: getActiveTheme(),
    variables: {
      primary: getCssVar("--primary"),
      primaryForeground: getCssVar("--primary-foreground"),
      background: getCssVar("--background"),
      foreground: getCssVar("--foreground"),
      muted: getCssVar("--muted"),
      mutedForeground: getCssVar("--muted-foreground"),
      border: getCssVar("--border"),
      borderFocus: getCssVar("--ring") || getCssVar("--primary"),
      placeholderColor: getCssVar("--muted-foreground"),
      labelColor: getCssVar("--muted-foreground"),
      labelFontWeight: "600",
      fontFamily: getCssVar("--font-sans-stack"),
      // 16px keeps mobile Safari from zooming into the input on focus.
      fontSize: "16px",
      borderRadius: "10px",
      spacing: "12px",
    },
    layout: {
      // `"icons"` renders tile buttons with the payment-method icon on top
      // and the label below — the SDK ships the icons natively from
      // `https://js.debi.pro/icons/type/{card,cbu}.svg`. Swap to `"tabs"`
      // for a single-row text switcher or `"accordion"` for collapsible
      // sections; the rest of the appearance (variables, rules) stays
      // unchanged.
      type: "icons" as const,
      inputs: "spaced" as const,
      labels: "auto" as const,
    },
    rules: {
      ".Label": {
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontSize: "0.75rem",
      },
      ".Input:focus": {
        boxShadow:
          "0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent)",
      },
      ".TabSelected": {
        boxShadow:
          "0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent)",
      },
    },
  });

  const elements = debi.elements({
    appearance: buildAppearance(),
    locale: "es-AR",
  });

  paymentElement = elements.create("payment-method", {
    // `allowedTypes` is intentionally omitted: when missing, the SDK calls
    // `GET /v1/account/payment_methods` and renders only the methods the
    // merchant has enabled. Pass `["card", "cbu"]` here to lock the order
    // for tests / offline preview.
    defaultType: "card",
    strict: true,
  });
  paymentElement.on("change", (state: DebiElementState) => {
    isEmpty.value = state.empty;
    errorMessage.value = state.error?.message ?? null;
  });
  if (mountTarget.value) paymentElement.mount(mountTarget.value);

  // Live-follow the app's dark/light theme. Whenever `data-theme` flips on
  // <html>, re-apply the matching SDK preset + recompute the variables (so
  // muted/border/etc. pull from the now-active CSS palette). The SDK keeps
  // mounted elements; this is just a re-paint.
  if (typeof window !== "undefined") {
    themeObserver = new MutationObserver(() => {
      elements.update({ appearance: buildAppearance() });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
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
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function getActiveTheme(): "debi" | "night" {
  if (typeof document === "undefined") return "debi";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "night"
    : "debi";
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

    <!-- Debi mounts the entire payment-method UI inside `mountTarget`. The
         outer container provides only chrome that the SDK doesn't ship
         (a "form card" wrapper). Everything inside — including tabs,
         labels, inputs and brand badges — is styled exclusively via the
         `appearance` object passed to `debi.elements()` above. We do not
         reach into `.debi-element__*` classes from our own CSS. -->
    <div
      :class="[
        'rounded-xl border border-border bg-muted/40 p-5 sm:p-6',
        disabled && 'pointer-events-none opacity-60',
      ]"
      :aria-disabled="disabled || undefined"
    >
      <div ref="mountTarget"></div>
    </div>

    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
  </div>
</template>
