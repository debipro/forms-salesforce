<script setup lang="ts">
/**
 * Multi-step wizard orchestrator.
 *
 * Usage:
 *
 *   <MultiStepFlow :steps="2" @submit="onSubmit">
 *     <template #step-1>
 *       <PersonalDataStep v-model="state.personal" />
 *     </template>
 *     <template #step-2>
 *       <AmountStep v-model="state.amount" />
 *       <PaymentMethodStep v-model="state.payment" />
 *     </template>
 *   </MultiStepFlow>
 *
 * Each slot can hold ONE or MANY step components. Steps register themselves
 * with the orchestrator via the `useFlowStep()` composable (auto-imported)
 * inside their `<script setup>`. The orchestrator then knows which steps
 * belong to which slot, calls `validate()` on every active step before
 * advancing, and aborts on the first failure.
 *
 * Optional anti-cart-abandonment hook: `onStepAdvance(stepIndex, ctx)` runs
 * after a step validates and before navigating to the next one. Use it to
 * POST the partial payload so a Contact is persisted even if the donor
 * bails out before paying.
 */
import { computed, provide, ref, watch } from "vue";
import {
  FLOW_INJECTION_KEY,
  type FlowStepHandle,
} from "~/composables/useFlowStep";

const props = withDefaults(
  defineProps<{
    steps: number;
    actionLabel?: string;
    backLabel?: string;
    nextLabel?: string;
    stepLabels?: ReadonlyArray<string>;
    isSubmitting?: boolean;
    /** Flip to `true` after a successful final submit so the trailing check fills. */
    isSubmitted?: boolean;
    onStepAdvance?: (
      stepIndex: number,
      ctx: { isLastStep: boolean },
    ) => Promise<void> | void;
  }>(),
  {
    actionLabel: "Enviar",
    backLabel: "Atrás",
    nextLabel: "Siguiente",
    stepLabels: undefined,
    isSubmitting: false,
    isSubmitted: false,
    onStepAdvance: undefined,
  },
);

const emit = defineEmits<{
  submit: [];
  stepChange: [step: number];
}>();

const currentStep = ref(1);
const isAdvancing = ref(false);
const advanceError = ref<string | null>(null);
const slotContainer = ref<HTMLDivElement | null>(null);

const isFirstStep = computed(() => currentStep.value === 1);
const isLastStep = computed(() => currentStep.value === props.steps);

/**
 * Registry of step handles, keyed by the slot they belong to. Steps push
 * themselves in on mount and remove themselves on unmount.
 */
const registry = new Map<number, Set<FlowStepHandle>>();

function register(stepIndex: number, handle: FlowStepHandle) {
  let bucket = registry.get(stepIndex);
  if (!bucket) {
    bucket = new Set();
    registry.set(stepIndex, bucket);
  }
  bucket.add(handle);
}

function unregister(stepIndex: number, handle: FlowStepHandle) {
  registry.get(stepIndex)?.delete(handle);
}

provide(FLOW_INJECTION_KEY, {
  currentStep,
  totalSteps: props.steps,
  isLastStep,
  register,
  unregister,
});

watch(currentStep, (n) => {
  emit("stepChange", n);
  if (import.meta.client) {
    requestAnimationFrame(() => {
      slotContainer.value?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
});

async function validateCurrentStep(): Promise<boolean> {
  const handles = Array.from(registry.get(currentStep.value) ?? []);
  if (handles.length === 0) return true;
  let allOk = true;
  for (const h of handles) {
    const result = await h.validate();
    if (!result.ok) {
      if (allOk) h.focus?.();
      allOk = false;
    }
  }
  return allOk;
}

async function goNext() {
  if (isAdvancing.value || props.isSubmitting) return;
  advanceError.value = null;
  isAdvancing.value = true;
  try {
    const ok = await validateCurrentStep();
    if (!ok) return;
    if (props.onStepAdvance) {
      await props.onStepAdvance(currentStep.value, {
        isLastStep: isLastStep.value,
      });
    }
    if (isLastStep.value) {
      emit("submit");
    } else {
      currentStep.value++;
    }
  } catch (error) {
    advanceError.value =
      error instanceof Error
        ? error.message
        : "No pudimos continuar. Probá de nuevo en unos minutos.";
  } finally {
    isAdvancing.value = false;
  }
}

function goBack() {
  if (isFirstStep.value || isAdvancing.value || props.isSubmitting) return;
  advanceError.value = null;
  currentStep.value--;
}

defineExpose({
  reset() {
    currentStep.value = 1;
    advanceError.value = null;
  },
  currentStep,
});
</script>

<template>
  <div class="space-y-6">
    <StepsIndicator
      :total="steps"
      :current="currentStep"
      :submitted="isSubmitted"
      :labels="stepLabels"
    />

    <div ref="slotContainer" class="space-y-6">
      <!--
        We use `v-if` (not `v-show`) so the previous step is fully
        unmounted from the DOM when we advance. This guarantees the user
        never sees old content stacked under the active step, and lets
        `useFlowStep` deregister cleanly. Step data is preserved by
        `useFlowState` in the parent flow page, so back-navigation
        restores everything the donor typed.
      -->
      <template v-for="i in steps" :key="i">
        <div v-if="currentStep === i" class="space-y-6">
          <slot :name="`step-${i}`" />
        </div>
      </template>
    </div>

    <p v-if="advanceError" class="text-sm text-red-600" role="alert">
      {{ advanceError }}
    </p>

    <div class="flex items-center justify-between gap-3 pt-2">
      <button
        v-if="!isFirstStep"
        type="button"
        class="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        :disabled="isAdvancing || isSubmitting"
        @click="goBack"
      >
        {{ backLabel }}
      </button>
      <span v-else class="block" aria-hidden="true"></span>

      <button
        type="button"
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        :disabled="isAdvancing || isSubmitting"
        @click="goNext"
      >
        <template v-if="isAdvancing || isSubmitting">
          {{ isLastStep ? "Enviando..." : "Cargando..." }}
        </template>
        <template v-else>
          {{ isLastStep ? actionLabel : nextLabel }}
        </template>
      </button>
    </div>
  </div>
</template>
