const VIDEO_MEETING_PATTERNS = [
  /^https:\/\/meet\.google\.com\//,
  /^https:\/\/[\w-]+\.zoom\.us\//,
  /^https:\/\/teams\.microsoft\.com\//,
  /^https:\/\/[\w-]+\.webex\.com\//,
];

export function isVideoMeetingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return VIDEO_MEETING_PATTERNS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}
