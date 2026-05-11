<script setup lang="ts">
/**
 * Amount + frequency step.
 *
 * Two visual modes for the preset picker, switchable via the `mode` prop:
 *
 *   - `"buttons"` (default) — renders a chip group, one button per preset.
 *     Works best with short numeric labels ("$12.000", "$18.000", ...).
 *
 *   - `"select"` — renders a native `<select>` dropdown. Best when each
 *     preset has a long descriptive label that wouldn't fit on a button
 *     ("$76.600 mensual. Apadriná un/a joven."). This mirrors the
 *     legacy debi-forms presentation for Reciduca and similar orgs.
 *
 * In both modes, a preset whose `value` is `null` is treated as the
 * "Otro monto" escape hatch; picking it reveals the custom-amount text
 * input. Pass `presets: []` to skip the picker entirely and only show
 * the custom-amount input.
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
type PresetMode = "buttons" | "select";

const props = withDefaults(
  defineProps<{
    modelValue: AmountData;
    stepIndex?: number;
    title?: string;
    description?: string;
    presets?: ReadonlyArray<Preset> | ReadonlyArray<number>;
    presetsLabel?: string;
    /** `"buttons"` (chips) or `"select"` (dropdown) — see component docs. */
    mode?: PresetMode;
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
    presetsLabel: "Monto de la donación",
    mode: "buttons",
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

/**
 * Sentinel used **only for the `mode: "select"` path**. The native `<select>`
 * cannot carry `null` through its DOM string layer, and `FieldSelect`'s
 * placeholder logic treats `null` and `""` as the same state. Stringifying
 * every option (`"__custom__"` for the "Otro monto" entry, the amount as a
 * decimal string otherwise) makes each option's `value` attribute unique
 * and lets us round-trip the user's choice cleanly.
 */
const CUSTOM_SELECT_VALUE = "__custom__";

const selectModeOptions = computed(() =>
  presetWithCustom.value.map((p) => ({
    label: p.label,
    value: p.value === null ? CUSTOM_SELECT_VALUE : String(p.value),
  })),
);

const selectModeValue = computed<string>(() => {
  const sel = presetSelection.value;
  if (sel === null) return CUSTOM_SELECT_VALUE;
  if (sel === "") return "";
  return String(sel);
});

function onSelectModeChange(value: string | number | null) {
  if (value === CUSTOM_SELECT_VALUE) return onPresetChange(null);
  if (value === "" || value == null) return onPresetChange("");
  onPresetChange(Number(value));
}

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
  <section class="space-y-4">
    <header class="space-y-1">
      <h2 class="text-sm font-semibold text-foreground">{{ title }}</h2>
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

    <!--
      Mode 1: chip buttons (default). Good for short numeric labels.
    -->
    <FieldButtonGroup
      v-if="showPresets && mode === 'buttons'"
      :model-value="presetSelection"
      :label="presetsLabel"
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

    <!--
      Mode 2: native <select>. Better when each preset has a long
      descriptive label (e.g. "$76.600 mensual. Apadriná un/a joven.").
      Mirrors the legacy debi-forms `type: "select"` config.
    -->
    <template v-else-if="showPresets && mode === 'select'">
      <FieldSelect
        :model-value="selectModeValue"
        :label="presetsLabel"
        :options="selectModeOptions"
        placeholder="Seleccioná un monto"
        required
        :disabled="disabled"
        :error="errors.value"
        @update:model-value="onSelectModeChange"
      />
      <div v-if="presetSelection === null" class="-mt-1">
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

    <!--
      No presets at all — just a free-form numeric input. Used by the
      "actualizar donación" flow, where the donor edits an existing
      amount.
    -->
    <FieldText
      v-else
      :model-value="customDisplay"
      :label="presetsLabel"
      placeholder="1.000"
      inputmode="decimal"
      autocomplete="transaction-amount"
      :disabled="disabled"
      :error="errors.value"
      @update:model-value="onCustomInput"
    />
  </section>
</template>
