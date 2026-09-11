import type { MetadataRoute } from "next";
import { PRODUCT_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: "Leads, quotes, jobs and invoicing for one-man-band roofers — run from your phone.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1f7a3f",
    icons: [
      { src: "/pwa-icon-192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
