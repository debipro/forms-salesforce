<script setup lang="ts">
/**
 * Preset chip selector. Equivalent to debi-forms' `select-buttons*` field
 * type. Each preset is a tile; tapping selects its value. An optional
 * `custom` slot lets the parent render a freeform input when the user
 * picks the "Otro monto" preset (its `value` is `null`).
 *
 * Designed for amount/frequency selection but works for any preset list.
 */

type Preset = { label: string; value: string | number | null };

withDefaults(
  defineProps<{
    modelValue: string | number | null;
    label: string;
    options: ReadonlyArray<Preset>;
    helper?: string;
    error?: string | null;
    required?: boolean;
    disabled?: boolean;
  }>(),
  {
    helper: "",
    error: null,
    required: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string | number | null];
}>();

function select(value: string | number | null) {
  emit("update:modelValue", value);
}

function isSelected(
  modelValue: string | number | null,
  value: string | number | null,
): boolean {
  if (modelValue == null && value == null) return true;
  return modelValue === value;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <span
      class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </span>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button
        v-for="(opt, i) in options"
        :key="i"
        type="button"
        :disabled="disabled"
        :aria-pressed="isSelected(modelValue, opt.value)"
        :class="[
          'rounded-lg border px-3 py-2.5 text-sm font-medium transition',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          isSelected(modelValue, opt.value)
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:border-primary/50',
          disabled && 'pointer-events-none opacity-60',
        ]"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <slot name="custom" :is-custom-selected="modelValue === null" />
    <p
      v-if="helper && !error"
      class="text-xs leading-relaxed text-muted-foreground"
    >
      {{ helper }}
    </p>
    <p v-if="error" class="text-xs text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
