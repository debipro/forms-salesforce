import { getFlowRecord } from "~/server/utils/salesforce";

export default defineEventHandler(async (event) => {
  const oppId = getRouterParam(event, "oppId");
  if (!oppId) {
    setResponseStatus(event, 400);
    return { error: true, message: "Falta el parámetro oppId" };
  }

  try {
    const record = await getFlowRecord(oppId);
    return { error: false, data: record };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al cargar los datos del flujo";
    const status = /not found|No se encontró la oportunidad/i.test(message)
      ? 404
      : 422;
    setResponseStatus(event, status);
    return { error: true, message };
  }
});
