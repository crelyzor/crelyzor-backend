import {
  templates,
  type TemplateId,
  type CardTemplateData,
} from "./cardTemplates";
import { safeColor } from "./helpers";
import { generateQrSvg } from "./qrGenerator";

export async function renderCardHtml(
  templateId: TemplateId,
  data: CardTemplateData,
): Promise<{ htmlContent: string; htmlBackContent: string }> {
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const safeData: CardTemplateData = {
    ...data,
    accentColor: safeColor(data.accentColor),
  };

  const qrSvg = safeData.showQr
    ? await generateQrSvg(data.publicUrl, data.accentColor)
    : "";

  return {
    htmlContent: template.front(safeData),
    htmlBackContent: template.back(safeData, qrSvg),
  };
}
