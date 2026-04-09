// eslint.config.cjs
const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const globals = require("globals");

module.exports = defineConfig([
  // 默认规则，所有 JS 文件
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: { js },
    extends: ["js/recommended"],
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "semi": ["error", "always"],
      "quotes": ["error", "double"],
      "eqeqeq": ["error", "always"],
      "comma-dangle": ["error", "never"],
      "max-len": ["warn", { code: 120 }],
      "curly": "off",
    },
  },

  // 仅针对 account.js
  {
    files: ["public/js/recipes.js"],
    rules: {
      "no-useless-assignment": "off", // 关闭未使用变量报错
    },
  },
]);