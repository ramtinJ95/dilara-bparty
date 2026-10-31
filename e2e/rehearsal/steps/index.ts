import type { Step } from "../rehearsal.ts";
import { photoSteps } from "./photos.ts";
import { presenceSteps, settle } from "./presence.ts";
import { quizSteps } from "./quiz.ts";

// The run order. Add a feature's steps as their own file and list them before settle.
export const steps: Step[] = [...presenceSteps, ...photoSteps, ...quizSteps, settle];
