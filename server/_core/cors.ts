/** Origin allowlist for the room service and the Socket.IO relays.
 *
 * - Requests without an Origin header (native mobile apps, curl) are always allowed.
 * - Origins listed in ALLOWED_ORIGINS (comma-separated) are always allowed.
 * - Setting ALLOWED_ORIGINS="*" opens every origin (not recommended).
 * - When ALLOWED_ORIGINS is unset, localhost/127.0.0.1 on any port is allowed
 *   so local web development keeps working; production deployments must set
 *   an explicit list.
 */
const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAllOrigins = configuredOrigins.includes("*");

const isLocalOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
};

export const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) return true;
  if (allowAllOrigins) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (configuredOrigins.length === 0 && isLocalOrigin(origin)) return true;
  return false;
};

export const socketCors = {
  origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed."), false);
  },
  credentials: true,
};
