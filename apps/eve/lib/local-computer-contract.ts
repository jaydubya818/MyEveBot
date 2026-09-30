import { z } from "zod";

const path = z.string().min(1).max(4096);
export const localOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("roots") }).strict(),
  z.object({ operation: z.literal("list_files"), path }).strict(),
  z.object({ operation: z.literal("find_files"), path, name: z.string().min(1).max(100) }).strict(),
  z.object({ operation: z.literal("read_text"), path }).strict(),
  z.object({ operation: z.literal("shell"), command: z.string().min(1).max(20000) }).strict(),
  z.object({ operation: z.literal("write_text"), path, content: z.string().max(200000), expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable() }).strict(),
  z.object({ operation: z.literal("screenshot") }).strict(),
  z.object({ operation: z.literal("click"), x: z.number().int().min(0).max(20000), y: z.number().int().min(0).max(20000) }).strict(),
  z.object({ operation: z.literal("type"), text: z.string().min(1).max(10000) }).strict(),
  z.object({ operation: z.literal("key"), key: z.enum(["Return", "Tab", "Escape", "BackSpace", "Up", "Down", "Left", "Right", "Cmd+a", "Cmd+c", "Cmd+v", "Cmd+s", "Cmd+l", "Cmd+w"]) }).strict(),
  z.object({ operation: z.literal("scroll"), amount: z.number().int().min(-100).max(100) }).strict(),
]);
export type LocalOperation = z.infer<typeof localOperationSchema>;
export const localTaskSchema = z.union([
  localOperationSchema,
  z.object({ operation: z.literal("status"), job_id: z.string().uuid().optional() }).strict(),
]);
export type LocalTask = z.infer<typeof localTaskSchema>;
// Model providers require an object at the top level (not a union/anyOf).
// Runtime parsing below still enforces the exact fields for each operation.
export const localTaskInputSchema = z.object({
  operation: z.enum(["status","roots","list_files","find_files","read_text","shell","write_text","screenshot","click","type","key","scroll"]),
  path: path.optional(), name: z.string().optional(), command: z.string().optional(),
  content: z.string().optional(), expected_sha256: z.string().nullable().optional(),
  x: z.number().optional(), y: z.number().optional(), text: z.string().optional(),
  key: z.string().optional(), amount: z.number().optional(), job_id: z.string().optional(),
}).strict().superRefine((input,ctx)=>{
  const result=localTaskSchema.safeParse(input);
  if(!result.success)ctx.addIssue({code:"custom",message:result.error.message});
});
export function localReadOperation(input: LocalTask): boolean {
  return ["status", "roots", "list_files", "find_files", "read_text"].includes(input.operation);
}
export const localResultSchema = z.object({
  text: z.string().max(220000),
  // Images are private tool results, never Action receipts or application logs.
  image: z.string().max(3500000).optional(),
  isError: z.boolean().optional(),
}).strict();
export type LocalResult = z.infer<typeof localResultSchema>;
