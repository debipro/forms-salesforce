<script setup lang="ts">
/**
 * Amount + frequency step. Renders a preset chip group plus an optional
 * custom-amount text input that appears when the user picks the "Otro
 * monto" preset (whose `value` is `null`).
 *
 * The frequency selector is shown when more than one option is provided.
 * Pass `frequencies: [{ value: 'Mensual', label: '...' }]` (length 1) to
 * hard-code a single frequency without rendering the picker.
 *
 * `modelValue.value` is always a Number (NaN-checked) when valid, or `null`
 * when the user hasn't entered anything.
 */
import { computed, reactive, ref } from "vue";
import {
  formatAmountEsAR,
  formatMoneyEsAR,
  parseAmountEsAR,
} from "~/composables/formatters";

export interface AmountData {
  value: number | null;
  frequency: string;
}

type Preset = { label: string; value: number | null };
type FrequencyOption = { value: string; label: string };

const props = withDefaults(
  defineProps<{
    modelValue: AmountData;
    stepIndex?: number;
    title?: string;
    description?: string;
    presets?: ReadonlyArray<Preset> | ReadonlyArray<number>;
    frequencies?: ReadonlyArray<FrequencyOption>;
    minAmount?: number;
    disabled?: boolean;
    customLabel?: string;
  }>(),
  {
    stepIndex: 1,
    title: "Tu donación",
    description: "Elegí el monto que querés donar.",
    presets: () => [],
    frequencies: () => [
      { value: "Mensual", label: "Todos los meses" },
      { value: "Única vez", label: "Por única vez" },
    ],
    minAmount: 1,
    disabled: false,
    customLabel: "Otro monto",
  },
);

const emit = defineEmits<{ "update:modelValue": [value: AmountData] }>();

const errors = reactive<{ value: string | null; frequency: string | null }>({
  value: null,
  frequency: null,
});

const normalizedPresets = computed<Preset[]>(() => {
  return props.presets.map((p) =>
    typeof p === "number"
      ? { label: formatMoneyEsAR(p), value: p }
      : (p as Preset),
  );
});

const showPresets = computed(() => normalizedPresets.value.length > 0);
const showFrequency = computed(() => props.frequencies.length > 1);

const frequencyOptions = computed<
  Array<{ label: string; value: string | null }>
>(() => props.frequencies.map((f) => ({ label: f.label, value: f.value })));

/**
 * Selection state for the preset group:
 *   - matches an existing preset → that preset's value (number)
 *   - matches the "Otro monto" preset (`value: null`) → `null`
 *   - no match yet → `""`
 */
const presetSelection = computed<number | null | "">(() => {
  if (!showPresets.value) return "";
  if (props.modelValue.value == null) {
    if (isCustomActive.value) return null;
    return "";
  }
  const match = normalizedPresets.value.find(
    (p) => p.value === props.modelValue.value,
  );
  if (match) return match.value;
  return null; // value entered but not a preset → in "Otro monto"
});

const isCustomActive = ref(false);

const presetWithCustom = computed(() => {
  const hasCustomOption = normalizedPresets.value.some((p) => p.value === null);
  if (hasCustomOption) return normalizedPresets.value;
  return [...normalizedPresets.value, { label: props.customLabel, value: null }];
});

const customDisplay = ref<string>(
  props.modelValue.value != null
    ? formatAmountEsAR(props.modelValue.value)
    : "",
);

function onPresetChange(value: string | number | null) {
  if (errors.value) errors.value = null;
  if (value == null) {
    isCustomActive.value = true;
    emit("update:modelValue", { ...props.modelValue, value: null });
    return;
  }
  isCustomActive.value = false;
  customDisplay.value = "";
  emit("update:modelValue", {
    ...props.modelValue,
    value: typeof value === "number" ? value : Number(value),
  });
}

function onCustomInput(raw: string) {
  if (errors.value) errors.value = null;
  customDisplay.value = raw;
  const parsed = parseAmountEsAR(raw);
  emit("update:modelValue", {
    ...props.modelValue,
    value: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
  });
}

function onFrequencyChange(value: string | number | null) {
  if (errors.value) errors.value = null;
  emit("update:modelValue", {
    ...props.modelValue,
    frequency: String(value ?? ""),
  });
}

async function validate() {
  errors.value = null;
  errors.frequency = null;
  const out: Record<string, string> = {};
  const v = props.modelValue.value;
  if (v == null || !Number.isFinite(v) || v <= 0) {
    out.value = "Ingresá un monto válido mayor a cero.";
  } else if (v < props.minAmount) {
    out.value = `El monto mínimo es ${formatMoneyEsAR(props.minAmount)}.`;
  }
  if (showFrequency.value && !props.modelValue.frequency) {
    out.frequency = "Elegí la frecuencia de tu donación.";
  }
  errors.value = out.value ?? null;
  errors.frequency = out.frequency ?? null;
  return { ok: Object.keys(out).length === 0, errors: out };
}

useFlowStep({
  stepIndex: props.stepIndex,
  validate,
});

defineExpose({ validate });
</script>

<template>
  <section class="space-y-5">
    <header class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">{{ title }}</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">
        {{ description }}
      </p>
    </header>

    <FieldSelect
      v-if="showFrequency"
      :model-value="modelValue.frequency"
      label="Quiero donar"
      :options="frequencyOptions"
      required
      :disabled="disabled"
      :error="errors.frequency"
      @update:model-value="onFrequencyChange"
    />

    <FieldButtonGroup
      v-if="showPresets"
      :model-value="presetSelection"
      label="Monto de la donación"
      :options="presetWithCustom"
      required
      :disabled="disabled"
      :error="errors.value"
      @update:model-value="onPresetChange"
    >
      <template #custom="{ isCustomSelected }">
        <div v-if="isCustomSelected" class="mt-2">
          <FieldText
            :model-value="customDisplay"
            label="Monto personalizado"
            placeholder="1.000"
            inputmode="decimal"
            autocomplete="transaction-amount"
            :disabled="disabled"
            @update:model-value="onCustomInput"
          />
        </div>
      </template>
    </FieldButtonGroup>

    <FieldText
      v-else
      :model-value="customDisplay"
      label="Monto de la donación"
      placeholder="1.000"
      inputmode="decimal"
      autocomplete="transaction-amount"
      :disabled="disabled"
      :error="errors.value"
      @update:model-value="onCustomInput"
    />
  </section>
</template>
