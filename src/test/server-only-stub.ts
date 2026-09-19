/**
 * Test-only stub for the `server-only` package.
 *
 * The real package throws the moment it is imported outside a React Server
 * Component — that is exactly what makes it a useful guard in the app, and
 * exactly what makes server modules impossible to unit test. Vitest aliases
 * `server-only` to this empty module so the logic inside those modules can be
 * exercised.
 *
 * This does NOT weaken the guard: the real protection is Next's bundler, and
 * `src/lib/harvest/client.test.ts` statically asserts that every module able to
 * touch the API token still opens with `import "server-only"`.
 */
export {};
