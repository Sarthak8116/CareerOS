/**
 * Minimal PDF generator for tests.
 *
 * Built by hand rather than checked in as a binary fixture so the tests can
 * state exactly what is on each page and assert that the rendered bytes match.
 * Pages are drawn with vector operators only — filled rectangles — because the
 * base-14 fonts need font data pdf.js fetches over HTTP, which is unavailable
 * under Node. Rectangles render everywhere, and "page N draws N rectangles"
 * gives every page a distinct, countable amount of ink.
 */

export interface TinyPdfOptions {
  pages?: number;
  width?: number;
  height?: number;
  /** Emit pages with an empty content stream — nothing at all is drawn. */
  blank?: boolean;
  /**
   * Attach a standard-security-handler /Encrypt dictionary with unusable key
   * material, so pdf.js cannot open it with the empty password.
   */
  encrypted?: boolean;
}

/** Number of filled rectangles drawn on the given 1-based page. */
export function inkRectangles(pageNumber: number): number {
  return pageNumber;
}

export function tinyPdf(options: TinyPdfOptions = {}): Uint8Array {
  const {
    pages = 1,
    width = 612,
    height = 792,
    blank = false,
    encrypted = false,
  } = options;

  const objects: string[] = [];
  const pageIds: number[] = [];
  for (let i = 0; i < pages; i++) pageIds.push(3 + i * 2);
  const encryptId = 3 + pages * 2;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] ` +
    `/Count ${pages} >>`;

  for (let i = 0; i < pages; i++) {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Contents ${contentId} 0 R >>`;

    let stream = "";
    if (!blank) {
      const parts = ["0 0 0 rg"];
      for (let r = 0; r < inkRectangles(i + 1); r++) {
        parts.push(`60 ${height - 140 - r * 80} 160 60 re f`);
      }
      stream = parts.join("\n");
    }
    objects[contentId] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  if (encrypted) {
    // /R 2 /V 1 with 32 bytes of zeros for both /O and /U: structurally valid,
    // cryptographically unusable, so pdf.js reports "this needs a password".
    const zeros = "0".repeat(64);
    objects[encryptId] =
      `<< /Filter /Standard /V 1 /R 2 /O <${zeros}> /U <${zeros}> ` +
      `/P -1 >>`;
  }

  const lastId = encrypted ? encryptId : encryptId - 1;
  let out = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id <= lastId; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = out.length;
  const size = lastId + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastId; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const trailerExtras = encrypted
    ? ` /Encrypt ${encryptId} 0 R /ID [<${"a".repeat(32)}> <${"a".repeat(32)}>]`
    : "";
  out +=
    `trailer\n<< /Size ${size} /Root 1 0 R${trailerExtras} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return latin1Bytes(out);
}

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
