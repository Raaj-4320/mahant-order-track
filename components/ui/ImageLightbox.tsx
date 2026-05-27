"use client";

import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  src?: string | null;
  alt?: string;
  caption?: string;
  open: boolean;
  onClose: () => void;
};

export function ImageLightbox({ src, alt = "Preview image", caption, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !src) return null;
  const fullSrc = getCloudinaryOptimizedUrl(src, { width: 1400, quality: "auto", format: "auto" });
  return createPortal(
    <div className="fixed inset-0 z-[12000] bg-black/75 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Image preview">
      <button type="button" onClick={onClose} aria-label="Close image preview" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-border bg-bg-card text-fg">
        <X size={18} />
      </button>
      <div className="flex h-full w-full items-center justify-center">
        <div className="max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
          <img src={fullSrc || src} alt={alt} className="max-h-[85vh] max-w-[90vw] rounded-xl border border-border bg-bg-card object-contain" />
          {caption ? <div className="mt-2 text-center text-sm text-fg-muted">{caption}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
