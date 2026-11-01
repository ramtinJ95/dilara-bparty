const arms = [0, 60, 120, 180, 240, 300];

export const Snowflake = () => (
  <svg viewBox="-24 -24 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
    {arms.map((angle) => (
      <g key={angle} transform={`rotate(${angle})`}>
        <path d="M0 0V-21M0 -9l-5 -5M0 -9l5 -5M0 -16l-4 -4M0 -16l4 -4" />
      </g>
    ))}
  </svg>
);

export const Sparkle = ({ class: className }: { class?: string }) => (
  <svg class={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0c.9 6.4 4.9 10.6 12 12-7.1 1.4-11.1 5.6-12 12-.9-6.4-4.9-10.6-12-12C7.1 10.6 11.1 6.4 12 0z" />
  </svg>
);

export const Tiara = () => (
  <svg class="tiara" viewBox="0 0 74 38" aria-hidden="true">
    <defs>
      <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" />
        <stop offset="1" stop-color="#a9bccd" />
      </linearGradient>
    </defs>
    <path d="M4 34 L10 14 L22 26 L37 4 L52 26 L64 14 L70 34 Q37 26 4 34Z" fill="url(#silver)" stroke="#8fa7bd" stroke-width="1.2" stroke-linejoin="round" />
    <circle cx="37" cy="5" r="3.4" fill="#7cc0f2" />
    <circle cx="10" cy="14" r="2.6" fill="#a9d2f3" />
    <circle cx="64" cy="14" r="2.6" fill="#a9d2f3" />
    <circle cx="37" cy="24" r="3" fill="#4f9be0" />
  </svg>
);

const line = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

export const LockIcon = () => (
  <svg viewBox="0 0 24 24" {...line} aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const CameraIcon = () => (
  <svg viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
);

export const GalleryIcon = () => (
  <svg viewBox="0 0 24 24" {...line} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="9.5" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </svg>
);

export const QuizIcon = () => (
  <svg viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d="M4 4.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-8.5L7 20.5V17H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
    <path d="M9.6 8.7a2.4 2.4 0 1 1 3.3 2.2c-.6.3-.9.7-.9 1.4" />
    <path d="M12 14.6v.1" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" {...line} stroke-width="2.6" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
