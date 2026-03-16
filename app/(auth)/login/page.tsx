"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import HealthStatus from "@/components/ui/HealthStatus";

// ─── Magic Link form ──────────────────────────────────────────────────────────

type MagicState = "idle" | "submitting" | "sent" | "error";

function MagicLinkForm({ hasError }: { hasError: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<MagicState>("idle");

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-white font-medium text-lg mb-2">Check your email</h2>
        <p className="text-slate-400 text-sm">
          If your email is authorized, you will receive a login link shortly. The
          link expires in 10 minutes.
        </p>
        <button
          type="button"
          onClick={() => { setEmail(""); setState("idle"); }}
          className="mt-6 text-blue-400 hover:text-blue-300 text-sm underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="text-slate-400 text-sm mb-6">
        Enter your authorized email address to receive a one-time login link.
      </p>

      {hasError && state === "idle" && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          That login link is invalid or has expired. Please request a new one.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ml-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="ml-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "submitting"}
            placeholder="you@aleutfederal.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {state === "error" && (
          <p className="text-red-400 text-sm">Something went wrong. Please try again.</p>
        )}

        <button
          type="submit"
          disabled={state === "submitting" || !email}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          {state === "submitting" ? "Sending…" : "Send login link"}
        </button>
      </form>
    </>
  );
}

// ─── Password form ────────────────────────────────────────────────────────────

type PasswordState = "idle" | "submitting" | "error";

function PasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<PasswordState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      const data = await res.json().catch(() => ({}));
      setErrorMsg(
        res.status === 401
          ? "Invalid email or password."
          : (data as { error?: string }).error ?? "Something went wrong."
      );
      setState("error");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }

  return (
    <>
      <p className="text-slate-400 text-sm mb-6">
        Sign in with your email address and password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pw-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="pw-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "submitting"}
            placeholder="you@aleutfederal.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="pw-password" className="block text-sm font-medium text-slate-300 mb-1">
            Password
          </label>
          <input
            id="pw-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={state === "submitting"}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {state === "error" && errorMsg && (
          <p className="text-red-400 text-sm">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={state === "submitting" || !email || !password}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          {state === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}

// ─── Login page ───────────────────────────────────────────────────────────────

type Tab = "magic" | "password";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("magic");

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const hasError = searchParams?.get("error") === "invalid";

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="w-full max-w-md mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900 mb-4">
          <svg
            className="w-8 h-8 text-blue-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white">
          Aleut Federal Media Gallery
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Secure Media Library</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl border border-slate-700">
        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            type="button"
            onClick={() => setTab("magic")}
            className={`flex-1 py-3 text-sm font-medium rounded-tl-lg transition-colors focus:outline-none ${
              tab === "magic"
                ? "bg-slate-800 text-white border-b-2 border-blue-500"
                : "bg-slate-900/40 text-slate-400 hover:text-slate-300"
            }`}
          >
            Magic Link
          </button>
          <button
            type="button"
            onClick={() => setTab("password")}
            className={`flex-1 py-3 text-sm font-medium rounded-tr-lg transition-colors focus:outline-none ${
              tab === "password"
                ? "bg-slate-800 text-white border-b-2 border-blue-500"
                : "bg-slate-900/40 text-slate-400 hover:text-slate-300"
            }`}
          >
            Password
          </button>
        </div>

        {/* Tab content */}
        <div className="p-8">
          <h2 className="text-white font-medium text-lg mb-1">
            {tab === "magic" ? "Sign in with email link" : "Sign in with password"}
          </h2>

          {tab === "magic" ? (
            <MagicLinkForm hasError={hasError} />
          ) : (
            <PasswordForm />
          )}
        </div>
      </div>

      {/* Health status panel */}
      <HealthStatus />

      {/* Classification notice */}
      <p className="mt-6 text-slate-600 text-xs text-center max-w-sm">
        Access to this system is restricted to authorized personnel only.
        Unauthorized access is prohibited and may be subject to criminal
        prosecution.
      </p>
    </div>
  );
}
