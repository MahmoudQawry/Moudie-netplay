const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isAllowedOrigin = (origin: string | undefined) => !origin || configuredOrigins.includes(origin);

export const socketCors = {
  origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed."), false);
  },
  credentials: true,
};
