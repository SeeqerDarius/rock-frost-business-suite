// Test-only stand-in for the "server-only" package. Next.js resolves the real
// "server-only" import via its own bundler (it isn't an installed npm
// package — Next intercepts it to fail client bundles at build time), so
// Vitest has nothing to resolve without this alias. See vitest.config.ts.
export {};
