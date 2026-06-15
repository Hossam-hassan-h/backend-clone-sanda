import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const MAIL_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS || 10000);

const withTimeout = (promise, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${MAIL_TIMEOUT_MS}ms`)),
      MAIL_TIMEOUT_MS
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const getSender = () =>
  process.env.EMAIL_FROM || process.env.RESEND_FROM || process.env.EMAIL || process.env.SMTP_USER;

const writeLocalEmail = async ({ to, subject, html, from }) => {
  const dir = path.join(process.cwd(), "emails");
  await fs.mkdir(dir, { recursive: true });
  const safeTo = String(to).replace(/[^a-z0-9@._-]/gi, "_");
  const file = path.join(dir, `${Date.now()}-${safeTo}.html`);
  await fs.writeFile(
    file,
    [
      `<!-- from: ${from} -->`,
      `<!-- to: ${to} -->`,
      `<!-- subject: ${subject} -->`,
      html,
    ].join("\n"),
    "utf8"
  );
  console.log(`Local email written: ${file}`);
  return { file };
};

const sendWithResend = async ({ to, subject, html, from }) => {
  if (!process.env.RESEND_API_KEY) return false;

  const response = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    }),
    "Resend email request"
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend email failed with ${response.status}: ${body}`);
  }

  return true;
};

const createTransporter = () => {
  const common = {
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
  };

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
      },
      ...common,
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS,
    },
    ...common,
  });
};

export const sendEmail = async (to, subject, html) => {
  const localMailMode = process.env.MAIL_MODE === "file" || process.env.MAIL_MODE === "local";
  const from = getSender() || (localMailMode ? "Sanda <no-reply.local@sanda.test>" : null);

  if (!from) {
    throw new Error("Email sender is not configured");
  }

  if (localMailMode) {
    await writeLocalEmail({ to, subject, html, from });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    await sendWithResend({ to, subject, html, from });
    return;
  }

  const hasSmtpConfig = process.env.SMTP_HOST && (process.env.SMTP_USER || process.env.EMAIL) && (process.env.SMTP_PASS || process.env.EMAIL_PASS);
  const hasGmailConfig = process.env.EMAIL && process.env.EMAIL_PASS;

  if (!hasSmtpConfig && !hasGmailConfig) {
    throw new Error("Email service is not configured");
  }

  const transporter = createTransporter();
  await withTimeout(
    transporter.sendMail({
      from,
      to,
      subject,
      html,
    }),
    "SMTP email request"
  );
};
