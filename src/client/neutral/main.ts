import type { CodeResponse } from "../../shared/api";
import { postJson } from "../api";
import { hasSession, restoreSession } from "../session";

const form = document.querySelector<HTMLFormElement>("#code-form")!;
const input = form.querySelector<HTMLInputElement>("#code")!;
const button = form.querySelector<HTMLButtonElement>("button")!;
const error = form.querySelector<HTMLParagraphElement>("#error")!;

if (hasSession()) {
  form.hidden = true;
  if ((await restoreSession()) === "restored") location.replace("/app");
  else form.hidden = false;
}

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
