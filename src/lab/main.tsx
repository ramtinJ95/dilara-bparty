import { render, type ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { LAB_MARKER } from "./fixture";
import "./lab.css";
import { DIRECTIONS, directionById, type DirectionMeta } from "./directions";
import { LOADERS } from "./registry";
import { SCREENS, type ScreenId } from "./types";

type View = { kind: "index" } | { kind: "direction"; meta: DirectionMeta } | { kind: "screen"; meta: DirectionMeta; screen: ScreenId } | { kind: "missing" };

function parse(path: string): View {
  const [id, screen, ...rest] = path.replace(/^\/lab\/?/, "").split("/").filter(Boolean);
  if (!id) return { kind: "index" };
  const meta = directionById(id);
  if (!meta || rest.length > 0) return { kind: "missing" };
  if (!screen) return { kind: "direction", meta };
  const known = SCREENS.find((s) => s.id === screen);
  return known ? { kind: "screen", meta, screen: known.id } : { kind: "missing" };
}

function Index() {
  return (
    <main class="lab-index">
      <h1>Design lab</h1>
      <p>Ten directions for the guest app. Each page shows the same five screens with the same data.</p>
      <ol class="lab-list">
        {DIRECTIONS.map((d, i) => (
          <li key={d.id}>
            <a href={`/lab/${d.id}`}>
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

function DirectionPage({ meta }: { meta: DirectionMeta }) {
  const [round, setRound] = useState(0);
  const i = DIRECTIONS.indexOf(meta);
  const prev = DIRECTIONS[(i + DIRECTIONS.length - 1) % DIRECTIONS.length]!;
  const next = DIRECTIONS[(i + 1) % DIRECTIONS.length]!;
  return (
    <main class="lab-direction">
      <header>
        <a href="/lab/">All directions</a>
        <h1>
          {i + 1}. {meta.name}
        </h1>
        <p>{meta.idea}</p>
        <nav>
          <a href={`/lab/${prev.id}`}>← {prev.name}</a>
          <button type="button" onClick={() => setRound(round + 1)}>
            Replay
          </button>
          <a href={`/lab/${next.id}`}>{next.name} →</a>
        </nav>
      </header>
      <div class="lab-frames">
        {SCREENS.map((s) => (
          <figure key={`${s.id}-${round}`}>
            <iframe src={`/lab/${meta.id}/${s.id}`} title={`${meta.name}: ${s.title}`} width={390} height={844} />
            <figcaption>{s.title}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}

function Screen({ meta, screen }: { meta: DirectionMeta; screen: ScreenId }) {
  const [View, setView] = useState<ComponentType | null>(null);
  useEffect(() => {
    void LOADERS[meta.id]().then(({ direction }) => setView(() => direction[screen]));
  }, [meta, screen]);
  return View ? <View /> : null;
}

function Lab() {
  const view = parse(location.pathname);
  document.body.classList.toggle("lab-phone", view.kind === "screen");
  if (view.kind === "index") return <Index />;
  if (view.kind === "direction") return <DirectionPage meta={view.meta} />;
  if (view.kind === "screen") return <Screen meta={view.meta} screen={view.screen} />;
  return (
    <main class="lab-index">
      <h1>Not in the lab</h1>
      <a href="/lab/">All directions</a>
    </main>
  );
}

document.body.dataset.lab = LAB_MARKER;
render(<Lab />, document.getElementById("app")!);
