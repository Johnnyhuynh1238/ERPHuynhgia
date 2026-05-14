import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import * as mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { getObjectFromMinio } from "@/lib/minio";

const MAX_TEXT_CHARS_PER_FILE = 30_000;
const MAX_OCR_CHARS_PER_FILE = 20_000;
const MAX_PDF_TEXT_PAGES_PER_FILE = 8;
const MAX_OCR_PAGES_PER_FILE = 2;

const execFileAsync = promisify(execFile);

export type AiFileInput = {
  fileName: string;
  fileKind: string;
  fileUrl: string;
  mimeType: string;
};

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function truncateText(text: string) {
  return text.length > MAX_TEXT_CHARS_PER_FILE ? `${text.slice(0, MAX_TEXT_CHARS_PER_FILE)}\n\n[Đã cắt bớt nội dung file do quá dài]` : text;
}

function truncateOcrText(text: string) {
  return text.length > MAX_OCR_CHARS_PER_FILE ? `${text.slice(0, MAX_OCR_CHARS_PER_FILE)}\n\n[Đã cắt bớt nội dung OCR do quá dài]` : text;
}

async function extractPdfPlainText(buffer: Buffer, fileName: string) {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "project-ai-pdf-text-"));
    const inputPath = join(dir, "input.pdf");
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-f", "1", "-l", String(MAX_PDF_TEXT_PAGES_PER_FILE), inputPath, "-"], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const text = truncateText(String(stdout).trim());
    console.info("[project-ai] pdf text fallback", { fileName, extractedChars: text.length });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[project-ai] pdf text fallback failed", { fileName, message });
    return "";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function commandOutputText(error: unknown) {
  const output = error as { stdout?: unknown; stderr?: unknown; message?: string };
  return {
    stdout: output.stdout ? String(output.stdout) : "",
    stderr: output.stderr ? String(output.stderr) : output.message || String(error),
  };
}

async function extractPdfOcrText(buffer: Buffer, fileName: string) {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "project-ai-pdf-"));
    const inputPath = join(dir, "input.pdf");
    const outputPattern = join(dir, "page-%03d.png");
    await writeFile(inputPath, buffer);

    await execFileAsync(
      "gs",
      [
        "-q",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pnggray",
        "-r120",
        "-dFirstPage=1",
        `-dLastPage=${MAX_OCR_PAGES_PER_FILE}`,
        `-sOutputFile=${outputPattern}`,
        inputPath,
      ],
      { timeout: 90_000, maxBuffer: 1024 * 1024 },
    );

    const imageFiles = (await readdir(dir)).filter((entry) => entry.startsWith("page-") && entry.endsWith(".png")).sort();
    const chunks: string[] = [];
    for (const imageFile of imageFiles) {
      try {
        const { stdout } = await execFileAsync("tesseract", [join(dir, imageFile), "stdout", "-l", "vie+eng", "--psm", "11"], {
          timeout: 90_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const text = String(stdout).trim();
        if (text) chunks.push(text);
      } catch (error) {
        const output = commandOutputText(error);
        if (output.stdout.trim()) chunks.push(output.stdout.trim());
        console.warn("[project-ai] pdf ocr page failed", { fileName, imageFile, message: output.stderr.slice(0, 500) });
      }
      if (chunks.join("\n\n").length >= MAX_OCR_CHARS_PER_FILE) break;
    }

    const text = truncateOcrText(chunks.join("\n\n"));
    console.info("[project-ai] pdf ocr fallback", { fileName, renderedPages: imageFiles.length, extractedChars: text.length });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[project-ai] pdf ocr fallback failed", { fileName, message });
    return "";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractSpreadsheetText(buffer: Buffer) {
  const sheets = (await readExcelFile(buffer)) as Array<{ sheet: string; data: unknown[][] }>;
  return sheets
    .map((sheet) => {
      const rows = sheet.data.slice(0, 120).map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : cell ?? "")).join(" | "));
      return `# Sheet: ${sheet.sheet}\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

export async function buildFileContext(files: AiFileInput[]) {
  const sections: string[] = [];
  const unsupported: string[] = [];

  for (const file of files) {
    const key = minioKey(file.fileUrl);
    if (!key) {
      unsupported.push(`${file.fileName}: đường dẫn không phải MinIO`);
      continue;
    }

    const object = await getObjectFromMinio(key);
    const name = file.fileName.toLowerCase();
    const header = `Loại hồ sơ: ${file.fileKind}\nTên file: ${file.fileName}`;

    if (file.mimeType === "application/pdf" || name.endsWith(".pdf")) {
      const plainText = await extractPdfPlainText(object.buffer, file.fileName);
      const ocrText = plainText.length >= 500 ? "" : await extractPdfOcrText(object.buffer, file.fileName);
      const extractedText = [plainText, ocrText].filter((text) => text.trim()).join("\n\n");
      if (extractedText.trim()) {
        sections.push(`${header}\nNội dung trích xuất từ PDF:\n${extractedText}`);
      } else {
        unsupported.push(`${file.fileName}: PDF không trích xuất được text (pdftotext + OCR đều fail)`);
      }
      continue;
    }

    if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: object.buffer });
      sections.push(`${header}\nNội dung file:\n${truncateText(result.value || "")}`);
      continue;
    }

    if (name.endsWith(".xlsx")) {
      const text = await extractSpreadsheetText(object.buffer);
      sections.push(`${header}\nNội dung file:\n${truncateText(text)}`);
      continue;
    }

    unsupported.push(`${file.fileName}: định dạng legacy chưa parse tự động trong AI (.doc/.xls)`);
  }

  if (unsupported.length > 0) {
    sections.push(`Các file sau chưa đọc được nội dung tự động, hãy tạo warning nếu chúng quan trọng:\n${unsupported.join("\n")}`);
  }

  return sections.join("\n\n---\n\n");
}
