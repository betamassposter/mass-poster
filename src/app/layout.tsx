import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/auth/session";

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
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg tracking-tight">
              Mass Poster
              <span className="ml-2 text-xs font-medium text-zinc-500">
                internal
              </span>
            </Link>
            {session ? (
              <nav className="flex gap-5 text-sm text-zinc-600 dark:text-zinc-400 items-center">
                <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  Brands
                </Link>
                <Link
                  href="/accounts"
                  className="hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Accounts
                </Link>
                <Link
                  href="/links"
                  className="hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Links
                </Link>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span
                  className="text-xs text-zinc-500 hidden sm:inline"
                  title={session.user_id}
                >
                  {session.email}
                </span>
                <form action="/auth/logout" method="post" className="inline">
                  <button
                    type="submit"
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline-offset-4 hover:underline"
                  >
                    logout
                  </button>
                </form>
              </nav>
            ) : (
              <nav className="text-sm">
                <Link
                  href="/login"
                  className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Sign in
                </Link>
              </nav>
            )}
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
