/**
 * Configuration for the gestion-donacion flow.
 *
 * This file defines the content and behavior for each mode of the donation
 * management flow. ONGs can customize these settings without modifying
 * the main page component.
 *
 * To enable this flow in your deployment:
 * 1. Copy this file (if you haven't already)
 * 2. Customize the content for your organization
 * 3. The flow will be available at /flow/gestion-donacion/[id]?mode=<mode>
 *
 * Modes and their ID types:
 *
 *   - `update-recurring`: ID is a Recurring Donation (npe03__Recurring_Donation__c)
 *     For reactivating an existing closed/inactive recurring donation.
 *     Optionally change amount, frequency, and/or payment method.
 *
 *   - `convert-to-recurring`: ID is an Opportunity
 *     For converting a one-time donation into a recurring one.
 *     Creates a new Recurring Donation linked to the Opportunity.
 *
 *   - `abandoned-cart`: ID is a TCPagos__Formulario_TC__c
 *     For completing an incomplete form submission.
 *     Updates the form with missing data; the Salesforce Flow creates
 *     Contact, Recurring Donation, Opportunity, etc.
 */

export type GestionMode =
  | "update-recurring"
  | "convert-to-recurring"
  | "abandoned-cart";

export interface ModeConfig {
  /** Page title shown in browser tab */
  pageTitle: string;
  /** Main heading shown on the page */
  title: string;
  /** Description shown below the title. Use {firstName} as placeholder. */
  description: string;
  /** Text for the submit button */
  buttonText: string;
  /** Text shown while submitting */
  buttonLoadingText: string;
  /** Success message after submission. Use {firstName} as placeholder. */
  successMessage: string;
  /** Whether payment method is required (true) or optional (false) */
  paymentRequired: boolean;
  /** Optional secondary description paragraph */
  secondaryDescription?: string;
  /** Heading of the amount block. Defaults to "Monto y frecuencia". */
  amountTitle?: string;
  /** Text under the amount heading. Falls back to the previous-amount line. */
  amountDescription?: string;
  /**
   * Label above the preset buttons. Empty string hides it.
   * Defaults to "Monto de la donación".
   */
  presetsLabel?: string;
  /** Heading of the payment block. */
  paymentTitle?: string;
  /** Text under the payment heading. */
  paymentDescription?: string;
  /**
   * Note under the submit button. Use {contactEmail}; the address comes
   * from the ORG_CONTACT_EMAIL env var (Vercel).
   */
  footerNote?: string;
  /**
   * When false, the frequency picker is hidden and the loaded frequency
   * (or the default) is submitted as-is.
   */
  showFrequency?: boolean;
  /** Label of the frequency dropdown. Defaults to "Quiero donar". */
  frequencyLabel?: string;
}

/**
 * Default configuration for each mode.
 * Override these in your deployment by editing this file directly.
 */
export const MODE_CONFIGS: Record<GestionMode, ModeConfig> = {
  "update-recurring": {
    pageTitle: "Reactivá tu donación",
    title: "Reactivá tu donación",
    description:
      "Hola {firstName}, ¡qué bueno que vuelvas! Desde acá podés reactivar tu donación mensual en un minuto.",
    secondaryDescription:
      "Con tu aporte volvés a ser parte para que nadie viva sobre un piso de tierra.",
    buttonText: "Reactivar mi donación",
    buttonLoadingText: "Reactivando...",
    successMessage:
      "¡Gracias {firstName}! Tu donación fue reactivada correctamente.",
    paymentRequired: false,
    amountTitle: "Monto",
    amountDescription: "Elegí con cuánto querés volver a sumarte:",
    presetsLabel: "",
    paymentTitle: "Método de pago",
    paymentDescription: "Ingresá los datos de tu tarjeta o CBU.",
    footerNote:
      "Podés modificar o pausar tu donación cuando quieras escribiéndonos a {contactEmail}.",
    showFrequency: false,
  },
  "convert-to-recurring": {
    pageTitle: "Sumate todos los meses",
    title: "Sumate todos los meses",
    description:
      "Hola {firstName}, ¡Gracias por tu donación, qué bueno que estés acá!",
    secondaryDescription:
      "Siendo socio mensual, sostenés en el tiempo la construcción de viviendas y proyectos comunitarios.",
    buttonText: "Activar donación mensual",
    buttonLoadingText: "Activando...",
    successMessage:
      "¡Gracias {firstName}! Tu donación recurrente está activa. Recibirás un email de confirmación.",
    paymentRequired: true,
    amountTitle: "Monto mensual",
    amountDescription: "Elegí con cuánto querés sumarte cada mes:",
    presetsLabel: "",
    paymentTitle: "Método de pago",
    paymentDescription: "Ingresá los datos de tu tarjeta o CBU.",
    footerNote:
      "Podés modificar o pausar tu donación cuando quieras escribiéndonos a {contactEmail}.",
    showFrequency: false,
  },
  "abandoned-cart": {
    pageTitle: "Completá tu donación",
    title: "Completá tu donación",
    description:
      "Hola {firstName}, te quedó la donación a mitad de camino. ¡Estás a un paso de sumarte a {orgName} y construir con nosotros para que nadie viva sobre un piso de tierra!",
    buttonText: "Finalizar mi donación",
    buttonLoadingText: "Procesando...",
    successMessage:
      "¡Bienvenido/a {firstName}! Tu donación está activa. Gracias por sumarte.",
    paymentRequired: true,
    amountTitle: "Monto y frecuencia",
    amountDescription: "Elegí el monto y la frecuencia de tu donación:",
    presetsLabel: "",
    frequencyLabel: "Frecuencia",
    paymentTitle: "Método de pago",
    paymentDescription: "Ingresá los datos de tu tarjeta o CBU.",
    footerNote:
      "¿Tuviste algún problema para completarla? Escribinos a {contactEmail}.",
  },
};

/**
 * Frequency options shown in the form.
 * Customize if your org uses different frequencies.
 */
export const FREQUENCY_OPTIONS = [
  { value: "Mensual", label: "Mensual" },
  { value: "Trimestral", label: "Trimestral" },
  { value: "Anual", label: "Anual" },
] as const;

/**
 * Amount presets shown as quick-select buttons.
 * Set to empty array [] to show only a free-form input.
 * Each number represents an amount in your currency.
 */
export const AMOUNT_PRESETS: number[] = [5000, 10000, 15000, 25000];

/**
 * Default frequency to pre-select when loading the form.
 */
export const DEFAULT_FREQUENCY = "Mensual";

/**
 * Helper to replace {firstName} placeholder in strings.
 */
export function interpolate(
  template: string,
  firstName: string | null,
): string {
  const name = firstName?.trim() || "";
  // If no name, remove "Hola {firstName}, " pattern to avoid awkward "Hola , ..."
  if (!name) {
    return template
      .replace(/Hola \{firstName\},?\s*/gi, "")
      .replace(/\{firstName\}/g, "");
  }
  return template.replace(/\{firstName\}/g, name);
}

/**
 * Replaces {contactEmail} in a footer note. The address comes from
 * ORG_CONTACT_EMAIL. If it is empty, the "escribiéndonos a …" clause
 * is dropped so the sentence still reads cleanly.
 */
export function interpolateContactEmail(
  template: string,
  email: string | null | undefined,
): string {
  const address = email?.trim() || "";
  if (!address) {
    return template
      .replace(/\s*(?:escribiéndonos|escribinos) a \{contactEmail\}\.?/gi, ".")
      .replace(/\{contactEmail\}/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\?\./g, "?")
      .replace(/\s+\./g, ".")
      .replace(/\.{2,}/g, ".")
      .trim();
  }
  return template.replace(/\{contactEmail\}/g, address);
}

/**
 * Replaces {orgName}. The name comes from ORG_NAME. If it is empty,
 * "a {orgName}" is dropped so "sumarte a {orgName} y…" still reads.
 */
export function interpolateOrgName(
  template: string,
  orgName: string | null | undefined,
): string {
  const name = orgName?.trim() || "";
  if (!name) {
    return template
      .replace(/\s+a \{orgName\}/gi, "")
      .replace(/\{orgName\}/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return template.replace(/\{orgName\}/g, name);
}

/**
 * Maps Salesforce Installment Period to our frequency values.
 */
export function installmentPeriodToFrequency(
  installmentPeriod: string | null,
): string {
  switch (installmentPeriod) {
    case "Monthly":
      return "Mensual";
    case "Quarterly":
      return "Trimestral";
    case "Yearly":
      return "Anual";
    default:
      return DEFAULT_FREQUENCY;
  }
}
