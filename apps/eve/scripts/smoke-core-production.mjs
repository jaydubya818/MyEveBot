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
if (!login.ok) throw new Error(`Core canary login failed (${login.status}).`);
const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
const loginBody = await login.json();
if (!cookie && loginBody.localDevelopment !== true) throw new Error("Core canary received no owner session cookie.");

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  return response.json();
}

const started = await fetch(`${baseUrl}/eve/v1/session`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie, origin },
  body: JSON.stringify({ message: "Reply with exactly MYEVE_CHAT_CANARY_OK and nothing else." }),
});
if (!started.ok) throw new Error(`Chat canary start failed (${started.status}).`);
const session = await started.json();
if (typeof session.sessionId !== "string") throw new Error("Chat canary received no session id.");

const stream = await fetch(`${baseUrl}/eve/v1/session/${encodeURIComponent(session.sessionId)}/stream`, {
  headers: { accept: "application/x-ndjson", cookie },
  signal: AbortSignal.timeout(120_000),
});
if (!stream.ok || !stream.body) throw new Error(`Chat canary stream failed (${stream.status}).`);
const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
let pending = "";
let finalText = "";
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
    if (event.type === "message.completed" && event.data?.finishReason === "stop" && typeof event.data.message === "string") {
      finalText = event.data.message.trim();
    }
    if (event.type === "turn.failed") throw new Error("Chat canary turn failed.");
    if (event.type === "turn.completed") complete = true;
  }
}
await reader.cancel();
if (finalText !== "MYEVE_CHAT_CANARY_OK") throw new Error(`Chat canary returned an unexpected reply: ${finalText || "(empty)"}`);

const [goals, results, routines, operations] = await Promise.all([
  getJson("/api/goals?limit=1"),
  getJson("/api/task-runs"),
  getJson("/api/automations"),
  getJson("/api/operations"),
]);
if (!Array.isArray(goals.goals)) throw new Error("Goals canary returned an invalid payload.");
if (!Array.isArray(results.tasks)) throw new Error("Results canary returned an invalid payload.");
if (!Array.isArray(routines.reminders) || !Array.isArray(routines.runs)) throw new Error("Routines canary returned an invalid payload.");
if (!Array.isArray(operations.signals)) throw new Error("Operations canary returned an invalid payload.");

console.log(JSON.stringify({ chat: "passed", goals: "passed", results: "passed", routines: "passed", operations: operations.overall }));
