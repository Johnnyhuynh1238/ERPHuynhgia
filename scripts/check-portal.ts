import { prisma } from "../lib/prisma";

(async () => {
  const rows = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      code: true,
      customerName: true,
      customerPortalEnabled: true,
      customerPortalToken: true,
      actualEndDate: true,
      updatedAt: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})();
