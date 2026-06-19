/**
 * Seed StandardTaskCatalog từ tài liệu nền "Danh mục công tác chuẩn — Nhà phố".
 * Source: erp.huynhgia6.com/SOP/danh-muc-cong-tac.html (md gốc: SoTay HuynhGia 19-06-2026).
 *
 * Idempotent: upsert by (phaseCode, taskCode). Chạy lại nhiều lần không tạo trùng.
 * Lưu ý luật giữ mã: KHÔNG xoá row nào — task không còn dùng → set retiredAt qua admin UI.
 *
 * Run: npx tsx prisma/seeds/standard-task-catalog.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type CatalogRow = {
  phaseCode: string;
  taskCode: string;
  phaseName: string;
  taskName: string;
  groupLabel?: string;
  note?: string;
  isHoldPoint?: boolean;
};

const PHASE_NAMES: Record<string, string> = {
  "01": "Chuẩn bị & khởi công (Phase 0)",
  "02": "Phần ngầm – Móng",
  "03": "Kết cấu BTCT phần thân",
  "04": "Phần mái",
  "05": "Xây tường – Tô trát – Cán nền",
  "06": "Chống thấm",
  "07": "Cơ điện (MEP)",
  "08": "Hoàn thiện",
  "09": "Vệ sinh – Nghiệm thu – Bàn giao",
};

// Transcribed 1:1 từ danh mục chuẩn anh đã duyệt (19/06/2026).
const CATALOG: CatalogRow[] = [
  // 01 Chuẩn bị & khởi công
  { phaseCode: "01", taskCode: "010", taskName: "Khảo sát hiện trạng đất nền & công trình lân cận", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "020", taskName: "Xác định ranh giới, mốc giới, cao độ chuẩn (mốc gửi)", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "030", taskName: "Kiểm tra & lập biên bản hiện trạng nhà liền kề", note: "chống tranh chấp — bắt buộc", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "040", taskName: "Phá dỡ công trình cũ (nếu có)", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "050", taskName: "Dọn dẹp, phát quang, san lấp mặt bằng", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "060", taskName: "Vận chuyển phế thải, xà bần ra khỏi công trường", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "070", taskName: "Định vị tim trục công trình (giác móng)", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "080", taskName: "Lắp dựng lán trại, kho, WC tạm", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "090", taskName: "Hàng rào tôn, lưới an toàn, biển báo công trường", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "100", taskName: "Đấu nối điện – nước thi công tạm", phaseName: PHASE_NAMES["01"] },
  { phaseCode: "01", taskCode: "110", taskName: "Tập kết máy móc, thiết bị, vật tư đợt đầu", phaseName: PHASE_NAMES["01"] },

  // 02 Phần ngầm – Móng
  { phaseCode: "02", taskCode: "010", taskName: "Ép / khoan cọc BTCT (nếu móng cọc)", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "020", taskName: "Cắt, đập đầu cọc, vệ sinh đầu cọc", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "030", taskName: "Đào đất hố móng / hố đài", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "040", taskName: "Gia cố nền, đầm chặt, đổ bê tông lót", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "050", taskName: "Lắp dựng cốt thép móng (đài, giằng)", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "060", taskName: "Lắp dựng cốp pha móng", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "070", taskName: "Đổ bê tông móng (đài, giằng)", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "080", taskName: "Xây / đổ bể tự hoại", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "090", taskName: "Xây / đổ bể nước ngầm (nếu có)", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "100", taskName: "Chống thấm cổ móng, hố ga, hố pit", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "110", taskName: "Lấp đất hố móng, đầm nền", phaseName: PHASE_NAMES["02"] },
  { phaseCode: "02", taskCode: "120", taskName: "Đổ bê tông nền tầng trệt (đan nền)", phaseName: PHASE_NAMES["02"] },

  // 03 Kết cấu BTCT phần thân (lặp theo từng tầng)
  { phaseCode: "03", taskCode: "010", taskName: "Lắp cốt thép cột", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "020", taskName: "Cốp pha cột", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "030", taskName: "Đổ bê tông cột", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "040", taskName: "Lắp cốp pha dầm, sàn", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "050", taskName: "Lắp cốt thép dầm, sàn", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "060", taskName: "Đặt chờ MEP trong sàn (ống điện, hộp kỹ thuật, ống xuyên sàn)", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "070", taskName: "Đổ bê tông dầm, sàn", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "080", taskName: "Bảo dưỡng bê tông", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "090", taskName: "Tháo cốp pha", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "100", taskName: "Kết cấu cầu thang BTCT", phaseName: PHASE_NAMES["03"] },
  { phaseCode: "03", taskCode: "110", taskName: "Lanh tô, bổ trụ, lam BTCT (nếu có)", phaseName: PHASE_NAMES["03"] },

  // 04 Phần mái
  { phaseCode: "04", taskCode: "010", taskName: "Kết cấu sàn mái BTCT (mái bằng): thép – cốp pha – đổ bê tông", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "020", taskName: "Tạo dốc, cán dốc về phễu thu", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "030", taskName: "Lắp sê nô, phễu thu, ống thoát nước mái", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "040", taskName: "Chống thấm mái", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "050", taskName: "Lắp hệ vì kèo, xà gồ thép/gỗ (mái dốc)", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "060", taskName: "Lắp cầu phong, li tô", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "070", taskName: "Lợp ngói / tôn", phaseName: PHASE_NAMES["04"] },
  { phaseCode: "04", taskCode: "080", taskName: "Xử lý nóc, diềm mái, úp nóc, máng xối", phaseName: PHASE_NAMES["04"] },

  // 05 Xây tường – Tô trát – Cán nền
  { phaseCode: "05", taskCode: "010", taskName: "Xây tường bao che", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "020", taskName: "Xây tường ngăn phòng", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "030", taskName: "Xây bậc cầu thang, xây bao khu WC", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "040", taskName: "Tô trát tường trong", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "050", taskName: "Tô trát tường ngoài", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "060", taskName: "Cán nền các tầng", phaseName: PHASE_NAMES["05"] },
  { phaseCode: "05", taskCode: "070", taskName: "Bo hèm cửa, gờ chỉ, nẹp góc", phaseName: PHASE_NAMES["05"] },

  // 06 Chống thấm
  { phaseCode: "06", taskCode: "010", taskName: "Chống thấm sàn WC, ban công", phaseName: PHASE_NAMES["06"] },
  { phaseCode: "06", taskCode: "020", taskName: "Chống thấm sân thượng", phaseName: PHASE_NAMES["06"] },
  { phaseCode: "06", taskCode: "030", taskName: "Chống thấm bể nước, bể phốt", phaseName: PHASE_NAMES["06"] },
  { phaseCode: "06", taskCode: "040", taskName: "Chống thấm chân tường, hộp gen, ống xuyên sàn", phaseName: PHASE_NAMES["06"] },
  { phaseCode: "06", taskCode: "050", taskName: "Ngâm thử nước & nghiệm thu chống thấm", isHoldPoint: true, note: "hold-point", phaseName: PHASE_NAMES["06"] },

  // 07 MEP — Phần âm
  { phaseCode: "07", taskCode: "010", taskName: "Đi ống điện âm sàn, đặt hộp box sàn", groupLabel: "Phần âm (trước tô)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "020", taskName: "Đục tường, đi ống điện âm tường", groupLabel: "Phần âm (trước tô)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "030", taskName: "Đi ống cấp nước âm (PPR), đầu chờ", groupLabel: "Phần âm (trước tô)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "040", taskName: "Đi ống thoát nước âm (PVC), đảm bảo độ dốc", groupLabel: "Phần âm (trước tô)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "050", taskName: "Đặt ống chờ điều hòa, máy nước nóng", groupLabel: "Phần âm (trước tô)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "060", taskName: "Test áp lực ống nước & nghiệm thu MEP âm", groupLabel: "Phần âm (trước tô)", isHoldPoint: true, note: "hold-point — trước khi tô", phaseName: PHASE_NAMES["07"] },
  // 07 MEP — Phần nổi & thiết bị
  { phaseCode: "07", taskCode: "070", taskName: "Kéo dây điện, đấu tủ điện", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "080", taskName: "Lắp công tắc, ổ cắm, mặt", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "090", taskName: "Lắp đèn chiếu sáng, đèn trang trí", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "100", taskName: "Lắp thiết bị vệ sinh (lavabo, bồn cầu, sen vòi)", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "110", taskName: "Lắp máy bơm, bồn nước, lọc nước", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "120", taskName: "Đi điện nhẹ (mạng, camera, chuông cửa)", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", phaseName: PHASE_NAMES["07"] },
  { phaseCode: "07", taskCode: "130", taskName: "Test toàn hệ điện – nước & nghiệm thu MEP", groupLabel: "Phần nổi & thiết bị (sau hoàn thiện)", isHoldPoint: true, note: "hold-point", phaseName: PHASE_NAMES["07"] },

  // 08 Hoàn thiện — Sàn & tường
  { phaseCode: "08", taskCode: "010", taskName: "Ốp lát gạch nền các phòng", groupLabel: "Sàn & tường", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "020", taskName: "Ốp gạch tường WC, bếp", groupLabel: "Sàn & tường", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "030", taskName: "Lát đá / sàn gỗ", groupLabel: "Sàn & tường", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "040", taskName: "Len chân tường", groupLabel: "Sàn & tường", phaseName: PHASE_NAMES["08"] },
  // Trần & sơn
  { phaseCode: "08", taskCode: "050", taskName: "Đóng trần thạch cao, khung xương", groupLabel: "Trần & sơn", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "060", taskName: "Bả matit, xử lý bề mặt", groupLabel: "Trần & sơn", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "070", taskName: "Sơn lót, sơn phủ nội thất", groupLabel: "Trần & sơn", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "080", taskName: "Sơn ngoại thất, sơn chống thấm ngoài", groupLabel: "Trần & sơn", phaseName: PHASE_NAMES["08"] },
  // Cầu thang
  { phaseCode: "08", taskCode: "090", taskName: "Ốp đá / gỗ mặt bậc, cổ bậc", groupLabel: "Cầu thang", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "100", taskName: "Lắp lan can, tay vịn cầu thang", groupLabel: "Cầu thang", phaseName: PHASE_NAMES["08"] },
  // Cửa & cơ khí
  { phaseCode: "08", taskCode: "110", taskName: "Lắp cửa đi, cửa sổ", groupLabel: "Cửa & cơ khí", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "120", taskName: "Lắp cổng, khung bảo vệ, hoa sắt", groupLabel: "Cửa & cơ khí", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "130", taskName: "Lắp lan can ban công", groupLabel: "Cửa & cơ khí", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "140", taskName: "Mái kính / tấm poly giếng trời, ô lấy sáng", groupLabel: "Cửa & cơ khí", phaseName: PHASE_NAMES["08"] },
  // Mặt tiền & ngoại thất
  { phaseCode: "08", taskCode: "150", taskName: "Ốp đá / vật liệu trang trí mặt tiền", groupLabel: "Mặt tiền & ngoại thất", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "160", taskName: "Lam, khung trang trí mặt tiền", groupLabel: "Mặt tiền & ngoại thất", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "170", taskName: "Hoàn thiện sân trước, sân sau", groupLabel: "Mặt tiền & ngoại thất", phaseName: PHASE_NAMES["08"] },
  { phaseCode: "08", taskCode: "180", taskName: "Sơn / ốp hàng rào, cổng", groupLabel: "Mặt tiền & ngoại thất", phaseName: PHASE_NAMES["08"] },

  // 09 Vệ sinh – Nghiệm thu – Bàn giao
  { phaseCode: "09", taskCode: "010", taskName: "Vệ sinh công nghiệp toàn nhà", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "020", taskName: "Nghiệm thu nội bộ tổng thể (theo SOP 10)", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "030", taskName: "Lập hồ sơ hoàn công, bản vẽ as-built", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "040", taskName: "Hồ sơ bảo hành & hướng dẫn sử dụng thiết bị", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "050", taskName: "Nghiệm thu bàn giao với khách", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "060", taskName: "Bàn giao chìa khóa, ký biên bản bàn giao", phaseName: PHASE_NAMES["09"] },
  { phaseCode: "09", taskCode: "070", taskName: "Tháo lán trại, dọn dẹp, hoàn trả mặt bằng", phaseName: PHASE_NAMES["09"] },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Thiếu DATABASE_URL trong .env");

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    let upserts = 0;
    for (let i = 0; i < CATALOG.length; i++) {
      const row = CATALOG[i];
      await prisma.standardTaskCatalog.upsert({
        where: { phaseCode_taskCode: { phaseCode: row.phaseCode, taskCode: row.taskCode } },
        create: {
          phaseCode: row.phaseCode,
          taskCode: row.taskCode,
          phaseName: row.phaseName,
          taskName: row.taskName,
          groupLabel: row.groupLabel ?? null,
          note: row.note ?? null,
          isHoldPoint: row.isHoldPoint ?? false,
          displayOrder: (i + 1) * 10,
        },
        update: {
          phaseName: row.phaseName,
          taskName: row.taskName,
          groupLabel: row.groupLabel ?? null,
          note: row.note ?? null,
          isHoldPoint: row.isHoldPoint ?? false,
          displayOrder: (i + 1) * 10,
        },
      });
      upserts++;
    }
    console.log(`✓ Seeded ${upserts} standard task catalog rows`);

    const stats = await prisma.standardTaskCatalog.groupBy({
      by: ["phaseCode"],
      _count: { _all: true },
      orderBy: { phaseCode: "asc" },
    });
    console.log("\nPhân bố theo giai đoạn:");
    stats.forEach((s) => console.log(`  ${s.phaseCode} — ${s._count._all} công tác`));

    const holdPoints = await prisma.standardTaskCatalog.count({ where: { isHoldPoint: true } });
    console.log(`\nHold-points: ${holdPoints}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
