import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruki AI - Kapruka Conversational Shopping Concierge",
  description: "Experience premium, AI-powered conversational gifting and shopping with Ruki AI for Kapruka. Find the perfect gifts, check real-time delivery feasibility, and check out instantly.",
};

// Clerk stays optional: without a publishable key the tree renders exactly as
// before (guest mode), so local dev and the current VM deploy never break.
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shell = (
    <html
      lang="en"
      // The theme script below may add the "dark" class before hydration.
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Apply the saved theme before first paint so a refresh never
            flashes light mode when the user chose dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{if(localStorage.getItem("ruki_theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );

  if (!clerkEnabled) return shell;

  return <ClerkProvider>{shell}</ClerkProvider>;
}
