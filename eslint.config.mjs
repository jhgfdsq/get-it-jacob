// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "work/**",
    "dist-electron/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "electron/*-bin/**",
    "electron/assets/**",
    "public/pdf.worker.min.mjs",
  ]),
  {
    files: ["electron/**/*.js", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
