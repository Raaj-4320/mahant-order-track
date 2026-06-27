"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  LucideIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getFirebaseConfigStatus } from "@/lib/firebase/client";

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const items: Item[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Order Booking", href: "/orders", icon: ClipboardList },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Payment Agents", href: "/payment-agents", icon: Wallet },
  { label: "Payment Agents V2", href: "/payment-agents-v2", icon: WalletCards },
  { label: "Products", href: "/products", icon: Package },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Recycle Bin", href: "/recycle-bin", icon: RotateCcw },
];

export function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const pathname = usePathname();
  const businessId = getFirebaseConfigStatus().businessId || "mahant";

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-bg-subtle transition-[width,opacity] duration-200 lg:flex",
        collapsed ? "w-[64px] opacity-100" : "w-[208px] opacity-100",
      )}
    >
      <div className={cn("border-b border-border", collapsed ? "flex h-[72px] flex-col items-center justify-center gap-1 px-2 py-2" : "flex h-[58px] items-center gap-2 px-4")}>
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-brand-fg">
          <span className="text-[13px] font-bold">T</span>
        </div>
        {!collapsed ? <span className="text-[15.5px] font-semibold tracking-tight">TradeFlow</span> : null}
        <button
          type="button"
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={onToggle}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card shadow-sm transition-colors hover:border-fg-subtle",
            collapsed ? "" : "ml-auto",
          )}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className={cn("flex flex-col gap-0.5", collapsed ? "p-2" : "p-2.5")}>
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="block">
              <div className={cn("nav-item text-[25px]", collapsed ? "justify-center px-0" : "", active && "active")}>
                <Icon size={16} />
                {!collapsed ? <span>{it.label}</span> : null}
                {active ? <span className="" /> : null}
              </div>
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="mt-auto space-y-2 p-3">
          <div className="card space-y-2 p-3 text-[11.5px]">
            <div className="font-semibold">Business</div>
            <div className="break-all text-fg-subtle">Business: {businessId}</div>
            <div className="text-fg-subtle">Workspace data is loaded from the configured Firebase business context.</div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
