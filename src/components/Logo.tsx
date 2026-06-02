// Tucano DB brand marks (inline SVG so they stay crisp and theme-independent).
// Source: ~/Downloads/tucano-icons/{app-db,tucano-db-mark}.svg — brand teal #119EA0.

/** Full app icon: rounded teal square with the toucan + DB-cylinder mark. */
export function LogoApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden>
      <rect x="0" y="0" width="128" height="128" rx="30.72" ry="30.72" fill="#119EA0" />
      <g transform="translate(26 26) scale(0.58)">
        <g fill="#FBFBF8">
          <circle cx="43" cy="72" r="25" />
          <path d="M52 52 C 82 47,108 54,122 70 C 125 73,122 78,116 77 C 100 80,84 82,66 84 C 60 78,54 62,52 52 Z" />
        </g>
        <circle cx="38" cy="63" r="4.3" fill="#119EA0" />
        <path
          d="M63 68 C 84 69,100 71,111 73"
          fill="none"
          stroke="#119EA0"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <g stroke="#FBFBF8" strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="110" cy="14" rx="13" ry="4.6" />
          <path d="M97 14 V34 a13 4.6 0 0 0 26 0 V14" />
          <path d="M97 24 a13 4.6 0 0 0 26 0" />
        </g>
      </g>
    </svg>
  );
}

/** The mark alone (toucan + cylinder) in brand teal — for heroes & empty states. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden>
      <g fill="#119EA0">
        <circle cx="43" cy="72" r="25" />
        <path d="M52 52 C 82 47,108 54,122 70 C 125 73,122 78,116 77 C 100 80,84 82,66 84 C 60 78,54 62,52 52 Z" />
      </g>
      <circle cx="38" cy="63" r="4.3" fill="#FBFBF8" />
      <path
        d="M63 68 C 84 69,100 71,111 73"
        fill="none"
        stroke="#FBFBF8"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g stroke="#119EA0" strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="110" cy="14" rx="13" ry="4.6" />
        <path d="M97 14 V34 a13 4.6 0 0 0 26 0 V14" />
        <path d="M97 24 a13 4.6 0 0 0 26 0" />
      </g>
    </svg>
  );
}
