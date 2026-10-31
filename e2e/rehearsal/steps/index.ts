import type { Step } from "../rehearsal.ts";
import { presenceSteps, settle } from "./presence.ts";

// The run order. Add a feature's steps (quiz rounds, uploads, votes) as their own file and list them before settle.
export const steps: Step[] = [...presenceSteps, settle];
