import nodemailer from "nodemailer";

const MAIL_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS || 15000);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: MAIL_TIMEOUT_MS,
  greetingTimeout: MAIL_TIMEOUT_MS,
  socketTimeout: MAIL_TIMEOUT_MS,
});

export const sendEmail = async (to, subject, html) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    throw new Error("Email service is not configured");
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(
      `[SMTP_FAILURE] code=${error.code || "unknown"} command=${error.command || "n/a"} message=${error.message}`
    );
    throw error;
  }
};
