import type { AppProps } from "next/app";
import { NextUIProvider } from "@nextui-org/react";
import React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProvider } from "./contexts/ThemeContext";
import "../styles/globals.css";

// import { UnisatWalletExternalTypes } from "@/app/components/wallet/types";

// declare global {
//   interface Window {
//     btc: any;
//     unisat: UnisatWalletExternalTypes;
//     turnstile: any;
//     LeatherProvider: any;
//   }
// }

export default function App({ Component, pageProps }: AppProps) {
  return (
    <React.StrictMode>
      <NextUIProvider>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          <ThemeProvider>
            <Component {...pageProps} />
          </ThemeProvider>
        </NextThemesProvider>
      </NextUIProvider>
    </React.StrictMode>
  );
}
