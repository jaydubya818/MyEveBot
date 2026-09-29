import { ActivationFixture, request } from "./fixture";
const [path, phase] = process.argv.slice(2);
const fixture = new ActivationFixture(path, reached => { if (reached === phase) process.kill(process.pid, "SIGKILL"); });
const batch = request();
await fixture.stage(batch); await fixture.validate(batch.id);
await fixture.activate(batch.id, (await fixture.preview(batch.id)).reviewDigest);
await fixture.rollback(batch.id); await fixture.close();
