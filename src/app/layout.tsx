import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "راهیار | دستیار هوشمند دانش بانکی",
  description: "دستیار فارسی مبتنی بر بازیابی دانش سازمانی با دسترسی امن و تفکیک‌شده بر اساس واحد.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
