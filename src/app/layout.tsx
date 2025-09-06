// Metadata Typ entfernt (vereinfachtes Typing ohne Next Types)
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CustomSessionProvider from "./SessionProvider";
import { ToastProvider } from "@/components/shared/ToastProvider";
import HeaderGate from "@/components/shared/HeaderGate";
import GlobalFooter from "../components/shared/GlobalFooter";
import CookieConsent from "@/components/legal/CookieConsent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "LernArena - Interaktive Lernplattform",
  description: "Eine moderne Lernplattform mit interaktiven Kursen und Quizzes",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans min-h-screen flex flex-col`}>        
        <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
        <CustomSessionProvider>
          <ToastProvider>
            <HeaderGate />
            <main id="main-content" tabIndex={-1} className="flex-1 w-full px-3 sm:px-4 lg:px-6 max-w-[1400px] mx-auto w-full pt-16">{children}</main>
            <GlobalFooter />
            <CookieConsent />
          </ToastProvider>
        </CustomSessionProvider>
      </body>
    </html>
  );
}
