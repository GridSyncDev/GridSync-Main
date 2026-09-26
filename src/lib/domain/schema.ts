import { z } from "zod";

// The one shared contract. Ingestion writes it, the engine and the UI read it.
// Change it only with the whole team in the loop (see docs/CONTRACT.md).

export const projectTypes = [
  "transmission_line_new",
  "transmission_line_upgrade", // rebuild, reconductor, uprate
  "substation_new",
  "substation_upgrade", // expansion, transformer/breaker work
  "generation_solar",
  "generation_storage",
  "generation_gas",
  "generation_other",
  "distribution",
  "other",
] as const;
export const projectTypeSchema = z.enum(projectTypes);
export type ProjectType = z.infer<typeof projectTypeSchema>;

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: lonLat }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(lonLat).min(2) }),
]);
export type Geometry = z.infer<typeof geometrySchema>;

// "YYYY-MM"
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

export const sourceSchema = z.object({
  url: z.url(),
  title: z.string(),
  publisher: z.string().optional(),
  retrieved: z.string().optional(), // YYYY-MM-DD
  quote: z.string().optional(), // the exact text a number came from
  page: z.number().int().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  utility: z.string(), // utility id, see utilitySchema
  name: z.string(),
  type: projectTypeSchema,
  voltageKv: z.number().positive().nullable(),
  capacityMw: z.number().positive().nullable().optional(),
  geometry: geometrySchema,
  // How much to trust the geometry: exact site, approximate (town/route sketch), or county centroid.
  locationPrecision: z.enum(["exact", "approximate", "county"]),
  // Construction window. When a filing only gives an in-service date, the window is
  // estimated from typical build times (see engine/durations.ts) and marked "estimated".
  construction: z.object({
    start: monthSchema,
    end: monthSchema,
    precision: z.enum(["published", "estimated"]),
  }),
  inService: monthSchema.nullable(),
  status: z.enum(["planned", "permitting", "approved", "under_construction"]),
  description: z.string(),
  county: z.string().optional(),
  state: z.string().length(2),
  sources: z.array(sourceSchema).min(1),
  // Optional overrides when the document names specific equipment/crews.
  resources: z.array(z.string()).optional(),
});
export type Project = z.infer<typeof projectSchema>;

export const utilitySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  kind: z.enum(["investor_owned", "municipal", "cooperative", "federal", "state", "independent"]),
  states: z.array(z.string().length(2)),
  color: z.string(),
});
export type Utility = z.infer<typeof utilitySchema>;

export const datasetSchema = z.object({
  utilities: z.array(utilitySchema),
  projects: z.array(projectSchema),
});
export type Dataset = z.infer<typeof datasetSchema>;
