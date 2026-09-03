import type { Metadata, Viewport } from "next";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";
import { InspectProvider } from "@/lib/inspect";
import { OnboardingProvider } from "@/lib/store";
import { DeviceShell } from "@/components/DeviceShell";

const display = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Store Scan · Faire onboarding prototype",
  description:
    "A prototype: new retailers film a 15-second walkthrough of their store and Faire personalizes their first feed from what's on the shelves.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full">
        <OnboardingProvider>
          <InspectProvider>
            <DeviceShell>{children}</DeviceShell>
          </InspectProvider>
        </OnboardingProvider>
      </body>
    </html>
  );
}
