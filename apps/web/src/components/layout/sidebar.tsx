"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Columns3,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { clearSession, getUser } from "@/lib/auth";
import { cn } from "@/lib/cn";

const NAV = [
  {
    group: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Columns3 },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/rfqs", label: "RFQs", icon: ClipboardList },
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    group: "Intelligence",
    items: [{ href: "/ask", label: "Ask Your CRM", icon: Sparkles }],
  },
];

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
      <img src="/logo.jpg" alt="Forge" className="size-8 rounded-md object-contain" />
      <div className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-semibold tracking-tight text-white">
          Forge
        </span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-steel">
          CRM · Sales OS
        </span>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {NAV.map((section) => (
        <div key={section.group} className="mt-4 first:mt-2">
          <p className="px-2 pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-steel">
            {section.group}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "border-signal bg-white/5 font-medium text-white"
                        : "border-transparent text-steel hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserCard() {
  const router = useRouter();
  const user = getUser();
  const initials = (user?.fullName ?? "??")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal font-mono text-[11px] font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">{user?.fullName ?? "—"}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-steel">{user?.role ?? ""}</p>
        </div>
        <button
          onClick={() => {
            clearSession();
            router.push("/login");
          }}
          title="Log out"
          className="rounded-md p-1.5 text-steel transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4" strokeWidth={1.8} />
        </button>
      </div>
      <p className="mt-1 px-2 text-center font-mono text-[9px] tracking-wider text-steel/60">
        Forge
      </p>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-mist bg-ink px-4 md:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-white" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="font-display text-[15px] font-semibold text-white">Forge</span>
        <span className="size-9" />
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-md p-2 text-steel hover:text-white" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <UserCard />
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-ink md:flex">
        <Brand />
        <NavLinks />
        <UserCard />
      </aside>
    </>
  );
}
