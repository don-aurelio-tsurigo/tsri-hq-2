import { Roboto } from "next/font/google";

export const carouselFont = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-carousel",
});
