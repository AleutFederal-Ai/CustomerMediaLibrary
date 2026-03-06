export default function CuiBanner() {
  return (
    <div
      role="banner"
      aria-label="CUI classification notice"
      className="w-full bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium"
    >
      <span className="font-bold">
        &#9888; CONTROLLED UNCLASSIFIED INFORMATION (CUI)
      </span>
      <span className="hidden sm:inline">
        {" — "}
        This system may contain Controlled Unclassified Information. Handle in
        accordance with applicable laws, regulations, and organizational
        policies. Unauthorized disclosure is prohibited.
      </span>
    </div>
  );
}
