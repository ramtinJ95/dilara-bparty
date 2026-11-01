type Look = { sky: [string, string]; ink: string; shape: "snowflake" | "star" | "heart" | "crown" };

const shapes: Record<Look["shape"], (ink: string) => string> = {
  snowflake: (ink) =>
    `<g stroke="${ink}" stroke-width="16" stroke-linecap="round" fill="none">${[0, 60, 120, 180, 240, 300]
      .map((a) => `<g transform="rotate(${a})"><path d="M0 0V-150M0 -60l-36 -36M0 -60l36 -36M0 -105l-30 -30M0 -105l30 -30"/></g>`)
      .join("")}</g>`,
  star: (ink) => `<path fill="${ink}" d="M0-150 35-48 143-46 57 19 88 121 0 60-88 121-57 19-143-46-35-48Z"/>`,
  heart: (ink) => `<path fill="${ink}" d="M0 120C-210-15-90-165 0-60 90-165 210-15 0 120Z"/>`,
  crown: (ink) => `<path fill="${ink}" d="M-150 75V-75L-75 0 0-120 75 0 150-75V75Z"/><circle cx="0" cy="-130" r="18" fill="${ink}"/>`,
};

// A generated picture, never a real photo: a sky, snow and one big shape, so the photos are easy to tell apart.
function photo({ sky, ink, shape }: Look, seed: number) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const flakes = Array.from({ length: 50 }, () => `<circle cx="${(rand() * 800) | 0}" cy="${(rand() * 800) | 0}" r="${(3 + rand() * 8) | 0}" opacity="${(0.5 + rand() / 2).toFixed(2)}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="800" height="800" fill="url(#s)"/><g fill="#fff"><ellipse cx="200" cy="790" rx="480" ry="180"/><ellipse cx="690" cy="815" rx="400" ry="200"/>${flakes}</g><g transform="translate(400 370)">${shapes[shape](ink)}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PHOTOS = {
  landing: photo({ sky: ["#bfe0fb", "#ffffff"], ink: "#4f9be0", shape: "crown" }, 7),
  question: photo({ sky: ["#8fc7ef", "#e2f2fd"], ink: "#1d4f84", shape: "snowflake" }, 59),
  snow: photo({ sky: ["#bfe0fb", "#ffffff"], ink: "#4f9be0", shape: "snowflake" }, 3),
  dusk: photo({ sky: ["#c9b8f0", "#fbeefe"], ink: "#8a5cc7", shape: "star" }, 11),
  mint: photo({ sky: ["#b6ead9", "#f2fffb"], ink: "#2f9c7a", shape: "heart" }, 23),
  rose: photo({ sky: ["#f8c6d6", "#fff4f7"], ink: "#d0577f", shape: "crown" }, 31),
  sun: photo({ sky: ["#fde3a7", "#fffaf0"], ink: "#d08a1e", shape: "star" }, 43),
  sea: photo({ sky: ["#8fc7ef", "#e2f2fd"], ink: "#1d4f84", shape: "heart" }, 61),
};
