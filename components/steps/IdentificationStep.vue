<script setup lang="ts">
/**
 * Identification document step. Three preset validation modes:
 *
 *   - `DNI` (8 digits)
 *   - `CUIT_OR_DNI` (7–11 digits, lenient — same as legacy
 *     `validateCuitOrDni` used by Reciduca and others)
 *   - `CUIL` (strict 11-digit CUIL with valid prefix)
 *
 * Renders a single text input; the document type is fixed by the parent
 * via the `mode` prop. If you need a user-selectable type dropdown, add it
 * inline in your flow page next to this step.
 */
import { reactive } from "vue";
import {
  validateCuil,
  validateCuitOrDni,
  validateDni,
} from "~/composables/validators";

export type IdentificationMode = "DNI" | "CUIT_OR_DNI" | "CUIL";

export interface IdentificationData {
  number: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: IdentificationData;
    stepIndex?: number;
    mode?: IdentificationMode;
    label?: string;
    placeholder?: string;
    helper?: string;
    title?: string;
    description?: string;
    disabled?: boolean;
  }>(),
  {
    stepIndex: 1,
    mode: "DNI",
    label: "DNI",
    placeholder: "23554134",
    helper: "",
    title: "",
    description: "",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: IdentificationData];
}>();

const errors = reactive<{ number: string | null }>({ number: null });

function update(value: string) {
  emit("update:modelValue", { ...props.modelValue, number: value });
  if (errors.number) errors.number = null;
}

async function validate() {
  errors.number = null;
  const out: Record<string, string> = {};
  const v = props.modelValue.number?.trim() ?? "";

  if (!v) {
    out.number = "Ingresá tu " + props.label.toLowerCase() + ".";
  } else {
    let ok = false;
    switch (props.mode) {
      case "DNI":
        ok = validateDni(v);
        if (!ok) out.number = "El DNI debe tener 8 dígitos.";
        break;
      case "CUIL":
        ok = validateCuil(v);
        if (!ok) out.number = "Ingresá un CUIL válido (11 dígitos).";
        break;
      case "CUIT_OR_DNI":
        ok = validateCuitOrDni(v);
        if (!ok)
          out.number = "Ingresá un DNI o CUIT válido (solo números).";
        break;
    }
  }

  errors.number = out.number ?? null;
  return { ok: Object.keys(out).length === 0, errors: out };
}

useFlowStep({
  stepIndex: props.stepIndex,
  validate,
});

defineExpose({ validate });
</script>

<template>
  <section class="space-y-4">
    <header v-if="title || description" class="space-y-1">
      <h2 v-if="title" class="text-base font-semibold text-foreground">
        {{ title }}
      </h2>
      <p v-if="description" class="text-sm leading-relaxed text-muted-foreground">
        {{ description }}
      </p>
    </header>

    <FieldText
      :model-value="modelValue.number"
      :label="label"
      :placeholder="placeholder"
      :helper="helper"
      inputmode="numeric"
      autocomplete="off"
      required
      :error="errors.number"
      :disabled="disabled"
      @update:model-value="update"
    />
  </section>
</template>
