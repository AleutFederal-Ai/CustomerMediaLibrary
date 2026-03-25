import { redirect } from "next/navigation";

export default async function GalleryHomePage() {
  redirect("/select-tenant");
}
