import { z } from "zod";
import { projectTypeSchema } from "../domain/schema";

// Model output is deliberately not a Project. Missing facts remain null, and
// construction dates remain the source's raw expressions until human review.
const fact = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), quote: z.string().nullable() });

export const draftSchema = z.object({
  name: fact(z.string()),
  type: fact(projectTypeSchema),
  voltageKv: fact(z.number()),
  capacityMw: fact(z.number()),
  status: fact(z.enum(["planned", "permitting", "approved", "under_construction"])),
  description: fact(z.string()),
  county: fact(z.string()),
  state: fact(z.string()),
  constructionStart: fact(z.string()),
  constructionEnd: fact(z.string()),
  inService: fact(z.string()),
  locationDescription: fact(z.string()),
  coordinates: fact(z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  })),
  equipment: z.array(fact(z.string())),
});

export type Draft = z.infer<typeof draftSchema>;
export type DraftKey = Exclude<keyof Draft, "equipment">;
export const draftKeys: DraftKey[] = [
  "name", "type", "voltageKv", "capacityMw", "status", "description",
  "county", "state", "constructionStart", "constructionEnd", "inService",
  "locationDescription", "coordinates",
];

export const sourceInputSchema = z.object({
  utility: z.string().min(1),
  url: z.url(),
  title: z.string().trim().min(1),
  publisher: z.string().trim().min(1),
  text: z.string().trim().min(20).max(30_000),
});

export type SourceInput = z.infer<typeof sourceInputSchema>;
