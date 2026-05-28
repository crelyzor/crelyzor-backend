import winston from "winston";

const { printf } = winston.format;

// Fields that must never appear in log output — they hold encrypted content or plaintext PII.
// Any log call that passes these as metadata keys will have the value replaced with [REDACTED].
const PII_DENYLIST = new Set([
  "fullText",
  "text",
  "note",
  "content",
  "description",
  "phone",
  "email",
  "guestEmail",
  "guestName",
  "guestNote",
  "company",
  "accessToken",
  "refreshToken",
  "wrappedDek",
  "summary",
  "keyPoints",
]);

function redactPii(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    out[key] = PII_DENYLIST.has(key) ? "[REDACTED]" : val;
  }
  return out;
}

export const createLogFormat = (includeMetadata: boolean = false) => {
  return printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${stack || message}`;

    if (includeMetadata && Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(redactPii(meta))}`;
    }

    return log;
  });
};

export { redactPii, PII_DENYLIST };

export default {
  createLogFormat,
};
