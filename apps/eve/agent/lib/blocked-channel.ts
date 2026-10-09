import { defineChannel, POST } from "eve/channels";

/** No provider factory or event handler is reachable through this registration. */
export function blockedChannel(path: string) {
  return defineChannel({
    routes: [POST(path, async () => Response.json({
      error: "channel_write_blocked",
      message: "This channel is unavailable while send authorization is being qualified. Use MyEve chat.",
    }, {status: 503}))],
    events: {},
  });
}
