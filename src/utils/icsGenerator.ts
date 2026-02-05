import { createEvent } from "ics";

/**
 * Generate iCalendar (.ics) content for meeting invitation
 * Returns the .ics content as a string (in-memory, no file system)
 */
export function generateMeetingICS(params: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  organizer: {
    name: string;
    email: string;
  };
  attendee: {
    name: string;
    email: string;
  };
  location?: string;
  url?: string; // Meeting link or frontend response page
}): string {
  const {
    title,
    description,
    startTime,
    endTime,
    organizer,
    attendee,
    location,
    url,
  } = params;

  // Generate unique event ID (combination of meeting title, organizer email, and timestamp)
  const eventId = `${title}-${organizer.email}-${startTime.getTime()}@experimentlabs.in`;

  const event = {
    title,
    description: description || "",
    start: [
      startTime.getUTCFullYear(),
      startTime.getUTCMonth() + 1,
      startTime.getUTCDate(),
      startTime.getUTCHours(),
      startTime.getUTCMinutes(),
    ] as [number, number, number, number, number],
    end: [
      endTime.getUTCFullYear(),
      endTime.getUTCMonth() + 1,
      endTime.getUTCDate(),
      endTime.getUTCHours(),
      endTime.getUTCMinutes(),
    ] as [number, number, number, number, number],
    organizer: {
      name: organizer.name,
      email: organizer.email,
    },
    attendees: [
      {
        name: attendee.name,
        email: attendee.email,
      },
    ],
    location: location || undefined,
    url: url || undefined,
    uid: eventId,
    status: "CONFIRMED" as const,
    busyStatus: "BUSY" as const,
  };

  // Generate .ics content
  const { error, value } = createEvent(event);

  if (error) {
    throw new Error(`Failed to generate ICS: ${error.message}`);
  }

  if (!value) {
    throw new Error("Failed to generate ICS: No value returned");
  }

  return value;
}

/**
 * Convert .ics content to base64 for email attachment
 */
export function encodeICSToBase64(icsContent: string): string {
  return Buffer.from(icsContent).toString("base64");
}
