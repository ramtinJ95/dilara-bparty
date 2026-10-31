import type { CodeResponse } from "../../shared/api";
import { postJson } from "../api";

const form = document.querySelector<HTMLFormElement>("#code-form")!;
const input = form.querySelector<HTMLInputElement>("#code")!;
const button = form.querySelector<HTMLButtonElement>("button")!;
const error = form.querySelector<HTMLParagraphElement>("#error")!;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  error.textContent = "";
  const res = await postJson<CodeResponse>("/api/code", { code: input.value });
  if (res.ok) return location.assign(res.data.path);
  button.disabled = false;
  error.textContent = res.error;
  input.select();
});
