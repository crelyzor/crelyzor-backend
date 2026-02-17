import QRCode from "qrcode";

/**
 * Generate an inline SVG string for a QR code.
 * Uses accent color for the QR modules on a transparent background.
 */
export async function generateQrSvg(
  url: string,
  accentColor: string = "#d4af61",
): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    width: 140,
    margin: 1,
    color: {
      dark: accentColor,
      light: "#00000000", // transparent
    },
  });
  return svg;
}
