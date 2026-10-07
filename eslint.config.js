// ESLint for the site's own scripts, under Matinee's coding standards: no nested ternaries, a cyclomatic limit
// of 10, and nodes built with textContent, never innerHTML. The copy of Matinee's page under static/ is
// Matinee's own and linted there.
import js from "@eslint/js";
import globals from "globals";

const rules = {
  "no-nested-ternary": "error",
  complexity: ["error", 10],
  "no-var": "error",
  "prefer-const": "error",
  eqeqeq: "error",
  "no-restricted-properties": [
    "error",
    { property: "innerHTML", message: "Build nodes with textContent; never assign innerHTML." },
    { property: "outerHTML", message: "Build nodes with textContent; never assign outerHTML." },
  ],
};

export default [
  js.configs.recommended,
  {
    files: ["site/**/*.js", "static/js/api.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.browser },
    rules,
  },
  {
    files: ["tests/**/*.mjs", "tools/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules,
  },
];
