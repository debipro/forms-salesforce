import { ref, watch, type Ref } from "vue";

/**
 * Shared, reactive state container for a multi-step flow. Each flow page
 * calls `useFlowState(defaults)` once and binds the returned `ref` into its
 * step components via `v-model="state.<section>"`.
 *
 * Persistence: the state is mirrored to `sessionStorage` keyed by the route
 * path so an accidental refresh mid-flow doesn't wipe what the donor has
 * typed. Tokens from `PaymentMethodStep` are NOT persisted (the SDK's
 * tokenization element re-mounts blank by design, so any saved token would
 * be stale anyway).
 *
 * The storage key includes the route path so two flows in the same browser
 * don't trample each other.
 */
export function useFlowState<T extends object>(
  defaults: T,
  options: { storageKey?: string; persist?: boolean } = {},
): Ref<T> {
  const persist = options.persist ?? true;
  const route = useRoute();
  const key =
    options.storageKey ?? `debi-forms:flow-state:${String(route.path)}`;

  const state = ref({ ...defaults }) as Ref<T>;

  if (import.meta.client && persist) {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        state.value = { ...defaults, ...parsed };
      }
    } catch {
      // Corrupted JSON; ignore and start fresh.
    }

    watch(
      state,
      (value) => {
        try {
          // Strip non-serializable / sensitive fields before persisting.
          // Convention: any top-level entry with a `token` property is a
          // payment-step section — drop the token from storage.
          const sanitized = sanitizeForStorage(value);
          window.sessionStorage.setItem(key, JSON.stringify(sanitized));
        } catch {
          // Quota exceeded or serialization issue; not fatal.
        }
      },
      { deep: true },
    );
  }

  return state;
}

function sanitizeForStorage<T extends object>(value: T): T {
  const clone = { ...value } as Record<string, unknown>;
  for (const [k, v] of Object.entries(clone)) {
    if (v && typeof v === "object" && "token" in (v as object)) {
      clone[k] = { ...(v as object), token: null };
    }
  }
  return clone as T;
}
