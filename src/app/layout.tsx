import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { connection } from "next/server";
import { SideNav } from "../components/SideNav";
import "./globals.css";

const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Inbound", template: "%s · Inbound" },
  description: "Receive a trailer, leave it waiting, then unload, sort, and put the same load away.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable}`}>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <div className="app">
          <aside className="sidebar">
            <a className="brand" href="/">
              <span className="brand-mark">In</span>
              <span className="brand-text">
                <strong>Inbound</strong>
                <span>Dock loads</span>
              </span>
            </a>
            <SideNav />
            <p className="side-note">One trailer, two stages. Receiving, then unloading.</p>
          </aside>
          <main id="content" className="content">
            <div className="frame">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
