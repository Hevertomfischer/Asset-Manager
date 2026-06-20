---
name: Production CJS build crash
description: import.meta.url is undefined in esbuild CJS output, crashing the app before port opens
---

The rule: never use `import.meta.url` alone in files bundled to CJS by esbuild.

**Why:** esbuild warns and leaves `import.meta` as `undefined` in CJS output format. At runtime, `createRequire(import.meta.url)` throws `ERR_INVALID_ARG_VALUE: The argument 'filename' must be a file URL object...` — the app crashes before opening its port, causing all health checks to fail with 500.

**How to apply:** Use the conditional pattern wherever `createRequire` is needed:
```typescript
declare const __filename: string | undefined;
const _require = createRequire(
  typeof __filename !== "undefined" ? __filename : import.meta.url
);
```
In CJS builds, esbuild defines `__filename`; in dev (tsx/ESM), `import.meta.url` is valid. This pattern works in both modes.

Affected file: `artifacts/api-server/src/optimizers/ilpSolver.ts`
