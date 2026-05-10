<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{
  error: NuxtError;
}>();

function goHome() {
  return clearError({ redirect: "/" });
}
</script>

<template>
  <main class="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col justify-center p-6">
    <h1 class="mb-2 text-xl font-semibold">
      {{ error.statusCode === 404 ? "Página no encontrada" : "Algo no salió bien" }}
    </h1>
    <p class="mb-4 text-sm text-muted-foreground">
      {{
        error.statusCode === 404
          ? "No hay nada en esta dirección. Volvé al inicio o abrí el flujo con el link que te pasaron."
          : "Probá de nuevo en unos minutos. Si el problema persiste, escribinos."
      }}
    </p>
    <button
      type="button"
      class="self-start text-sm font-medium text-primary underline underline-offset-2"
      @click="goHome"
    >
      Ir al inicio
    </button>
  </main>
</template>
