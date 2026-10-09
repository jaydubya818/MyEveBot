import type { Metadata } from "next";
export const metadata: Metadata = { title: "Files — MyEve" };
import { redirect } from "next/navigation";
export default function FilesPage() { redirect("/workspace"); }
