import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import remotion from "@remotion/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Build Next.js recommended rules and an "off" map for overrides
const nextRecommended = nextPlugin.configs.recommended ?? { rules: {} };
const nextRecommendedRules = nextRecommended.rules ?? {};
const offNextRules = Object.fromEntries(
  Object.keys(nextRecommendedRules).map((k) => [k, "off"]),
);

export default [
  // Global ignores
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "next.config.js",
      "deploy.mjs",
      ".claude/**",
      ".remotion-bundle/**",
      "playwright-report/**",
      "test-results/**",
      "supabase/**",
    ],
  },
  // Base JS recommended
  js.configs.recommended,
  // TypeScript recommended (non type-checked for speed/simplicity)
  ...tseslint.configs.recommended,
  // Next.js recommended rules applied to app code
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextRecommendedRules,
    },
  },
  // Node 스크립트
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", fetch: "readonly" } },
  },
  // React hooks 규칙 (rules-of-hooks, exhaustive-deps)
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Remotion rules applied only to remotion files
  {
    files: ["src/remotion/**"],
    ...remotion.flatPlugin,
    rules: {
      ...remotion.flatPlugin.rules,
    },
  },
  // Disable all Next.js rules within remotion files
  {
    files: ["src/remotion/**"],
    rules: {
      ...offNextRules,
    },
  },
];
