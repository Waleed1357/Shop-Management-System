import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Complaint, InvoiceWithComplaint, ShopPurchase, Technician, TechnicianPayment, TechnicianPurchase } from "./types";
import { formatDate, formatMoney, formatWarranty, todayISO, warrantyEndDate } from "./utils";
import { renderUrduBadge, renderUrduTerms } from "./urdu-terms";

/*
 * Every printed document (complaint slip, invoice, purchase receipt, technician statement,
 * list exports) is built from the same pieces below, so they all share one design:
 *   red strip · logo + business name · number box · status pill · detail cards ·
 *   item table · totals box · note box · signatures · footer.
 */

interface Branding {
  businessName: string;
  logoUrl: string | null;
}

type RGB = [number, number, number];
const RED: RGB = [220, 38, 38];
const INK: RGB = [15, 23, 42]; // slate-900
const MUTED: RGB = [100, 116, 139]; // slate-500
const LINE: RGB = [226, 232, 240]; // slate-200
const PANEL: RGB = [248, 250, 252]; // slate-50
const L = 14; // left margin
const R = 196; // right margin (A4 portrait)
const TAGLINE = "LED / TV Repair & Service  ·  Wah Cantt";

/** Printed at the bottom of every receipt. Edit here to change addresses or phone numbers. */
const BRANCHES: { name: string; address: string; phone: string }[] = [
  { name: "Branch # 1", address: "Awan Electronics, Awan Plaza, Barrier # 2, G.T. Road, Wah Cantt", phone: "0309 8997044" },
  { name: "Branch # 2", address: "Shop # 2 & 4, Near Saifi Medical Store, Laiq Ali Chowk, Wah Cantt", phone: "0344 9483676" },
  { name: "Branch # 3", address: "Awan Electronics, St # 5, Model Town Phase II", phone: "0370 5030519" },
];

const STATUS_STYLE: Record<string, { label: string; fill: RGB; text: RGB }> = {
  pending: { label: "PENDING", fill: [254, 243, 199], text: [180, 83, 9] },
  in_progress: { label: "IN PROGRESS", fill: [219, 234, 254], text: [29, 78, 216] },
  resolved: { label: "RESOLVED", fill: [220, 252, 231], text: [21, 128, 61] },
  paid: { label: "PAID", fill: [220, 252, 231], text: [21, 128, 61] },
};

type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };
const tableEnd = (doc: jsPDF) => (doc as DocWithTable).lastAutoTable.finalY;

/** Loads an image URL into a data URL so jsPDF can embed it. Returns null on failure. */
async function loadImage(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * Red strip, logo, business name, tagline, status badge and the number box on the right.
 * Returns the y where the page content starts.
 */
async function brandHeader(doc: jsPDF, branding: Branding, box: { label: string; value: string; sub?: string }, status?: string) {
  doc.setFillColor(...RED).rect(0, 0, doc.internal.pageSize.getWidth(), 3, "F");

  const logo = await loadImage(branding.logoUrl);
  let textX = L;
  if (logo) {
    try {
      doc.addImage(logo, L, 10, 22, 22);
      textX = L + 27;
    } catch {
      /* unsupported image format - skip the logo */
    }
  }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...INK);
  doc.text(doc.splitTextToSize(branding.businessName.toUpperCase(), 118 - textX + L), textX, 19);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(TAGLINE, textX, 30);

  const boxX = 140;
  doc.setFillColor(254, 242, 242).setDrawColor(...RED).setLineWidth(0.4);
  doc.roundedRect(boxX, 9, R - boxX, 27, 3, 3, "FD");
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
  doc.text(box.label.toUpperCase(), boxX + 5, 16, { charSpace: 0.4 });
  doc.setFont("helvetica", "bold").setFontSize(box.value.length > 12 ? 13 : 17).setTextColor(...RED);
  doc.text(box.value, boxX + 5, 24.5);
  if (box.sub) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text(box.sub, boxX + 5, 31.5);
  }

  // Status badge under the tagline (e.g. PAID / PENDING / IN PROGRESS)
  if (status) {
    const style = STATUS_STYLE[status] ?? { label: status.replace("_", " ").toUpperCase(), fill: LINE, text: INK };
    doc.setFont("helvetica", "bold").setFontSize(7.5);
    const w = doc.getTextWidth(style.label) + 8;
    doc.setFillColor(...style.fill).roundedRect(textX, 33, w, 6, 3, 3, "F");
    doc.setTextColor(...style.text).text(style.label, textX + w / 2, 37, { align: "center" });
  }

  doc.setDrawColor(...LINE).setLineWidth(0.4).line(L, 43, R, 43);
  return 49;
}

/** A card with a red section title and "label / value" rows. Returns the card's bottom y. */
function infoCard(doc: jsPDF, x: number, y: number, w: number, title: string, rows: [string, string][], minHeight = 0) {
  const rowHeight = (label: string, lines: string[]) => (label ? 5 : 0) + lines.length * 5 + 4;
  doc.setFont("helvetica", "bold").setFontSize(10.5);
  const wrapped = rows.map(([label, value]) => [label, doc.splitTextToSize(value || "-", w - 10) as string[]] as const);
  const height = Math.max(16 + wrapped.reduce((h, [label, lines]) => h + rowHeight(label, lines), 0), minHeight);

  doc.setFillColor(...PANEL).setDrawColor(...LINE).setLineWidth(0.3);
  doc.roundedRect(x, y, w, height, 3, 3, "FD");
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...RED);
  doc.text(title.toUpperCase(), x + 5, y + 8, { charSpace: 0.6 });
  doc.setDrawColor(...RED).setLineWidth(0.6).line(x + 5, y + 10, x + 15, y + 10);

  let rowY = y + 17;
  for (const [label, lines] of wrapped) {
    if (label) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
      doc.text(label, x + 5, rowY);
    }
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...INK);
    doc.text(lines, x + 5, label ? rowY + 5 : rowY);
    rowY += rowHeight(label, lines);
  }
  return y + height;
}

/** Two cards side by side, same height. Returns the y below them. */
function cardPair(doc: jsPDF, y: number, left: [string, [string, string][]], right: [string, [string, string][]]) {
  const gap = 6;
  const w = (R - L - gap) / 2;
  const measure = new jsPDF();
  const height = Math.max(infoCard(measure, 0, 0, w, ...left), infoCard(measure, 0, 0, w, ...right));
  infoCard(doc, L, y, w, ...left, height);
  infoCard(doc, L + w + gap, y, w, ...right, height);
  return y + height;
}

/** Item table in the shared style. `money` = column indexes to right-align. Returns the y below it. */
function itemTable(doc: jsPDF, y: number, head: string[], body: (string | number)[][], money: number[] = [], extra: Parameters<typeof autoTable>[1] = {}) {
  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.map((row) => row.map(String)),
    theme: "grid",
    margin: { left: L, right: doc.internal.pageSize.getWidth() - R },
    styles: { font: "helvetica", fontSize: 9.5, textColor: INK, lineColor: LINE, lineWidth: 0.2, cellPadding: 3 },
    headStyles: { fillColor: PANEL, textColor: MUTED, fontStyle: "bold", fontSize: 8 },
    columnStyles: Object.fromEntries(money.map((i) => [i, { halign: "right" as const }])),
    ...extra,
  });
  return tableEnd(doc);
}

/** Totals on the right. The last row is highlighted. Returns the y below it. */
function totalsBox(doc: jsPDF, y: number, rows: [string, string][]) {
  const x = 116;
  const h = 8 + rows.length * 7;
  doc.setFillColor(...PANEL).setDrawColor(...LINE).setLineWidth(0.3);
  doc.roundedRect(x, y, R - x, h, 3, 3, "FD");
  rows.forEach(([label, value], i) => {
    const last = i === rows.length - 1;
    const rowY = y + 8 + i * 7;
    if (last && rows.length > 1) doc.setDrawColor(...LINE).line(x + 4, rowY - 5, R - 4, rowY - 5);
    doc.setFont("helvetica", last ? "bold" : "normal").setFontSize(last ? 11 : 9.5).setTextColor(...(last ? INK : MUTED));
    doc.text(label, x + 5, rowY);
    doc.setTextColor(...(last ? RED : INK)).setFont("helvetica", "bold");
    doc.text(value, R - 5, rowY, { align: "right" });
  });
  return y + h;
}

/** Lowest y the page content may reach before the signature / branches area. */
const CONTENT_BOTTOM = 229;

/**
 * Urdu warranty terms in a yellow box (drawn as an image, see lib/urdu-terms.ts).
 * Shrinks a little if space is tight, or moves to a new page if the document is very long.
 */
async function warrantyBox(doc: jsPDF, y: number) {
  const pad = 4;
  const terms = await renderUrduTerms(R - L - pad * 2);
  if (!terms) return y;

  let imgW = R - L - pad * 2;
  let imgH = terms.heightMm;
  const space = CONTENT_BOTTOM - y - pad * 2;
  if (imgH > space) {
    if (space >= imgH * 0.7) {
      imgW *= space / imgH; // shrink to fit (keeps the shape)
      imgH = space;
    } else {
      doc.addPage();
      doc.setFillColor(...RED).rect(0, 0, 210, 3, "F");
      y = 14;
    }
  }

  doc.setFillColor(255, 251, 235).setDrawColor(253, 230, 138).setLineWidth(0.3);
  doc.roundedRect(L, y, R - L, imgH + pad * 2, 3, 3, "FD");
  // Right-aligned, because Urdu reads right to left
  doc.addImage(terms.dataUrl, "PNG", R - pad - imgW, y + pad, imgW, imgH);
  return y + imgH + pad * 2;
}

/** Signature lines, our branches, the thank-you line and the red strip at the bottom of the page. */
function closing(doc: jsPDF, branding: Branding, signatures = true) {
  if (signatures) {
    // Only the shop signs (no customer signature)
    const signY = 236;
    doc.setDrawColor(...MUTED).setLineWidth(0.3);
    doc.line(R - 60, signY, R, signY);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text("Authorized Signature", R, signY + 5, { align: "right" });
  }

  // Our branches
  const top = 249;
  doc.setFillColor(...PANEL).setDrawColor(...LINE).setLineWidth(0.3);
  doc.roundedRect(L, top, R - L, 10 + BRANCHES.length * 6, 3, 3, "FD");
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...RED);
  doc.text("OUR BRANCHES", L + 5, top + 6.5, { charSpace: 0.6 });
  BRANCHES.forEach((branch, i) => {
    const y = top + 12.5 + i * 6;
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...RED);
    doc.text(branch.name, L + 5, y);
    doc.setFont("helvetica", "normal").setTextColor(...INK);
    doc.text(branch.address, L + 24, y, { maxWidth: R - L - 62 });
    doc.setFont("helvetica", "bold");
    doc.text(`Ph # ${branch.phone}`, R - 5, y, { align: "right" });
  });

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK);
  doc.text(`Thank you for choosing ${branding.businessName}`, 105, 286, { align: "center" });
  doc.setFillColor(...RED).rect(0, 294, 210, 3, "F");
}

/** Opens the document in a new tab with the print dialog. */
async function printDoc(make: () => Promise<jsPDF>, what: string) {
  // Open the tab right away (before any await) so pop-up blockers allow it.
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) throw new Error(`Allow pop-ups to print this ${what}.`);
  try {
    const doc = await make();
    doc.autoPrint({ variant: "javascript" });
    printWindow.location.href = doc.output("bloburl").toString();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

const fileSafe = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";

// ---------------------------------------------------------------------------
// Complaint slip
// ---------------------------------------------------------------------------

/*
 * Complaint slip = the shop's printed bill book page ("Bill Book Amended on 03-09-26").
 * Fields we know are filled in; the rest (parts, home service, total, accessories...) stay as
 * blank lines and boxes to write on by hand, like the paper form.
 */
const BILL_RED: RGB = [200, 16, 46];
const BILL_INK: RGB = [33, 33, 33];
const BILL_BRANDS = "Eco Star, Haier, Changhong Ruba, Sharp, Multi Net, TCL, Hisense, Sony, Samsung";
const BILL_FOOTER = [
  "Branch # 1: Awan Electronics, Awan Plaza, Barrier # 2 G.T. Road Wah Cantt.  Ph # 0309 8997044",
  "Branch # 2 : Shop # 2 & 4 Near Saifi Medical Store, Liaq Ali Chowk Wah Cantt.  Ph # 0344 9483676",
  "Branch # 3 : Awan Electronics St # 5 Model Town Phase-II.  Ph # 0370 5030519",
  "Email: awaanelectronics@gmail.com",
];

/** "Label ______ value" on one line. The value is written in bold just above the underline. */
function billField(doc: jsPDF, label: string, value: string | null | undefined, x: number, y: number, endX: number) {
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...BILL_INK);
  doc.text(label, x, y);
  const lineStart = x + doc.getTextWidth(label) + 2;
  doc.setDrawColor(...BILL_INK).setLineWidth(0.25).line(lineStart, y + 0.8, endX, y + 0.8);
  const text = (value ?? "").trim();
  if (text) {
    doc.setFont("helvetica", "bold").setFontSize(10);
    const fitted = (doc.splitTextToSize(text, endX - lineStart - 2) as string[])[0];
    doc.text(fitted, lineStart + 1.5, y - 0.4);
  }
}

/** Complaint fields printed on the bill book. */
type BillComplaint = Pick<
  Complaint,
  "complaint_no" | "complaint_date" | "client_name" | "phone" | "address" | "led_model" | "serial_number"
  | "technician" | "technician_phone" | "defect" | "accessories" | "condition" | "notes" | "advance_amount"
>;

/** Invoice details filled into the bill book (parts table, totals, remarks). */
interface BillInvoice {
  invoiceNo: string;
  date: string;
  status: string;
  /** [description, qty, amount] */
  rows: [string, string, string][];
  total: number;
  balance: number;
  remarks: string | null | undefined;
  /** e.g. "3 Months (valid until 2027-01-29)" */
  warranty?: string | null;
}

export async function createComplaintPdf(complaint: Complaint, branding: Branding) {
  void branding; // the bill book has its own fixed header
  return createBillBookPdf(complaint);
}

/** The bill book page. Without `bill` it's the blank complaint slip; with it, the invoice is filled in. */
async function createBillBookPdf(complaint: BillComplaint, bill?: BillInvoice) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // ---- Header ----
  doc.setFont("helvetica", "bold").setFontSize(21).setTextColor(...BILL_RED);
  doc.text("AWAN ELECTRONIC SERVICE CENTER", L + 2, 22, { charSpace: 0.3 });
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...BILL_INK);
  doc.text("WE HAVE AUTHORIZED SERVICE CENTER", L + 2, 29.5, { charSpace: 1.9 });

  doc.setFillColor(...BILL_RED).roundedRect(L + 12, 33, 126, 7, 3.5, 3.5, "F");
  doc.setFont("helvetica", "normal").setFontSize(8.6).setTextColor(255, 255, 255);
  doc.text(BILL_BRANDS, L + 12 + 63, 37.6, { align: "center" });

  const badge = await renderUrduBadge(28);
  if (badge) doc.addImage(badge, "PNG", R - 28, 11, 28, 28);
  else doc.setFillColor(...BILL_RED).circle(R - 14, 25, 14, "F");

  doc.setFont("helvetica", "normal").setFontSize(11.5).setTextColor(...BILL_INK);
  doc.text("Awan Plaza Barrier # 2, G.T. Road, Wah Cantt", 92, 47.5, { align: "center" });
  doc.text("Haider Awan 0309 8997044     Mukhtar Awan 0344 9483676", 92, 53.5, { align: "center" });

  if (bill) {
    // Invoice number, date and status under the header
    const status = bill.status === "paid" ? "PAID" : bill.status === "partial" ? "PARTIAL" : "PENDING";
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...BILL_RED);
    doc.text(`INVOICE # ${bill.invoiceNo}   ·   Date: ${formatDate(bill.date)}   ·   ${status}`, R, 59.5, { align: "right" });
  }

  // ---- Complaint details (filled from the complaint) ----
  const technician = complaint.technician
    ? `${complaint.technician}${complaint.technician_phone ? ` (${complaint.technician_phone})` : ""}`
    : "";
  let y = 65;
  const row = 8.2;
  billField(doc, "Complaint #", complaint.complaint_no, L, y, 70);
  billField(doc, "Complaint Date", formatDate(complaint.complaint_date), 72, y, 132);
  billField(doc, "Official Complaint #", "", 134, y, R);
  y += row;
  billField(doc, "Customer Name", complaint.client_name, L, y, 126);
  billField(doc, "Cell Number", complaint.phone, 128, y, R);
  y += row;
  billField(doc, "Address", complaint.address, L, y, R);
  y += row;
  billField(doc, "Model #", complaint.led_model, L, y, 126);
  billField(doc, "Serial#", complaint.serial_number, 128, y, R);
  y += row;
  billField(doc, "Purchase Date", "", L, y, 126);
  billField(doc, "Technician", technician, 128, y, R);
  y += row;
  billField(doc, "Product Defect", complaint.defect, L, y, R);
  y += row;
  billField(doc, "Accessories Received", complaint.accessories, L, y, 132);
  billField(doc, "Condition", complaint.condition, 134, y, R);

  // ---- Parts table (invoice lines, then blank rows to fill by hand; 7 rows like the paper) ----
  const lines = bill?.rows ?? [];
  autoTable(doc, {
    startY: y + 3,
    head: [["S No", "Part Description", "Qty", "Amount"]],
    body: Array.from({ length: Math.max(7, lines.length) }, (_, i) => [String(i + 1), ...(lines[i] ?? ["", "", ""])]),
    theme: "grid",
    margin: { left: L, right: pageW - R },
    styles: { font: "helvetica", fontSize: 10, textColor: BILL_INK, lineColor: [90, 90, 90], lineWidth: 0.25, cellPadding: 1.6, minCellHeight: 7, valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: BILL_INK, fontStyle: "normal", halign: "center" },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 52 },
    },
  });
  y = tableEnd(doc) + 4;

  // ---- Home Service / Advance / Total Amount ----
  const boxX = 128;
  const labelW = 34;
  const boxH = 7.4;
  const advance = Number(complaint.advance_amount ?? 0);
  const totals: [string, string][] = [
    ["Home Service", ""],
    ["Advance", advance > 0 ? formatMoney(advance) : ""],
    ["Total Amount", bill ? formatMoney(bill.total) : ""],
    ...(bill ? [["Balance Due", formatMoney(bill.balance)] as [string, string]] : []),
  ];
  doc.setDrawColor(90, 90, 90).setLineWidth(0.25);
  totals.forEach(([label, value], i) => {
    const top = y + i * boxH;
    doc.rect(boxX, top, labelW, boxH);
    doc.rect(boxX + labelW, top, R - boxX - labelW, boxH);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...BILL_INK);
    doc.text(label, boxX + labelW / 2, top + 5, { align: "center" });
    if (value) {
      doc.setFont("helvetica", "bold");
      doc.text(value, boxX + labelW + 3, top + 5);
    }
  });

  // Unit Delivered  Yes [ ]  No [ ]   (level with the Total Amount row)
  const deliveredY = y + boxH * 2 + 5;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...BILL_INK);
  doc.text("Unit Delivered", L, deliveredY);
  doc.text("Yes", 62, deliveredY);
  doc.rect(70, deliveredY - 4, 7, 5);
  doc.text("No", 84, deliveredY);
  doc.rect(90, deliveredY - 4, 7, 5);
  y += boxH * totals.length + 9;

  billField(doc, "Product Warranty", bill?.warranty ?? "", L, y, R);
  y += 9;
  billField(doc, "Customer Remarks", bill?.remarks?.trim() || complaint.notes, L, y, R);
  y += 4;

  // ---- Urdu warranty terms (scaled to fit above the footer) ----
  const footerTop = 271;
  const terms = await renderUrduTerms(R - L);
  if (terms) {
    let w = R - L;
    let h = terms.heightMm;
    const space = footerTop - 3 - y;
    if (h > space) {
      w *= space / h;
      h = space;
    }
    doc.addImage(terms.dataUrl, "PNG", R - w, y, w, h);
  }

  // ---- Branches + email ----
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...BILL_INK);
  BILL_FOOTER.forEach((line, i) => doc.text(line, L, footerTop + 4 + i * 5.2));
  return doc;
}

export async function downloadComplaintPdf(complaint: Complaint, branding: Branding) {
  (await createComplaintPdf(complaint, branding)).save(`${complaint.complaint_no}.pdf`);
}

export async function printComplaintPdf(complaint: Complaint, branding: Branding) {
  await printDoc(() => createComplaintPdf(complaint, branding), "complaint");
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export async function createInvoicePdf(invoice: InvoiceWithComplaint, branding: Branding) {
  // Complaint invoices print on the same bill book page as the complaint, with the bill filled in.
  if (invoice.complaint) {
    const c = invoice.complaint;
    const amount = Number(invoice.amount);
    const later = (c.payments ?? []).reduce((total, p) => total + Number(p.amount), 0);
    const paid = invoice.status === "paid"
      ? amount
      : invoice.status === "partial"
        ? Math.min(Number(invoice.paid_amount ?? Number(c.advance_amount ?? 0) + later), amount)
        : Math.min(Number(c.advance_amount ?? 0) + later, amount);
    return createBillBookPdf(
      {
        ...c,
        complaint_date: c.complaint_date ?? invoice.invoice_date,
        serial_number: c.serial_number ?? "",
        technician: c.technician ?? null,
        defect: c.defect ?? null,
        notes: c.notes ?? null,
      },
      {
        invoiceNo: invoice.invoice_no,
        date: invoice.invoice_date,
        status: invoice.status,
        rows: [[invoice.description, "1", formatMoney(amount)]],
        total: amount,
        balance: amount - paid,
        remarks: invoice.notes,
        warranty: formatWarranty(invoice.warranty_value, invoice.warranty_unit)
          ? `${formatWarranty(invoice.warranty_value, invoice.warranty_unit)} (valid until ${formatDate(warrantyEndDate(invoice.invoice_date, invoice.warranty_value, invoice.warranty_unit))})`
          : null,
      },
    );
  }

  // Older invoices made for a shop purchase keep the receipt layout.
  const doc = new jsPDF();
  const p = invoice.purchase;
  let y = await brandHeader(doc, branding, { label: "Invoice No.", value: invoice.invoice_no, sub: `Date: ${formatDate(invoice.invoice_date)}` }, invoice.status);

  y = cardPair(
    doc,
    y,
    ["Customer Details", [
      ["Customer Name", p?.customer_name ?? "-"],
      ["Contact Number", p?.phone ?? "-"],
      ["Address", p?.address ?? "-"],
    ]],
    ["Purchase Details", [
      ["Product", p?.product ?? "-"],
      ["Purchase Date", formatDate(p?.purchase_date)],
    ]],
  ) + 8;

  y = itemTable(doc, y, ["#", "Description", "Amount"], [["1", invoice.description, formatMoney(invoice.amount)]], [2], {
    columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right", cellWidth: 40 } },
  }) + 6;

  const paid = invoice.status === "paid" ? Number(invoice.amount) : invoice.status === "partial" ? Number(invoice.paid_amount ?? 0) : 0;
  y = totalsBox(doc, y, [
    ["Total Amount", formatMoney(invoice.amount)],
    ["Paid Amount", formatMoney(paid)],
    ["Balance Due", formatMoney(Number(invoice.amount) - paid)],
  ]) + 8;

  if (invoice.notes?.trim()) y = infoCard(doc, L, y, R - L, "Note", [["", invoice.notes.trim()]]) + 6;

  await warrantyBox(doc, y);
  closing(doc, branding);
  return doc;
}

export async function downloadInvoicePdf(invoice: InvoiceWithComplaint, branding: Branding) {
  (await createInvoicePdf(invoice, branding)).save(`${invoice.invoice_no}.pdf`);
}

export async function printInvoicePdf(invoice: InvoiceWithComplaint, branding: Branding) {
  await printDoc(() => createInvoicePdf(invoice, branding), "invoice");
}

// ---------------------------------------------------------------------------
// Shop purchase receipt
// ---------------------------------------------------------------------------

export async function createPurchasePdf(purchase: ShopPurchase, branding: Branding) {
  const doc = new jsPDF();
  let y = await brandHeader(doc, branding, { label: "Purchase Date", value: formatDate(purchase.purchase_date) }, "paid");

  y = cardPair(
    doc,
    y,
    ["Customer Details", [
      ["Customer Name", purchase.customer_name],
      ["Contact Number", purchase.phone],
      ["Address", purchase.address],
    ]],
    ["Purchase Details", [
      ["Product", purchase.product],
      ["Amount", formatMoney(purchase.amount)],
      [
        "Warranty",
        formatWarranty(purchase.warranty_value, purchase.warranty_unit)
          ? `${formatWarranty(purchase.warranty_value, purchase.warranty_unit)} (valid until ${formatDate(
              warrantyEndDate(purchase.purchase_date, purchase.warranty_value, purchase.warranty_unit),
            )})`
          : "No warranty",
      ],
    ]],
  ) + 8;

  y = itemTable(doc, y, ["#", "Product", "Amount"], [["1", purchase.product, formatMoney(purchase.amount)]], [2], {
    columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right", cellWidth: 40 } },
  }) + 6;
  y = totalsBox(doc, y, [["Total", formatMoney(purchase.amount)]]) + 8;

  await warrantyBox(doc, y);
  closing(doc, branding);
  return doc;
}

export async function downloadPurchasePdf(purchase: ShopPurchase, branding: Branding) {
  (await createPurchasePdf(purchase, branding)).save(`receipt-${fileSafe(purchase.customer_name)}-${purchase.purchase_date}.pdf`);
}

export async function printPurchasePdf(purchase: ShopPurchase, branding: Branding) {
  await printDoc(() => createPurchasePdf(purchase, branding), "receipt");
}

// ---------------------------------------------------------------------------
// Technician statement
// ---------------------------------------------------------------------------

/** What a technician took, returned, used, paid, and still owes. */
export async function downloadTechnicianStatementPdf(
  technician: Technician,
  purchases: TechnicianPurchase[],
  payments: TechnicianPayment[],
  branding: Branding,
) {
  const doc = new jsPDF();
  await brandHeader(doc, branding, { label: "Statement Date", value: formatDate(todayISO()) });

  const bill = purchases.reduce((s, p) => s + Number(p.total_amount), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  let y = cardPair(
    doc,
    50,
    ["Technician Details", [
      ["Name", technician.name],
      ["Contact Number", technician.phone || "-"],
    ]],
    ["Account Summary", [
      ["Bill for used items", formatMoney(bill)],
      ["Balance Due", formatMoney(bill - paid)],
    ]],
  ) + 8;

  y = itemTable(
    doc,
    y,
    ["Date", "Product", "Taken", "Returned", "Used", "Unit Price", "Bill"],
    purchases.map((p) => [
      formatDate(p.purchase_date),
      p.item_name,
      p.quantity,
      p.returned_quantity,
      p.quantity - p.returned_quantity,
      formatMoney(p.unit_price),
      formatMoney(p.total_amount),
    ]),
    [5, 6],
  ) + 6;

  if (payments.length) {
    y = itemTable(doc, y, ["Payment Date", "Amount", "Notes"], payments.map((p) => [formatDate(p.payment_date), formatMoney(p.amount), p.notes || "-"]), [1]) + 6;
  }

  totalsBox(doc, y, [
    ["Total Bill (used items)", formatMoney(bill)],
    ["Total Paid", formatMoney(paid)],
    ["Balance Due", formatMoney(bill - paid)],
  ]);
  closing(doc, branding, false);
  doc.save(`statement-${fileSafe(technician.name)}.pdf`);
}

// ---------------------------------------------------------------------------
// List export ("Export PDF" on list pages)
// ---------------------------------------------------------------------------

export async function downloadTablePdf(
  title: string,
  head: string[],
  body: (string | number)[][],
  branding: Branding,
  /** Dates covered, e.g. "This month (2026-10-01 to 2026-10-31)". */
  period?: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const right = width - L;

  doc.setFillColor(...RED).rect(0, 0, width, 3, "F");
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
  doc.text(branding.businessName.toUpperCase(), L, 16);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(TAGLINE, L, 22);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...RED);
  doc.text(title, right, 16, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(
    `${period ? `Period: ${period}  ·  ` : ""}${body.length} records  ·  Printed ${formatDate(todayISO())}`,
    right,
    22,
    { align: "right" },
  );
  doc.setDrawColor(...LINE).setLineWidth(0.4).line(L, 27, right, 27);

  autoTable(doc, {
    startY: 32,
    head: [head],
    body: body.map((r) => r.map(String)),
    theme: "grid",
    margin: { left: L, right: L },
    styles: { font: "helvetica", fontSize: 8, textColor: INK, lineColor: LINE, lineWidth: 0.2, cellPadding: 2.5 },
    headStyles: { fillColor: PANEL, textColor: MUTED, fontStyle: "bold" },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFillColor(...RED).rect(0, h - 3, width, 3, "F");
    },
  });
  doc.save(`${fileSafe(title)}.pdf`);
}
