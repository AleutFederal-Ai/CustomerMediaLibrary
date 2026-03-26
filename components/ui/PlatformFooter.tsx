import {
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_COPYRIGHT,
  PLATFORM_RIGHTS_RESERVED,
} from "@/lib/platform-config";
import { PageWidth } from "@/components/ui/AppFrame";

export default function PlatformFooter() {
  return (
    <footer className="border-t border-[rgba(148,163,184,0.18)] bg-white/92 backdrop-blur">
      <PageWidth className="flex flex-col gap-2 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {PLATFORM_COPYRIGHT}. {PLATFORM_RIGHTS_RESERVED}
        </p>
        <a
          href={`mailto:${PLATFORM_CONTACT_EMAIL}`}
          className="font-medium text-slate-900 hover:text-slate-700"
        >
          Contact: {PLATFORM_CONTACT_EMAIL}
        </a>
      </PageWidth>
    </footer>
  );
}
