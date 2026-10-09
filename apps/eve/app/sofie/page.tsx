"use client";

import { ownerSessionStorage } from "@/lib/owner-browser-storage";

import { useEffect, useState } from "react";
import { Chat } from "../chat";
export default function SofiePage() {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { try { setDraft(ownerSessionStorage.getItem("myeve-owner-conversation-draft") ?? ""); } catch { setDraft(""); } }, []);
  if (draft === null) return <main><p role="status">Preparing your conversation…</p></main>;
  return <Chat initialPrompt={draft || undefined} />;
}
