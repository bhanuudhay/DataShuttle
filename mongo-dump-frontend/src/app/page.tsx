"use client";

import Link from "next/link";
import { useAuth } from "./context/AuthContext";
import { useTheme } from "./context/ThemeContext";

export default function Home() {
  const { user, logout, loading } = useAuth();
  const { resolved: themeMode, toggle: toggleTheme } = useTheme();

  return (
    <div className="relative flex flex-col flex-1 items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 overflow-hidden">
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes iconFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.15); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .anim-fade { animation: fadeSlideUp 0.7s ease-out both; }
        .anim-d1   { animation-delay: 0.1s; }
        .anim-d2   { animation-delay: 0.25s; }
        .anim-d3   { animation-delay: 0.4s; }
        .anim-d4   { animation-delay: 0.55s; }
        .anim-d5   { animation-delay: 0.7s; }
      `}</style>

      {/* Background glow orbs */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-emerald-400/20 dark:bg-emerald-500/10 blur-[100px]"
        style={{ animation: "glowPulse 6s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-teal-400/20 dark:bg-teal-500/10 blur-[120px]"
        style={{ animation: "glowPulse 8s ease-in-out 2s infinite" }}
      />

      {/* Top-right auth bar */}
      {!loading && (
        <div className="fixed top-6 right-6 flex items-center gap-3 z-50 anim-fade anim-d5">
          <button onClick={toggleTheme} title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`} className="rounded-full border border-zinc-300 dark:border-zinc-700 p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            {themeMode === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" /></svg>
            )}
          </button>
          {user ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Hi, <strong className="text-zinc-900 dark:text-zinc-100">{user.name}</strong>
              </span>
              <button
                onClick={logout}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-emerald-600 px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}

      <main className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* Icon */}
        <div
          className="flex items-center justify-center w-24 h-24 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 shadow-lg anim-fade anim-d1"
          style={{ animation: "fadeSlideUp 0.7s ease-out 0.1s both, iconFloat 4s ease-in-out 1s infinite" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-12 h-12 text-emerald-600 dark:text-emerald-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl anim-fade anim-d2">
          Welcome to{" "}
          <span
            className="text-transparent bg-clip-text bg-[length:200%_auto] bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-400"
            style={{ animation: "shimmer 4s linear infinite" }}
          >
            DataShuttle
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-lg text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed anim-fade anim-d3">
          Your go-to tool for copying and managing MongoDB collections across clusters.
        </p>

        {/* Buttons */}
        <div className="mt-4 flex gap-4 anim-fade anim-d4">
          <Link
            href={user ? "/connect-database" : "/login"}
            className="rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg hover:scale-105 active:scale-95"
          >
            Get Started
          </Link>
          <Link
            href="/learn-more"
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-8 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:scale-105 active:scale-95"
          >
            Learn More
          </Link>
        </div>
      </main>
    </div>
  );
}
