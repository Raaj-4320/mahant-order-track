"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  width?: number;
  className?: string;
  children: ReactNode;
};

export function FloatingPortal({ anchorRef, open, width, className = "", children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;
    const w = width ?? rect.width;
    const maxLeft = window.scrollX + window.innerWidth - w - 8;
    if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
    setStyle({ top, left });
  }, [open, anchorRef, width]);

  if (!mounted || !open) return null;
  return createPortal(
    <div ref={panelRef} style={{ position: "absolute", top: style.top, left: style.left, width: width ? `${width}px` : undefined, zIndex: 9999 }} className={className}>
      {children}
    </div>,
    document.body,
  );
}
