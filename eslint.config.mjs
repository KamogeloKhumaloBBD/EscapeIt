import eslint from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import tseslint from "typescript-eslint";

const typeChecked = {
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/no-unsafe-argument": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/strict-boolean-expressions": [
      "error",
      { allowNullableBoolean: true },
    ],
    "no-console": ["error", { allow: ["warn", "error"] }],
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    ...typeChecked,
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...nextVitals],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-dom",
              importNames: ["useFormState"],
              message:
                "React 19 renamed useFormState to useActionState. Use useActionState from react and useFormStatus from react-dom.",
            },
          ],
          patterns: [
            {
              group: ["@context-layer/db", "@context-layer/db/*"],
              message: "The frontend must access data through the Express API.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/api/**/*.{ts,tsx}",
      "apps/mcp/**/*.{ts,tsx}",
      "packages/db/**/*.{ts,tsx}",
      "packages/integrations/**/*.{ts,tsx}",
      "packages/mcp-runtime/**/*.{ts,tsx}",
      "packages/security/**/*.{ts,tsx}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@context-layer/api*", "@context-layer/web*"],
              message: "The database package must not depend on applications.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // Command-line tooling, where printing to the terminal is the whole point.
    files: ["*.{js,mjs}", "scripts/**/*.{js,mjs,ts}", "apps/*/scripts/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
);
