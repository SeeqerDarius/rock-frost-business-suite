import "server-only";

import PDFDocument from "pdfkit";

type StudentIdPdfInput = {
  schoolName: string;
  studentName: string;
  studentNumber: string;
  campus: string;
  className?: string | null;
  academicYear?: string | null;
  status: string;
  issueDate: Date;
  expiryDate: Date;
  photo?: Buffer | null;
  qrDataUrl: string;
  verificationUrl: string;
};

const cardSize: [number, number] = [242.65, 153.07];
const date = (value: Date) => new Intl.DateTimeFormat("en-GB").format(value);

export function buildStudentIdPdf(input: StudentIdPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: cardSize, margin: 14, layout: "landscape", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, cardSize[0], cardSize[1]).fill("#102A56");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9).text(input.schoolName, 14, 13, { width: 210 });
    if (input.photo) doc.image(input.photo, 14, 37, { fit: [55, 68], align: "center", valign: "center" });
    else doc.roundedRect(14, 37, 55, 68, 5).fill("#D9E4F5").fillColor("#102A56").fontSize(7).text("NO PHOTO", 19, 67, { width: 45, align: "center" });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11).text(input.studentName, 79, 39, { width: 145 });
    doc.font("Helvetica").fontSize(7).fillColor("#D9E4F5").text(`Student ID: ${input.studentNumber}`, 79, 59).text(`Campus: ${input.campus}`, 79, 71).text(`Class: ${input.className ?? "Not assigned"}`, 79, 83).text(`Academic year: ${input.academicYear ?? "Not assigned"}`, 79, 95).text(`Status: ${input.status}`, 79, 107).text(`Valid: ${date(input.issueDate)} to ${date(input.expiryDate)}`, 14, 129, { width: 214, align: "center" });

    doc.addPage({ size: cardSize, margin: 14, layout: "landscape" });
    doc.fillColor("#102A56").font("Helvetica-Bold").fontSize(10).text("VERIFY THIS STUDENT ID", 14, 14, { width: 145 });
    doc.image(input.qrDataUrl, 156, 13, { fit: [72, 72] });
    doc.font("Helvetica").fontSize(7).fillColor("#334155").text("Scan the QR code to check the live card status. A changed, expired, or revoked card will fail verification.", 14, 38, { width: 130, lineGap: 2 });
    doc.fontSize(5).fillColor("#64748B").text(input.verificationUrl, 14, 104, { width: 214, align: "center" });
    doc.fontSize(6).text("Property of the issuing school. Return if found.", 14, 133, { width: 214, align: "center" });
    doc.end();
  });
}
