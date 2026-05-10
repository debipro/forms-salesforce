<script setup lang="ts">
// Top-level layout shared by every page. Mirrors `src/app/layout.tsx` from
// the legacy Next.js implementation: sticky theme switcher header + page
// content slot.
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="sticky top-0 z-10 flex justify-end px-4 py-3">
      <ThemeSwitcher />
    </header>
    <div class="flex-1">
      <NuxtPage />
    </div>
  </div>
</template>
