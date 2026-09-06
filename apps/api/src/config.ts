import { config as dotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "@duali/shared";
dotenv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) =>
        ["postgresql:", "postgres:"].includes(new URL(v).protocol),
      ),
    APP_ORIGIN: z.string().url().default("http://localhost:5173"),
    SESSION_HOURS: z.coerce.number().positive().max(168).default(8),
  })
  .superRefine((value, ctx) => {
    const origin = new URL(value.APP_ORIGIN);
    if (origin.origin !== value.APP_ORIGIN)
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Use somente a origem, sem caminho ou barra final.",
      });
    if (value.NODE_ENV === "production" && origin.protocol !== "https:")
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Produção exige HTTPS.",
      });
  });
export function readConfig() {
  return configSchema.parse(process.env);
}
