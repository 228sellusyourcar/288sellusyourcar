import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "288 Sell Us Your Car | Sell Your Car on the Mississippi Gulf Coast",
  description: "Get a fast, straightforward offer for your vehicle. No purchase required. Serving Gulfport, Biloxi and the Mississippi Gulf Coast.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
