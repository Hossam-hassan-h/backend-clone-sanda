import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to, subject, html) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    throw new Error("Email service is not configured");
  }

  await transporter.sendMail({
    from: process.env.EMAIL,
    to,
    subject,
    html,
  });
};
