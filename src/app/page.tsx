"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(
  () => import("@/components/app-shell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-[#f3ebdf]">
        <svg width="56" height="56" viewBox="0 0 64 64" className="animate-pulse">
          <defs>
            <linearGradient id="ld" x1="0" y1="0" x2="64" y2="64">
              <stop stopColor="#FF9270" />
              <stop offset="1" stopColor="#E8442F" />
            </linearGradient>
          </defs>
          <path
            d="M32 6c8.6 0 15.6 2.6 19.4 5.4 2.4 1.8 3.4 4.8 3 7.8-.8 6.3-3 15.6-7.6 22.9C43 47.8 38 54.6 33.9 59.1c-1 1.1-2.8 1.1-3.8 0-4.1-4.5-9.1-11.3-12.9-17C12.6 34.8 10.4 25.5 9.6 19.2c-.4-3 .6-6 3-7.8C16.4 8.6 23.4 6 32 6Z"
            fill="url(#ld)"
          />
        </svg>
      </div>
    ),
  }
);

export default function Page() {
  return <AppShell />;
}
