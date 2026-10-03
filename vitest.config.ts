import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["inject/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
  },
});
