import {
  FlowRequestError,
  createDonationChain,
  findOrCreateContact,
  type AltaPersonal,
} from "~/server/utils/salesforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Server endpoint for the "alta-donante" flow.
 *
 * Acepta dos stages:
 *
 *   `stage: "personal"` (después del paso 1)
 *     Crea o matchea un Contact por email. Devuelve `{ contactId }`.
 *     Este es el write anti-abandono — aunque el donante nunca llegue
 *     al paso de pago, la org conserva el registro del Contact.
 *
 *   `stage: "finalize"` (después del paso 2 / submit final)
 *     Tokeniza el método de pago (ya hecho client-side), luego crea
 *     la cadena de donación: Payment Method → Recurring Donation
 *     (mensual) u Opportunity (única vez). El Contact ya debe existir
 *     (su ID viene del paso 1).
 *
 * Si tu alta solo necesita un submit (sin write por paso), quitá el
 * branch `stage: "personal"` y llamá a `findOrCreateContact` desde
 * `finalize`. El hook `onStepAdvance` del orquestador es opcional.
 */

type PersonalBody = {
  stage: "personal";
  personal: AltaPersonal;
  campaign?: string | null;
};

type FinalizeBody = {
  stage: "finalize";
  contactId: string;
  amount: number;
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  dni?: string;
  alreadyDonor?: string;
  campaign?: string | null;
};

type AltaBody = PersonalBody | FinalizeBody;

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<AltaBody>(event);

    if (body.stage === "personal") {
      const p = body.personal;
      if (!p?.firstName || !p.lastName || !p.email) {
        setResponseStatus(event, 400);
        return {
          error: true,
          message: "Faltan datos personales obligatorios.",
        };
      }
      const { contactId } = await findOrCreateContact({ personal: p });
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

      // El DNI/CUIT lo escribe `createDonationChain` en el Contact (y en la
      // Opportunity si es única vez). "alreadyDonor" va al Contact porque
      // las altas mensuales no crean Opportunity.
      const contactExtra: Record<string, string> = {};
      if (body.alreadyDonor) {
        contactExtra["Observaciones_proceso_de_Ingreso__c"] =
          `¿Ya sos donante?: ${body.alreadyDonor}`;
      }

      const result = await createDonationChain({
        contactId: body.contactId,
        amount: body.amount,
        frequency: body.frequency,
        paymentMethodToken: body.paymentMethodToken,
        campaign: body.campaign ?? null,
        documentNumber: body.dni ?? null,
        extra: { contact: contactExtra },
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
        : "Error desconocido al procesar el alta.";
    setResponseStatus(event, 422);
    return { error: true, message };
  }
});
