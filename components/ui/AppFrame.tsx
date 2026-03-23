import Link from "next/link";
import { ReactNode } from "react";

function joinClasses(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={joinClasses("app-shell", className)}>{children}</div>;
}

export function PageWidth({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClasses(
        "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TopBar({
  children,
  accentColor,
}: {
  children: ReactNode;
  accentColor?: string;
}) {
  return (
    <>
      {accentColor ? (
        <div className="shell-band" style={{ backgroundColor: accentColor }} />
      ) : (
        <div className="shell-band" />
      )}
      <header className="shell-topbar">
        <PageWidth className="flex flex-wrap items-center justify-between gap-4 py-4">
          {children}
        </PageWidth>
      </header>
    </>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="shell-nav-link ops-focus-ring">
      {children}
    </Link>
  );
}

export function HeroSection({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={joinClasses(
        "surface-card rounded-[1.75rem] px-6 py-8 sm:px-8 sm:py-10",
        className
      )}
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <p className="hero-kicker">{eyebrow}</p>
          <div className="space-y-4">
            <h1 className="hero-title">{title}</h1>
            {description ? <p className="hero-subtitle">{description}</p> : null}
          </div>
          {meta ? <div className="flex flex-wrap gap-3">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <p className="hero-kicker">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-copy max-w-3xl">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  subtext,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
}) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {subtext ? <p className="metric-subtext">{subtext}</p> : null}
    </div>
  );
}
