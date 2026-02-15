import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { ToastProvider } from "@/components/ui/toast-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "RBIP Duty List - Hospital Therapist Allocation",
  description: "Automated hospital therapist manpower allocation system",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.className} bg-background text-foreground min-h-screen`}>
        <Script id="rbip-randomuuid-polyfill" strategy="beforeInteractive">
          {`
            (function () {
              var c = globalThis.crypto;
              if (!c) return;
              if (typeof c.randomUUID === 'function') return;
              c.randomUUID = function () {
                try {
                  var bytes = new Uint8Array(16);
                  c.getRandomValues(bytes);
                  bytes[6] = (bytes[6] & 15) | 64;
                  bytes[8] = (bytes[8] & 63) | 128;
                  var hex = Array.from(bytes, function (b) {
                    return b.toString(16).padStart(2, '0');
                  });
                  return (
                    hex.slice(0, 4).join('') + '-' +
                    hex.slice(4, 6).join('') + '-' +
                    hex.slice(6, 8).join('') + '-' +
                    hex.slice(8, 10).join('') + '-' +
                    hex.slice(10, 16).join('')
                  );
                } catch (_) {
                  var now = Date.now().toString(16);
                  var rnd = Math.floor(Math.random() * 1e16).toString(16);
                  return (now + rnd).slice(0, 8) + '-' + (now + rnd).slice(8, 12) + '-4' + (rnd + now).slice(0, 3) + '-a' + (rnd + now).slice(3, 6) + '-' + (now + rnd + now).slice(0, 12);
                }
              };
            })();
          `}
        </Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}

