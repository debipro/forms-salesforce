<script setup lang="ts">
/**
 * Checkbox with a rich-HTML label. The legacy debi-forms config embedded
 * anchor tags inside checkbox labels (e.g., "Acepto los <a>T&C</a>"); this
 * component preserves that by allowing either a plain `label` string OR a
 * default slot with arbitrary markup.
 *
 * Always render the label via the slot if you have inline links — never
 * use `v-html` here. The `label` prop is sanitized text only.
 */

withDefaults(
  defineProps<{
    modelValue: boolean;
    label?: string;
    error?: string | null;
    disabled?: boolean;
  }>(),
  {
    label: "",
    error: null,
    disabled: false,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const inputId = `c-${Math.random().toString(36).slice(2, 10)}`;

function onChange(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      :for="inputId"
      class="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-foreground"
    >
      <input
        :id="inputId"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        :aria-invalid="!!error || undefined"
        class="mt-0.5 h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
        @change="onChange"
      />
      <span>
        <slot>{{ label }}</slot>
      </span>
    </label>
    <p v-if="error" class="ml-6 text-xs text-red-600" role="alert">
      {{ error }}
    </p>
  </div>
</template>
