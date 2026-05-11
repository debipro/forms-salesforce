<script setup lang="ts">
/**
 * Terms-and-conditions acceptance step. A single checkbox with a
 * link-bearing label. Slot `#extra` lets you append flow-specific opt-in
 * questions (e.g., Techo's "¿Ya sos donante?" select) without forking the
 * step.
 *
 * The component renders the T&C link safely as a real `<a>` (not v-html).
 */
import { reactive } from "vue";

export interface AcceptanceData {
  tyc: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: AcceptanceData;
    stepIndex?: number;
    termsUrl: string;
    termsLabel?: string;
    title?: string;
    disabled?: boolean;
  }>(),
  {
    stepIndex: 1,
    termsLabel: "términos y condiciones",
    title: "Antes de terminar",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: AcceptanceData];
}>();

const errors = reactive<{ tyc: string | null }>({ tyc: null });

function update(value: boolean) {
  emit("update:modelValue", { ...props.modelValue, tyc: value });
  if (errors.tyc) errors.tyc = null;
}

async function validate() {
  errors.tyc = null;
  if (!props.modelValue.tyc) {
    errors.tyc = "Tenés que aceptar los términos para continuar.";
    return { ok: false, errors: { tyc: errors.tyc } as Record<string, string> };
  }
  return { ok: true, errors: {} };
}

useFlowStep({
  stepIndex: props.stepIndex,
  validate,
});

defineExpose({ validate });
</script>

<template>
  <section class="space-y-4">
    <header v-if="title">
      <h2 class="text-base font-semibold text-foreground">{{ title }}</h2>
    </header>

    <slot name="extra" />

    <FieldCheckbox
      :model-value="modelValue.tyc"
      :error="errors.tyc"
      :disabled="disabled"
      @update:model-value="update"
    >
      Acepto los
      <a
        :href="termsUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium text-primary underline underline-offset-2"
      >
        {{ termsLabel }}
      </a>.
    </FieldCheckbox>
  </section>
</template>
