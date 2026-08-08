"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return <div className="min-h-screen bg-canvas" />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <main className="px-4 pb-16 pt-[72px] md:pl-60 md:pt-0">
        <div className="mx-auto max-w-[1280px] py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
