"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";

const collections = [
  { id: 1, name: "users", icon: "👤", docs: "1,240 documents", total: 1240 },
  { id: 2, name: "orders", icon: "📦", docs: "3,870 documents", total: 3870 },
  { id: 3, name: "products", icon: "🏷️", docs: "800 documents", total: 800 },
];

const SELECTION_SEQUENCE = [
  [1],
  [1, 3],
  [1, 2, 3],
  [2, 3],
  [2],
  [],
];

function useAutoSelect() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % SELECTION_SEQUENCE.length);
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return SELECTION_SEQUENCE[step];
}

function useExportAllAnimation() {
  const [transferred, setTransferred] = useState<number[]>([]);
  const [transferring, setTransferring] = useState<number | null>(null);

  useEffect(() => {
    const ids = collections.map((c) => c.id);
    let step = 0;
    const totalSteps = ids.length * 2 + 2;

    function advance() {
      if (step < ids.length) {
        setTransferring(ids[step]);
      } else if (step < ids.length * 2) {
        const justLanded = ids[step - ids.length];
        setTransferring(null);
        setTransferred((prev) =>
          prev.includes(justLanded) ? prev : [...prev, justLanded]
        );
        if (step + 1 < ids.length * 2) {
          setTransferring(ids[step - ids.length + 1]);
        }
      } else {
        setTransferred([]);
        setTransferring(null);
        step = -1;
      }
      step++;
    }

    advance();
    const id = setInterval(advance, 1000);
    return () => clearInterval(id);
  }, []);

  return { transferred, transferring };
}

function useAnimatedProgress(items: { name: string; total: number }[]) {
  const [progresses, setProgresses] = useState(items.map(() => 0));
  const frameRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const totalDuration = 6000;
    const gap = 1500;

    function tick() {
      const elapsed = Date.now() - startRef.current;
      const cycleTime = elapsed % (totalDuration + 1000);

      const next = items.map((_, i) => {
        const itemStart = i * gap;
        const itemDuration = totalDuration / items.length;
        const itemElapsed = Math.max(0, cycleTime - itemStart);
        return Math.min(100, (itemElapsed / itemDuration) * 100);
      });

      setProgresses(next);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [items]);

  useEffect(() => {
    const id = setInterval(() => {
      startRef.current = Date.now();
    }, 7000);
    return () => clearInterval(id);
  }, []);

  return progresses;
}

function useBackupAnimation() {
  const [phase, setPhase] = useState<"idle" | "creating" | "copying" | "done">("idle");
  const [copiedCount, setCopiedCount] = useState(0);

  useEffect(() => {
    const total = collections.length;
    let timeout: NodeJS.Timeout;

    function cycle() {
      setPhase("idle");
      setCopiedCount(0);

      timeout = setTimeout(() => {
        setPhase("creating");
        timeout = setTimeout(() => {
          setPhase("copying");
          let count = 0;
          const interval = setInterval(() => {
            count++;
            setCopiedCount(count);
            if (count >= total) {
              clearInterval(interval);
              setTimeout(() => {
                setPhase("done");
                setTimeout(cycle, 2500);
              }, 600);
            }
          }, 800);
        }, 1500);
      }, 1500);
    }

    cycle();
    return () => clearTimeout(timeout);
  }, []);

  return { phase, copiedCount };
}

function useReveal() {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observedRef = useRef(new Set<string>());

  const observe = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const id = el.dataset.revealId;
    if (!id || observedRef.current.has(id)) return;
    observedRef.current.add(id);
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible((prev) => new Set(prev).add(id));
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
  }, []);

  return { visible, observe };
}

export default function LearnMore() {
  const autoSelected = useAutoSelect();
  const progresses = useAnimatedProgress(collections);
  const { transferred, transferring } = useExportAllAnimation();
  const backup = useBackupAnimation();
  const { resolved: themeMode, toggle: toggleTheme } = useTheme();
  const { visible, observe } = useReveal();
  const backupTimestamp = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  }, []);

  const autoSelectedNames = collections
    .filter((c) => autoSelected.includes(c.id))
    .map((c) => c.name);

  const revealClass = (id: string) =>
    `transition-all duration-700 ${visible.has(id) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
      <style>{`
        @keyframes previewPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes statsGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      `}</style>

      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
            Back to Home
          </Link>
          <button onClick={toggleTheme} title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`} className="rounded-lg p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
            {themeMode === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" /></svg>
            )}
          </button>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          How{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            DataShuttle
          </span>{" "}
          Works
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl">
          A powerful tool that lets you sync and export MongoDB collections
          interactively with real-time progress tracking.
        </p>

        {/* Feature Cards */}
        <div className="mt-14 grid gap-8">
          {/* Interactive Mode */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Interactive Mode
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Step-by-step guided experience
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              The tool prompts you through every step so you never have to
              memorize commands. It will ask you to:
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  1
                </span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Create a new database or use an existing one
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Choose whether to provision a fresh database or connect to
                    one that already exists on your server .
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  2
                </span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Select collections from a displayed list
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Pick exactly which collections you want to export — no need
                    to dump everything.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Export All */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-6 h-6 text-violet-600 dark:text-violet-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Export All Collections
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  One click to export everything
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
              Don&apos;t want to pick and choose? Export every collection from
              your source database into your target database with a single
              click. All collections are synced in one go — no selection
              needed.
            </p>

            {/* Animated visual demo */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-6">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* Source DB */}
                <div className="flex-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                    Source Database
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 min-h-[28px]">
                    {collections.map((col) => {
                      const isSent =
                        transferred.includes(col.id) ||
                        transferring === col.id;
                      return (
                        <span
                          key={col.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-500 ${
                            isSent
                              ? "opacity-30 scale-90 bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500"
                              : "opacity-100 scale-100 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {col.icon} {col.name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Animated arrow */}
                <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                  {transferring !== null && (
                    <span className="text-xs font-medium text-violet-500 dark:text-violet-400 animate-pulse">
                      {collections.find((c) => c.id === transferring)?.icon}
                    </span>
                  )}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`w-8 h-8 text-violet-500 dark:text-violet-400 rotate-90 sm:rotate-0 transition-transform duration-300 ${
                      transferring !== null ? "scale-110" : "scale-100"
                    }`}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                    />
                  </svg>
                </div>

                {/* Target DB */}
                <div
                  className={`flex-1 w-full rounded-lg border-2 border-dashed p-4 text-center transition-all duration-500 ${
                    transferred.length === collections.length
                      ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                      : "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20"
                  }`}
                >
                  <p
                    className={`text-xs font-medium uppercase tracking-wider mb-3 transition-colors duration-500 ${
                      transferred.length === collections.length
                        ? "text-emerald-500 dark:text-emerald-400"
                        : "text-violet-500 dark:text-violet-400"
                    }`}
                  >
                    Your Database
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 min-h-[28px]">
                    {collections.map((col) => {
                      const hasArrived = transferred.includes(col.id);
                      return (
                        <span
                          key={col.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-500 ${
                            hasArrived
                              ? "opacity-100 scale-100 translate-y-0 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                              : "opacity-0 scale-75 translate-y-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                          }`}
                        >
                          {col.icon} {col.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Status + button */}
              <div className="mt-5 flex flex-col items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-500 ${
                    transferred.length === collections.length
                      ? "bg-emerald-600"
                      : "bg-violet-600"
                  }`}
                >
                  {transferred.length === collections.length ? (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      All Collections Exported!
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                      </svg>
                      {transferring !== null
                        ? `Exporting ${collections.find((c) => c.id === transferring)?.name}...`
                        : "Export All Collections"}
                    </>
                  )}
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {transferred.length}/{collections.length} collections
                  transferred
                </p>
              </div>
            </div>
          </section>

          {/* Collection Selection — animated auto-select */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-6 h-6 text-teal-600 dark:text-teal-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Collection Selection
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Click on collections to select them for export
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              Available collections are displayed as cards. Click on a
              collection to select or deselect it for export.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {collections.map((col) => {
                const isSelected = autoSelected.includes(col.id);
                return (
                  <div
                    key={col.id}
                    className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-500 ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md shadow-emerald-100 dark:shadow-emerald-900/20 scale-[1.03]"
                        : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 scale-100"
                    }`}
                  >
                    <span
                      className={`absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white transition-all duration-300 ${
                        isSelected
                          ? "opacity-100 scale-100"
                          : "opacity-0 scale-50"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>

                    <span className="text-3xl">{col.icon}</span>
                    <div className="text-center">
                      <p
                        className={`font-semibold transition-colors duration-500 ${
                          isSelected
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {col.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {col.docs}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className={`mt-5 rounded-lg px-4 py-3 transition-all duration-500 ${
                autoSelected.length > 0
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                  : "bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700"
              }`}
            >
              {autoSelected.length > 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  ✓ Selected for export:{" "}
                  <span className="font-semibold">
                    {autoSelectedNames.join(", ")}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Selecting collections...
                </p>
              )}
            </div>
          </section>

          {/* Progress Logging — animated bars */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-6 h-6 text-amber-600 dark:text-amber-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Progress Logging
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Real-time sync visibility with tqdm progress bars
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              Never wonder what&apos;s happening behind the scenes. DataShuttle
              uses{" "}
              <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-sm font-mono text-amber-700 dark:text-amber-300">
                tqdm
              </code>{" "}
              progress bars to give you live feedback while collections are
              being synced.
            </p>

            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  datashuttle — syncing
                </span>
              </div>
              <div className="bg-zinc-950 p-5 font-mono text-sm leading-7 space-y-4">
                {collections.map((col, i) => {
                  const pct = Math.round(progresses[i]);
                  const done = Math.round((pct / 100) * col.total);
                  const isComplete = pct >= 100;
                  const barColor = isComplete ? "bg-emerald-500" : "bg-amber-500";
                  const textColor = isComplete
                    ? "text-emerald-400"
                    : "text-amber-400";

                  return (
                    <div key={col.id}>
                      <p className="text-zinc-400">
                        {isComplete ? "✓ Synced" : "Syncing"}{" "}
                        <span className="text-white font-medium">
                          {col.name}
                        </span>
                        {isComplete ? "" : "..."}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="h-3 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor} transition-none`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`${textColor} text-xs whitespace-nowrap tabular-nums`}
                        >
                          {pct.toString().padStart(3, "\u00A0")}%{" "}
                          {done.toLocaleString()}/{col.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <p className="text-zinc-500 text-xs pt-1">
                  {progresses.every((p) => p >= 100)
                    ? "✓ All collections synced successfully"
                    : `Syncing ${collections.filter((_, i) => progresses[i] < 100).length} collection(s)...`}
                </p>
              </div>
            </div>
          </section>

          {/* Database Backup */}
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-blue-600 dark:text-blue-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Database Backup
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  One-click full backup with timestamp
                </p>
              </div>
            </div>

            <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
              Create a complete backup of your source database on the target server with a single click.
              A new database is created automatically with the naming format{" "}
              <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-sm font-mono text-blue-700 dark:text-blue-300">
                source_backup_YYYYMMDD_HHMMSS
              </code>{" "}
              so you always know when the backup was taken.
            </p>

            {/* Animated backup demo */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-6">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* Source */}
                <div className="flex-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Source Database</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono mb-3">my_app_db</p>
                  <div className="flex flex-wrap gap-1.5">
                    {collections.map((col, idx) => (
                      <span
                        key={col.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-500 ${
                          backup.phase === "copying" && idx < backup.copiedCount
                            ? "opacity-40 scale-95 bg-zinc-200 dark:bg-zinc-700 text-zinc-400"
                            : backup.phase === "copying" && idx === backup.copiedCount
                            ? "opacity-60 scale-95 bg-blue-100 dark:bg-blue-900/30 text-blue-500 animate-pulse"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {col.icon} {col.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex shrink-0 flex-col items-center gap-1">
                  {backup.phase === "copying" && (
                    <span className="text-xs font-medium text-blue-500 dark:text-blue-400 animate-pulse">
                      {collections[Math.min(backup.copiedCount, collections.length - 1)]?.icon}
                    </span>
                  )}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-8 h-8 rotate-90 sm:rotate-0 transition-all duration-300 ${
                      backup.phase === "copying" ? "text-blue-500 dark:text-blue-400 scale-110" :
                      backup.phase === "done" ? "text-emerald-500 dark:text-emerald-400" :
                      "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>

                {/* Target backup */}
                <div className={`flex-1 w-full rounded-lg border-2 border-dashed p-4 transition-all duration-500 ${
                  backup.phase === "done"
                    ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                    : backup.phase === "creating" || backup.phase === "copying"
                    ? "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/20"
                    : "border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/40"
                }`}>
                  <p className={`text-xs font-medium uppercase tracking-wider mb-2 transition-colors duration-500 ${
                    backup.phase === "done" ? "text-emerald-500 dark:text-emerald-400" :
                    backup.phase !== "idle" ? "text-blue-500 dark:text-blue-400" :
                    "text-zinc-400 dark:text-zinc-500"
                  }`}>
                    Backup Database
                  </p>
                  <p className={`text-sm font-semibold font-mono mb-3 transition-all duration-500 ${
                    backup.phase === "idle" ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"
                  }`}>
                    {backup.phase === "idle" ? "waiting..." : `my_app_db_backup_${backupTimestamp}`}
                  </p>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {collections.map((col, idx) => (
                      <span
                        key={col.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-500 ${
                          (backup.phase === "copying" && idx < backup.copiedCount) || backup.phase === "done"
                            ? "opacity-100 scale-100 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : "opacity-0 scale-75"
                        }`}
                      >
                        {col.icon} {col.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="mt-5 flex flex-col items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-500 ${
                  backup.phase === "done" ? "bg-emerald-600" :
                  backup.phase !== "idle" ? "bg-blue-600" :
                  "bg-zinc-500"
                }`}>
                  {backup.phase === "idle" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06V3.44a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 2.5a9.006 9.006 0 0 0-4.25 1.065v13.254ZM9.25 4.565A9.006 9.006 0 0 0 5 2.5a9.006 9.006 0 0 0-2.454.219A.75.75 0 0 0 2 3.44v11.62a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5a7.462 7.462 0 0 1 4.25 1.32V4.565Z" />
                      </svg>
                      Backup Database
                    </>
                  )}
                  {backup.phase === "creating" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 animate-spin">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.28a.75.75 0 0 0-.75.75v3.955a.75.75 0 0 0 1.5 0v-2.134l.235.234a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.388Zm1.217-5.424a.75.75 0 0 0-1.5 0v2.134l-.235-.234a7 7 0 0 0-11.712 3.138.75.75 0 0 0 1.449.388 5.5 5.5 0 0 1 9.201-2.466l.312.311h-2.433a.75.75 0 0 0 0 1.5H15.72a.75.75 0 0 0 .75-.75V6Z" clipRule="evenodd" />
                      </svg>
                      Creating backup database...
                    </>
                  )}
                  {backup.phase === "copying" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 animate-pulse">
                        <path d="M15.988 3.012A2.25 2.25 0 0 0 14.25 2h-4.5A2.25 2.25 0 0 0 7.5 4.25v1.5H4.25A2.25 2.25 0 0 0 2 8v6a2.25 2.25 0 0 0 2.25 2.25h4.5A2.25 2.25 0 0 0 11 14v-1.5h2.75A2.25 2.25 0 0 0 16 10.25v-6a2.25 2.25 0 0 0-.012-.238Z" />
                      </svg>
                      Copying {collections[Math.min(backup.copiedCount, collections.length - 1)]?.name}... ({backup.copiedCount}/{collections.length})
                    </>
                  )}
                  {backup.phase === "done" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                      Backup Complete!
                    </>
                  )}
                </span>
                {backup.phase === "done" && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                    my_app_db_backup_{backupTimestamp}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-start gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Select your source database</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Choose which database you want to back up from the connected source.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Click Backup</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">A new database named <code className="rounded bg-zinc-200 dark:bg-zinc-700 px-1 py-0.5 font-mono text-[11px]">source_backup_YYYYMMDD_HHMMSS</code> is created on your target and all collections are copied with real-time progress.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Timestamp-based versioning</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Each backup gets a unique name based on date and time, so you can take multiple backups without overwriting previous ones.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Document Preview ─────────────────────────── */}
          <section ref={(el) => { if (el) { el.dataset.revealId = "preview"; observe(el); } }} data-reveal-id="preview"
            className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm ${revealClass("preview")}`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-cyan-600 dark:text-cyan-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Document Preview</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Peek before you copy</p>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              Hover over any source collection and click the eye icon to preview the first 10 documents in a beautiful JSON viewer — no need to open Compass or mongosh separately.
            </p>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-5">
              <div className="space-y-2">
                {[{ n: "users", f: '{ "_id": "64a...", "name": "Alice", "email": "alice@..." }' },
                  { n: "orders", f: '{ "_id": "64b...", "total": 129.99, "status": "completed" }' },
                  { n: "products", f: '{ "_id": "64c...", "title": "Widget Pro", "price": 49.99 }' }
                ].map((item, i) => (
                  <div key={i} className="group rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{item.n}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 group-hover:hidden">docs</span>
                      <span className="hidden group-hover:inline text-[11px] font-mono text-cyan-600 dark:text-cyan-400 max-w-[280px] truncate" style={{ animation: "previewPulse 1.5s ease-in-out infinite" }}>{item.f}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-cyan-500 transition-colors">
                        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Collection Stats Dashboard ───────────────── */}
          <section ref={(el) => { if (el) { el.dataset.revealId = "stats"; observe(el); } }} data-reveal-id="stats"
            className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 shadow-sm ${revealClass("stats")}`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-indigo-600 dark:text-indigo-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Collection Stats Dashboard</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Health check at a glance</p>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
              See total database size, number of objects, largest collections, and index sizes — a quick health check of both source and target databases before you start copying.
            </p>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[{ label: "Source", db: "production_db", color: "amber", data: { collections: 24, objects: "1.2M", size: "890 MB", idx: "120 MB" } },
                  { label: "Target", db: "dev_database", color: "emerald", data: { collections: 18, objects: "340K", size: "210 MB", idx: "45 MB" } }
                ].map((side) => (
                  <div key={side.label} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-2 h-2 rounded-full ${side.color === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{side.label}</span>
                      <span className="ml-auto text-xs font-mono text-zinc-500 dark:text-zinc-400">{side.db}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(side.data).map(([k, v]) => (
                        <div key={k} className="rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2"
                          style={visible.has("stats") ? { animation: "statsGrow 0.4s ease-out both", transformOrigin: "bottom" } : undefined}>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 capitalize">{k === "idx" ? "Index Size" : k === "size" ? "Data Size" : k}</p>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* CTA */}
        <div className="mt-14 text-center">
          <Link
            href="/connect-database"
            className="inline-flex rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}

