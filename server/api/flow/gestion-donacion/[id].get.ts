import {
  FlowRequestError,
  getUpdateRecurringRecord,
  getConvertToRecurringRecord,
  getAbandonedCartRecord,
} from "~/server/utils/salesforce";

type GestionMode = "update-recurring" | "convert-to-recurring" | "abandoned-cart";

const VALID_MODES: GestionMode[] = [
  "update-recurring",
  "convert-to-recurring",
  "abandoned-cart",
];

/**
 * GET /api/flow/gestion-donacion/[id]?mode=<mode>
 *
 * Loads data based on the mode:
 *   - update-recurring: ID is a Recurring Donation ID
 *   - convert-to-recurring: ID is an Opportunity ID
 *   - abandoned-cart: ID is a TCPagos__Formulario_TC__c ID
 *
 * Returns the data needed to pre-fill the form and personalize the greeting.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    setResponseStatus(event, 400);
    return { error: true, message: "Falta el parámetro id" };
  }

  const query = getQuery(event);
  const mode = (query.mode as string) || "update-recurring";

  if (!VALID_MODES.includes(mode as GestionMode)) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: `El modo debe ser uno de: ${VALID_MODES.join(", ")}`,
    };
  }

  try {
    let data: unknown;

    switch (mode as GestionMode) {
      case "update-recurring":
        data = await getUpdateRecurringRecord(id);
        break;
      case "convert-to-recurring":
        data = await getConvertToRecurringRecord(id);
        break;
      case "abandoned-cart":
        data = await getAbandonedCartRecord(id);
        break;
    }

    return { error: false, mode, data };
  } catch (error) {
    if (error instanceof FlowRequestError) {
      setResponseStatus(event, error.status);
      return { error: true, message: error.message };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al cargar los datos";
    const status = /not found|No se encontró/i.test(message) ? 404 : 422;
    setResponseStatus(event, status);
    return { error: true, message };
  }
});
