export default function CuiBanner() {
  return (
    <div
      role="banner"
      aria-label="CUI classification notice"
      className="border-b border-[rgba(241,197,108,0.22)] bg-[linear-gradient(90deg,rgba(91,62,11,0.96),rgba(140,101,20,0.92),rgba(91,62,11,0.96))] px-4 py-2.5 text-center text-[0.76rem] font-semibold uppercase tracking-[0.18em] text-[#fff2c5]"
    >
      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/18 bg-black/12 text-[0.65rem]">
        !
      </span>
      Controlled Unclassified Information
      <span className="hidden text-[0.68rem] tracking-[0.14em] text-[#ffe9ab] sm:inline">
        {" "}
        - Handle in accordance with applicable laws, regulations, and organizational policy.
      </span>
    </div>
  );
}
