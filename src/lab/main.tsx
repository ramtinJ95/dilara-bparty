import { render, type ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DIRECTIONS, directionById, type DirectionMeta } from "./directions";
import { LAB_MARKER } from "./fixture";
import "./lab.css";
import { LOADERS } from "./registry";
import { SCREENS, type ScreenId } from "./types";

type Route =
  | { kind: "index" }
  | { kind: "view"; meta: DirectionMeta; screen: ScreenId | null }
  | { kind: "frame"; meta: DirectionMeta; screen: ScreenId }
  | { kind: "missing" };

type LabMessage = { lab: "replay" } | { lab: "key"; key: string };

const screenById = (id: string | undefined) => SCREENS.find((s) => s.id === id)?.id;

function parse({ pathname, search }: { pathname: string; search: string }): Route {
  const [id, screenPart, ...rest] = pathname.replace(/^\/lab\/?/, "").split("/").filter(Boolean);
  if (!id) return { kind: "index" };
  const meta = directionById(id);
  const screen = screenById(screenPart);
  if (!meta || rest.length > 0 || (screenPart && !screen)) return { kind: "missing" };
  if (screen && new URLSearchParams(search).has("frame")) return { kind: "frame", meta, screen };
  return { kind: "view", meta, screen: screen ?? null };
}

const pathOf = (meta: DirectionMeta, screen: ScreenId | null) => `/lab/${meta.id}${screen ? `/${screen}` : ""}`;

const step = <T,>(list: readonly T[], item: T, by: number) => list[(list.indexOf(item) + by + list.length) % list.length]!;

const post = (target: Window, msg: LabMessage) => target.postMessage(msg, location.origin);

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function useViewport() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  return size;
}

const PHONE = { w: 390, h: 844 };
const GAP = 20;
const BAR = 96;

function replayAll() {
  for (const frame of document.querySelectorAll("iframe")) if (frame.contentWindow) post(frame.contentWindow, { lab: "replay" });
}

function Switcher({ meta, screen, narrow, go }: { meta: DirectionMeta | null; screen: ScreenId | null; narrow: boolean; go: (path: string) => void }) {
  const n = meta ? DIRECTIONS.indexOf(meta) + 1 : 0;
  const move = (by: number) => go(pathOf(meta ? step(DIRECTIONS, meta, by) : DIRECTIONS[0], screen));
  return (
    <header class="lab-bar">
      <a class="lab-home" href="/lab/" onClick={(e) => (e.preventDefault(), go("/lab/"))} aria-label="All directions">
        ❄
      </a>
      <button type="button" class="lab-arrow" onClick={() => move(-1)} aria-label="Previous direction" title="Previous direction (←)">
        ‹
      </button>
      <label class="lab-pick">
        {!narrow && <span class="lab-n">{meta ? `${n}/${DIRECTIONS.length}` : "–"}</span>}
        <select aria-label="Direction" value={meta?.id ?? ""} onChange={(e) => go(pathOf(directionById(e.currentTarget.value)!, screen))}>
          {!meta && <option value="">Choose a direction</option>}
          {DIRECTIONS.map((d, i) => (
            <option key={d.id} value={d.id}>
              {i + 1}. {d.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" class="lab-arrow" onClick={() => move(1)} aria-label="Next direction" title="Next direction (→)">
        ›
      </button>
      {meta && !narrow && (
        <nav class="lab-screens" aria-label="Screens">
          <button type="button" aria-pressed={screen === null} onClick={() => go(pathOf(meta, null))} title="All five (0)">
            All five
          </button>
          {SCREENS.map((s, i) => (
            <button key={s.id} type="button" aria-pressed={screen === s.id} onClick={() => go(pathOf(meta, s.id))} title={`${s.title} (${i + 1})`}>
              {i + 1}. {s.title}
            </button>
          ))}
        </nav>
      )}
      {meta && (
        <button type="button" class="lab-replay" onClick={replayAll} aria-label="Replay" title="Replay the animations (R)">
          {narrow ? "↻" : "↻ Replay"}
        </button>
      )}
      {meta && !narrow && <p class="lab-idea">{meta.idea}</p>}
    </header>
  );
}

const frameSrc = (meta: DirectionMeta, screen: ScreenId) => `/lab/${meta.id}/${screen}?frame`;

function AllFive({ meta, go }: { meta: DirectionMeta; go: (path: string) => void }) {
  const { w, h } = useViewport();
  const width = SCREENS.length * PHONE.w + (SCREENS.length - 1) * GAP;
  const scale = Math.min(1, (w - 48) / width, (h - BAR - 72) / PHONE.h);
  return (
    <main class="lab-stage" style={{ "--scale": scale }}>
      <div class="lab-frames" style={{ width: `${width * scale}px` }}>
        {SCREENS.map((s) => (
          <figure key={s.id} style={{ width: `${PHONE.w * scale}px` }}>
            <div class="lab-phone-box" style={{ height: `${PHONE.h * scale}px` }}>
              <iframe src={frameSrc(meta, s.id)} title={`${meta.name}: ${s.title}`} width={PHONE.w} height={PHONE.h} />
            </div>
            <figcaption>
              <button type="button" onClick={() => go(pathOf(meta, s.id))}>
                {s.title} ↗
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}

function OneScreen({ meta, screen, narrow, go }: { meta: DirectionMeta; screen: ScreenId; narrow: boolean; go: (path: string) => void }) {
  const { h } = useViewport();
  const i = SCREENS.findIndex((s) => s.id === screen);
  const move = (by: number) => go(pathOf(meta, step(SCREENS, SCREENS[i]!, by).id));
  const title = `${meta.name}: ${SCREENS[i]!.title}`;
  if (narrow)
    return (
      <main class="lab-narrow">
        <iframe src={frameSrc(meta, screen)} title={title} />
        <nav class="lab-steps" aria-label="Screens">
          <button type="button" onClick={() => move(-1)} aria-label="Previous screen">
            ‹
          </button>
          <span>
            <strong>{SCREENS[i]!.title}</strong>
            <span class="lab-dots" aria-hidden="true">
              {SCREENS.map((s) => (
                <i key={s.id} class={s.id === screen ? "on" : ""} />
              ))}
            </span>
          </span>
          <button type="button" onClick={() => move(1)} aria-label="Next screen">
            ›
          </button>
        </nav>
      </main>
    );
  const scale = Math.min(1, (h - BAR - 48) / PHONE.h);
  return (
    <main class="lab-stage lab-single" style={{ "--scale": scale }}>
      <button type="button" class="lab-side" onClick={() => move(-1)} aria-label="Previous screen">
        ‹
      </button>
      <div class="lab-phone-box" style={{ width: `${PHONE.w * scale}px`, height: `${PHONE.h * scale}px` }}>
        <iframe src={frameSrc(meta, screen)} title={title} width={PHONE.w} height={PHONE.h} />
      </div>
      <button type="button" class="lab-side" onClick={() => move(1)} aria-label="Next screen">
        ›
      </button>
    </main>
  );
}

function Index({ go }: { go: (path: string) => void }) {
  return (
    <main class="lab-index">
      <h1>Design lab</h1>
      <p>Ten directions for the guest app. Each one shows the same five screens with the same data. Use ← and → to move between directions, 1–5 to pick a screen, 0 for all five and R to replay.</p>
      <ol class="lab-list">
        {DIRECTIONS.map((d, i) => (
          <li key={d.id}>
            <a href={pathOf(d, null)} onClick={(e) => (e.preventDefault(), go(pathOf(d, null)))}>
              <span class="n">{i + 1}</span>
              <strong>{d.name}</strong>
              <span>{d.idea}</span>
            </a>
          </li>
        ))}
      </ol>
    </main>
  );
}

function Frame({ meta, screen }: { meta: DirectionMeta; screen: ScreenId }) {
  const [View, setView] = useState<ComponentType | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    void LOADERS[meta.id]().then(({ direction }) => setView(() => direction[screen]));
  }, [meta, screen]);
  useEffect(() => {
    const onMessage = (e: MessageEvent<LabMessage>) => e.origin === location.origin && e.data?.lab === "replay" && setRound((r) => r + 1);
    const onKey = (e: KeyboardEvent) => !isTyping(e) && parent !== window && post(parent, { lab: "key", key: e.key });
    addEventListener("message", onMessage);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("message", onMessage);
      removeEventListener("keydown", onKey);
    };
  }, []);
  return View ? <View key={round} /> : null;
}

const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.matches("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey;

function Lab() {
  const [loc, setLoc] = useState({ pathname: location.pathname, search: location.search });
  const route = parse(loc);
  const narrow = useMedia("(max-width: 820px)");
  const go = (path: string) => {
    if (path === location.pathname) return;
    history.pushState(null, "", path);
    setLoc({ pathname: location.pathname, search: location.search });
  };
  const onKey = useRef<(key: string) => void>(() => {});
  const meta = route.kind === "view" ? route.meta : null;
  const screen = route.kind === "view" ? (route.screen ?? (narrow ? "landing" : null)) : null;
  onKey.current = (key) => {
    if (key === "ArrowRight" || key === "ArrowLeft") go(pathOf(meta ? step(DIRECTIONS, meta, key === "ArrowRight" ? 1 : -1) : DIRECTIONS[0], screen));
    else if (meta && key >= "1" && key <= String(SCREENS.length)) go(pathOf(meta, SCREENS[Number(key) - 1]!.id));
    else if (meta && key === "0") go(pathOf(meta, null));
    else if (meta && (key === "r" || key === "R")) replayAll();
  };

  useEffect(() => {
    if (route.kind === "frame") return;
    const onPop = () => setLoc({ pathname: location.pathname, search: location.search });
    const onKeyDown = (e: KeyboardEvent) => !isTyping(e) && onKey.current(e.key);
    const onMessage = (e: MessageEvent<LabMessage>) => e.origin === location.origin && e.data?.lab === "key" && onKey.current(e.data.key);
    addEventListener("popstate", onPop);
    addEventListener("keydown", onKeyDown);
    addEventListener("message", onMessage);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("keydown", onKeyDown);
      removeEventListener("message", onMessage);
    };
  }, [route.kind]);

  useEffect(() => {
    document.title = meta ? `${DIRECTIONS.indexOf(meta) + 1}. ${meta.name} · Design lab` : "Design lab";
  }, [meta]);

  document.body.classList.toggle("lab-phone", route.kind === "frame");
  if (route.kind === "frame") return <Frame meta={route.meta} screen={route.screen} />;
  return (
    <>
      <Switcher meta={meta} screen={screen} narrow={narrow} go={go} />
      {route.kind === "index" && <Index go={go} />}
      {meta && (screen ? <OneScreen meta={meta} screen={screen} narrow={narrow} go={go} /> : <AllFive meta={meta} go={go} />)}
      {route.kind === "missing" && (
        <main class="lab-index">
          <h1>Not in the lab</h1>
        </main>
      )}
    </>
  );
}

document.body.dataset.lab = LAB_MARKER;
render(<Lab />, document.getElementById("app")!);
