"use client";

import { useState, FormEvent } from "react";

type State = "idle" | "submitting" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const hasError = searchParams?.get("error") === "invalid";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setState("sent");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

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
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
        {hasError && state === "idle" && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
            That login link is invalid or has expired. Please request a new one.
          </div>
        )}

        {state === "sent" ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-white font-medium text-lg mb-2">
              Check your email
            </h2>
            <p className="text-slate-400 text-sm">
              If your email is authorized, you will receive a login link
              shortly. The link expires in 10 minutes.
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("");
                setState("idle");
              }}
              className="mt-6 text-blue-400 hover:text-blue-300 text-sm underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-white font-medium text-lg mb-1">Sign in</h2>
            <p className="text-slate-400 text-sm mb-6">
              Enter your authorized email address to receive a one-time login
              link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
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
                <p className="text-red-400 text-sm">
                  Something went wrong. Please try again.
                </p>
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
        )}
      </div>

      {/* Classification notice */}
      <p className="mt-8 text-slate-600 text-xs text-center max-w-sm">
        Access to this system is restricted to authorized personnel only.
        Unauthorized access is prohibited and may be subject to criminal
        prosecution.
      </p>
    </div>
  );
}
