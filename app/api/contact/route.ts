import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/resend";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const {
      fullName,
      company,
      email,
      phone,
      businessType,
      employeeCount,
      servicesInterestedIn,
      message,
    } = payload as Record<string, string>;

    const errors: string[] = [];

    if (!fullName?.toString().trim()) errors.push("Full name is required.");
    if (!company?.toString().trim()) errors.push("Company name is required.");
    if (!email?.toString().trim()) errors.push("Email is required.");
    if (!phone?.toString().trim()) errors.push("Phone number is required.");
    if (!businessType?.toString().trim()) errors.push("Business type is required.");
    if (!employeeCount?.toString().trim()) errors.push("Number of employees is required.");
    if (!servicesInterestedIn?.toString().trim()) errors.push("Services interested in is required.");
    if (!message?.toString().trim()) errors.push("Message is required.");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailPattern.test(email)) errors.push("Email must be a valid address.");

    if (errors.length) {
      return NextResponse.json(
        { success: false, message: "Please correct the highlighted fields and try again.", errors },
        { status: 400 },
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmail = process.env.RESEND_TO_EMAIL;

    if (!fromEmail || !toEmail) {
      return NextResponse.json(
        { success: false, message: "Email delivery is not configured yet. Please contact us directly." },
        { status: 500 },
      );
    }

    const result = await sendEmail({
      to: toEmail,
      from: fromEmail,
      replyTo: email,
      subject: `New contact inquiry from ${fullName}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
          <h2 style="color:#1a6dff">New contact inquiry</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Company:</strong> ${company}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Business Type:</strong> ${businessType}</p>
          <p><strong>Employees:</strong> ${employeeCount}</p>
          <p><strong>Services:</strong> ${servicesInterestedIn}</p>
          <p><strong>Message:</strong> ${message}</p>
        </div>
      `,
      text: `New contact inquiry\nName: ${fullName}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nBusiness Type: ${businessType}\nEmployees: ${employeeCount}\nServices: ${servicesInterestedIn}\nMessage: ${message}`,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error ?? "We could not deliver your message right now." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Thanks for reaching out. Our team will contact you shortly." });
  } catch (error) {
    console.error("Contact submission failed", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
