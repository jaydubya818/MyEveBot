import { gateway } from "ai";

import { apiError } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

export async function GET(request: Request) {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  try {
    const { models } = await gateway.getAvailableModels();
    const language = models
      .filter((model) => (model.modelType ?? "language") === "language")
      .map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description ?? null,
        pricing: model.pricing
          ? { input: model.pricing.input, output: model.pricing.output }
          : null,
      }));
    return Response.json({ models: language });
  } catch (error) {
    console.error("Model catalog failed", error);
    return apiError(request, 503, "model_catalog_unavailable", "The model catalog is unavailable.");
  }
}
