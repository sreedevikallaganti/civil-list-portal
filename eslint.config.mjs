import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // PocketBase records are loosely typed throughout the app; `any` is a style issue here,
      // not a bug — shown as a warning so real errors stand out. Tighten as files get typed.
      "@typescript-eslint/no-explicit-any": "warn",
      // "reset the form when the panel opens" / "show a spinner while loading" patterns —
      // they work correctly; flagged for possible extra renders, so warn rather than fail.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
