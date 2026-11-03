import { render } from "preact";
import "../theme.css";
import "./guest.css";
import { pauseWhenHidden, Snow } from "../ice";
import { rememberSession, restoreSession } from "../session";
import { Landing } from "./landing";
import { Shell } from "./shell";

const secret = /^\/j\/([^/]+)$/.exec(location.pathname)?.[1];
const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
const photoId = meta("landing-photo");
const pid = meta("pid");

if (pid) rememberSession(pid);
if (secret && (await restoreSession())) location.replace("/app");
else {
  pauseWhenHidden();
  render(
    <>
      <Snow />
      {secret ? <Landing secret={secret} photoId={photoId} /> : <Shell />}
    </>,
    document.getElementById("app")!,
  );
}
