/**
 * Debi SDK accessor + ambient types.
 *
 * The SDK loads from the CDN (`https://js.debi.pro/v1/`) via the script
 * tag registered in `nuxt.config.ts` and exposes `window.Debi`. There is
 * **no npm dependency** on the SDK — the CDN URL is self-versioning, so
 * any fix Debi publishes reaches every visitor on their next page load
 * without bumping a dep or redeploying this template.
 *
 * The shapes below mirror `debi-js@0.7.x`. They're compile-time-only;
 * the runtime never imports from a package. If a future SDK ships new
 * fields you want to read from app code, add them here.
 */

export type DebiPaymentMethodType = "card" | "cbu";

export interface DebiError {
  code: string;
  message: string;
  raw?: unknown;
}

export interface DebiFieldState {
  complete: boolean;
  empty: boolean;
  error: DebiError | null;
}

export interface DebiElementState {
  type: DebiPaymentMethodType | null;
  complete: boolean;
  empty: boolean;
  error: DebiError | null;
  fields: Record<string, DebiFieldState>;
}

/**
 * Subset of element events we type explicitly. The SDK emits more
 * (`ready`, `focus`, `blur`, `escape`, `complete`); they're all
 * supported at runtime through the generic listener signature below.
 */
export interface DebiElement {
  mount: (target: string | Element) => DebiElement;
  unmount: () => void;
  destroy: () => void;
  update: (options: Record<string, unknown>) => void;
  focus: () => void;
  clear: () => void;
  getState: () => DebiElementState;
  on(event: "change", listener: (state: DebiElementState) => void): () => void;
  on(event: string, listener: (...args: unknown[]) => void): () => void;
  off(event: "change", listener: (state: DebiElementState) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

export interface DebiElementsFactory {
  create: (type: string, options?: Record<string, unknown>) => DebiElement;
  update: (options: Record<string, unknown>) => void;
  destroy: () => void;
}

export interface DebiPaymentToken {
  id: string;
  type: DebiPaymentMethodType;
  card?: {
    last_four_digits?: string;
    network?: string;
    funding?: string;
    issuer?: string;
    fingerprint?: string;
    bank?: string;
    expiration_month?: number;
    expiration_year?: number;
  };
  cbu?: {
    last_four_digits?: string;
    network?: string;
    funding?: string;
    issuer?: string;
    fingerprint?: string;
    bank?: string;
  };
}

export type DebiConfirmResult =
  | { token: DebiPaymentToken; error?: undefined }
  | { token?: undefined; error: DebiError };

export interface DebiClient {
  elements: (options?: Record<string, unknown>) => DebiElementsFactory;
  confirmPaymentMethod: (
    element: DebiElement,
    options?: { strict?: boolean },
  ) => Promise<DebiConfirmResult>;
}

interface DebiConstructor {
  new (publishableKey: string): DebiClient;
}

declare global {
  interface Window {
    /** Set by `https://js.debi.pro/v1/` once it finishes loading. */
    Debi?: DebiConstructor;
  }
}

/**
 * Returns a fresh Debi SDK instance bound to the configured publishable
 * key. Must be called from client code only — the SSR pass has no
 * `window.Debi`.
 */
export function useDebiClient(): DebiClient {
  if (typeof window === "undefined" || !window.Debi) {
    throw new Error("No se cargó el SDK de Debi");
  }
  const config = useRuntimeConfig();
  const publishableKey = config.public.debiPublicKey;
  if (!publishableKey) {
    throw new Error("Falta DEBI_PUBLIC_KEY");
  }
  return new window.Debi(publishableKey);
}
