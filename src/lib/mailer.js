import nodemailer from "nodemailer";
import { config } from "../config.js";

const transport = config.smtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export const mailConfigured = !!transport;

export async function sendPasswordResetEmail(to, link) {
  if (!transport) {
    // No mail server configured. In development, print the link so the flow
    // can still be used; in production a link must never end up in the logs.
    if (config.isProd) console.error("Password reset requested but SMTP is not configured — set SMTP_HOST in .env");
    else console.log(`\n[dev] Password reset link for ${to}:\n${link}\n`);
    return;
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: "Reset your Aranya password",
    text: [
      "We received a request to reset the password for your Aranya account.",
      "",
      `Choose a new password here (the link works for one hour):`,
      link,
      "",
      "If you didn't ask for this, you can ignore this email — your password stays the same.",
    ].join("\n"),
  });
}
