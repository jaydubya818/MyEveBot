import { Chat } from "../chat";
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;
  return (
    <Chat
      initialPrompt={
        typeof params.prompt === "string"
          ? params.prompt.slice(0, 2000)
          : undefined
      }
    />
  );
}
