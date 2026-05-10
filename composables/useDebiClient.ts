// Types come from the SDK package itself, so we never go out of sync with
// runtime. The SDK is loaded via <script src="https://js.debi.pro/v1/"> at
// runtime; the npm install is a devDependency only, used for typechecking.
import type Debi from "debi-js";
import type {
  DebiElement,
  DebiPaymentToken,
  ElementState as DebiElementState,
  ConfirmResult as DebiConfirmResult,
} from "debi-js";

declare global {
  interface Window {
    Debi?: typeof Debi;
  }
}

export type DebiClient = InstanceType<typeof Debi>;

export type {
  DebiElement,
  DebiElementState,
  DebiPaymentToken,
  DebiConfirmResult,
};

/**
 * Returns a Debi SDK instance. Must be called from client code: the SDK is
 * loaded via `<script src="https://js.debi.pro/v1/">` configured in
 * `nuxt.config.ts` and exposes `window.Debi`.
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
