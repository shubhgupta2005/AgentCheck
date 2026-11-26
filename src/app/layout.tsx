import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCheck — jobs that actually reply",
  description:
    "Stop applying to 600 jobs. AgentCheck ranks startup jobs by how likely they are to reply, flags ghost listings, and shows how long each application takes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
