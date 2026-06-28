import type {Metadata} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BetterCodex Store",
  description: "Community plugins, themes, and skills for BetterCodex.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
