import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "VoicePay Shield | Voice Risk Command Center", description: "Deepfake-safe voice approvals for high-value payments." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const demo = process.env.DEMO_MODE === "true" && !process.env.DETECTIFAI_API_KEY; return <html lang="en" data-demo={demo ? "true" : "false"}><body>{children}</body></html>; }
