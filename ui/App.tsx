// App.tsx is kept as a no-op root component for tooling compatibility
// (snapshot tests, dev tools that probe for "App"). Expo Router actually
// owns the rendered RootComponent via `index.ts` -> `expo-router/entry`,
// so returning `null` here is intentional and matches design.md AD-7
// (no navigation library calls yet — only the single placeholder route
// at app/index.tsx).
export default function App(): null {
  return null;
}
