import { getCustomers, getKeys, getPickupResponses, getCurrentWeekId, buildPickupList, buildCombinedList, AREA_CONFIG } from "../../../lib/sheets";
import ExcelJS from "exceljs";

// GET /api/pickup-list-xlsx?area=uptown&day=Friday
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area") || "uptown";
  const day = searchParams.get("day");
  const week = searchParams.get("week") || getCurrentWeekId();

  if (!day) {
    return new Response("Missing day parameter", { status: 400 });
  }

  try {
    const config = AREA_CONFIG[area];
    const [customers, keysMap, responses] = await Promise.all([
      getCustomers(area),
      getKeys(),
      getPickupResponses(area, week),
    ]);

    const isDay2 = day.toLowerCase() === config.day2.toLowerCase();
    let pickupList;
    let isCombined = false;
    let totalDropoffs = 0;
    let totalPickups = 0;

    if (isDay2) {
      isCombined = true;
      const day1Emails = responses
        .filter((r) => r[3]?.toLowerCase() === config.day1.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const day2Emails = responses
        .filter((r) => r[3]?.toLowerCase() === config.day2.toLowerCase())
        .map((r) => r[2]?.toLowerCase());

      const day1Customers = customers.filter((c) =>
        c.emails.some((e) => day1Emails.includes(e.toLowerCase()))
      );
      const day2Customers = customers.filter((c) =>
        c.emails.some((e) => day2Emails.includes(e.toLowerCase()))
      );

      totalDropoffs = day1Customers.length;
      totalPickups = day2Customers.length;
      pickupList = buildCombinedList(day1Customers, day2Customers, keysMap, area);
    } else {
      const confirmedEmails = responses
        .filter((r) => r[3]?.toLowerCase() === day.toLowerCase())
        .map((r) => r[2]?.toLowerCase());
      const confirmedCustomers = customers.filter((c) =>
        c.emails.some((e) => confirmedEmails.includes(e.toLowerCase()))
      );
      totalPickups = confirmedCustomers.length;
      pickupList = buildPickupList(confirmedCustomers, keysMap, area, "pickup");
    }

    // Build Excel workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${day} Route`);

    // Title row
    const titleRow = ws.addRow([`${day} Route — ${area}`]);
    titleRow.getCell(1).font = { bold: true, size: 16 };
    ws.mergeCells("A1:D1");

    // Date + summary row
    const dateStr = new Date().toLocaleDateString();
    const summary = isCombined
      ? `${dateStr} | ${totalDropoffs} drop-offs + ${totalPickups} pickups`
      : `${dateStr} | ${totalPickups} pickups`;
    const summaryRow = ws.addRow([summary]);
    summaryRow.getCell(1).font = { size: 11, color: { argb: "FF666666" } };
    ws.mergeCells("A2:D2");

    // Empty row
    ws.addRow([]);

    // Headers
    const headers = isCombined
      ? ["Address", "Unit", "Entry Method", "Type"]
      : ["Address", "Unit", "Entry Method"];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle" };
    });

    // Data rows
    const greenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } };
    const redFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };
    const greenFont = { bold: true, color: { argb: "FF155724" } };
    const redFont = { bold: true, color: { argb: "FF721C24" } };
    const border = {
      top: { style: "thin", color: { argb: "FFDDDDDD" } },
      bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      left: { style: "thin", color: { argb: "FFDDDDDD" } },
      right: { style: "thin", color: { argb: "FFDDDDDD" } },
    };

    for (const p of pickupList) {
      const rowData = isCombined
        ? [p.address, p.unit, p.entryMethod, p.type === "pickup" ? "PICK UP" : "DROP OFF"]
        : [p.address, p.unit, p.entryMethod];

      const row = ws.addRow(rowData);
      const isPickup = p.type === "pickup";
      const fill = isCombined ? (isPickup ? greenFill : redFill) : undefined;

      row.eachCell((cell, colNumber) => {
        cell.border = border;
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.font = { size: 11 };
        if (fill) cell.fill = fill;

        // Bold + colored font for the Type column
        if (isCombined && colNumber === 4) {
          cell.font = isPickup
            ? { ...greenFont, size: 12 }
            : { ...redFont, size: 12 };
        }
      });
    }

    // Column widths
    ws.getColumn(1).width = 22; // Address
    ws.getColumn(2).width = 10; // Unit
    ws.getColumn(3).width = 28; // Entry Method
    if (isCombined) ws.getColumn(4).width = 14; // Type

    // Row heights
    ws.eachRow((row) => {
      row.height = 22;
    });

    // Generate buffer
    const buffer = await wb.xlsx.writeBuffer();

    const filename = `${day}-Route-${area}-${dateStr.replace(/\//g, "-")}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("XLSX generation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
