import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginSecurity from "eslint-plugin-security";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginSecurity.configs.recommended,
  {
    rules: {
      "arrow-body-style": ["error", "as-needed"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "dot-notation": "error",
      "security/detect-object-injection": "off",
    },
  },
  {
    files: ["src/electron/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["src/external/**/*.ts"],
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
