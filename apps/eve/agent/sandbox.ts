import { defineSandbox } from "eve/sandbox";
import { computerEnvironment } from "../lib/computer-sandbox-backend.ts";

export const environment = computerEnvironment;
// No provider calls during compilation; live creation requires Action authority.
export default defineSandbox(() => environment.open());
