import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const zoneMessage =
  "src/lib/operations is a framework-agnostic zone. Move UI dependencies to src/components or src/app.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/lib/operations/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: zoneMessage },
            { name: "react-dom", message: zoneMessage },
          ],
          patterns: [
            {
              group: ["next/*", "@radix-ui/*", "framer-motion"],
              message: zoneMessage,
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
