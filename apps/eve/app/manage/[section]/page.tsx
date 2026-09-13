import { Chat } from "../../chat";

// Stable section URLs render in the shared chat shell. ManagePanel validates
// the segment and owns list/detail navigation without remounting the sidebar.
export default function ManageSectionPage() {
  return <Chat initialView="manage" />;
}
