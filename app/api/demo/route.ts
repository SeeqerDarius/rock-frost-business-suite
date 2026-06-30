import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/resend";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const {
      name,
      company,
      position,
      email,
      phone,
      country,
      employeeCount,
      industry,
      modulesInterestedIn,
      demoDate,
      demoTime,
      notes,
    } = payload as Record<string, string>;

    const errors: string[] = [];

    if (!name?.toString().trim()) errors.push("Name is required.");
    if (!company?.toString().trim()) errors.push("Company is required.");
    if (!position?.toString().trim()) errors.push("Position is required.");
    if (!email?.toString().trim()) errors.push("Email is required.");
    if (!phone?.toString().trim()) errors.push("Phone number is required.");
    if (!country?.toString().trim()) errors.push("Country is required.");
    if (!employeeCount?.toString().trim()) errors.push("Number of employees is required.");
    if (!industry?.toString().trim()) errors.push("Industry is required.");
    if (!modulesInterestedIn?.toString().trim()) errors.push("Modules interested in is required.");
    if (!demoDate?.toString().trim()) errors.push("Preferred demo date is required.");
    if (!demoTime?.toString().trim()) errors.push("Preferred demo time is required.");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailPattern.test(email)) errors.push("Email must be a valid address.");

    if (errors.length) {
      return NextResponse.json(
        { success: false, message: "Please complete every required field before requesting a demo.", errors },
        { status: 400 },
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmail = process.env.RESEND_TO_EMAIL;

    if (!fromEmail || !toEmail) {
      return NextResponse.json(
        { success: false, message: "Demo requests are not configured yet. Please contact us directly." },
        { status: 500 },
      );
    }

    const result = await sendEmail({
      to: toEmail,
      from: fromEmail,
      replyTo: email,
      subject: `New demo request from ${name}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
          <h2 style="color:#1a6dff">New demo request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Company:</strong> ${company}</p>
          <p><strong>Position:</strong> ${position}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Country:</strong> ${country}</p>
          <p><strong>Employees:</strong> ${employeeCount}</p>
          <p><strong>Industry:</strong> ${industry}</p>
          <p><strong>Modules:</strong> ${modulesInterestedIn}</p>
          <p><strong>Preferred Date:</strong> ${demoDate}</p>
          <p><strong>Preferred Time:</strong> ${demoTime}</p>
          <p><strong>Notes:</strong> ${notes || "None"}</p>
        </div>
      `,
      text: `New demo request\nName: ${name}\nCompany: ${company}\nPosition: ${position}\nEmail: ${email}\nPhone: ${phone}\nCountry: ${country}\nEmployees: ${employeeCount}\nIndustry: ${industry}\nModules: ${modulesInterestedIn}\nPreferred Date: ${demoDate}\nPreferred Time: ${demoTime}\nNotes: ${notes || "None"}`,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error ?? "We could not submit your demo request right now." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Your demo request is confirmed. We will reach out shortly." });
  } catch (error) {
    console.error("Demo request failed", error);
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
