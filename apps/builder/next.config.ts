import path from "node:path";

import type { NextConfig } from "next";

// The deploy and update APIs assemble the agent deployment from apps/eve
// source at runtime (and /api/template-version hashes it), so those files
// must ship inside each route's serverless function bundle. The excludes
// matter: without them tracing would drag apps/eve's node_modules, build
// output, and — critically — .env.local (real secrets) into the builder's
// deployment.
const TEMPLATE_ROUTES = ["/api/deploy", "/api/update", "/api/template-version"] as const;

// Keep this as an allowlist instead of tracing the whole sibling workspace.
// Eve's local runtime creates linked dependency trees under `.eve/`; Turbopack
// can attempt to hash those directory links as files before excludes apply.
const templateIncludes = [
  "../eve/.eve-template-release",
  "../eve/agent/**",
  "../eve/app/**",
  "../eve/components/**",
  "../eve/components.json",
  "../eve/lib/**",
  "../eve/migrations/**",
  "../eve/next-env.d.ts",
  "../eve/next.config.ts",
  "../eve/package.json",
  "../eve/postcss.config.mjs",
  "../eve/proxy.ts",
  "../eve/public/**",
  "../eve/skills-lock.json",
  "../eve/test/**",
  "../eve/tsconfig.json",
  "../eve/vercel.json",
];
const templateExcludes = [
  "../eve/node_modules/**",
  "../eve/.next/**",
  "../eve/.env*",
  "../eve/.eve/**",
  "../eve/.turbo/**",
  "../eve/.output/**",
  "../eve/.vercel/**",
  "../eve/*.tsbuildinfo",
];

const nextConfig: NextConfig = {
  // Instant Navigations (Next 16.3): dynamic data must stream inside a
  // Suspense boundary or be wrapped in `use cache`, and links prefetch one
  // reusable shell per route instead of one payload per link.
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: Object.fromEntries(
    TEMPLATE_ROUTES.map((route) => [route, templateIncludes]),
  ),
  outputFileTracingExcludes: Object.fromEntries(
    TEMPLATE_ROUTES.map((route) => [route, templateExcludes]),
  ),
};

export default nextConfig;
