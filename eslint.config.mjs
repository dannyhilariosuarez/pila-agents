import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "tests/load/**", ".claude/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "eqeqeq": ["error", "always"],
      "no-throw-literal": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["packages/cli/**/*.ts", "agents/**/register.ts", "scripts/**/*.ts", "apps/agent/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
