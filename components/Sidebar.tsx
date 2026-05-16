"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Truck,
  Package,
  Wallet,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useEffect, useState } from "react";
import { bootstrapBusinessForUser, getBusinessMember } from "@/services/firebase/businessBootstrapFirebaseService";

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
  { label: "Payment Agents", href: "/payment-agents", icon: Wallet },
  { label: "Products", href: "/products", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isSignedIn, signIn, signUp, logout } = useAuthUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const businessId = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return setMemberRole(null);
      const m = await getBusinessMember(user.uid).catch(() => null);
      if (active) setMemberRole(m?.role || null);
    })();
    return () => { active = false; };
  }, [user]);
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

      <div className="mt-auto p-3 space-y-2">
        <div className="card p-3 text-[11.5px] space-y-2">
          <div className="font-semibold">Auth / Business</div>
          {!isSignedIn ? <div className="space-y-2">
            <input className="input h-8 text-[12px]" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input h-8 text-[12px]" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-1">
              <button className="btn btn-secondary px-2 py-1 text-[11px]" onClick={async () => { try { await signIn(email, password); setAuthMsg("Signed in."); } catch { setAuthMsg("Sign in failed."); } }}>Sign In</button>
              <button className="btn btn-secondary px-2 py-1 text-[11px]" onClick={async () => { try { await signUp(email, password); setAuthMsg("Account created."); } catch { setAuthMsg("Sign up failed."); } }}>Sign Up</button>
            </div>
          </div> : <div className="space-y-2">
            <div className="text-fg-subtle break-all">{user?.email || user?.uid}</div>
            <div className="text-fg-subtle">Business: {businessId} · Role: {memberRole || "none"}</div>
            {!memberRole ? <button className="btn btn-secondary px-2 py-1 text-[11px]" onClick={async () => { try { await bootstrapBusinessForUser(user!.uid, user?.email); setAuthMsg("Business/member bootstrap complete."); setMemberRole("owner"); } catch { setAuthMsg("Bootstrap failed. Check rules/auth."); } }}>Bootstrap Owner Membership</button> : null}
            <button className="btn btn-secondary px-2 py-1 text-[11px]" onClick={() => logout()}>Sign Out</button>
          </div>}
          {authMsg ? <div className="text-fg-subtle">{authMsg}</div> : null}
        </div>
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
