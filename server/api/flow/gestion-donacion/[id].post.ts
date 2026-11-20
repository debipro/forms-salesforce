import {
  FlowRequestError,
  submitUpdateRecurring,
  submitConvertToRecurring,
  submitAbandonedCart,
  type UpdateRecurringRecord,
  type ConvertToRecurringRecord,
} from "~/server/utils/salesforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

type GestionMode = "update-recurring" | "convert-to-recurring" | "abandoned-cart";

const VALID_MODES: GestionMode[] = [
  "update-recurring",
  "convert-to-recurring",
  "abandoned-cart",
];

/**
 * POST /api/flow/gestion-donacion/[id]
 *
 * Processes the form submission based on the mode:
 *
 *   - `update-recurring`: Reactivates an existing Recurring Donation.
 *     ID is a npe03__Recurring_Donation__c ID.
 *     Optionally updates amount, frequency, and/or payment method.
 *
 *   - `convert-to-recurring`: Converts a one-time Opportunity to recurring.
 *     ID is an Opportunity ID.
 *     Creates a new Recurring Donation and Payment Method.
 *
 *   - `abandoned-cart`: Completes an incomplete TCPagos__Formulario_TC__c.
 *     ID is a TCPagos__Formulario_TC__c ID.
 *     Updates the form with monto, frecuencia, and payment_method.
 *     The Salesforce Flow handles the rest.
 *
 * Body:
 *   - mode: "update-recurring" | "convert-to-recurring" | "abandoned-cart"
 *   - amount: number (required, must be > 0)
 *   - frequency: string (e.g., "Mensual", "Trimestral", "Anual")
 *   - paymentMethodToken?: DebiPaymentToken
 *     - Optional for update-recurring
 *     - Required for convert-to-recurring and abandoned-cart
 *   - record?: Pre-loaded record to skip re-fetching
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    setResponseStatus(event, 400);
    return { error: true, message: "Falta el parámetro id" };
  }

  try {
    const body = await readBody<{
      mode?: string;
      amount?: number;
      frequency?: string;
      paymentMethodToken?: DebiPaymentToken;
      record?: UpdateRecurringRecord | ConvertToRecurringRecord;
    }>(event);

    // Validate mode
    const mode = body.mode as GestionMode | undefined;
    if (!mode || !VALID_MODES.includes(mode)) {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: `El modo debe ser uno de: ${VALID_MODES.join(", ")}`,
      };
    }

    // Validate amount
    if (
      typeof body.amount !== "number" ||
      Number.isNaN(body.amount) ||
      body.amount <= 0
    ) {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: "El monto tiene que ser un número positivo",
      };
    }

    // Validate frequency
    if (!body.frequency || typeof body.frequency !== "string") {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: "Falta la frecuencia de la donación",
      };
    }

    // Validate payment method token if provided
    const token = body.paymentMethodToken;
    if (token !== undefined && token !== null && (!token.id || !token.type)) {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: "El token de método de pago no es válido",
      };
    }

    // For convert-to-recurring and abandoned-cart, payment method is required
    if (
      (mode === "convert-to-recurring" || mode === "abandoned-cart") &&
      !token
    ) {
      setResponseStatus(event, 400);
      return {
        error: true,
        message: "El método de pago es obligatorio para este tipo de operación",
      };
    }

    let data: unknown;

    switch (mode) {
      case "update-recurring":
        data = await submitUpdateRecurring({
          rdId: id,
          amount: body.amount,
          frequency: body.frequency,
          paymentMethodToken: token,
          record: body.record as UpdateRecurringRecord | undefined,
        });
        break;

      case "convert-to-recurring":
        data = await submitConvertToRecurring({
          oppId: id,
          amount: body.amount,
          frequency: body.frequency,
          paymentMethodToken: token!,
          record: body.record as ConvertToRecurringRecord | undefined,
        });
        break;

      case "abandoned-cart":
        data = await submitAbandonedCart({
          formId: id,
          amount: body.amount,
          frequency: body.frequency,
          paymentMethodToken: token!,
        });
        break;
    }

    return { error: false, mode, data };
  } catch (error) {
    console.error("[gestion-donacion] submit failed", {
      id,
      error: error instanceof Error ? error.message : error,
    });
    if (error instanceof FlowRequestError) {
      setResponseStatus(event, error.status);
      return { error: true, message: error.message };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al procesar la solicitud";
    setResponseStatus(event, 422);
    return { error: true, message };
  }
});
