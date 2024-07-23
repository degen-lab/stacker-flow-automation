import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import AuthContextProvider from "./contexts/AuthContext";
import { NavbarSoloStacking } from "./components/Navbar/Navbar";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import ClientOnly from "./components/ClientOnly";
import QueryProviders from "./providers";

const inter = Roboto({ subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Automation of Stacker Delegations",
  description:
    "Automatically lock and stack the STX delegated to your address.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientOnly>
          <QueryProviders>
            <ThemeProvider>
              <AuthContextProvider>
                <div className="flex flex-col min-h-screen">
                  <NavbarSoloStacking />
                  <main className="flex-grow">{children}</main>
                </div>
              </AuthContextProvider>
            </ThemeProvider>
          </QueryProviders>
        </ClientOnly>
      </body>
    </html>
  );
}
