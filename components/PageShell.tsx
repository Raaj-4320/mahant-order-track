"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";

export function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen w-full flex-col">
      <TopBar title={title} />
      <main key={pathname} className="flex-1 overflow-y-auto animate-fadeSlide">
        {children}
      </main>
    </div>
  );
}
