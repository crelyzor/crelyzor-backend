import {
  templates,
  type TemplateId,
  type CardTemplateData,
} from "./cardTemplates";
import { generateQrSvg } from "./qrGenerator";

export async function renderCardHtml(
  templateId: TemplateId,
  data: CardTemplateData,
): Promise<{ htmlContent: string; htmlBackContent: string }> {
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  // Only generate QR if showQr is true
  const qrSvg = data.showQr
    ? await generateQrSvg(data.publicUrl, data.accentColor)
    : "";

  return {
    htmlContent: template.front(data),
    htmlBackContent: template.back(data, qrSvg),
  };
}
