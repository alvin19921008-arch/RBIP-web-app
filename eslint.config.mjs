import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Tooling / scripts (not part of app runtime; keep lint focused on app code)
      "scripts/**",
      "supabase/**",
      "next.config.js",
      "postcss.config.js",
      "tailwind.config.ts",
      // Next 16+ proxy convention file
      "proxy.ts",
    ],
  },
  {
    rules: {
      // The codebase uses `any` intentionally in a number of places (large legacy surface area).
      // Keeping this as an error would make dependency upgrades noisy and block CI.
      "@typescript-eslint/no-explicit-any": "off",
      // We still have a few Node-style scripts/configs that use require().
      "@typescript-eslint/no-require-imports": "off",
      // Shadcn-style component prop interfaces sometimes intentionally extend
      // existing DOM props without adding anything (still useful for consistency).
      "@typescript-eslint/no-empty-object-type": "off",
      // Too opinionated for this codebase right now; causes many false positives.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler-specific warning; not required for correctness and too noisy during upgrade.
      "react-hooks/preserve-manual-memoization": "off",
      // Too strict for this codebase: flags legitimate patterns like passing refs via props.
      "react-hooks/refs": "off",
      // Style-only rules (avoid blocking upgrades on non-functional changes).
      "prefer-const": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
