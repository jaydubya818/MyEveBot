import { AppsHub } from "@/components/owner/product-hubs";
import { localAppsAllowed } from "@/lib/myapps/hosting";
export default function Page() {
  return <AppsHub installedAppsAvailable={localAppsAllowed()} />;
}
