import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "OnChainDrips",
  description: "OnChainDrips Sui + Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Header />
        <main className="relative z-10 pt-20 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
