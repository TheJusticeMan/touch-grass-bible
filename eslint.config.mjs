import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginSecurity from "eslint-plugin-security";
import css from "@eslint/css";
import localRules from "./eslint-local-rules.mjs";

export default [
  {
    files: ["dist/**/*.css"],
    plugins: { css, local: localRules },
    language: "css/css",
    languageOptions: {
      tolerant: true,
    },
    rules: {
      "local/bundle-css-vars": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    ...pluginJs.configs.recommended,
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["**/*.{js,mjs,cjs,ts}"],
  })),
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    ...pluginSecurity.configs.recommended,
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    plugins: { local: localRules },
    rules: {
      "local/no-van-state-mutation": "error",
      "local/fluent-methods-return-this": "error",
      "arrow-body-style": ["error", "as-needed"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "dot-notation": "error",
      "security/detect-object-injection": "off",
      "prefer-const": "error",
      "prefer-template": "error",
      "no-param-reassign": "error",
      "prefer-arrow-callback": "error",
      "object-shorthand": "error",
    },
  },
  {
    files: ["src/electron/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["packages/framework/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@platform", "@touch-grass-bible", "src/*", "../../*", "../../../*", "../../../../*"],
        },
      ],
    },
  },
];
