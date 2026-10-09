const baseUrl = process.env.MYEVE_SMOKE_BASE_URL?.replace(/\/$/, "");
const password = process.env.MYEVE_SMOKE_PASSWORD;
if (!baseUrl) {
  console.error("Set MYEVE_SMOKE_BASE_URL. Production also requires MYEVE_SMOKE_PASSWORD.");
  process.exit(2);
}

const origin = new URL(baseUrl).origin;
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ password: password ?? "" }),
});
if (!login.ok) throw new Error(`Browser smoke login failed (${login.status}).`);
const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
const loginBody = await login.json();
if (!cookie && loginBody.localDevelopment !== true) {
  throw new Error("Browser smoke login returned no owner session cookie.");
}

const started = await fetch(`${baseUrl}/eve/v1/session`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie, origin },
  body: JSON.stringify({
    message: [
      "Use your ephemeral rendered browser to open https://example.com.",
      "Read the page title and main sentence, cite the exact URL, stop the Computer session,",
      "then answer concisely. Do not use web_fetch or web_search for this check.",
    ].join(" "),
  }),
});
if (!started.ok) throw new Error(`Browser smoke session failed (${started.status}).`);
const session = await started.json();
if (typeof session.sessionId !== "string") throw new Error("Browser smoke received no session id.");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 180_000);
const tools = new Set();
let finalText = "";
try {
  const stream = await fetch(`${baseUrl}/eve/v1/session/${encodeURIComponent(session.sessionId)}/stream`, {
    headers: { accept: "application/x-ndjson", cookie },
    signal: controller.signal,
  });
  if (!stream.ok || !stream.body) throw new Error(`Browser smoke stream failed (${stream.status}).`);
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let complete = false;
  while (!complete) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      const serialized = JSON.stringify(event);
      for (const match of serialized.matchAll(/"toolName":"([^"]+)"/g)) tools.add(match[1]);
      if (event.type === "message.completed") {
        const candidate = event.data?.message ?? event.data?.content ?? event.data?.text;
        if (typeof candidate === "string") finalText = candidate;
        else if (Array.isArray(candidate)) {
          finalText = candidate.map((part) => typeof part?.text === "string" ? part.text : "").join("");
        } else if (candidate && typeof candidate === "object") {
          const content = candidate.content;
          if (typeof content === "string") finalText = content;
          else if (Array.isArray(content)) {
            finalText = content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
          }
        }
      }
      if (event.type === "turn.completed" || event.type === "turn.failed") complete = true;
      if (event.type === "turn.failed") throw new Error("Browser smoke turn failed.");
    }
  }
  await reader.cancel();
} finally {
  clearTimeout(timeout);
}

const observedTools = [...tools].sort().join(", ") || "none";
if (!tools.has("browser__navigate")) throw new Error(`Sofie did not navigate with the rendered browser. Observed: ${observedTools}`);
if (!["browser__read", "browser__snapshot"].some((name) => tools.has(name))) {
  throw new Error(`Sofie did not read the rendered page. Observed: ${observedTools}`);
}
if (!tools.has("stop_computer_session")) throw new Error(`Sofie did not stop the Computer session. Observed: ${observedTools}`);
if (!/https:\/\/example\.com\/?/i.test(finalText)) throw new Error("Final answer did not cite the exact URL.");
console.log("production browser smoke passed");
