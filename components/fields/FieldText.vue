<script setup lang="ts">
/**
 * Generic text-like input (text / email / tel / date) with label, helper
 * line, and inline error. Two-way binds via `v-model`.
 *
 * - `formatter` runs on every keystroke so the visible value can differ
 *   from the canonical one (e.g., DD/MM/YYYY auto-slashing).
 * - `transformer` is documented for parity with debi-forms but is NOT
 *   invoked here — the step component owning the field should apply it
 *   right before submitting, so the input keeps the user-friendly form.
 *
 * Set `half-width` to make the field take half a row inside a CSS grid.
 */
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    type?: "text" | "email" | "tel" | "date" | "number";
    inputmode?:
      | "text"
      | "email"
      | "tel"
      | "decimal"
      | "numeric"
      | "search"
      | "url";
    placeholder?: string;
    autocomplete?: string;
    maxlength?: number;
    helper?: string;
    error?: string | null;
    required?: boolean;
    disabled?: boolean;
    halfWidth?: boolean;
    formatter?: (value: string) => string;
  }>(),
  {
    type: "text",
    inputmode: undefined,
    placeholder: "",
    autocomplete: "",
    maxlength: undefined,
    helper: "",
    error: null,
    required: false,
    disabled: false,
    halfWidth: false,
    formatter: undefined,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const inputId = `f-${Math.random().toString(36).slice(2, 10)}`;
const focused = ref(false);

const displayValue = computed(() => props.modelValue ?? "");

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const raw = target.value;
  const next = props.formatter ? props.formatter(raw) : raw;
  if (next !== raw) target.value = next;
  emit("update:modelValue", next);
}
</script>

<template>
  <div :class="['flex flex-col gap-1.5', halfWidth && 'sm:col-span-1']">
    <label
      :for="inputId"
      class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <input
      :id="inputId"
      :type="type"
      :value="displayValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete || undefined"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      :aria-describedby="error ? `${inputId}-error` : undefined"
      class="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      @input="onInput"
      @focus="focused = true"
      @blur="focused = false"
    />
    <p
      v-if="helper && !error"
      class="text-xs leading-relaxed text-muted-foreground"
    >
      {{ helper }}
    </p>
    <p
      v-if="error"
      :id="`${inputId}-error`"
      class="text-xs text-red-600"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
