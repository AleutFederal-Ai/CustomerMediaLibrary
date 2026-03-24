"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { OwnedMediaSummary, UserProfileSummary } from "@/types";

interface Props {
  initialProfile: UserProfileSummary;
  ownedContent: OwnedMediaSummary[];
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

export default function ProfileWorkspace({
  initialProfile,
  ownedContent,
}: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initialProfile.displayName ?? "");
  const [jobTitle, setJobTitle] = useState(initialProfile.jobTitle ?? "");
  const [organization, setOrganization] = useState(
    initialProfile.organization ?? ""
  );
  const [phoneNumber, setPhoneNumber] = useState(
    initialProfile.phoneNumber ?? ""
  );
  const [officeLocation, setOfficeLocation] = useState(
    initialProfile.officeLocation ?? ""
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const response = await apiFetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          jobTitle,
          organization,
          phoneNumber,
          officeLocation,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setProfileError(data.error ?? "Failed to update profile.");
        return;
      }

      setProfileMessage("Profile updated.");
      router.refresh();
    } catch {
      setProfileError("Network error while updating profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (nextPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      const response = await apiFetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPasswordError(data.error ?? "Failed to update password.");
        return;
      }

      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
      router.refresh();
    } catch {
      setPasswordError("Network error while updating password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.7fr)]">
        <form
          onSubmit={handleProfileSave}
          className="surface-card rounded-[1.35rem] p-5 sm:p-6"
        >
          <div className="space-y-2">
            <p className="hero-kicker">Profile Details</p>
            <h2 className="section-title">Manage your operator profile</h2>
            <p className="section-copy">
              Update the account details other operators will recognize across
              the platform.
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-white/86">
                Email
              </label>
              <div className="surface-card-soft rounded-[1rem] px-4 py-3 text-sm text-white">
                {initialProfile.email}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="ops-input"
                placeholder="Your preferred display name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                className="ops-input"
                placeholder="Program Manager"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                Organization
              </label>
              <input
                type="text"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                className="ops-input"
                placeholder="Aleut Federal"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                Phone Number
              </label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                className="ops-input"
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-white/86">
                Office Location
              </label>
              <input
                type="text"
                value={officeLocation}
                onChange={(event) => setOfficeLocation(event.target.value)}
                className="ops-input"
                placeholder="Anchorage, AK"
              />
            </div>
          </div>

          {profileMessage ? (
            <div className="ops-success-panel mt-4 rounded-[1rem] px-4 py-3 text-sm">
              {profileMessage}
            </div>
          ) : null}
          {profileError ? (
            <div className="ops-danger-panel mt-4 rounded-[1rem] px-4 py-3 text-sm">
              {profileError}
            </div>
          ) : null}

          <div className="mt-5">
            <button
              type="submit"
              disabled={savingProfile}
              className="ops-button"
            >
              {savingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        <aside className="surface-card-soft rounded-[1.2rem] p-5">
          <p className="hero-kicker">Account Status</p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
            Access snapshot
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip chip-accent">
              Password
              <strong>{initialProfile.hasPassword ? "Configured" : "Not Set"}</strong>
            </span>
            {initialProfile.isPlatformAdmin ? (
              <span className="chip">
                Role
                <strong>Platform Admin</strong>
              </span>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="metric-label">Last Login</p>
              <p className="mt-1 text-sm text-white">
                {initialProfile.lastLoginAt
                  ? new Date(initialProfile.lastLoginAt).toLocaleString()
                  : "Unavailable"}
              </p>
            </div>
            <div>
              <p className="metric-label">Login Count</p>
              <p className="mt-1 text-sm text-white">
                {initialProfile.loginCount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="metric-label">Owned Uploads</p>
              <p className="mt-1 text-sm text-white">
                {ownedContent.length.toLocaleString()}
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section
        id="password-access"
        className="surface-card rounded-[1.35rem] p-5 sm:p-6"
      >
        <div className="space-y-2">
          <p className="hero-kicker">Password & Access</p>
          <h2 className="section-title">Reset your password</h2>
          <p className="section-copy">
            {initialProfile.hasPassword
              ? "Confirm your current password before setting a new one."
              : "No password is configured yet. Set one here to enable password sign-in in addition to magic-link access."}
          </p>
        </div>

        <form onSubmit={handlePasswordSave} className="mt-5 grid gap-4 sm:grid-cols-2">
          {initialProfile.hasPassword ? (
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-white/86">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="ops-input"
                autoComplete="current-password"
              />
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              New Password
            </label>
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              className="ops-input"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="ops-input"
              autoComplete="new-password"
            />
          </div>

          {passwordMessage ? (
            <div className="ops-success-panel rounded-[1rem] px-4 py-3 text-sm sm:col-span-2">
              {passwordMessage}
            </div>
          ) : null}
          {passwordError ? (
            <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm sm:col-span-2">
              {passwordError}
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingPassword}
              className="ops-button"
            >
              {savingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      <section
        id="owned-content"
        className="surface-card rounded-[1.35rem] p-5 sm:p-6"
      >
        <div className="space-y-2">
          <p className="hero-kicker">My Content</p>
          <h2 className="section-title">Media you uploaded</h2>
          <p className="section-copy">
            Review the latest media items attributed to your account across the
            platform.
          </p>
        </div>

        {ownedContent.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="ops-table text-sm">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Tenant</th>
                  <th>Album</th>
                  <th>Uploaded</th>
                  <th>Size</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {ownedContent.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="space-y-1">
                        <p className="font-medium text-white">{item.fileName}</p>
                        <span className="ops-badge ops-badge-info">
                          {item.fileType}
                        </span>
                      </div>
                    </td>
                    <td className="text-white">{item.tenantName}</td>
                    <td className="text-white">{item.albumName}</td>
                    <td className="ops-muted whitespace-nowrap">
                      {new Date(item.uploadedAt).toLocaleString()}
                    </td>
                    <td className="ops-muted">{formatFileSize(item.sizeBytes)}</td>
                    <td>
                      {item.tenantSlug ? (
                        <Link
                          href={`/api/sessions/current?tenantId=${encodeURIComponent(
                            item.tenantId
                          )}&next=${encodeURIComponent(`/t/${item.tenantSlug}`)}`}
                          className="ops-button-ghost !w-auto text-sm"
                        >
                          Open Tenant
                        </Link>
                      ) : (
                        <span className="ops-muted text-xs">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-empty mt-5">
            <p className="text-lg font-semibold text-white">
              No uploaded media yet.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm">
              Once you upload images or video into an approved tenant album, the
              latest items you own will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
