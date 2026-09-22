import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bundled Claude Code skill scripts — local tooling, not committed (see .gitignore),
    // and written as plain CommonJS .cjs so no-require-imports doesn't apply to them.
    ".claude/skills/**",
  ]),
  {
    // react-hooks/immutability assumes React's "never mutate a value a hook returned"
    // discipline, which is directly incompatible with react-three-fiber's core rendering
    // model: mutating a material/geometry/ref inside useFrame every frame (instead of
    // creating a new object 60 times a second) is the standard, documented way to write a
    // performant r3f scene, not an accident. Every file in this directory does this on
    // purpose. Scoped here rather than disabled globally so the rule still applies to
    // ordinary React state elsewhere in the app.
    files: ["components/twin/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
