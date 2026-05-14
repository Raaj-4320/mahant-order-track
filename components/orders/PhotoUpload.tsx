"use client";

import { Plus, X } from "lucide-react";
import { ChangeEvent, ClipboardEvent, DragEvent, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isCloudinaryConfigured, uploadImageUnsigned } from "@/lib/cloudinary/client";

type Props = {
  value?: string;
  onChange: (url: string | undefined) => void;
  dimLabel?: string;
  onDimChange?: (label: string) => void;
  compact?: boolean;
  ariaLabel?: string;
  onUploadingChange?: (isUploading: boolean) => void;
};

export function PhotoUpload({
  value,
  onChange,
  dimLabel,
  onDimChange,
  compact,
  ariaLabel = "Upload photo — click, drag, or paste",
  onUploadingChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = async (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    if (!isCloudinaryConfigured()) {
      setError("Cloudinary is not configured. Please check upload settings.");
      return;
    }
    try {
      setIsUploading(true);
      onUploadingChange?.(true);
      const uploaded = await uploadImageUnsigned(file, "tradeflow/orders");
      if (!uploaded.secureUrl) throw new Error("Upload succeeded but image URL was missing.");
      onChange(uploaded.secureUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
    }
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    await ingest(e.target.files?.[0]);
    e.target.value = "";
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    await ingest(e.dataTransfer.files?.[0]);
  };

  const onPaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        await ingest(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  };

  const boxClasses = compact ? "h-[44px] w-full max-w-[50px] rounded-md" : "h-[68px] w-full max-w-[100px] rounded-lg";

  return (
    <div className="flex w-full flex-col items-center gap-0.5 min-w-0">
      <div
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onClick={() => !isUploading && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isUploading) {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!isUploading) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "group relative grid cursor-pointer place-items-center overflow-hidden border border-dashed border-border bg-bg-subtle text-fg-subtle transition-all",
          boxClasses,
          "hover:border-fg-subtle hover:bg-bg",
          (dragOver || focused) && "border-fg ring-2 ring-fg/15",
          value && "border-solid border-border",
          isUploading && "opacity-70 cursor-wait"
        )}
      >
        {isUploading ? (
          <span className="text-[9px] text-fg-subtle">Uploading...</span>
        ) : value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!isUploading) onChange(undefined);
              }}
              disabled={isUploading}
              className={cn(
                "absolute grid place-items-center rounded-full bg-bg-card/95 text-fg shadow-soft opacity-0 group-hover:opacity-100 transition-opacity border border-border",
                compact ? "right-0.5 top-0.5 h-4 w-4" : "right-1 top-1 h-5 w-5"
              )}
              aria-label="Remove photo"
            >
              <X size={compact ? 9 : 11} />
            </button>
          </>
        ) : compact ? (
          <Plus size={14} />
        ) : (
          <div className="flex flex-col items-center gap-0.5 px-1 text-center">
            <div className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-fg-subtle/60"><Plus size={13} /></div>
            <span className="text-[9.5px] leading-tight text-fg-subtle">{dragOver ? "Drop image" : focused ? "Paste image" : "click · drag · paste"}</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} disabled={isUploading} />
      </div>
      {error && <div className="text-[9px] text-[var(--danger)] text-center leading-tight">{error}</div>}
      {onDimChange && (
        <input
          value={dimLabel ?? ""}
          onChange={(e) => onDimChange(e.target.value)}
          placeholder="dim"
          className={cn("w-full rounded border-0 bg-transparent px-1 text-center text-fg-muted leading-tight focus:bg-bg-subtle min-w-0", compact ? "max-w-[60px] text-[9.5px]" : "max-w-[100px] text-[10.5px]")}
        />
      )}
    </div>
  );
}
