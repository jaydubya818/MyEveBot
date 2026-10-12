import path from "node:path";

import { prepareTemplateTrace, templateTraceExcludes, traceLiteral } from "./lib/template-build";
import { STANDALONE_SOURCE_INPUTS } from "./lib/shared-myapps";

import type { NextConfig } from "next";

// The deploy and update APIs assemble the agent deployment from apps/eve
// source at runtime (and /api/template-version hashes it), so those files
// must ship inside each route's serverless function bundle. The excludes
// matter: without them tracing would drag apps/eve's node_modules, build
// output, and — critically — .env.local (real secrets) into the builder's
// deployment.
const TEMPLATE_ROUTES = ["/api/deploy", "/api/update", "/api/template-version"] as const;

const templateExcludes = [
  "../eve/node_modules/**",
  "../eve/.next/**",
  "../eve/.env*",
  "../eve/**/.env*",
  "../eve/**/output/**",
  "../eve/**/.local-computer/**",
  "../eve/.eve/**",
  "../eve/.turbo/**",
  "../eve/.output/**",
  "../eve/.vercel/**",
  "../eve/*.tsbuildinfo",
];

export default async function nextConfig(): Promise<NextConfig> {
  const files = await prepareTemplateTrace(path.join(import.meta.dirname, "../eve"));
  const excludes = [...templateExcludes, ...await templateTraceExcludes(path.join(import.meta.dirname, "../eve"), files)];
  const templateIncludes = [
    ...files.map(file => `../eve/${traceLiteral(file)}`),
    ...STANDALONE_SOURCE_INPUTS.map(file => `../../${file}`),
  ];
  return {
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
    TEMPLATE_ROUTES.map((route) => [route, excludes]),
  ),
  };
}
