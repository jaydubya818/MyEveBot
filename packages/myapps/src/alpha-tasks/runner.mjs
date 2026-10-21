// Runs ONLY inside the isolated container. Never import this module in the trusted host.
import { readFileSync, writeFileSync } from "node:fs";
const input = JSON.parse(readFileSync("/harness/input.json", "utf8"));
writeFileSync("/data/tasks.json", JSON.stringify(input.data));
const { createStore } = await import("file:///candidate/src/tasks.js");
const store = createStore("/data/tasks.json");
let output;
if (input.operation === "list") output = store.list();
else if (input.operation === "create") output = store.create(input.input);
else if (input.operation === "update")
  output = store.update(input.input.id, input.input.patch);
else if (input.operation === "render") {
  const { renderTaskList } = await import("file:///candidate/src/render.js");
  output = renderTaskList(store.list());
} else throw Error("DENIED");
process.stdout.write(
  JSON.stringify({
    output,
    data: JSON.parse(readFileSync("/data/tasks.json", "utf8")),
  }),
);
