import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { webPrincipal } from "../../lib/web-auth.ts";

export function ownerSession(): AuthFn<Request> {
  return (request) => {
    const principal = webPrincipal(request);
    if (principal === null) return null;
    return {
      attributes: { owner: "true" },
      authenticator: "myeve-web-session",
      issuer: "myeve",
      principalId: principal.id,
      principalType: "user",
      subject: principal.id,
    };
  };
}

export const eveAuth = [
  // The browser session is the personal owner's primary route boundary.
  ownerSession(),
  // Lets the eve TUI and your Vercel deployments reach the deployed agent.
  vercelOidc(),
  // Open on localhost for `eve dev` and the REPL. Production requests arrive
  // on the deployment host and therefore do not match this strategy.
  localDev(),
] satisfies readonly AuthFn<Request>[];

export default eveChannel({
  auth: eveAuth,
});
