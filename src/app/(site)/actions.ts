"use server";

import { sendMail } from "@/server/mail";

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function subscribeAction(_state: { message: string }, formData: FormData): Promise<{ message: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { message: "Enter a valid email." };
  await sendMail({
    to: "info@eujobbd.com",
    subject: "Website newsletter",
    text: `${email} asked to hear about new jobs.`,
  });
  return { message: "You are on the list. We will write when new jobs open." };
}

export async function contactAction(_state: { message: string }, formData: FormData): Promise<{ message: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const message = String(formData.get("message") ?? "").trim();
  if (!name || !emailOk(email) || message.length < 8) return { message: "Add your name, a valid email, and a short message." };
  await sendMail({
    to: "info@eujobbd.com",
    subject: `Website message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });
  return { message: "Message received. We will reply from info@eujobbd.com." };
}
