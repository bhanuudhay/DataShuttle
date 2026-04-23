"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";

const SYSTEM_DBS = ["admin", "local", "config"];

interface ConnectionResult {
  success: boolean;
  source: string;
  source_databases?: string[];
  target: string;
  target_databases?: string[];
  message: string;
}

interface Session {
  active: boolean;
  source_uri?: string;
  target_uri?: string;
  source_db?: string;
  target_db?: string;
  source_databases?: string[];
  target_databases?: string[];
  source_alive: boolean;
  target_alive: boolean;
}

export default function GetStarted() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const [sourceUri, setSourceUri] = useState("");
  const [targetUri, setTargetUri] = useState("");
  const [showSourcePassword, setShowSourcePassword] = useState(false);
  const [showTargetPassword, setShowTargetPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  const [step, setStep] = useState<"connect" | "select-db">("connect");
  const [selectedSourceDb, setSelectedSourceDb] = useState<string | null>(null);
  const [selectedTargetDb, setSelectedTargetDb] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<"existing" | "create">("existing");
  const [newDbName, setNewDbName] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [creatingDb, setCreatingDb] = useState(false);
  const [createDbError, setCreateDbError] = useState("");

  // backup
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [backupDbName, setBackupDbName] = useState("");
  const [backupProgress, setBackupProgress] = useState<{ total?: number; completed?: number; current?: string } | null>(null);

  useEffect(() => {
    if (!backupDone) return;
    const timer = setTimeout(() => {
      setBackupDone(false);
      setBackupRunning(false);
      setBackupDbName("");
      setBackupProgress(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [backupDone]);

  const isSourceValid = sourceUri.startsWith("mongodb");
  const isTargetValid = targetUri.startsWith("mongodb");
  const isSameUri = sourceUri.trim().length > 0 && sourceUri.trim() === targetUri.trim();
  const canConnect = sourceUri.length > 0 && targetUri.length > 0 && !isSameUri && !loading;

  const sourceDbs = (result?.source_databases || []).filter(
    (db) => !SYSTEM_DBS.includes(db)
  );
  const targetDbs = (result?.target_databases || []).filter(
    (db) => !SYSTEM_DBS.includes(db)
  );

  const finalTargetDb = targetMode === "create" ? newDbName.trim() : selectedTargetDb;
  const canContinue = selectedSourceDb && finalTargetDb && finalTargetDb.length > 0;

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    async function restoreSession() {
      try {
        const res = await fetch(`${API_URL}/api/session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setSessionLoading(false); return; }
        const session: Session = await res.json();

        if (session.active && session.source_alive && session.target_alive) {
          setHasActiveSession(true);
          setSourceUri(session.source_uri || "");
          setTargetUri(session.target_uri || "");

          const sDbs = (session.source_databases || []).filter(db => !SYSTEM_DBS.includes(db));
          const tDbs = (session.target_databases || []).filter(db => !SYSTEM_DBS.includes(db));

          setResult({
            success: true,
            source: "Connected successfully",
            source_databases: sDbs,
            target: "Connected successfully",
            target_databases: tDbs,
            message: "Connection established",
          });

          if (session.source_db) setSelectedSourceDb(session.source_db);
          if (session.target_db) setSelectedTargetDb(session.target_db);

          setStep("select-db");
        }
      } catch {
        // session fetch failed — start fresh
      } finally {
        setSessionLoading(false);
      }
    }
    restoreSession();
  }, [token]);

  async function handleConnect() {
    if (!canConnect) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/test-connection`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          source_uri: sourceUri,
          target_uri: targetUri,
        }),
      });
      const data: ConnectionResult = await res.json();
      setResult(data);
      if (data.success) {
        setHasActiveSession(true);
        setStep("select-db");
      }
    } catch {
      setResult({
        success: false,
        source: "Could not reach the server",
        target: "Could not reach the server",
        message: "Connection failed — is the backend running?",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("connect");
    setSelectedSourceDb(null);
    setSelectedTargetDb(null);
    setTargetMode("existing");
    setNewDbName("");
  }

  async function handleContinue() {
    if (!canContinue) return;

    await fetch(`${API_URL}/api/session`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        source_uri: sourceUri,
        target_uri: targetUri,
        source_db: selectedSourceDb,
        target_db: finalTargetDb,
        source_databases: result?.source_databases || [],
        target_databases: result?.target_databases || [],
      }),
    });

    router.push(`/collections?source_db=${encodeURIComponent(selectedSourceDb!)}&target_db=${encodeURIComponent(finalTargetDb!)}`);
  }

  async function handleBackup() {
    if (!selectedSourceDb) return;
    if (!confirm(`Backup "${selectedSourceDb}" to a new database on the target? This will copy all collections.`)) return;
    setBackupRunning(true);
    setBackupDone(false);
    setBackupDbName("");
    setBackupProgress(null);

    try {
      const res = await fetch(`${API_URL}/api/backup`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ source_db: selectedSourceDb }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

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
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "overall") {
                setBackupProgress({ total: evt.total_collections, completed: evt.completed_collections, current: evt.current });
                if (evt.status === "done") {
                  setBackupDone(true);
                  setBackupRunning(false);
                }
              }
              if (evt.type === "backup_done") {
                setBackupDbName(evt.backup_db);
                setBackupDone(true);
                setBackupRunning(false);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      setBackupRunning(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch(`${API_URL}/api/session`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      // ignore
    }
    setHasActiveSession(false);
    setStep("connect");
    setSourceUri("");
    setTargetUri("");
    setResult(null);
    setSelectedSourceDb(null);
    setSelectedTargetDb(null);
    setTargetMode("existing");
    setNewDbName("");
  }

  async function refreshTargetDbs() {
    try {
      const res = await fetch(`${API_URL}/api/databases/target`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && result) {
        setResult({
          ...result,
          target_databases: data.databases,
        });
      }
    } catch {
      // ignore
    }
  }

  async function handleCreateDatabase() {
    const name = newDbName.trim();
    if (!name) return;
    setCreatingDb(true);
    setCreateDbError("");

    try {
      const res = await fetch(`${API_URL}/api/database/create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ db_name: name }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshTargetDbs();
        setSelectedTargetDb(name);
        setTargetMode("existing");
        setNewDbName("");
      } else {
        setCreateDbError(data.detail || data.message || "Failed to create database");
      }
    } catch {
      setCreateDbError("Could not reach the server");
    } finally {
      setCreatingDb(false);
    }
  }

  if (authLoading || !user || sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline mb-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
          Back to Home
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            step === "connect"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
          }`}>
            {step === "select-db" ? "✓" : "1"}
          </span>
          <span className={`text-sm font-medium ${
            step === "connect" ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400 dark:text-zinc-500"
          }`}>
            Connect
          </span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            step === "select-db"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
          }`}>
            2
          </span>
          <span className={`text-sm font-medium ${
            step === "select-db" ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400 dark:text-zinc-500"
          }`}>
            Select Database
          </span>
        </div>

        {/* ==================== STEP 1: CONNECT ==================== */}
        {step === "connect" && (
          <>
            <div className="mb-10">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                <span className="text-zinc-900 dark:text-zinc-50">Connect </span>
                <span className="text-emerald-600 dark:text-emerald-400">Your Databases</span>
              </h1>
              <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Enter the MongoDB connection URIs for the database you want to copy
                data <strong className="text-zinc-800 dark:text-zinc-200">from</strong> (source) and the database you want to copy
                data <strong className="text-zinc-800 dark:text-zinc-200">to</strong> (target).
              </p>
            </div>

            <div className="space-y-8">
              {/* Source URI */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-amber-600 dark:text-amber-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Source Database</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">The database you want to copy data from</p>
                  </div>
                </div>
                <label htmlFor="source-uri" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">MongoDB URI</label>
                <div className="relative">
                  <input
                    id="source-uri"
                    type={showSourcePassword ? "text" : "password"}
                    value={sourceUri}
                    onChange={(e) => setSourceUri(e.target.value)}
                    placeholder="mongodb://username:password@host:27017/dbname"
                    className={`w-full rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 pr-20 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all focus:ring-2 ${
                      sourceUri.length === 0
                        ? "border-zinc-300 dark:border-zinc-700 focus:ring-emerald-500/30 focus:border-emerald-500"
                        : isSourceValid
                          ? "border-emerald-400 dark:border-emerald-600 focus:ring-emerald-500/30 focus:border-emerald-500"
                          : "border-red-400 dark:border-red-600 focus:ring-red-500/30 focus:border-red-500"
                    }`}
                  />
                  <button type="button" onClick={() => setShowSourcePassword(!showSourcePassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                    {showSourcePassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.092 1.092a4 4 0 0 0-5.558-5.558Z" clipRule="evenodd" /><path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 4.09 5.12L6.3 7.33a4 4 0 0 0 4.448 4.448Z" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>
                    )}
                  </button>
                </div>
                {sourceUri.length > 0 && !isSourceValid && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">URI should start with <code className="font-mono">mongodb://</code> or <code className="font-mono">mongodb+srv://</code></p>
                )}
                {result?.source && (
                  <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${result.source.startsWith("Connected") ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"}`}>
                    <span className="mt-0.5 shrink-0">{result.source.startsWith("Connected") ? "✓" : "✗"}</span>
                    <span>{result.source}</span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-emerald-500">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              {/* Target URI */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-emerald-600 dark:text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Target Database</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Your local database where data will be dumped</p>
                  </div>
                </div>
                <label htmlFor="target-uri" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">MongoDB URI</label>
                <div className="relative">
                  <input
                    id="target-uri"
                    type={showTargetPassword ? "text" : "password"}
                    value={targetUri}
                    onChange={(e) => setTargetUri(e.target.value)}
                    placeholder="mongodb://localhost:27017/mydb"
                    className={`w-full rounded-xl border bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 pr-20 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all focus:ring-2 ${
                      targetUri.length === 0
                        ? "border-zinc-300 dark:border-zinc-700 focus:ring-emerald-500/30 focus:border-emerald-500"
                        : isTargetValid
                          ? "border-emerald-400 dark:border-emerald-600 focus:ring-emerald-500/30 focus:border-emerald-500"
                          : "border-red-400 dark:border-red-600 focus:ring-red-500/30 focus:border-red-500"
                    }`}
                  />
                  <button type="button" onClick={() => setShowTargetPassword(!showTargetPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                    {showTargetPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.092 1.092a4 4 0 0 0-5.558-5.558Z" clipRule="evenodd" /><path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 4.09 5.12L6.3 7.33a4 4 0 0 0 4.448 4.448Z" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>
                    )}
                  </button>
                </div>
                {targetUri.length > 0 && !isTargetValid && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">URI should start with <code className="font-mono">mongodb://</code> or <code className="font-mono">mongodb+srv://</code></p>
                )}
                {result?.target && (
                  <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${result.target.startsWith("Connected") ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"}`}>
                    <span className="mt-0.5 shrink-0">{result.target.startsWith("Connected") ? "✓" : "✗"}</span>
                    <span>{result.target}</span>
                  </div>
                )}
              </div>

              {isSameUri && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center gap-2">
                  <span className="text-amber-600 dark:text-amber-400 text-sm">⚠</span>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                    Source and target URIs cannot be the same.
                  </p>
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={!canConnect}
                className={`w-full rounded-xl py-3.5 text-sm font-semibold shadow-md transition-all ${
                  canConnect
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                }`}
              >
                {loading ? "Connecting..." : "Connect & Continue"}
              </button>

              {result && !result.success && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">✗ Connection failed</p>
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                    Please check the failing database URI above. If you&apos;re connecting to a remote database, try using a VPN or verify your IP is whitelisted in the database network settings.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-5">
                  <strong className="text-zinc-700 dark:text-zinc-300">Tip:</strong>{" "}
                  Your URI typically looks like{" "}
                  <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 font-mono text-[11px]">mongodb://user:pass@host:27017/db</code>{" "}
                  for a local server or{" "}
                  <code className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 font-mono text-[11px]">mongodb+srv://user:pass@cluster.mongodb.net/db</code>{" "}
                  for MongoDB Atlas.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ==================== STEP 2: SELECT DATABASE ==================== */}
        {step === "select-db" && (
          <>
            <div className="mb-10">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                <span className="text-zinc-900 dark:text-zinc-50">Select </span>
                <span className="text-emerald-600 dark:text-emerald-400">Databases</span>
              </h1>
              <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Choose which database to copy <strong className="text-zinc-800 dark:text-zinc-200">from</strong> and where to dump the data <strong className="text-zinc-800 dark:text-zinc-200">to</strong>.
              </p>
            </div>

            {/* Connection summary */}
            <div className="mb-8 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              <div className="flex-1">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">Both connections established successfully</p>
                {hasActiveSession && (
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Session restored — connections are still alive</p>
                )}
              </div>
              <button onClick={handleDisconnect} className="text-xs font-medium text-red-500 dark:text-red-400 hover:underline">
                Disconnect
              </button>
              <button onClick={handleBack} className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                Change URIs
              </button>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              {/* Source DB selector */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-amber-600 dark:text-amber-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Source</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Copy data from</p>
                  </div>
                </div>

                <div className={`space-y-2 ${sourceDbs.length > 5 ? "max-h-[260px] overflow-y-auto pr-1" : ""}`} style={{ scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
                  {sourceDbs.length === 0 ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No databases found</p>
                  ) : (
                    sourceDbs.map((db) => (
                      <button
                        key={db}
                        onClick={() => setSelectedSourceDb(db)}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                          selectedSourceDb === db
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 ${selectedSourceDb === db ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-sm font-medium ${selectedSourceDb === db ? "text-amber-700 dark:text-amber-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                          {db}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Target DB selector */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-emerald-600 dark:text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Target</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Dump data to</p>
                  </div>
                </div>

                {/* Toggle: existing / create new */}
                <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 mb-4">
                  <button
                    onClick={() => { setTargetMode("existing"); setNewDbName(""); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      targetMode === "existing"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    Use Existing
                  </button>
                  <button
                    onClick={() => { setTargetMode("create"); setSelectedTargetDb(null); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      targetMode === "create"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    Create New
                  </button>
                </div>

                {targetMode === "existing" ? (
                  <div className={`space-y-2 ${targetDbs.length > 5 ? "max-h-[260px] overflow-y-auto pr-1" : ""}`} style={{ scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
                    {targetDbs.length === 0 ? (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No databases found</p>
                    ) : (
                      targetDbs.map((db) => (
                        <button
                          key={db}
                          onClick={() => setSelectedTargetDb(db)}
                          className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                            selectedTargetDb === db
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 ${selectedTargetDb === db ? "text-emerald-500" : "text-zinc-300 dark:text-zinc-600"}`}>
                            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                          </svg>
                          <span className={`text-sm font-medium ${selectedTargetDb === db ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                            {db}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="new-db" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      New database name
                    </label>
                    <input
                      id="new-db"
                      type="text"
                      value={newDbName}
                      onChange={(e) => { setNewDbName(e.target.value); setCreateDbError(""); }}
                      placeholder="my_new_database"
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    />
                    {createDbError && (
                      <p className="mt-2 text-xs text-red-500 dark:text-red-400">{createDbError}</p>
                    )}
                    <button
                      onClick={handleCreateDatabase}
                      disabled={!newDbName.trim() || creatingDb}
                      className={`mt-3 w-full rounded-xl py-2.5 text-xs font-semibold transition-all ${
                        newDbName.trim() && !creatingDb
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] cursor-pointer"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      {creatingDb ? "Creating..." : "Create Database"}
                    </button>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      The database will be created on your target server and appear in the list.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Backup progress / result */}
            {(backupRunning || backupDone) && (
              <div className="mt-6 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-600 dark:text-blue-400">
                    <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06V3.44a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 2.5a9.006 9.006 0 0 0-4.25 1.065v13.254ZM9.25 4.565A9.006 9.006 0 0 0 5 2.5a9.006 9.006 0 0 0-2.454.219A.75.75 0 0 0 2 3.44v11.62a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5a7.462 7.462 0 0 1 4.25 1.32V4.565Z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    {backupDone ? "Backup Complete" : "Backing up..."}
                  </h3>
                </div>

                {backupProgress && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 mb-1.5">
                      <span>{backupProgress.current ? `Copying ${backupProgress.current}` : "Starting..."}</span>
                      <span>{backupProgress.completed || 0} / {backupProgress.total || 0}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-blue-200 dark:bg-blue-900/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${backupProgress.total ? ((backupProgress.completed || 0) / backupProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {backupDone && backupDbName && (
                  <div className="rounded-lg bg-white dark:bg-zinc-800/60 border border-blue-200 dark:border-blue-800/40 px-3 py-2 flex items-center gap-2">
                    <span className="text-emerald-500">✓</span>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      Backup saved to <strong className="font-mono text-blue-700 dark:text-blue-300">{backupDbName}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-8 flex gap-3">
              <button
                onClick={handleBack}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-6 py-3.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98]"
              >
                Back
              </button>
              <button
                onClick={handleBackup}
                disabled={!selectedSourceDb || backupRunning}
                className={`rounded-xl px-5 py-3.5 text-sm font-semibold shadow-md transition-all flex items-center gap-2 ${
                  selectedSourceDb && !backupRunning
                    ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06V3.44a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 2.5a9.006 9.006 0 0 0-4.25 1.065v13.254ZM9.25 4.565A9.006 9.006 0 0 0 5 2.5a9.006 9.006 0 0 0-2.454.219A.75.75 0 0 0 2 3.44v11.62a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5a7.462 7.462 0 0 1 4.25 1.32V4.565Z" />
                </svg>
                {backupRunning ? "Backing up..." : "Backup"}
              </button>
              <button
                onClick={handleContinue}
                disabled={!canContinue || backupRunning}
                className={`flex-1 rounded-xl py-3.5 text-sm font-semibold shadow-md transition-all ${
                  canContinue && !backupRunning
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                }`}
              >
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
