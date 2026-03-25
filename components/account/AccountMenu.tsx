"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  email: string;
  activeScopeLabel?: string;
}

function getInitials(email: string): string {
  const localPart = email.split("@")[0] ?? "U";
  const tokens = localPart
    .split(/[.\-_ ]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase();
}

export default function AccountMenu({ email, activeScopeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => getInitials(email), [email]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="surface-card-soft ops-focus-ring inline-flex items-center gap-3 rounded-full px-3 py-2 text-left"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-xs font-semibold text-[color:var(--foreground)]">
          {initials}
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--text-subtle)]">
            Account
          </p>
          <p className="max-w-[12rem] truncate text-sm font-medium text-[color:var(--foreground)]">
            {email}
          </p>
        </div>
      </button>

      {open ? (
        <div
          role="menu"
          className="surface-card absolute right-0 top-full z-50 mt-3 w-[18.5rem] rounded-[1.2rem] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.34)]"
        >
          <div className="border-b border-[rgba(140,172,197,0.12)] pb-3">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">{email}</p>
            {activeScopeLabel ? (
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Active scope: {activeScopeLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Manage your identity, password, and uploads.
              </p>
            )}
          </div>

          <div className="mt-3 space-y-1">
            <Link
              href="/profile"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
              onClick={() => setOpen(false)}
            >
              Manage Profile
            </Link>
            <Link
              href="/profile#password-access"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
              onClick={() => setOpen(false)}
            >
              Password & Access
            </Link>
            <Link
              href="/profile#owned-content"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
              onClick={() => setOpen(false)}
            >
              My Content
            </Link>
          </div>

          <div className="mt-3 border-t border-[rgba(140,172,197,0.12)] pt-3">
            <Link
              href="/api/auth/signout"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => setOpen(false)}
            >
              Sign Out
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
