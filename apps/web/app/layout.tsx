import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
