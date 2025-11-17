import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse-debugging-disabled";

export const runtime = "nodejs"; // importante na Vercel

function normalizeGoogleDriveUrl(urlString) {
  const u = new URL(urlString);

  if (u.hostname === "drive.google.com") {
    // Formato: /file/d/{id}/view
    const match = u.pathname.match(/^\/file\/d\/([^/]+)/);
    if (match) {
      const id = match[1];
      return `https://drive.google.com/uc?export=download&id=${id}`;
    }
  }

  return urlString;
}

async function bufferFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar arquivo: ${res.status} ${res.statusText}`);
  }

  const contentType = (res.headers.get("content-type") || "").split(";")[0];
  const contentDisposition = res.headers.get("content-disposition") || "";

  let filename = "";
  const match = contentDisposition.match(
    /filename\*?=(?:UTF-8'')?["']?([^;"']+)/
  );
  if (match) {
    filename = decodeURIComponent(match[1].replace(/"/g, ""));
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, mimeType: contentType, filename };
}

async function extractFromPdf(buffer) {
  // 👇 v1 do pdf-parse: função simples
  const data = await pdfParse(buffer);

  return {
    format: "markdown",
    content: formatPdfTextToMarkdown(data.text),
  };
}

function formatPdfTextToMarkdown(text) {
  if (!text) return "";

  let t = text;

  // Remove excesso de quebras (>2)
  t = t.replace(/\n{3,}/g, "\n\n");

  // Remove espaços inúteis no começo das linhas
  t = t.replace(/^[ \t]+/gm, "");

  // Remove múltiplos espaços no meio
  t = t.replace(/ +/g, " ");

  // Converte seções comuns em headings
  t = t.replace(/^ABOUT\b/i, "## About");
  t = t.replace(/^EDUCATION\b/i, "## Education");
  t = t.replace(/^EXPERIENCES\b/i, "## Experiences");
  t = t.replace(/^SKILLS\b/i, "## Skills");
  t = t.replace(/^OTHER PROJECTS\b/i, "## Other Projects");
  t = t.replace(/^LANGUAGES\b/i, "## Languages");
  t = t.replace(/^EXTRACURRICULAR ACTIVITIES\b/i, "## Extracurricular Activities");

  // Lista por bullet
  t = t.replace(/●/g, "-");

  // Normaliza quebras
  t = t.trim();

  return t;
}

async function extractFromDocx(buffer) {
  const result = await mammoth.convertToHtml({ buffer });
  return {
    format: "html",
    content: result.value,
  };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !body.url) {
      return NextResponse.json(
        { error: "Envie um JSON com o campo 'url'." },
        { status: 400 }
      );
    }

    const originalUrl = body.url;

    // 1) Normaliza URL do Google Drive (se for o caso)
    const downloadUrl = normalizeGoogleDriveUrl(originalUrl);

    // 2) Baixa arquivo e pega buffer + headers
    const { buffer, mimeType: headerMime, filename: headerFilename } =
      await bufferFromUrl(downloadUrl);

    // 3) Descobre filename base (header > url)
    const urlObj = new URL(originalUrl);
    const urlFilename = urlObj.pathname.split("/").pop() || "";
    const filename = headerFilename || urlFilename || "arquivo";

    // 4) Descobre mimeType (header > extensão > assinatura PDF)
    let mimeType = headerMime || "";
    const lower = filename.toLowerCase();

    if (!mimeType || mimeType === "application/octet-stream") {
      if (lower.endsWith(".pdf")) {
        mimeType = "application/pdf";
      } else if (lower.endsWith(".docx")) {
        mimeType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (lower.endsWith(".doc")) {
        mimeType = "application/msword";
      }
    }

    // Fallback: assinatura de PDF (%PDF)
    if (!mimeType && buffer.slice(0, 4).toString() === "%PDF") {
      mimeType = "application/pdf";
    }

    let result;

    if (mimeType === "application/pdf") {
      result = await extractFromPdf(buffer);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      result = await extractFromDocx(buffer);
    } else if (mimeType === "application/msword") {
      return NextResponse.json(
        {
          error:
            "Arquivos .DOC (formato antigo) não são suportados diretamente. Converta para .DOCX ou .PDF antes.",
        },
        { status: 415 }
      );
    } else {
      return NextResponse.json(
        {
          error:
            `Tipo de arquivo não suportado. MimeType detectado: "${mimeType || "desconhecido"}". Use PDF ou DOCX.`,
        },
        { status: 415 }
      );
    }

    return NextResponse.json({
      filename,
      mimeType,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        error: "Falha ao processar arquivo.",
        detail: err && err.message,
      },
      { status: 500 }
    );
  }
}
