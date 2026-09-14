import { withEve } from "eve/next";
import type { NextConfig } from "next";

const qaLocalOrigin =
  process.env.MYEVE_QA_LOCAL_ORIGIN?.trim() ?? process.env.SOFIE_QA_LOCAL_ORIGIN?.trim();
const nextConfig: NextConfig = {
  // Local browser automation reaches the dev server over the Mac's LAN IP.
  // Keep the extra origin opt-in so production never inherits a local address.
  allowedDevOrigins: ["127.0.0.1", ...(qaLocalOrigin ? [qaLocalOrigin] : [])],
};

// Mounts the eve agent (./agent) on this app's origin: one dev server, one
// Vercel deployment. /eve/v1/** routes to the agent service.
export default withEve(nextConfig);
