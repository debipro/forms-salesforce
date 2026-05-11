/**
 * Onboarding check: reports which of the 5 mandatory env vars are set.
 *
 * Returns **booleans only**, never values. Safe to call from the public
 * landing page (`pages/index.vue`) without leaking secrets. The endpoint
 * exists so a customer can refresh the deploy and immediately see
 * whether they completed the Vercel config without having to submit a
 * form and read the error.
 *
 * If you don't want this endpoint exposed at all (e.g. you've taken the
 * onboarding out of the landing), delete this file — `pages/index.vue`
 * already degrades gracefully when the fetch fails.
 */
export default defineEventHandler(() => {
  const config = useRuntimeConfig();
  const items = [
    {
      key: "SF_INSTANCE_URL",
      set: !!config.sfInstanceUrl,
      source: "asistente Debi",
      help: "Pedile a Debi la URL del asistente de onboarding (hoy https://forms.tc-cloud-partners.net/connect — si no responde mirá debi.pro/docs). Te logueás con Salesforce y la pantalla final te muestra las 3 variables SF_*.",
    },
    {
      key: "SF_REFRESH_TOKEN",
      set: !!config.sfRefreshToken,
      source: "asistente Debi",
      help: "Mismo asistente que SF_INSTANCE_URL — los 3 valores salen de la misma pantalla.",
    },
    {
      key: "SF_LOGIN_URL",
      set: !!config.sfLoginUrl,
      source: "asistente Debi",
      help: "https://login.salesforce.com para producción, https://test.salesforce.com para sandbox. El asistente te muestra cuál corresponde.",
    },
    {
      key: "DEBI_PUBLIC_KEY",
      set: !!config.public.debiPublicKey,
      source: "dashboard Debi",
      help: "Andá a https://debi.pro/dashboard/developers y copiá el valor que empieza con pk_live_* (o pk_test_* mientras probás).",
    },
    {
      key: "DEBI_SECRET_KEY",
      set: !!config.debiSecretKey,
      source: "dashboard Debi",
      help: "Andá a https://debi.pro/dashboard/developers y copiá el valor que empieza con sk_live_*. Nunca la pongas en el front ni en logs.",
    },
  ];

  const missing = items.filter((i) => !i.set).map((i) => i.key);
  return {
    allOk: missing.length === 0,
    missing,
    items,
  };
});
