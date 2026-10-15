export function OniLogo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="oniLibrary logo"
    >
      <defs>
        <linearGradient id="oniGrad" x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9270" />
          <stop offset="0.55" stopColor="#F8694C" />
          <stop offset="1" stopColor="#E8442F" />
        </linearGradient>
        <linearGradient id="oniGradSoft" x1="32" y1="14" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD9CC" />
          <stop offset="1" stopColor="#FFB39D" />
        </linearGradient>
      </defs>
      {/* horns */}
      <path
        d="M14.5 15.5C12 9.5 13.5 4.8 16.2 2.6c1-.8 2.4-.2 2.7 1l1.9 8.2-6.3 3.7Z"
        fill="url(#oniGrad)"
      />
      <path
        d="M49.5 15.5C52 9.5 50.5 4.8 47.8 2.6c-1-.8-2.4-.2-2.7 1l-1.9 8.2 6.3 3.7Z"
        fill="url(#oniGrad)"
      />
      {/* face */}
      <path
        d="M32 6c8.6 0 15.6 2.6 19.4 5.4 2.4 1.8 3.4 4.8 3 7.8-.8 6.3-3 15.6-7.6 22.9C43 47.8 38 54.6 33.9 59.1c-1 1.1-2.8 1.1-3.8 0-4.1-4.5-9.1-11.3-12.9-17C12.6 34.8 10.4 25.5 9.6 19.2c-.4-3 .6-6 3-7.8C16.4 8.6 23.4 6 32 6Z"
        fill="url(#oniGrad)"
      />
      {/* cheek marks */}
      <path
        d="M13.5 22.5c2.8-1 6.4-1.6 9.8-1.4"
        stroke="#FFC9B5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M50.5 22.5c-2.8-1-6.4-1.6-9.8-1.4"
        stroke="#FFC9B5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* eyes (angry hannya slits) */}
      <path
        d="M17.5 25.5c3.2-2.6 8.3-2.9 11.6-.7.9.6 1 1.9.2 2.7-2.7 2.6-8.3 3.2-11.6 1.4-1.2-.7-1.3-2.5-.2-3.4Z"
        fill="#FFF3EC"
      />
      <path
        d="M46.5 25.5c-3.2-2.6-8.3-2.9-11.6-.7-.9.6-1 1.9-.2 2.7 2.7 2.6 8.3 3.2 11.6 1.4 1.2-.7 1.3-2.5.2-3.4Z"
        fill="#FFF3EC"
      />
      <circle cx="24.5" cy="27.4" r="2.1" fill="#33221D" />
      <circle cx="39.5" cy="27.4" r="2.1" fill="#33221D" />
      {/* nose */}
      <path
        d="M30.4 34.5c.9-1.1 2.3-1.1 3.2 0l-1.6 2.2-1.6-2.2Z"
        fill="#C93A26"
      />
      {/* mouth with fangs */}
      <path
        d="M24.5 39.5c2.3 3 5 4.5 7.5 4.5s5.2-1.5 7.5-4.5c.8-1 .4-2.6-.9-2.9-4.3-1-8.9-1-13.2 0-1.3.3-1.7 1.9-.9 2.9Z"
        fill="#7E2417"
      />
      <path
        d="M26.6 37.4l1.5 3 1.2-2.6c-1.5-.1-2.4-.3-2.7-.4ZM37.4 37.4l-1.5 3-1.2-2.6c1.5-.1 2.4-.3 2.7-.4Z"
        fill="#FFF3EC"
      />
      {/* forehead crest */}
      <path
        d="M29 12.6c.6-2.4 1.4-4 3-5.6 1.6 1.6 2.4 3.2 3 5.6.2.9-.4 1.8-1.3 2-1.1.2-2.3.2-3.4 0-.9-.2-1.5-1.1-1.3-2Z"
        fill="url(#oniGradSoft)"
      />
    </svg>
  );
}
