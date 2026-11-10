import {
  FlowRequestError,
  createDonationChain,
  findOrCreateContact,
  type AltaPersonal,
} from "~/server/utils/salesforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Server endpoint for the "alta-donante-alternativo" flow.
 *
 * Misma estructura de dos stages que `alta-donante.post.ts`. Las diferencias:
 *
 *   - El campo `phoneFixed` se escribe en el Contact como `HomePhone`
 *     (campo estándar).
 *   - El DNI/CUIT lo escribe `createDonationChain` en el Contact
 *     (`N_de_documento__c` / `CUIT__c`) y, si es única vez, en la
 *     Opportunity (`CUIT__c`).
 *
 * Este archivo es intencionalmente similar a `alta-donante.post.ts` —
 * sería fácil factorizar un helper compartido, pero mantenerlos como
 * dos archivos independientes hace que "borrar el alternativo" sea
 * una operación de un solo archivo.
 */

type PersonalBody = {
  stage: "personal";
  personal: AltaPersonal;
  phoneFixed?: string | null;
  campaign?: string | null;
};

type FinalizeBody = {
  stage: "finalize";
  contactId: string;
  amount: number;
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  dni?: string;
  campaign?: string | null;
};

type AltaAlternativoBody = PersonalBody | FinalizeBody;

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<AltaAlternativoBody>(event);

    if (body.stage === "personal") {
      const p = body.personal;
      if (!p?.firstName || !p.lastName || !p.email) {
        setResponseStatus(event, 400);
        return {
          error: true,
          message: "Faltan datos personales obligatorios.",
        };
      }
      const extra: Record<string, string> = {};
      if (body.phoneFixed) extra.HomePhone = body.phoneFixed;

      const { contactId } = await findOrCreateContact({
        personal: p,
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      });
      return { error: false, data: { contactId } };
    }

    if (body.stage === "finalize") {
      if (!body.contactId) {
        setResponseStatus(event, 400);
        return { error: true, message: "Falta el contacto del donante." };
      }
      if (
        typeof body.amount !== "number" ||
        Number.isNaN(body.amount) ||
        body.amount <= 0
      ) {
        setResponseStatus(event, 400);
        return {
          error: true,
          message: "El monto tiene que ser un número positivo.",
        };
      }
      if (
        !body.paymentMethodToken?.id ||
        !body.paymentMethodToken?.type
      ) {
        setResponseStatus(event, 400);
        return {
          error: true,
          message: "El token de método de pago no es válido.",
        };
      }

      const result = await createDonationChain({
        contactId: body.contactId,
        amount: body.amount,
        frequency: body.frequency,
        paymentMethodToken: body.paymentMethodToken,
        campaign: body.campaign ?? null,
        documentNumber: body.dni ?? null,
      });

      return { error: false, data: result };
    }

    setResponseStatus(event, 400);
    return { error: true, message: "Stage desconocido." };
  } catch (error) {
    if (error instanceof FlowRequestError) {
      setResponseStatus(event, error.status);
      return { error: true, message: error.message };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al procesar la donación.";
    setResponseStatus(event, 422);
    return { error: true, message };
  }
});
