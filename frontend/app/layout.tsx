import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "./components/AuthGate";
import { AuthProvider } from "./lib/auth-context";
import { ToastProvider } from "./lib/toast-context";
import { WorkspaceProvider } from "./lib/workspace-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowHub - 智能业务工作台",
  description: "让 Agent 在明确的数据范围内完成企业业务操作。",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <AuthGate>
                {children}
              </AuthGate>
            </WorkspaceProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
