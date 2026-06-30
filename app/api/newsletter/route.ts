import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/resend";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const email = payload?.email?.toString().trim() ?? "";

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailPattern.test(email)) {
      return NextResponse.json({ success: false, message: "Please enter a valid email address." }, { status: 400 });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmail = process.env.RESEND_TO_EMAIL;

    if (!fromEmail || !toEmail) {
      return NextResponse.json(
        { success: false, message: "Newsletter delivery is not configured yet. Please contact us directly." },
        { status: 500 },
      );
    }

    const result = await sendEmail({
      to: toEmail,
      from: fromEmail,
      replyTo: email,
      subject: "New newsletter subscription",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;"><h2 style="color:#1a6dff">New newsletter subscription</h2><p>Email: ${email}</p></div>`,
      text: `New newsletter subscription\nEmail: ${email}`,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error ?? "We could not subscribe you right now." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "You are subscribed. Expect updates from Rock Frost soon." });
  } catch (error) {
    console.error("Newsletter signup failed", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
