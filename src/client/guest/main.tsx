import { render } from "preact";
import "../theme.css";
import "./guest.css";
import { Landing } from "./landing";
import { Shell } from "./shell";

const secret = /^\/j\/([^/]+)$/.exec(location.pathname)?.[1];
const photoId = document.querySelector<HTMLMetaElement>('meta[name="landing-photo"]')?.content ?? null;

render(secret ? <Landing secret={secret} photoId={photoId} /> : <Shell />, document.getElementById("app")!);
