"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";

function SkeletonRow({ accent = "zinc" }: { accent?: "amber" | "emerald" | "zinc" }) {
  const border =
    accent === "amber"
      ? "border-amber-100 dark:border-amber-900/20"
      : accent === "emerald"
      ? "border-emerald-100 dark:border-emerald-900/20"
      : "border-zinc-200 dark:border-zinc-700/50";

  return (
    <div className={`flex items-center justify-between rounded-xl border-2 ${border} px-4 py-3 animate-pulse`}>
      <div className="h-4 w-28 rounded-md bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-3 w-16 rounded-md bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

function SkeletonPill() {
  return (
    <div className="inline-flex h-8 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-700/60 animate-pulse" />
  );
}

interface CollectionInfo {
  name: string;
  count: number;
}

interface ProgressEvent {
  type?: string;
  collection?: string;
  target_collection?: string;
  total?: number;
  copied?: number;
  status?: string;
  total_collections?: number;
  completed_collections?: number;
  current?: string;
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    }>
      <CollectionsContent />
    </Suspense>
  );
}

function CollectionsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, token, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { resolved: themeMode, toggle: toggleTheme } = useTheme();

  const sourceDb = params.get("source_db") || "";
  const targetDb = params.get("target_db") || "";

  const [sourceCollections, setSourceCollections] = useState<CollectionInfo[]>([]);
  const [targetCollections, setTargetCollections] = useState<CollectionInfo[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);

  const [mode, setMode] = useState<"selective" | "copy-all">("selective");

  // selective mode
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [targetColName, setTargetColName] = useState("");
  const [targetColMode, setTargetColMode] = useState<"existing" | "new">("existing");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  // search
  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");

  // multi-select for target bulk delete
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // target actions
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // progress
  const [copying, setCopying] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);
  const [overallProgress, setOverallProgress] = useState<ProgressEvent | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  // preview modal
  const [previewCol, setPreviewCol] = useState<string | null>(null);
  const [previewDocs, setPreviewDocs] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewView, setPreviewView] = useState<"json" | "table" | "keyval">("json");

  // stats panel
  const [showStats, setShowStats] = useState(false);
  const [dbStats, setDbStats] = useState<Record<string, unknown> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!token || !sourceDb || !targetDb) return;
    async function load() {
      try {
        const [srcRes, tgtRes] = await Promise.all([
          fetch(`${API_URL}/api/collections/source?db_name=${encodeURIComponent(sourceDb)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/collections/target?db_name=${encodeURIComponent(targetDb)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const srcData = await srcRes.json();
        const tgtData = await tgtRes.json();
        if (srcData.success) setSourceCollections(srcData.collections);
        if (tgtData.success) setTargetCollections(tgtData.collections);
      } catch {
        // ignore
      } finally {
        setLoadingCollections(false);
      }
    }
    load();
  }, [token, sourceDb, targetDb]);

  async function refreshTargetCollections() {
    try {
      const res = await fetch(`${API_URL}/api/collections/target?db_name=${encodeURIComponent(targetDb)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTargetCollections(data.collections);
    } catch { /* ignore */ }
  }

  async function openPreview(colName: string) {
    setPreviewCol(colName);
    setPreviewDocs([]);
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/collection/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ db_name: sourceDb, collection_name: colName, role: "source", limit: 3 }),
      });
      const data = await res.json();
      if (data.success) setPreviewDocs(data.documents as Record<string, unknown>[]);
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  }

  async function loadDbStats() {
    setShowStats(true);
    setStatsLoading(true);
    try {
      const [srcRes, tgtRes] = await Promise.all([
        fetch(`${API_URL}/api/database/stats?db_name=${encodeURIComponent(sourceDb)}&role=source`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/database/stats?db_name=${encodeURIComponent(targetDb)}&role=target`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const srcData = await srcRes.json();
      const tgtData = await tgtRes.json();
      setDbStats({ source: srcData, target: tgtData });
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function readSSE(response: Response) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    (async () => {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const evt: ProgressEvent = JSON.parse(line.slice(6));
              setProgress((prev) => [...prev, evt]);
              if (evt.type === "overall") {
                setOverallProgress(evt);
                if (evt.status === "done") {
                  setCopyDone(true);
                  setCopying(false);
                  refreshTargetCollections();
                }
              } else if (evt.collection) {
                setCurrentProgress(evt);
                if (evt.status === "done") {
                  setCurrentProgress(null);
                }
              }
              if (evt.type === "finish") {
                setCopyDone(true);
                setCopying(false);
                refreshTargetCollections();
                toast("Copy completed successfully", "success");
              }
            } catch { /* ignore parse error */ }
          }
        }
      }
    })();
  }

  async function handleCopySingle() {
    if (!selectedSource) return;
    const tCol = targetColMode === "new" ? targetColName.trim() : selectedTarget;
    if (!tCol) return;

    setCopying(true);
    setCopyDone(false);
    setProgress([]);
    setCurrentProgress(null);
    setOverallProgress(null);

    try {
      const res = await fetch(`${API_URL}/api/collection/copy`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          source_db: sourceDb,
          target_db: targetDb,
          source_collection: selectedSource,
          target_collection: tCol,
        }),
      });
      readSSE(res);
    } catch {
      setCopying(false);
    }
  }

  async function handleCopyAll() {
    setCopying(true);
    setCopyDone(false);
    setProgress([]);
    setCurrentProgress(null);
    setOverallProgress(null);

    try {
      const res = await fetch(`${API_URL}/api/collection/copy-all`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          source_db: sourceDb,
          target_db: targetDb,
        }),
      });
      readSSE(res);
    } catch {
      setCopying(false);
    }
  }

  const filteredSource = sourceCollections.filter((c) =>
    c.name.toLowerCase().includes(sourceSearch.toLowerCase())
  );
  const filteredTarget = targetCollections.filter((c) =>
    c.name.toLowerCase().includes(targetSearch.toLowerCase())
  );

  function toggleDeleteSelection(name: string) {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedForDelete.size === filteredTarget.length) {
      setSelectedForDelete(new Set());
    } else {
      setSelectedForDelete(new Set(filteredTarget.map((c) => c.name)));
    }
  }

  async function handleBulkDelete() {
    if (selectedForDelete.size === 0) return;
    if (!confirm(`Drop ${selectedForDelete.size} collection(s)? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/collection/drop-many`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ db_name: targetDb, collection_names: Array.from(selectedForDelete) }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedTarget && selectedForDelete.has(selectedTarget)) setSelectedTarget(null);
        setSelectedForDelete(new Set());
        setMultiSelect(false);
        await refreshTargetCollections();
        toast(`Dropped ${selectedForDelete.size} collection(s)`, "success");
      }
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  }

  async function handleDropCollection(colName: string) {
    if (!confirm(`Drop collection "${colName}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/collection/drop`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ db_name: targetDb, collection_name: colName }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedTarget === colName) setSelectedTarget(null);
        await refreshTargetCollections();
        toast(`Collection "${colName}" dropped`, "success");
      }
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  }

  async function handleRenameCollection(oldName: string) {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingCol(null); return; }
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/collection/rename`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ db_name: targetDb, old_name: oldName, new_name: newName }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedTarget === oldName) setSelectedTarget(newName);
        setRenamingCol(null);
        setRenameValue("");
        await refreshTargetCollections();
        toast(`Renamed to "${newName}"`, "success");
      }
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  }

  function resetState() {
    setCopying(false);
    setCopyDone(false);
    setProgress([]);
    setCurrentProgress(null);
    setOverallProgress(null);
    setSelectedSource(null);
    setSelectedTarget(null);
    setTargetColName("");
    setTargetColMode("existing");
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!sourceDb || !targetDb) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 gap-4">
        <p className="text-zinc-500 dark:text-zinc-400">No databases selected.</p>
        <Link href="/connect-database" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">Go back to select databases</Link>
      </div>
    );
  }

  const singleTargetCol = targetColMode === "new" ? targetColName.trim() : selectedTarget;
  const canCopySingle = selectedSource && singleTargetCol && singleTargetCol.length > 0 && !copying;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
        <Link
          href="/connect-database"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline mb-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
          Back to Database Selection
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="text-zinc-900 dark:text-zinc-50">Copy </span>
              <span className="text-emerald-600 dark:text-emerald-400">Collections</span>
            </h1>
            <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              From <strong className="text-zinc-800 dark:text-zinc-200">{sourceDb}</strong> to <strong className="text-zinc-800 dark:text-zinc-200">{targetDb}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button onClick={loadDbStats} title="Database Stats" className="rounded-lg p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" /></svg>
            </button>
            <button onClick={toggleTheme} title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`} className="rounded-lg p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
              {themeMode === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        {!copying && !copyDone && (
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 mb-6 max-w-md">
            <button
              onClick={() => { setMode("selective"); resetState(); }}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                mode === "selective"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              Copy Selected
            </button>
            <button
              onClick={() => { setMode("copy-all"); resetState(); }}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                mode === "copy-all"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              Copy All
            </button>
          </div>
        )}

        {/* ============ SELECTIVE MODE ============ */}
        {mode === "selective" && !copying && !copyDone && (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            {/* Source collections */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 shadow-sm flex flex-col max-h-[420px]">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-amber-600 dark:text-amber-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Source Collection</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick which collection to copy</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
                <input
                  type="text"
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="Search collections..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                {loadingCollections ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={i} accent="amber" />
                    ))}
                  </div>
                ) : filteredSource.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">{sourceSearch ? "No matches" : "No collections found"}</p>
                ) : (
                  filteredSource.map((col) => (
                    <div key={col.name} className="group relative flex items-center gap-1">
                      <button
                        onClick={() => setSelectedSource(col.name)}
                        className={`flex-1 flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 ${
                          selectedSource === col.name
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 shadow-md shadow-amber-500/10"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 hover:shadow-sm hover:scale-[1.01]"
                        }`}
                      >
                        <span className={`text-sm font-medium transition-colors ${selectedSource === col.name ? "text-amber-700 dark:text-amber-300" : "text-zinc-700 dark:text-zinc-300 group-hover:text-amber-700 dark:group-hover:text-amber-300"}`}>
                          {col.name}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">{col.count.toLocaleString()} docs</span>
                      </button>
                      <button
                        onClick={() => openPreview(col.name)}
                        title="Preview documents"
                        className="shrink-0 rounded-lg p-2 text-zinc-300 dark:text-zinc-600 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Animated arrows */}
            <div className="hidden sm:flex flex-col items-center justify-center gap-1 pt-6">
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg
                    key={i}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-emerald-500 dark:text-emerald-400"
                    style={{
                      animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  >
                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                ))}
              </div>
              <style>{`
                @keyframes pulse {
                  0%, 100% { opacity: 0.3; transform: translateX(0); }
                  50% { opacity: 1; transform: translateX(3px); }
                }
              `}</style>
            </div>

            {/* Target collection */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 shadow-sm flex flex-col max-h-[420px]">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-emerald-600 dark:text-emerald-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Target Collection</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Where to put the data</p>
                </div>
              </div>

              <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 mb-4">
                <button
                  onClick={() => { setTargetColMode("existing"); setTargetColName(""); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    targetColMode === "existing"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  Use Existing
                </button>
                <button
                  onClick={() => { setTargetColMode("new"); setSelectedTarget(null); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    targetColMode === "new"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  New Name
                </button>
              </div>

              {targetColMode === "existing" ? (
                <>
                  {/* Search + multi-select toggle */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                      </svg>
                      <input
                        type="text"
                        value={targetSearch}
                        onChange={(e) => setTargetSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                      />
                    </div>
                    <button
                      onClick={() => { setMultiSelect(!multiSelect); setSelectedForDelete(new Set()); }}
                      title={multiSelect ? "Cancel multi-select" : "Multi-select to delete"}
                      className={`shrink-0 rounded-lg p-2 transition-colors ${
                        multiSelect
                          ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1h.01a1 1 0 0 1 0 2h-.01a1 1 0 0 1-1-1Zm1 5.25a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm0 5.25a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  {/* Multi-select toolbar */}
                  {multiSelect && (
                    <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 px-3 py-2 mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleSelectAll}
                          className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                        >
                          {selectedForDelete.size === filteredTarget.length ? "Deselect All" : "Select All"}
                        </button>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {selectedForDelete.size} selected
                        </span>
                      </div>
                      <button
                        onClick={handleBulkDelete}
                        disabled={selectedForDelete.size === 0 || actionLoading}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
                        </svg>
                        Drop {selectedForDelete.size}
                      </button>
                    </div>
                  )}

                <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                  {loadingCollections ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonRow key={i} accent="emerald" />
                      ))}
                    </div>
                  ) : filteredTarget.length === 0 ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">{targetSearch ? "No matches" : "No collections yet"}</p>
                  ) : (
                    filteredTarget.map((col) => (
                      <div key={col.name} className="group relative">
                        {renamingCol === col.name ? (
                          <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleRenameCollection(col.name); if (e.key === "Escape") { setRenamingCol(null); setRenameValue(""); } }}
                              autoFocus
                              placeholder="New name"
                              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                            <button
                              onClick={() => handleRenameCollection(col.name)}
                              disabled={actionLoading}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setRenamingCol(null); setRenameValue(""); }}
                              className="rounded-lg bg-zinc-200 dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : multiSelect ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleDeleteSelection(col.name)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleDeleteSelection(col.name); }}
                            className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 cursor-pointer ${
                              selectedForDelete.has(col.name)
                                ? "border-red-400 bg-red-50 dark:bg-red-950/20 shadow-sm"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50/50 dark:hover:bg-red-950/10"
                            }`}
                          >
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                              selectedForDelete.has(col.name)
                                ? "border-red-500 bg-red-500"
                                : "border-zinc-300 dark:border-zinc-600"
                            }`}>
                              {selectedForDelete.has(col.name) && (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-white">
                                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-sm font-medium ${selectedForDelete.has(col.name) ? "text-red-700 dark:text-red-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                              {col.name}
                            </span>
                            <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">{col.count.toLocaleString()} docs</span>
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedTarget(col.name)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedTarget(col.name); }}
                            className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 cursor-pointer ${
                              selectedTarget === col.name
                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 hover:shadow-sm hover:scale-[1.01]"
                            }`}
                          >
                            <span className={`text-sm font-medium transition-colors ${selectedTarget === col.name ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"}`}>
                              {col.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums group-hover:hidden">{col.count.toLocaleString()} docs</span>
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRenamingCol(col.name); setRenameValue(col.name); }}
                                  title="Rename"
                                  className="rounded-lg p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDropCollection(col.name); }}
                                  title="Drop"
                                  disabled={actionLoading}
                                  className="rounded-lg p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                </>
              ) : (
                <input
                  type="text"
                  value={targetColName}
                  onChange={(e) => setTargetColName(e.target.value)}
                  placeholder="new_collection_name"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              )}

              {targetColMode === "existing" && selectedTarget && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  Existing data in &quot;{selectedTarget}&quot; will be replaced.
                </p>
              )}
            </div>

            {/* Filter & Options */}
            <div className="sm:col-span-3 space-y-3">
              <button
                onClick={handleCopySingle}
                disabled={!canCopySingle}
                className={`w-full rounded-xl py-3.5 text-sm font-semibold shadow-md transition-all ${
                  canCopySingle
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                }`}
              >
                Copy Collection
              </button>
            </div>
          </div>
        )}

        {/* ============ COPY ALL MODE ============ */}
        {mode === "copy-all" && !copying && !copyDone && (
          <div className="space-y-5">
            <style>{`
              @keyframes pillFadeIn {
                from { opacity: 0; transform: translateY(8px) scale(0.9); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes pillSlideIn {
                from { opacity: 0; transform: translateX(-12px) scale(0.9); }
                to   { opacity: 1; transform: translateX(0) scale(1); }
              }
              @keyframes arrowFlow {
                0%   { opacity: 0.2; transform: translateX(-4px); }
                50%  { opacity: 1;   transform: translateX(4px); }
                100% { opacity: 0.2; transform: translateX(-4px); }
              }
              @keyframes dotTravel {
                0%   { left: 0%; opacity: 0; }
                10%  { opacity: 1; }
                90%  { opacity: 1; }
                100% { left: 100%; opacity: 0; }
              }
            `}</style>

            {/* Header card */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {sourceCollections.length} collections
                </h3>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Ready to copy
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Existing collections with the same name in the target will be replaced.
              </p>
            </div>

            {/* From → To visual */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
              {/* Source column */}
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM6.75 9.25a.75.75 0 0 0 0 1.5h4.59l-2.1 1.95a.75.75 0 0 0 1.02 1.1l3.5-3.25a.75.75 0 0 0 0-1.1l-3.5-3.25a.75.75 0 1 0-1.02 1.1l2.1 1.95H6.75Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">From</p>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{sourceDb}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {loadingCollections ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonPill key={i} />)
                  ) : (
                    sourceCollections.map((col, idx) => (
                      <span
                        key={col.name}
                        className="inline-flex items-center rounded-lg bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800/40 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 shadow-sm hover:scale-105 hover:shadow-md hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-default"
                        style={{
                          animation: `pillFadeIn 0.4s ease-out ${idx * 0.06}s both`,
                        }}
                      >
                        {col.name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Animated arrow bridge */}
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="relative w-10 h-24 flex flex-col items-center justify-center">
                  {[0, 1, 2].map((i) => (
                    <svg
                      key={i}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-5 h-5 text-emerald-500 dark:text-emerald-400"
                      style={{ animation: `arrowFlow 1.8s ease-in-out ${i * 0.3}s infinite` }}
                    >
                      <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-4.158a.75.75 0 1 1 1.08-1.04l5.25 5.5a.75.75 0 0 1 0 1.08l-5.25 5.5a.75.75 0 1 1-1.08-1.04l3.96-4.158H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                    </svg>
                  ))}
                </div>
                {/* Traveling dots */}
                <div className="relative w-10 h-1 overflow-hidden rounded-full bg-emerald-200/30 dark:bg-emerald-800/20">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-1 w-2 rounded-full bg-emerald-500"
                      style={{ animation: `dotTravel 1.5s ease-in-out ${i * 0.5}s infinite` }}
                    />
                  ))}
                </div>
              </div>

              {/* Target column */}
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/10 p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-600 dark:text-emerald-400">
                      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">To</p>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{targetDb}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 flex-1 content-start">
                  {loadingCollections ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonPill key={i} />)
                  ) : sourceCollections.map((col, idx) => {
                    const existsInTarget = targetCollections.some((t) => t.name === col.name);
                    return (
                      <span
                        key={col.name}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm cursor-default ${
                          existsInTarget
                            ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300"
                        }`}
                        style={{
                          animation: `pillSlideIn 0.4s ease-out ${(sourceCollections.length * 0.06 + 0.3) + idx * 0.06}s both`,
                        }}
                      >
                        {col.name}
                        <span className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${
                          existsInTarget
                            ? "bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200"
                            : "bg-emerald-200 dark:bg-emerald-800/50 text-emerald-800 dark:text-emerald-200"
                        }`}>
                          {existsInTarget ? "REPLACE" : "NEW"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Copy All button */}
            <button
              onClick={handleCopyAll}
              disabled={copying || sourceCollections.length === 0}
              className={`w-full rounded-xl py-4 text-sm font-semibold shadow-lg transition-all flex items-center justify-center gap-2 ${
                !copying && sourceCollections.length > 0
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl active:scale-[0.98] cursor-pointer"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M15.988 3.012A2.25 2.25 0 0 0 14.25 2h-4.5A2.25 2.25 0 0 0 7.5 4.25v1.5H4.25A2.25 2.25 0 0 0 2 8v6a2.25 2.25 0 0 0 2.25 2.25h4.5A2.25 2.25 0 0 0 11 14v-1.5h2.75A2.25 2.25 0 0 0 16 10.25v-6a2.25 2.25 0 0 0-.012-.238ZM7.5 10.25v3.75a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75V8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v2.25Zm6-4a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-2a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v2Z" />
              </svg>
              Copy All {sourceCollections.length} Collections
            </button>
          </div>
        )}

        {/* ============ PROGRESS ============ */}
        {(copying || copyDone) && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              {copyDone ? "Copy Complete" : "Copying..."}
            </h3>

            {/* Overall progress bar (for copy-all) */}
            {overallProgress && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
                  <span>Overall</span>
                  <span>{overallProgress.completed_collections} / {overallProgress.total_collections} collections</span>
                </div>
                <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${overallProgress.total_collections ? (overallProgress.completed_collections! / overallProgress.total_collections) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Current collection progress */}
            {currentProgress && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{currentProgress.collection}</span>
                  <span>{currentProgress.copied?.toLocaleString()} / {currentProgress.total?.toLocaleString()} docs</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{
                      width: `${currentProgress.total ? (currentProgress.copied! / currentProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Completed collection log */}
            <div className="max-h-60 overflow-y-auto space-y-1 mt-4">
              {progress
                .filter((p) => p.status === "done" && p.collection)
                .map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1">
                    <span className="text-emerald-500">✓</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{p.collection}</span>
                    <span className="text-zinc-400 dark:text-zinc-500">→ {p.target_collection}</span>
                    <span className="ml-auto text-zinc-400 tabular-nums">{p.copied?.toLocaleString()} docs</span>
                  </div>
                ))}
            </div>

            {copyDone && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => { resetState(); refreshTargetCollections(); }}
                  className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Copy More
                </button>
                <Link
                  href="/connect-database"
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white text-center shadow-md transition-all hover:bg-emerald-700 active:scale-[0.98]"
                >
                  Done
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ PREVIEW MODAL ============ */}
      {previewCol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPreviewCol(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl max-h-[85vh] mx-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Preview: <span className="text-emerald-600 dark:text-emerald-400">{previewCol}</span>
                </h3>
                {!previewLoading && previewDocs.length > 0 && (
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{previewDocs.length} docs</span>
                )}
              </div>
              <button onClick={() => setPreviewCol(null)} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
              </button>
            </div>

            {/* View Tabs */}
            {!previewLoading && previewDocs.length > 0 && (
              <div className="flex items-center gap-1 px-6 pt-3 pb-1">
                {([["json", "JSON"], ["table", "Table"], ["keyval", "Key → Value"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setPreviewView(id)}
                    className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (previewView === id ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800")}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 pt-3">
              {previewLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}</div>
              ) : previewDocs.length === 0 ? (
                <p className="text-center text-zinc-400 py-8">No documents found</p>
              ) : previewView === "json" ? (
                <div className="space-y-3">
                  {previewDocs.map((doc, i) => (
                    <details key={i} open className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden">
                      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 select-none flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{i + 1}</span>
                        Document {i + 1}
                      </summary>
                      <pre className="px-4 pb-4 text-xs font-mono leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all overflow-auto max-h-72">{JSON.stringify(doc, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              ) : previewView === "table" ? (
                <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-100 dark:bg-zinc-800">
                        {(() => {
                          const keys = Array.from(new Set(previewDocs.flatMap((d) => Object.keys(d))));
                          return keys.map((k) => (
                            <th key={k} className="px-3 py-2.5 text-left font-semibold text-zinc-600 dark:text-zinc-400 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-700">{k}</th>
                          ));
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {previewDocs.map((doc, i) => {
                        const keys = Array.from(new Set(previewDocs.flatMap((d) => Object.keys(d))));
                        return (
                          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                            {keys.map((k) => {
                              const val = doc[k];
                              const display = val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
                              return (
                                <td key={k} className="px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate" title={display}>{display}</td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4">
                  {previewDocs.map((doc, i) => (
                    <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 overflow-hidden">
                      <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Document {i + 1}</span>
                      </div>
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-700/50">
                        {Object.entries(doc).map(([k, v]) => (
                          <div key={k} className="flex gap-4 px-4 py-2 text-xs">
                            <span className="shrink-0 w-32 font-semibold text-zinc-500 dark:text-zinc-400 truncate" title={k}>{k}</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300 break-all">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ STATS MODAL ============ */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowStats(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Database Stats</h3>
              <button onClick={() => setShowStats(false)} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {statsLoading ? (
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}</div>
              ) : dbStats ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  {["source", "target"].map((role) => {
                    const s = (dbStats as Record<string, Record<string, unknown>>)[role];
                    if (!s) return null;
                    return (
                      <div key={role} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 capitalize flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${role === "source" ? "bg-amber-500" : "bg-emerald-500"}`} />
                          {role === "source" ? sourceDb : targetDb}
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2">
                            <p className="text-zinc-400 dark:text-zinc-500">Collections</p>
                            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{(s.collections as number)?.toLocaleString() || 0}</p>
                          </div>
                          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2">
                            <p className="text-zinc-400 dark:text-zinc-500">Objects</p>
                            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{(s.objects as number)?.toLocaleString() || 0}</p>
                          </div>
                          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2">
                            <p className="text-zinc-400 dark:text-zinc-500">Data Size</p>
                            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{formatBytes(s.dataSize as number || 0)}</p>
                          </div>
                          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2">
                            <p className="text-zinc-400 dark:text-zinc-500">Index Size</p>
                            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">{formatBytes(s.indexSize as number || 0)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-zinc-400 py-8">No stats available</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
