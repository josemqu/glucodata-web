import type { Metadata } from "next";
import {
  JetBrains_Mono,
  Outfit,
} from "next/font/google";
import "./globals.css";

const appSans = Outfit({
  variable: "--font-app-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const appMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

const appNumbers = Outfit({
  variable: "--font-app-numbers",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : new URL("http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "GlucoWeb",
    template: "%s | GlucoWeb",
  },
  description: "Panel de monitoreo y sincronización de glucosa.",
  applicationName: "GlucoWeb",
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
      "/icon",
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "GlucoWeb",
    title: "GlucoWeb",
    description: "Panel de monitoreo y sincronización de glucosa.",
    locale: "es_AR",
  },
  twitter: {
    card: "summary",
    title: "GlucoWeb",
    description: "Panel de monitoreo y sincronización de glucosa.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${appMono.variable} ${appNumbers.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
