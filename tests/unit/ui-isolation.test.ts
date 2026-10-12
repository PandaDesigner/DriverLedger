import { expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const allowedImports = [
  "react",
  "react-native",
  "expo-router",
  "@expo/ui",
  "react-native-safe-area-context",
  "@preact/signals-react",
  "@preact/signals-react/runtime",
  "rxjs",
];
function sourcePaths(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcePaths(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
}
it("keeps every route and source module inside the approved demonstration boundary", () => {
  const uiRoot = join(import.meta.dir, "../../ui");
  for (const path of [
    ...sourcePaths(join(uiRoot, "app")),
    ...sourcePaths(join(uiRoot, "src")),
  ]) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(
      /\b(?:from|import)\s*['"]([^'"]+)['"]/g,
    )) {
      const imported = match[1];
      if (!imported) {
        throw new Error(`Missing import specifier in ${path}`);
      }
      expect(
        imported.startsWith(".") || allowedImports.includes(imported),
      ).toBe(true);
      expect(imported).not.toMatch(/(?:data|services)\//);
    }
    expect(source).not.toMatch(
      /\b(?:fetch|require|import)\s*\(|XMLHttpRequest|SecureStore|requestForegroundPermissionsAsync|\.env\b/,
    );
  }
});
