import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { CURRENT_WORKSPACE_ID } from "@/lib/db/workspace";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mass Poster — Internal",
  description:
    "AI short-form content generation + multi-account social posting (internal SaaS).",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  let workspaceName = 'Workspace';
  let planLabel = 'INTERNAL';
  if (session) {
    const supabase = getSupabaseAdmin();
    const { data: ws } = await supabase
      .from('workspace')
      .select('name, plan')
      .eq('id', CURRENT_WORKSPACE_ID)
      .maybeSingle();
    if (ws) {
      workspaceName = (ws.name as string) ?? 'Workspace';
      planLabel = ((ws.plan as string) ?? 'internal').toUpperCase();
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-bg-canvas text-text-primary">
        <ToastProvider>
          <AppShell
            session={session ? { email: session.email } : null}
            workspaceName={workspaceName}
            planLabel={planLabel}
          >
            {children}
          </AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
