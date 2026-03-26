export const PLATFORM_TITLE = "Aleut Federal myMedia Platform";

export const PLATFORM_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PLATFORM_CONTACT_EMAIL ??
  "geoff.vaughan@aleutfederal.us";

export const PLATFORM_COPYRIGHT =
  process.env.NEXT_PUBLIC_PLATFORM_COPYRIGHT ??
  `Copyright ${new Date().getFullYear()} Aleut Federal`;

export const PLATFORM_RIGHTS_RESERVED =
  process.env.NEXT_PUBLIC_PLATFORM_RIGHTS_RESERVED ?? "All rights reserved.";
