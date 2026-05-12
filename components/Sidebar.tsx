"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Truck,
  Package,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const items: Item[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Order Booking", href: "/orders", icon: ClipboardList },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Products", href: "/products", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();
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
          const active =
            pathname === it.href ||
            (it.href !== "/" && pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="block">
              <div className={cn("nav-item", active && "active")}>
                <Icon size={16} />
                <span>{it.label}</span>
                {active && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-brand-fg" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-3">
        <div className="card flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-bg-subtle border border-border text-[12px] font-semibold">
            AD
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">Admin User</div>
            <div className="truncate text-[11.5px] text-fg-subtle">
              admin@tradeflow.com
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
