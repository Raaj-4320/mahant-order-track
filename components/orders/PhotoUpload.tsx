"use client";

import { Plus, Search, X } from "lucide-react";
import { ChangeEvent, ClipboardEvent, DragEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isCloudinaryConfigured, uploadImageUnsigned } from "@/lib/cloudinary/client";
import { getCloudinaryOptimizedUrl } from "@/lib/cloudinary/image";


const COMPRESS_MAX_SIDE = 1200;
const COMPRESS_QUALITY = 0.78;
const COMPRESS_SKIP_BYTES = 250 * 1024;

async function compressImageForUpload(file: File): Promise<File> {
  if (file.size < COMPRESS_SKIP_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, COMPRESS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const hasTransparency = file.type === 'image/png';
  const mime = hasTransparency ? 'image/png' : 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, COMPRESS_QUALITY));
  bitmap.close();
  if (!blob) return file;
  const ext = mime === 'image/png' ? 'png' : 'webp';
  const name = file.name.replace(/\.[^/.]+$/, '') + `.${ext}`;
  if (blob.size >= file.size) return file;
  return new File([blob], name, { type: mime, lastModified: Date.now() });
}

type Props = {
  value?: string;
  onChange: (url: string | undefined) => void;
  dimLabel?: string;
  onDimChange?: (label: string) => void;
  compact?: boolean;
  ariaLabel?: string;
  onUploadingChange?: (isUploading: boolean) => void;
  onPreview?: (src: string) => void;
};

export function PhotoUpload({
  value,
  onChange,
  dimLabel,
  onDimChange,
  compact,
  ariaLabel = "Upload photo - click, drag, or paste",
  onUploadingChange,
  onPreview,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const clearLocalPreview = () => {
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const ingest = async (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    if (!isCloudinaryConfigured()) {
      setError("Cloudinary is not configured. Please check upload settings.");
      return;
    }
    clearLocalPreview();
    const local = URL.createObjectURL(file);
    setLocalPreviewUrl(local);
    setLastFile(file);
    try {
      setIsUploading(true);
      onUploadingChange?.(true);
      const compressed = await compressImageForUpload(file);
      const uploaded = await uploadImageUnsigned(compressed, "tradeflow/orders");
      if (!uploaded.secureUrl) throw new Error("Upload succeeded but image URL was missing.");
      onChange(uploaded.secureUrl);
      clearLocalPreview();
      setLastFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
    }
  };

  const onRetry = async () => {
    if (!lastFile || isUploading) return;
    await ingest(lastFile);
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

  const boxClasses = compact ? "h-[56px] w-full max-w-[58px] rounded-md" : "h-[72px] w-full max-w-[110px] rounded-lg";

  useEffect(() => () => { clearLocalPreview(); }, []);

  return (
    <div className="flex w-full flex-col items-center gap-0.5 min-w-0">
      <div
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        ref={rootRef}
        onClick={() => rootRef.current?.focus()}
        onDoubleClick={() => !isUploading && fileRef.current?.click()}
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
          "group relative grid cursor-default place-items-center overflow-hidden border border-dashed border-border/70 bg-bg-subtle/80 text-fg-subtle transition-all",
          boxClasses,
          "hover:border-fg-subtle hover:bg-bg",
          (dragOver || focused) && "border-fg ring-2 ring-fg/15",
          value && "border-solid border-border",
          isUploading && "opacity-70 cursor-wait"
        )}
      >
        {(isUploading && (localPreviewUrl || value)) ? (
          <>
            <img src={localPreviewUrl || getCloudinaryOptimizedUrl(value || "", { width: 300, height: 300, crop: "fill" })} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            <div className="absolute inset-0 grid place-items-center bg-black/25 text-[9px] text-white">Uploading...</div>
          </>
        ) : value ? (
          <>
            <img src={value ? getCloudinaryOptimizedUrl(value, { width: 300, height: 300, crop: "fill" }) : ""} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            {onPreview ? <button type="button" title="Open image preview" aria-label="Open image preview" className={cn("absolute grid place-items-center rounded-full bg-bg-card/95 text-fg shadow-soft border border-border", compact ? "left-0.5 top-0.5 h-4 w-4" : "left-1 top-1 h-5 w-5")} onClick={(e) => { e.stopPropagation(); onPreview(value); }}><Search size={compact ? 9 : 11} /></button> : null}
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
          <div className="flex flex-col items-center gap-0.5 px-1 text-center">
            <Plus size={14} />
            <span className="text-[8.5px] leading-tight text-fg-subtle">Click to select - Paste image - Double-click</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5 px-1 text-center">
            <div className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-fg-subtle/60"><Plus size={13} /></div>
            <span className="text-[9.5px] leading-tight text-fg-subtle">{dragOver ? "Drop image" : focused ? "Paste image now" : "Click to select - Paste image - Double-click to browse"}</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} disabled={isUploading} />
      </div>
      {error && <div className="text-[9px] text-[var(--danger)] text-center leading-tight">{error}</div>}
      {error && lastFile && (
        <div className="flex items-center gap-1 text-[9px]">
          <button type="button" onClick={onRetry} className="rounded border border-border px-1.5 py-0.5 hover:bg-bg-subtle">Retry</button>
          <button type="button" onClick={() => { setLastFile(null); setError(null); clearLocalPreview(); }} className="rounded border border-border px-1.5 py-0.5 hover:bg-bg-subtle">Remove</button>
        </div>
      )}
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


