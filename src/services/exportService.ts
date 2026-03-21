import PDFDocument from "pdfkit";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { ExportQuery } from "../validators/exportSchema";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function buildTranscriptText(meetingId: string): Promise<string> {
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
    include: {
      segments: { orderBy: { startTime: "asc" }, take: 5000 },
    },
  });

  if (!transcript || transcript.segments.length === 0) {
    throw new AppError("No transcript available for this meeting", 400);
  }

  const lines = transcript.segments.map(
    (seg) => `[${formatTimestamp(seg.startTime)}] ${seg.speaker}: ${seg.text}`,
  );
  return lines.join("\n");
}

async function buildSummaryText(meetingId: string): Promise<string> {
  const summary = await prisma.meetingAISummary.findFirst({
    where: { meetingId },
    select: { summary: true, keyPoints: true },
  });

  if (!summary) {
    throw new AppError("No summary available for this meeting", 400);
  }

  const lines: string[] = ["SUMMARY", "=======", summary.summary];
  if (summary.keyPoints.length > 0) {
    lines.push("", "KEY POINTS", "----------");
    summary.keyPoints.forEach((pt) => lines.push(`• ${pt}`));
  }
  return lines.join("\n");
}

function buildPdfBuffer(
  title: string,
  content: string,
  label: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "left" });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#666666")
      .text(label, { align: "left" });

    doc.moveDown(1.5);

    doc.font("Helvetica").fontSize(11).fillColor("#000000").text(content, {
      lineGap: 4,
    });

    doc.end();
  });
}

export async function exportMeeting(
  meetingId: string,
  userId: string,
  query: ExportQuery,
): Promise<{ buffer: Buffer | string; filename: string; mimeType: string }> {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true, title: true, startTime: true, type: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const { format, content } = query;

  const label =
    content === "transcript"
      ? `Transcript — ${meeting.title}`
      : `Summary — ${meeting.title}`;

  const textContent =
    content === "transcript"
      ? await buildTranscriptText(meetingId)
      : await buildSummaryText(meetingId);

  const safeName = meeting.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${safeName}_${content}.${format}`;

  if (format === "txt") {
    logger.info("Meeting export: TXT", { meetingId, content });
    return {
      buffer: textContent,
      filename,
      mimeType: "text/plain; charset=utf-8",
    };
  }

  // PDF
  const buffer = await buildPdfBuffer(meeting.title, textContent, label);
  logger.info("Meeting export: PDF", { meetingId, content });

  return {
    buffer,
    filename,
    mimeType: "application/pdf",
  };
}
