import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "./components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Sidebar />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
