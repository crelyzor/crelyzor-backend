import ExcelJS from "exceljs";

export async function generateLoginHistoryExcel(
  loginHistory: any[],
  days: number,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Monitoring Service";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Login History", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Column definitions
  sheet.columns = [
    { header: "User Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Organization(s)", key: "orgs", width: 35 },
    { header: "IP Address", key: "ip", width: 18 },
    { header: "User Agent", key: "agent", width: 45 },
    { header: "Login Time", key: "loginTime", width: 22 },
  ];

  // Header styling (bold + fill)
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Data rows
  for (const record of loginHistory) {
    const orgNames =
      record.user?.organizationMembers
        ?.map((m: any) => m.organization?.name)
        .filter(Boolean)
        .join(", ") || "-";

    sheet.addRow({
      name: record.user?.name || "-",
      email: record.user?.email || "-",
      orgs: orgNames,
      ip: record.ipAddress || "-",
      agent: record.userAgent || "-",
      loginTime: record.loginTime
        ? new Date(record.loginTime).toLocaleString()
        : "-",
    });
  }

  // Auto filter
  sheet.autoFilter = {
    from: "A1",
    to: "F1",
  };

  // Return as buffer
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
