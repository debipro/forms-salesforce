import {
  inject,
  onBeforeUnmount,
  onMounted,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";

/**
 * Shape every step component implements. Step components call
 * `useFlowStep({ stepIndex, validate, focus })` once inside `<script setup>`
 * to register themselves with the nearest `<MultiStepFlow>` ancestor.
 *
 * `validate()` returns `{ ok, errors }` where `errors` is a map from a
 * field key to a user-facing message. Callers may render those messages
 * inline (next to the field) or let the orchestrator scroll-focus the
 * first invalid field.
 */
export interface FlowStepValidation {
  ok: boolean;
  errors: Record<string, string>;
}

export interface FlowStepHandle {
  validate(): Promise<FlowStepValidation>;
  focus?(): void;
}

export interface FlowContext {
  currentStep: Ref<number>;
  totalSteps: number;
  isLastStep: ComputedRef<boolean>;
  register(stepIndex: number, handle: FlowStepHandle): void;
  unregister(stepIndex: number, handle: FlowStepHandle): void;
}

export const FLOW_INJECTION_KEY: InjectionKey<FlowContext> =
  Symbol("flowContext");

/**
 * Registers a step component with the enclosing `<MultiStepFlow>`. If there
 * is no `<MultiStepFlow>` ancestor (e.g., when the step is used outside a
 * wizard, like in the single-step `actualizar-donacion` flow), this is a
 * no-op — the parent is expected to call `validate()` directly via a
 * template ref.
 *
 * The `stepIndex` is 1-indexed to match the `#step-N` slot naming.
 */
export function useFlowStep(args: {
  stepIndex: number;
  validate: FlowStepHandle["validate"];
  focus?: FlowStepHandle["focus"];
}): void {
  const flow = inject(FLOW_INJECTION_KEY, null);
  const handle: FlowStepHandle = {
    validate: args.validate,
    focus: args.focus,
  };
  onMounted(() => {
    flow?.register(args.stepIndex, handle);
  });
  onBeforeUnmount(() => {
    flow?.unregister(args.stepIndex, handle);
  });
}
