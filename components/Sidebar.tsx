"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  LucideIcon,
  Package,
  RotateCcw,
  Settings,
  Users,
  Wallet,
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
  { label: "Products", href: "/products", icon: Package },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Recycle Bin", href: "/recycle-bin", icon: RotateCcw },
];

export function Sidebar() {
  const pathname = usePathname();
  const businessId = getFirebaseConfigStatus().businessId || "mahant";

  return (
    <aside className="hidden lg:flex w-[208px] shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex items-center gap-2 px-4 h-[58px] border-b border-border">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-brand-fg">
          <span className="text-[13px] font-bold">T</span>
        </div>
        <span className="text-[15.5px] font-semibold tracking-tight">TradeFlow</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-2.5">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="block">
              <div className={cn("nav-item text-[25px]", active && "active")}>
                <Icon size={16} />
                <span>{it.label}</span>
                {active ? <span className="" /> : null}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-3 space-y-2">
        <div className="card p-3 text-[11.5px] space-y-2">
          <div className="font-semibold">Business</div>
          <div className="text-fg-subtle break-all">Business: {businessId}</div>
          <div className="text-fg-subtle">Workspace data is loaded from the configured Firebase business context.</div>
        </div>
      </div>
    </aside>
  );
}
