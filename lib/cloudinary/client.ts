export type CloudinaryClientConfig = {
  cloudName: string;
  uploadPreset: string;
};

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  resourceType?: string;
  bytes?: number;
  createdAt?: string;
  originalFilename?: string;
};

const IMAGE_ENDPOINT = "image/upload";

export const getCloudinaryClientConfig = (): CloudinaryClientConfig | null => {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
};

export const isCloudinaryConfigured = () => getCloudinaryClientConfig() !== null;

export const getCloudinaryUploadUrl = () => {
  const config = getCloudinaryClientConfig();
  if (!config) return null;
  return `https://api.cloudinary.com/v1_1/${config.cloudName}/${IMAGE_ENDPOINT}`;
};

export async function uploadImageUnsigned(file: File, folder?: string): Promise<CloudinaryUploadResult> {
  const config = getCloudinaryClientConfig();
  if (!config) {
    throw new Error("Cloudinary upload is not configured.");
  }

  const formData = new FormData();
  formData.set("file", file);
  formData.set("upload_preset", config.uploadPreset);
  if (folder) formData.set("folder", folder);

  const response = await fetch(getCloudinaryUploadUrl() as string, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${text || "Unknown error"}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    secureUrl: String(data.secure_url ?? ""),
    publicId: String(data.public_id ?? ""),
    width: typeof data.width === "number" ? data.width : undefined,
    height: typeof data.height === "number" ? data.height : undefined,
    format: typeof data.format === "string" ? data.format : undefined,
    resourceType: typeof data.resource_type === "string" ? data.resource_type : undefined,
    bytes: typeof data.bytes === "number" ? data.bytes : undefined,
    createdAt: typeof data.created_at === "string" ? data.created_at : undefined,
    originalFilename: typeof data.original_filename === "string" ? data.original_filename : undefined,
  };
}
