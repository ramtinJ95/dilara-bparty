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

export const Tiara = ({ class: className }: { class?: string }) => (
  <svg class={className ? `tiara ${className}` : "tiara"} viewBox="0 0 124 68" aria-hidden="true">
    <defs>
      <linearGradient id="ice-tiara" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.5" stop-color="#cdeaff" />
        <stop offset="1" stop-color="#8fd0ff" />
      </linearGradient>
    </defs>
    <path d="M12 62L7 32L28 45L38 18L52 39L62 4L72 39L86 18L96 45L117 32L112 62Q62 51 12 62Z" fill="url(#ice-tiara)" stroke="#10204a" stroke-width="4.5" stroke-linejoin="round" />
    <path d="M62 10L62 46M38 24L42 50M86 24L82 50M18 40L22 56M106 40L102 56" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.9" />
    <circle cx="62" cy="40" r="7" fill="#ff9cc8" stroke="#10204a" stroke-width="3.5" />
    <circle cx="38" cy="18" r="4.5" fill="#8fd0ff" stroke="#10204a" stroke-width="3" />
    <circle cx="86" cy="18" r="4.5" fill="#8fd0ff" stroke="#10204a" stroke-width="3" />
    <circle cx="62" cy="5" r="4" fill="#fff" stroke="#10204a" stroke-width="3" />
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
