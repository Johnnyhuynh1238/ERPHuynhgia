import { chromium } from "playwright";
import { CustomerExportJobStatus, CustomerExportJobType } from "@prisma/client";
import { buildCustomerJournalEvents, normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { getObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

function minioKey(url: string | null | undefined) {
  return url?.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function csvEscape(value: string | number | Date | null | undefined) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function dateText(value: Date) {
  return value.toLocaleDateString("vi-VN");
}

async function buildSummaryPdf(projectId: string) {
  const [project, events] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true, customerName: true, address: true } }),
    buildCustomerJournalEvents(projectId),
  ]);
  if (!project) throw new Error("Project not found");

  const rows = events
    .slice(0, 300)
    .map(
      (event) => `<section class="entry">
        <div class="date">${escapeHtml(dateText(event.date))} · ${escapeHtml(event.type)}</div>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description || "-")}</p>
      </section>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
    body{font-family:Arial,sans-serif;color:#0f172a;padding:22px;line-height:1.45}
    h1{margin:0;color:#1f4e79;font-size:24px}.sub{color:#475569;font-size:12px;margin:6px 0 18px}
    .entry{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;page-break-inside:avoid}
    .date{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}.entry h3{font-size:15px;margin:5px 0}.entry p{font-size:12px;margin:0;color:#334155}
  </style></head><body>
    <h1>Nhật ký thi công - Cổng chủ nhà</h1>
    <div class="sub">${escapeHtml(project.code)} - ${escapeHtml(project.name)} · ${escapeHtml(project.customerName)} · ${escapeHtml(project.address || "")}</div>
    ${rows || "<div>Không có dữ liệu</div>"}
  </body></html>`;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer: Buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = table[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZip(files: Array<{ name: string; data: Buffer; mtime?: Date }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = file.data;
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(file.mtime || new Date());

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

async function buildZip(projectId: string) {
  const [summaryPdf, events, drawings, payments] = await Promise.all([
    buildSummaryPdf(projectId),
    buildCustomerJournalEvents(projectId),
    prisma.projectDrawing.findMany({ where: { projectId }, orderBy: [{ displayOrder: "asc" }, { uploadedAt: "desc" }] }),
    prisma.paymentSchedule.findMany({
      where: { projectId },
      select: {
        id: true,
        type: true,
        installmentNo: true,
        phaseNumber: true,
        description: true,
        milestoneDescription: true,
        amount: true,
        dueDate: true,
        expectedDate: true,
        status: true,
        paidAt: true,
        paidAmount: true,
        actualPaidDate: true,
        actualPaidAmount: true,
        receiptUrl: true,
        paymentNote: true,
        notes: true,
      },
    }),
  ]);

  const files: Array<{ name: string; data: Buffer; mtime?: Date }> = [
    { name: "00_TomTat.pdf", data: summaryPdf },
    {
      name: "04_QC_Logs/qc.csv",
      data: Buffer.from(
        [
          "date,task,title,note,photoCount",
          ...events.filter((event) => event.type === "qc").map((event) => [event.date, event.taskCode, event.title, event.description, event.photos?.length || 0].map(csvEscape).join(",")),
        ].join("\n"),
        "utf8",
      ),
    },
    {
      name: "06_BienLai/receipts.csv",
      data: Buffer.from(
        [
          "installment,description,paidAt,amount,receiptUrl",
          ...payments.map((row) => {
            const payment = normalizePaymentSchedule(row);
            return [payment.installmentNo, payment.description, payment.paidAt, payment.paidAmount || payment.amount, payment.receiptUrl].map(csvEscape).join(",");
          }),
        ].join("\n"),
        "utf8",
      ),
    },
  ];
  const photoRows = ["date,type,title,sourceUrl,filename"];
  const usedPhotoNames = new Set<string>();

  for (const event of events) {
    if (event.type !== "photo" && event.type !== "qc") continue;
    const photos = event.photos || [];
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const key = minioKey(photo.url);
      const extension = key?.match(/\.[a-zA-Z0-9]+$/)?.[0] || ".jpg";
      const baseName = safeFilename(`${event.date.toISOString().slice(0, 10)}_${event.type}_${event.taskCode || event.id}_${index + 1}`);
      let filename = `${baseName}${extension}`;
      let suffix = 2;
      while (usedPhotoNames.has(filename)) {
        filename = `${baseName}_${suffix}${extension}`;
        suffix += 1;
      }
      usedPhotoNames.add(filename);
      photoRows.push([event.date, event.type, event.title, photo.url, key ? filename : ""].map(csvEscape).join(","));
      if (!key) continue;
      const file = await getObjectFromMinio(key);
      files.push({ name: `03_Anh/${filename}`, data: file.buffer, mtime: event.date });
    }
  }
  files.push({ name: "03_Anh/index.csv", data: Buffer.from(photoRows.join("\n"), "utf8") });

  files.push({
    name: "02_BanVe/drawings.csv",
    data: Buffer.from(["name,description,fileUrl", ...drawings.map((drawing) => [drawing.name, drawing.description, drawing.fileUrl].map(csvEscape).join(","))].join("\n"), "utf8"),
  });

  for (const drawing of drawings) {
    const key = minioKey(drawing.fileUrl);
    if (!key) continue;
    const file = await getObjectFromMinio(key);
    files.push({ name: `02_BanVe/${safeFilename(drawing.name)}.pdf`, data: file.buffer, mtime: drawing.uploadedAt });
  }

  for (const row of payments) {
    const payment = normalizePaymentSchedule(row);
    const key = minioKey(payment.receiptUrl);
    if (!key) continue;
    const file = await getObjectFromMinio(key);
    files.push({ name: `06_BienLai/${safeFilename(`${payment.installmentNo}_${payment.description}`)}.pdf`, data: file.buffer, mtime: payment.paidAt || new Date() });
  }

  return createZip(files);
}

export async function processCustomerExportJob(jobId: string) {
  const job = await prisma.customerExportJob.findUnique({ where: { id: jobId }, select: { id: true, projectId: true, type: true, status: true } });
  if (!job || job.status === CustomerExportJobStatus.ready) return job;

  await prisma.customerExportJob.update({ where: { id: jobId }, data: { status: CustomerExportJobStatus.processing, error: null } });

  try {
    const isPdf = job.type === CustomerExportJobType.pdf;
    const buffer = isPdf ? await buildSummaryPdf(job.projectId) : await buildZip(job.projectId);
    const ext = isPdf ? "pdf" : "zip";
    const key = `projects/${job.projectId}/customer-exports/${job.id}.${ext}`;

    await putObjectToMinio({ key, body: buffer, contentType: isPdf ? "application/pdf" : "application/zip" });

    return prisma.customerExportJob.update({
      where: { id: job.id },
      data: {
        status: CustomerExportJobStatus.ready,
        fileUrl: `minio://${key}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    return prisma.customerExportJob.update({
      where: { id: job.id },
      data: { status: CustomerExportJobStatus.failed, error: error instanceof Error ? error.message : "Không thể tạo file export" },
    });
  }
}
