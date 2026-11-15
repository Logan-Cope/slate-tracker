/**
 * The label photo the client sends and the route accepts. Pure, shared by both sides.
 * 1568 px on the long edge is the most the model uses (it scales anything larger down to that),
 * and a JPEG at that size is well under Vercel's 4.5 MB request body limit.
 */
export const PHOTO_LONG_EDGE = 1568;
export const PHOTO_QUALITY = 0.85;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

/** The image type from the file's first bytes, or null when it is not a JPEG, PNG or WebP. */
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Width and height that fit the long edge, keeping the aspect ratio and never scaling up. */
export function fitLongEdge(width: number, height: number, longEdge = PHOTO_LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export type LabelFailure = { message: string; retry: boolean; signIn: boolean };

/**
 * What the label sheet says when a read fails, from the route's status (null: no response at all).
 * `retry` sends the same photo again; otherwise the next step is a new photo.
 */
export function labelFailure(status: number | null): LabelFailure {
  if (status === null) return { message: "No connection. Try again when you are back online.", retry: true, signIn: false };
  if (status === 401) return { message: "Your session ended. Sign in again.", retry: false, signIn: true };
  if (status === 422) return { message: "Could not read the label.", retry: false, signIn: false };
  if (status === 413 || status === 415) return { message: "Could not use that photo.", retry: false, signIn: false };
  return { message: "Could not read the label right now.", retry: true, signIn: false };
}
