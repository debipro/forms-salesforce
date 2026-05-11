<script setup lang="ts">
/**
 * Visual stepper. Inspired by `debi-forms/components/StepsIndicator.vue`:
 *
 *   ●━━━━━━━━━━━━━●━━━━━━━━━━━━━○
 *   1             2             ✓
 *
 * - Big numbered circles (h-10/w-10) with the primary color when reached.
 * - Horizontal bars BETWEEN each pair of circles that fill progressively:
 *   100% when the user has crossed them, 25% to signal "in progress" when
 *   they sit right before the active step, 0% otherwise.
 * - A final "check" circle at the end that fills only on `submitted`.
 *
 * Hidden entirely when there is only one step.
 *
 * Implementation: a single flex row with alternating `circle` / `bar`
 * children. Bars are `flex-1` (they absorb the leftover space); circles
 * are fixed-width. This avoids the absolute-positioning math from the
 * legacy debi-forms version.
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    total: number;
    current: number; // 1-indexed
    submitted?: boolean;
    /** Reserved for future use; the markup intentionally omits labels. */
    labels?: ReadonlyArray<string>;
  }>(),
  {
    submitted: false,
    labels: undefined,
  },
);
void props.labels;

/**
 * Builds an interleaved [circle, bar, circle, bar, ..., circle, bar, check]
 * list so the template can do a single `v-for`.
 */
type Cell =
  | { kind: "circle"; step: number; filled: boolean; active: boolean }
  | { kind: "bar"; fill: "0%" | "25%" | "100%" }
  | { kind: "check"; filled: boolean };

const cells = computed<Cell[]>(() => {
  const out: Cell[] = [];
  for (let step = 1; step <= props.total; step++) {
    const filled = props.submitted || step <= props.current;
    out.push({
      kind: "circle",
      step,
      filled,
      active: step === props.current && !props.submitted,
    });

    let fill: "0%" | "25%" | "100%";
    if (props.submitted) fill = "100%";
    else if (props.current > step) fill = "100%";
    else if (props.current === step) fill = "25%";
    else fill = "0%";
    out.push({ kind: "bar", fill });
  }
  out.push({ kind: "check", filled: props.submitted });
  return out;
});
</script>

<template>
  <div
    v-if="total > 1"
    class="flex w-full items-center py-4"
    role="list"
    :aria-label="`Paso ${current} de ${total}`"
  >
    <template v-for="(cell, idx) in cells" :key="idx">
      <div
        v-if="cell.kind === 'circle'"
        role="listitem"
        :class="[
          'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
          cell.filled
            ? 'bg-primary text-primary-foreground'
            : 'border-2 border-border bg-background text-muted-foreground',
          cell.active && 'ring-4 ring-primary/20',
        ]"
        :aria-current="cell.active ? 'step' : undefined"
      >
        {{ cell.step }}
      </div>

      <div
        v-else-if="cell.kind === 'bar'"
        class="relative h-1 flex-1 overflow-hidden rounded bg-border"
        aria-hidden="true"
      >
        <div
          class="h-full bg-primary opacity-60 transition-all duration-300"
          :style="{ width: cell.fill }"
        ></div>
      </div>

      <div
        v-else-if="cell.kind === 'check'"
        :class="[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
          cell.filled
            ? 'bg-primary text-primary-foreground'
            : 'border-2 border-border bg-background text-muted-foreground',
        ]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5 fill-current">
          <path
            d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-2.3-8.7l1.3 1.29 3.3-3.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-2-2a1 1 0 0 1 1.4-1.42z"
          />
        </svg>
      </div>
    </template>
  </div>
</template>
