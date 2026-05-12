"use client";

import { Plus, X } from "lucide-react";
import { ChangeEvent, ClipboardEvent, DragEvent, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  value?: string;
  onChange: (url: string | undefined) => void;
  dimLabel?: string;
  onDimChange?: (label: string) => void;
  compact?: boolean;
  ariaLabel?: string;
};

export function PhotoUpload({
  value,
  onChange,
  dimLabel,
  onDimChange,
  compact,
  ariaLabel = "Upload photo — click, drag, or paste",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const ingest = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    ingest(e.target.files?.[0]);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    ingest(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        ingest(it.getAsFile());
        e.preventDefault();
        return;
      }
    }
  };

  const boxClasses = compact
    ? "h-[44px] w-full max-w-[50px] rounded-md"
    : "h-[68px] w-full max-w-[100px] rounded-lg";

  return (
    <div className="flex w-full flex-col items-center gap-0.5 min-w-0">
      <div
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
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
          value && "border-solid border-border"
        )}
      >
        {value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
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
            <div className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-fg-subtle/60">
              <Plus size={13} />
            </div>
            <span className="text-[9.5px] leading-tight text-fg-subtle">
              {dragOver ? "Drop image" : focused ? "Paste image" : "click · drag · paste"}
            </span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
      </div>
      {onDimChange && (
        <input
          value={dimLabel ?? ""}
          onChange={(e) => onDimChange(e.target.value)}
          placeholder="dim"
          className={cn(
            "w-full rounded border-0 bg-transparent px-1 text-center text-fg-muted leading-tight focus:bg-bg-subtle min-w-0",
            compact ? "max-w-[60px] text-[9.5px]" : "max-w-[100px] text-[10.5px]"
          )}
        />
      )}
    </div>
  );
}
