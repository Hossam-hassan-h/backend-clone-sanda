import { Resend } from "resend";

const MAIL_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS || 15000);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Email API request timed out")), ms)
    ),
  ]);

export const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Email service is not configured");
  }

  try {
    const { error } = await withTimeout(
      resend.emails.send({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
      }),
      MAIL_TIMEOUT_MS
    );

    if (error) {
      console.error(`[EMAIL_API_FAILURE] code=${error.name || "unknown"} message=${error.message}`);
      throw new Error(error.message || "Email API request failed");
    }
  } catch (error) {
    console.error(`[EMAIL_API_FAILURE] code=${error.code || "unknown"} message=${error.message}`);
    throw error;
  }
};
