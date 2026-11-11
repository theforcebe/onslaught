import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const gateway = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : "";
  if (gateway && !gateway.startsWith("https://"))
    throw new Error("The production gateway must use HTTPS.");
  return {
    plugins: [
      react(),
      {
        name: "security-policy",
        transformIndexHtml: {
          order: "post",
          handler(html, ctx) {
            if (ctx.server) return html;
            const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://render.worldofwarcraft.com https://wow.zamimg.com https://thewowdb.com; connect-src 'self' https://thewowdb.com ${gateway}; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`;
            return html.replace(
              "<head>",
              `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`,
            );
          },
        },
      },
    ],
    base: "./",
    build: { target: "es2022" },
    server: { port: 5173, strictPort: true },
  };
});
