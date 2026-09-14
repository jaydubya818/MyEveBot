import { defineTool } from "eve/tools";
import { z } from "zod";
import { listRoutines } from "../lib/reminders-db.ts";

export default defineTool({ description: "List named recurring routines, including paused routines, next run, source result, and approval boundary.", inputSchema: z.object({}), execute: () => listRoutines() });
