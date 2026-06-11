import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Talk to Jenny — A1Potential Support",
  description:
    "Get instant help with A1Potential — features, pricing, and your account — from Jenny, our AI support specialist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, background: "#080610" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
