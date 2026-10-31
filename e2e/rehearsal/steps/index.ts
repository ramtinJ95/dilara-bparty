import type { Step } from "../rehearsal.ts";
import { photoSteps } from "./photos.ts";
import { presenceSteps, settle } from "./presence.ts";

// The run order. Add a feature's steps (quiz rounds next) as their own file and list them before settle.
export const steps: Step[] = [...presenceSteps, ...photoSteps, settle];
