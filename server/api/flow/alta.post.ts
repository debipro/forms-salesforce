import {
  FlowRequestError,
  createDonationChain,
  findOrCreateContact,
  type AltaPersonal,
} from "~/server/utils/salesforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Server endpoint for the "alta" flow.
 *
 * Accepts two stages:
 *
 *   `stage: "personal"` (after step 1)
 *     Creates or matches a Contact by email. Returns `{ contactId }`.
 *     This is the anti-cart-abandonment write — even if the donor never
 *     reaches the payment step, the org keeps the Contact record.
 *
 *   `stage: "finalize"` (after step 2 / final submit)
 *     Tokenizes the payment method (already done client-side), then
 *     creates the donation chain: Payment Method → optional Recurring
 *     Donation → Opportunity. The Contact must already exist (its ID is
 *     echoed back from step 1).
 *
 * If your alta only needs a single submit (no per-step write), drop the
 * `stage: "personal"` branch and call `findOrCreateContact` from inside
 * `finalize`. The orchestrator's `onStepAdvance` hook is optional.
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
      const { contactId } = await findOrCreateContact({
        personal: p,
        extra: body.campaign
          ? { TCPagos__Campa_a__c: body.campaign } as Record<string, string>
          : undefined,
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

      // Techo-specific extras: write DNI + "alreadyDonor" to the
      // Opportunity. If you want them on the Contact instead, move them
      // to `extra.contact` and adjust `findOrCreateContact` to update an
      // existing Contact when it matches.
      const oppExtra: Record<string, string | number | null> = {};
      if (body.dni) {
        oppExtra["TCPagos__N_mero_de_identificaci_n__c"] = body.dni;
      }
      if (body.alreadyDonor) {
        oppExtra["Observaciones__c"] = `¿Ya sos donante?: ${body.alreadyDonor}`;
      }

      const result = await createDonationChain({
        contactId: body.contactId,
        amount: body.amount,
        frequency: body.frequency,
        paymentMethodToken: body.paymentMethodToken,
        campaign: body.campaign ?? null,
        extra: { opportunity: oppExtra },
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
