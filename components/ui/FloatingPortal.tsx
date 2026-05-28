"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  width?: number;
  placement?: "auto" | "bottom";
  align?: "start" | "center";
  className?: string;
  children: ReactNode;
};

export function FloatingPortal({ anchorRef, open, width, placement = "auto", align = "start", className = "", children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const viewportPadding = 8;
    const offset = 6;
    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 260;
      const panelWidth = width ?? panelRef.current?.offsetWidth ?? rect.width;
      const viewportBottom = window.scrollY + window.innerHeight;
      const preferredTop = rect.bottom + window.scrollY + offset;
      const aboveTop = rect.top + window.scrollY - panelHeight - offset;
      const hasBottomSpace = preferredTop + panelHeight <= viewportBottom - viewportPadding;
      const minTop = window.scrollY + viewportPadding;
      const maxTop = viewportBottom - panelHeight - viewportPadding;
      const nextTop = placement === "bottom" ? preferredTop : (hasBottomSpace ? preferredTop : aboveTop);
      const top = Math.min(Math.max(nextTop, minTop), Math.max(minTop, maxTop));
      const preferredLeft = align === "center"
        ? rect.left + window.scrollX + (rect.width / 2) - (panelWidth / 2)
        : rect.left + window.scrollX;
      const minLeft = window.scrollX + viewportPadding;
      const maxLeft = window.scrollX + window.innerWidth - panelWidth - viewportPadding;
      const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));
      setStyle({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, width, placement, align]);

  if (!mounted || !open) return null;
  return createPortal(
    <div ref={panelRef} style={{ position: "absolute", top: style.top, left: style.left, width: width ? `${width}px` : undefined, zIndex: 9999 }} className={className}>
      {children}
    </div>,
    document.body,
  );
}
