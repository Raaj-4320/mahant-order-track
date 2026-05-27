const CLOUDINARY_UPLOAD_HOST = "res.cloudinary.com";

export function getCloudinaryOptimizedUrl(
  url: string,
  opts: { width?: number; height?: number; crop?: "fill" | "fit"; quality?: "auto" | number; format?: "auto" | "webp" | "jpg" } = {}
): string {
  if (!url || !url.includes(CLOUDINARY_UPLOAD_HOST) || !url.includes('/upload/')) return url;
  const width = opts.width ?? 300;
  const quality = opts.quality ?? "auto";
  const format = opts.format ?? "auto";
  const parts = [`f_${format}`, `q_${quality}`, `w_${width}`];
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.crop) parts.push(`c_${opts.crop}`);
  const uploadMarker = "/upload/";
  const uploadIndex = url.indexOf(uploadMarker);
  if (uploadIndex === -1) return url;

  const base = url.slice(0, uploadIndex + uploadMarker.length);
  const remainder = url.slice(uploadIndex + uploadMarker.length);

  // If URL already has Cloudinary transforms, replace them instead of stacking duplicates.
  const firstSegment = remainder.split("/")[0] ?? "";
  const hasTransforms = firstSegment.includes(",") || /^[a-z]{1,3}_/.test(firstSegment);
  const pathWithoutTransforms = hasTransforms ? remainder.slice(firstSegment.length + 1) : remainder;

  return `${base}${parts.join(",")}/${pathWithoutTransforms}`;
}
