import localFont from "next/font/local";

/** Self-hosted so production builds do not fetch Google Fonts (Render/Turbopack). */
export const carouselFont = localFont({
  src: [
    {
      path: "../../fonts/roboto/roboto-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/roboto/roboto-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../fonts/roboto/roboto-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../fonts/roboto/roboto-latin-500-italic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../fonts/roboto/roboto-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/roboto/roboto-latin-700-italic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "../../fonts/roboto/roboto-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "../../fonts/roboto/roboto-latin-900-italic.woff2",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-carousel",
  display: "swap",
  adjustFontFallback: false,
});
