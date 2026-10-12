import Link from "next/link";
import { localAppsAllowed } from "../../../lib/myapps/hosting.ts";
import { InstalledAlphaTasks } from "../../../components/owner/installed-alpha-tasks";
export default function InstalledAppsPage() {
  if (!localAppsAllowed())
    return (
      <main>
        <h1>Installed Apps</h1>
        <p>App runtime integration is not enabled in this environment.</p>
        <Link href="/apps">Back to Apps</Link>
      </main>
    );
  return <InstalledAlphaTasks />;
}
