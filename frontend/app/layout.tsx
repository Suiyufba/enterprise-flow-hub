import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "./components/AuthGate";
import { AuthProvider } from "./lib/auth-context";
import { ToastProvider } from "./lib/toast-context";
import { WorkspaceProvider } from "./lib/workspace-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <WorkspaceProvider>
            <AuthProvider>
              <AuthGate>
                {children}
              </AuthGate>
            </AuthProvider>
          </WorkspaceProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
