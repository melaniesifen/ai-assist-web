import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
    exclude: ["test/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/App.tsx", "src/main.tsx"]
    }
  }
});
