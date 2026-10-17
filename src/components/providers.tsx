import React from "react";
import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { RegistrarServiceWorker } from "@/components/pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light" storageKey="oliveira-theme">
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="top-right" richColors closeButton />
          <RegistrarServiceWorker />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
