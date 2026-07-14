import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Black Hole Geodesic Lab",
  description:
    "An interactive portfolio demo that traces Schwarzschild null geodesics to visualize light bending around a black hole.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
