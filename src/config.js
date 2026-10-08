import "dotenv/config";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT) || 4000,
  isProd: process.env.NODE_ENV === "production",
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB || "aranya",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  // Where the storefront lives; password-reset links point here.
  appUrl: (process.env.APP_URL || "http://localhost:3737").replace(/\/+$/, ""),
  // Outgoing mail. Unset means no email is sent (reset links are printed to
  // the server log in development instead).
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
        from: process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@aranya.local",
      }
    : null,
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3737")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
