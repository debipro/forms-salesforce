<script setup lang="ts">
import FlowForm from "~/components/FlowForm.vue";

const route = useRoute();
const oppId = computed(() => String(route.params.oppId));

useHead({ title: "Actualizá tu donación" });
</script>

<template>
  <main class="mx-auto w-full max-w-2xl p-6">
    <FlowForm :opp-id="oppId" />
  </main>
</template>
