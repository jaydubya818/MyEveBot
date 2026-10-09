import { businessScopes } from "@/lib/business-runtime";
import { businessApi } from "@/lib/business-api";
export const GET=businessApi({scopes:actor=>businessScopes(actor)});
export const POST=GET;
