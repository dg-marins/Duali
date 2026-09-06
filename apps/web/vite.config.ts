import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, "../../", "");
  const appOrigin = new URL(
    process.env.APP_ORIGIN ?? fileEnv.APP_ORIGIN ?? "http://localhost:5173",
  );
  const apiHost = process.env.API_HOST ?? fileEnv.API_HOST ?? "127.0.0.1";
  const apiPort = process.env.API_PORT ?? fileEnv.API_PORT ?? "3000";
  const target =
    process.env.API_PROXY_TARGET ?? `http://${apiHost}:${apiPort}`;

  return {
    envDir: "../../",
    plugins: [react(), tailwind()],
    server: {
      host: appOrigin.hostname,
      port: Number(appOrigin.port || (appOrigin.protocol === "https:" ? 443 : 80)),
      strictPort: true,
      proxy: { "/api": target, "/health": target },
    },
  };
});
