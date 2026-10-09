import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Channels consolidates provider state without weakening provider boundaries", async () => {
  const [statusRoute, searchRoute, workspace, emailInbound, imessage, slack] = await Promise.all([
    readFile(new URL("app/api/channels/route.ts", root), "utf8"),
    readFile(new URL("app/api/channels/search/route.ts", root), "utf8"),
    readFile(new URL("components/channels-workspace.tsx", root), "utf8"),
    readFile(new URL("agent/lib/email-inbound.ts", root), "utf8"),
    readFile(new URL("agent/channels/imessage.ts", root), "utf8"),
    readFile(new URL("agent/channels/slack.ts", root), "utf8"),
  ]);

  assert.match(statusRoute, /requireWebAuth/);
  assert.match(statusRoute, /Promise\.all/);
  assert.match(searchRoute, /requireIMessageTranscriptAdmin/);
  assert.match(searchRoute, /Slack history stays in Slack/);
  assert.match(workspace, /Search results are not retained in a second index/);
  assert.match(workspace, /Data controls/);

  assert.match(emailInbound, /claimInboundMessage/);
  assert.match(emailInbound, /releaseInboundClaim/);
  assert.match(imessage, /verifyV0Signature/);
  assert.match(imessage, /claimIMessageInbound/);
  assert.match(slack, /connectSlackCredentials/);
});
