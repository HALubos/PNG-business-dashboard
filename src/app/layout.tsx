import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obchodní dashboard — ACTIVENT365",
  description:
    "Modulární obchodní dashboard pro řízení obchodní agendy ACTIVENT365.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
