
// Metadata Typ entfernt (vereinfachtes Typing ohne Next Types)
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CustomSessionProvider from "./SessionProvider";
import { ToastProvider } from "@/components/shared/ToastProvider";
import GlobalHeader from "@/components/shared/GlobalHeader";
import GlobalFooter from "../components/shared/GlobalFooter";

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
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans min-h-screen flex flex-col`}>        
        <CustomSessionProvider>
          <ToastProvider>
            <GlobalHeader />
            <main className="flex-1 w-full">{children}</main>
            <GlobalFooter />
          </ToastProvider>
        </CustomSessionProvider>
      </body>
    </html>
  );
}
