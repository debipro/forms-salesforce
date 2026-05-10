import {
  FlowRequestError,
  submitFlow,
  type FlowRecord,
} from "~/server/utils/salesforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

export default defineEventHandler(async (event) => {
  const oppId = getRouterParam(event, "oppId");
  if (!oppId) {
    setResponseStatus(event, 400);
    return { error: true, message: "Falta el parámetro oppId" };
  }

  try {
    const body = await readBody<{
      amount?: number;
      paymentMethodToken?: DebiPaymentToken;
      record?: FlowRecord;
    }>(event);

    if (
      typeof body.amount !== "number" ||
      Number.isNaN(body.amount) ||
      body.amount <= 0
    ) {
      setResponseStatus(event, 400);
      return { error: true, message: "El monto tiene que ser un número positivo" };
    }

    const token = body.paymentMethodToken;
    if (token !== undefined && token !== null && (!token.id || !token.type)) {
      setResponseStatus(event, 400);
      return { error: true, message: "El token de método de pago no es válido" };
    }

    const data = await submitFlow({
      oppId,
      amount: body.amount,
      paymentMethodToken: token?.id && token?.type ? token : undefined,
      record: body.record,
    });

    return { error: false, data };
  } catch (error) {
    if (error instanceof FlowRequestError) {
      setResponseStatus(event, error.status);
      return { error: true, message: error.message };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al procesar la actualización del flujo";
    setResponseStatus(event, 422);
    return { error: true, message };
  }
});
