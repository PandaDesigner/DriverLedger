const expoPreset = require("../ui/node_modules/eslint-config-expo/flat");
module.exports = [
  ...expoPreset,
  {
    files: ["unit/ui-*.test.ts", "integration/ui-demo-flows.test.ts"],
    rules: { "import/no-unresolved": ["error", { ignore: ["^bun:test$"] }] },
  },
  { ignores: ["eslint.config.cjs"] },
];
