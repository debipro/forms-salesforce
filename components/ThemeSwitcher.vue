<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  getResolvedTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "~/composables/useThemePreference";

const preference = ref<ThemePreference>("system");

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function applyResolved(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", getResolvedTheme(pref));
}

function setTheme(next: ThemePreference) {
  preference.value = next;
  if (next === "system") {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }
  applyResolved(next);
}

let mediaQuery: MediaQueryList | null = null;
const onSystemChange = () => {
  if (preference.value === "system") applyResolved("system");
};

onMounted(() => {
  preference.value = readPreference();
  applyResolved(preference.value);
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onSystemChange);
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener("change", onSystemChange);
});

watch(preference, (next) => {
  if (next === "system") applyResolved("system");
});

const options: ReadonlyArray<readonly [ThemePreference, string]> = [
  ["light", "Claro"],
  ["dark", "Oscuro"],
  ["system", "Auto"],
];
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5"
    role="group"
    aria-label="Tema de la interfaz"
  >
    <button
      v-for="[value, label] in options"
      :key="value"
      type="button"
      :aria-pressed="preference === value"
      :class="[
        'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        preference === value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="setTheme(value)"
    >
      {{ label }}
    </button>
  </div>
</template>
