import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Global rule adjustments
  {
    rules: {
      'testing-library/render-result-naming-convention': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  // Relax TypeScript rules for test files (flat config entry)
  {
    // Relax TypeScript rules for test and component files where many helpers
    // and quick prototypes rely on `any` and test shims.
    files: ['__tests__/**', 'components/**', 'app/**', 'src/**', 'src/components/ai-elements/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off',
      // Testing-library rule may not be available in this workspace; silence it
      'testing-library/render-result-naming-convention': 'off',
      // Tests often define anonymous components for brevity — allow it
      'react/display-name': 'off',
    },
  },
  {
    // Jest bootstrapping files run as CommonJS in Node and intentionally use require().
    files: ['jest.custom-environment.js', 'jest.env.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // project-specific ignores formerly in .eslintignore
    "coverage/**",
    "coverage/lcov-report/**",
    // Generated public assets that are linted during build but not authored here
    "public/docs-widget.js",
    "public/docs-widget-*.js",
    "public/widget.js",
    "public/sw.js",
    // Source for the generated embed scripts — plain browser JS, not TypeScript
    "src/embed/docs-widget.js",
    "src/embed/widget.js",
    // Plain Node.js CommonJS helper scripts (not TypeScript modules)
    "scripts/**",
  ]),
]);

export default eslintConfig;
