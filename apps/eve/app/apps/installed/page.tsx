import Link from "next/link";
import { localAppsAllowed } from "../../../lib/myapps/hosting.ts";
export default function InstalledAppsPage() {
  if (!localAppsAllowed())
    return (
      <main>
        <h1>Installed Apps</h1>
        <p>App runtime integration is not enabled in this environment.</p>
        <Link href="/apps">Back to Apps</Link>
      </main>
    );
  return (
    <iframe
      title="Your installed Apps"
      src="/api/myapps/ui"
      style={{ width: "100%", height: "100vh", border: 0 }}
    />
  );
}
