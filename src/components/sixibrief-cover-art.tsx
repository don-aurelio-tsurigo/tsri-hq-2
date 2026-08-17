/** First-pass 6iBrief cover landscape (sky, cloud, hills). */
export function SixiBriefCoverArt() {
  return (
    <svg
      viewBox="0 0 1080 1350"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="sixibrief-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c6ebfe" />
          <stop offset="38%" stopColor="#d9f4ff" />
          <stop offset="62%" stopColor="#beced4" />
          <stop offset="100%" stopColor="#8e989c" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#sixibrief-sky)" />
      <g fill="#ffffff">
        <ellipse cx="540" cy="268" rx="118" ry="62" />
        <ellipse cx="470" cy="292" rx="92" ry="50" />
        <ellipse cx="610" cy="294" rx="96" ry="52" />
        <ellipse cx="540" cy="318" rx="128" ry="48" />
      </g>
      <path
        fill="#6a7843"
        d="M0 900C180 840 340 880 500 930C680 990 860 860 1080 910V1350H0Z"
      />
      <path
        fill="#2b3300"
        d="M0 1025C240 970 480 1085 700 1040C880 1000 980 1090 1080 1115V1350H0Z"
      />
    </svg>
  );
}
