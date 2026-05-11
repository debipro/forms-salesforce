import tailwindcss from "@tailwindcss/vite";

// Inline init script that sets `data-theme` on <html> before hydration so
// dark/light tokens render correctly on first paint (no flicker). Logic must
// stay in sync with `composables/useThemePreference.ts` and the
// `<ThemeSwitcher>` component.
const THEME_INIT_SCRIPT = `(function(){try{var k="forms-org-theme";var s=localStorage.getItem(k);var d=document.documentElement;if(s==="light"||s==="dark"){d.setAttribute("data-theme",s);return;}d.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}catch(e){}})();`;

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  devServer: {
    // Port 3001 keeps the dev server free of conflicts with `debipro/forms`,
    // which uses 3000 with a Salesforce OAuth callback registered for that
    // port. This template doesn't perform an OAuth callback, so any port is
    // fine in production; the value here is dev-only.
    port: 3001,
  },

  // The 5 environment variables the customer pastes in Vercel. Names are
  // intentionally framework-agnostic (no `NUXT_PUBLIC_*` prefix) so that
  // customers don't see Nuxt-specific naming. We wire them by hand here.
  runtimeConfig: {
    sfInstanceUrl: process.env.SF_INSTANCE_URL,
    sfRefreshToken: process.env.SF_REFRESH_TOKEN,
    sfLoginUrl: process.env.SF_LOGIN_URL,
    debiSecretKey: process.env.DEBI_SECRET_KEY,
    public: {
      debiPublicKey: process.env.DEBI_PUBLIC_KEY,
    },
  },

  css: ["~/assets/css/main.css"],

  vite: {
    plugins: [tailwindcss()],
  },

  app: {
    head: {
      htmlAttrs: { lang: "es-AR" },
      title: "Flujo Salesforce",
      meta: [
        {
          name: "description",
          content:
            "Autoservicio para donantes: actualizar método de pago y monto de la donación",
        },
      ],
      link: [
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap",
        },
      ],
      script: [
        // Theme-init must run before hydration to avoid a flash of wrong theme
        // on first paint. Placed in <head> so it executes synchronously before
        // <body> is rendered.
        {
          key: "theme-init",
          tagPosition: "head",
          innerHTML: THEME_INIT_SCRIPT,
        },
        // Debi tokenization SDK — exposes `window.Debi` for client-side use.
        {
          src: "https://js.debi.pro/v1/",
          defer: true,
        },
      ],
    },
  },
});
