/**
 * Static lists for Argentine flows. Extracted from the ~12 `pages/form/*.vue`
 * files in `debi-forms` that duplicated them verbatim. Centralizing here
 * keeps the per-flow files focused on flow logic, not data plumbing.
 */

export type Option = { label: string; value: string | null };

export const PROVINCES: Option[] = [
  { label: "Buenos Aires", value: "Buenos Aires" },
  { label: "CABA (Ciudad Autónoma de Buenos Aires)", value: "CABA" },
  { label: "Catamarca", value: "Catamarca" },
  { label: "Chaco", value: "Chaco" },
  { label: "Chubut", value: "Chubut" },
  { label: "Córdoba", value: "Córdoba" },
  { label: "Corrientes", value: "Corrientes" },
  { label: "Entre Ríos", value: "Entre Ríos" },
  { label: "Formosa", value: "Formosa" },
  { label: "Jujuy", value: "Jujuy" },
  { label: "La Pampa", value: "La Pampa" },
  { label: "La Rioja", value: "La Rioja" },
  { label: "Mendoza", value: "Mendoza" },
  { label: "Misiones", value: "Misiones" },
  { label: "Neuquén", value: "Neuquén" },
  { label: "Río Negro", value: "Río Negro" },
  { label: "Salta", value: "Salta" },
  { label: "San Juan", value: "San Juan" },
  { label: "San Luis", value: "San Luis" },
  { label: "Santa Cruz", value: "Santa Cruz" },
  { label: "Santa Fe", value: "Santa Fe" },
  { label: "Santiago del Estero", value: "Santiago del Estero" },
  { label: "Tierra del Fuego", value: "Tierra del Fuego" },
  { label: "Tucumán", value: "Tucumán" },
  { label: "Otro", value: null },
];

export const COUNTRIES: Option[] = [
  { label: "Argentina", value: "Argentina" },
  { label: "Bolivia", value: "Bolivia" },
  { label: "Brasil", value: "Brasil" },
  { label: "Chile", value: "Chile" },
  { label: "Colombia", value: "Colombia" },
  { label: "Costa Rica", value: "Costa Rica" },
  { label: "Ecuador", value: "Ecuador" },
  { label: "El Salvador", value: "El Salvador" },
  { label: "Estados Unidos", value: "Estados Unidos" },
  { label: "Europa", value: "Europa" },
  { label: "Guatemala", value: "Guatemala" },
  { label: "Haití", value: "Haití" },
  { label: "Honduras", value: "Honduras" },
  { label: "México", value: "México" },
  { label: "Nicaragua", value: "Nicaragua" },
  { label: "OI", value: "OI" },
  { label: "Panamá", value: "Panamá" },
  { label: "Paraguay", value: "Paraguay" },
  { label: "Perú", value: "Perú" },
  { label: "Puerto Rico", value: "Puerto Rico" },
  { label: "República Dominicana", value: "República Dominicana" },
  { label: "Uruguay", value: "Uruguay" },
  { label: "Venezuela", value: "Venezuela" },
  { label: "Otro", value: null },
];
