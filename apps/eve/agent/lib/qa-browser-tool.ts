import { defineTool, type ToolDefinition } from "eve/tools";

/** Give re-used extension tools a role-specific authored identity. */
export function qaBrowserTool<TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
  role: string,
): ToolDefinition<TInput, TOutput> {
  const wrapped: ToolDefinition<TInput, TOutput> = {
    description: `${role} QA browser action. ${definition.description}`,
    inputSchema: definition.inputSchema,
    execute(input, ctx) {
      return definition.execute(input, ctx);
    },
    ...(definition.outputSchema !== undefined ? { outputSchema: definition.outputSchema } : {}),
    ...(definition.approval !== undefined ? { approval: definition.approval } : {}),
    ...(definition.toModelOutput !== undefined ? { toModelOutput: definition.toModelOutput } : {}),
  };
  return defineTool(wrapped);
}
