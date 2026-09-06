import { z } from "zod";
export const healthSchema = z.object({ status: z.literal("ok") });
export { z };
export * from "./schemas.js";
export * from "./internship.js";
export * from "./leave.js";
export * from "./benefits.js";
