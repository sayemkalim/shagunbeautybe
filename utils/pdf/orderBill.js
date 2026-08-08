const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { toNumber } = require("../email/emailHelpers");

const BRAND_GREEN = "#039133";
const TEXT_DARK = "#1b110c";
const TEXT_MUTED = "#5b4f47";
const BORDER_LIGHT = "#e5ded9";

const LOGO_PATH = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "email-assets",
  "celiac-brand-logo.png"
);

const COMPANY_NAME = process.env.COMPANY_NAME || "The Celiac Store";
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "";
const COMPANY_GSTIN = process.env.COMPANY_GSTIN || "";
const COMPANY_SUPPORT_EMAIL =
  process.env.COMPANY_SUPPORT_EMAIL || process.env.EMAIL_FROM_EMAIL || "";

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 495; // A4 content width at 50pt margins

const formatCurrency = (value) => `Rs. ${toNumber(value).toFixed(2)}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const getItemName = (item) =>
  item.type === "product"
    ? item.product?.name || "Product"
    : item.bundle?.name || "Bundle";

// Draws the items-table column header at the given y, returns the y just below it.
const drawTableHeader = (doc, y) => {
  const colX = { item: PAGE_MARGIN, qty: 330, unit: 390, total: 470 };
  doc.rect(PAGE_MARGIN, y, PAGE_WIDTH, 22).fill(BRAND_GREEN);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
  doc.text("ITEM", colX.item + 8, y + 6);
  doc.text("QTY", colX.qty, y + 6, { width: 50, align: "right" });
  doc.text("UNIT PRICE", colX.unit, y + 6, { width: 70, align: "right" });
  doc.text("TOTAL", colX.total, y + 6, { width: 65, align: "right" });
  return y + 22;
};

// Starts a fresh page and redraws the table header, for orders with enough
// items to overflow a single page.
const ensureSpace = (doc, y, needed) => {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (y + needed <= bottomLimit) return y;
  doc.addPage();
  return PAGE_MARGIN;
};

// Builds a professional-looking invoice PDF for an order and resolves with
// the raw PDF buffer. `customer` = { name, email, mobile } — resolved by the
// caller (from the User doc for registered orders, or guestInfo for guests)
// so this stays a pure function with no DB access.
const buildOrderBillPdfBuffer = ({ order, customer }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ---- Header ----
      const headerTop = PAGE_MARGIN;
      let logoDrawn = false;
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, PAGE_MARGIN, headerTop, { width: 60 });
          logoDrawn = true;
        } catch (_) {
          // Fall back to text-only header if the logo can't be read/decoded.
        }
      }

      const companyBlockX = logoDrawn ? PAGE_MARGIN + 70 : PAGE_MARGIN;
      doc
        .fillColor(TEXT_DARK)
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(COMPANY_NAME, companyBlockX, headerTop, { width: 250 });
      let companyInfoY = doc.y + 2;
      if (COMPANY_ADDRESS) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(COMPANY_ADDRESS, companyBlockX, companyInfoY, { width: 250 });
        companyInfoY = doc.y + 2;
      }
      if (COMPANY_GSTIN) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(`GSTIN: ${COMPANY_GSTIN}`, companyBlockX, companyInfoY);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor(BRAND_GREEN)
        .text("TAX INVOICE", PAGE_MARGIN, headerTop, {
          width: PAGE_WIDTH,
          align: "right",
        });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(`Invoice #: ${order.orderNumber || order._id}`, PAGE_MARGIN, doc.y + 4, {
          width: PAGE_WIDTH,
          align: "right",
        })
        .text(`Order Date: ${formatDate(order.createdAt)}`, {
          width: PAGE_WIDTH,
          align: "right",
        })
        .text(`Status: ${String(order.status || "").toUpperCase()}`, {
          width: PAGE_WIDTH,
          align: "right",
        });

      let y = Math.max(doc.y, companyInfoY) + 16;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).strokeColor(BORDER_LIGHT).stroke();
      y += 16;

      // ---- Billed to / shipping address ----
      doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT_DARK).text("Billed To", PAGE_MARGIN, y);
      const billedLines = [customer?.name, customer?.email, customer?.mobile].filter(Boolean);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(billedLines.join("\n") || "-", PAGE_MARGIN, y + 16, { width: 220 });
      const billedBottom = doc.y;

      doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT_DARK).text("Shipping Address", 300, y);
      const addr = order.address || {};
      const addressLines = [
        addr.name,
        addr.address,
        [addr.locality, addr.city].filter(Boolean).join(", "),
        [addr.state, addr.pincode].filter(Boolean).join(" - "),
        addr.mobile,
      ].filter(Boolean);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(addressLines.join("\n") || "-", 300, y + 16, { width: 245 });
      const shippingBottom = doc.y;

      y = Math.max(billedBottom, shippingBottom) + 16;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).strokeColor(BORDER_LIGHT).stroke();
      y += 16;

      // ---- Items table ----
      const colX = { item: PAGE_MARGIN, qty: 330, unit: 390, total: 470 };
      y = drawTableHeader(doc, y);

      doc.font("Helvetica").fontSize(10).fillColor(TEXT_DARK);
      (order.items || []).forEach((item, idx) => {
        const rowHeight = 22;
        y = ensureSpace(doc, y, rowHeight);
        // ensureSpace may have started a new page; redraw the header there.
        if (y === PAGE_MARGIN) y = drawTableHeader(doc, y);

        if (idx % 2 === 1) {
          doc.rect(PAGE_MARGIN, y, PAGE_WIDTH, rowHeight).fill("#f7f4f2");
        }
        doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(10);

        const lineTotal = toNumber(item.discounted_total_amount);
        const unitPrice = lineTotal / (item.quantity || 1);

        doc.text(getItemName(item), colX.item + 8, y + 6, {
          width: 270,
          height: rowHeight - 4,
          ellipsis: true,
        });
        doc.text(String(item.quantity), colX.qty, y + 6, { width: 50, align: "right" });
        doc.text(formatCurrency(unitPrice), colX.unit, y + 6, { width: 70, align: "right" });
        doc.text(formatCurrency(lineTotal), colX.total, y + 6, { width: 65, align: "right" });

        y += rowHeight;
      });

      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).strokeColor(BORDER_LIGHT).stroke();
      y += 12;

      // ---- Totals ----
      y = ensureSpace(doc, y, 140);
      const summaryX = 350;
      const summaryLabelWidth = 105;
      const summaryValueWidth = 90;

      const addSummaryLine = (label, value, opts = {}) => {
        doc
          .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts.bold ? 12 : 10)
          .fillColor(opts.bold ? TEXT_DARK : TEXT_MUTED)
          .text(label, summaryX, y, { width: summaryLabelWidth })
          .text(value, summaryX + summaryLabelWidth, y, {
            width: summaryValueWidth,
            align: "right",
          });
        y += opts.bold ? 20 : 16;
      };

      const subtotal = toNumber(order.totalAmount);
      const discount = subtotal - toNumber(order.discountedTotalAmount);
      const shipping = toNumber(order.shippingCost);
      const couponDiscount = toNumber(order.couponDiscountAmount);
      const grandTotal = toNumber(order.finalTotalAmount);

      addSummaryLine("Subtotal", formatCurrency(subtotal));
      if (discount > 0) addSummaryLine("Product Discount", `- ${formatCurrency(discount)}`);
      if (couponDiscount > 0) {
        addSummaryLine(
          `Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`,
          `- ${formatCurrency(couponDiscount)}`
        );
      }
      addSummaryLine("Shipping", shipping > 0 ? formatCurrency(shipping) : "Free");
      y += 4;
      doc.moveTo(summaryX, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).strokeColor(BORDER_LIGHT).stroke();
      y += 8;
      addSummaryLine("Grand Total", formatCurrency(grandTotal), { bold: true });

      // ---- Payment details ----
      y = ensureSpace(doc, y + 16, 60);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text("Payment Details", PAGE_MARGIN, y);
      y = doc.y + 4;
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(`Mode: ${order.paymentMode || "-"}`, PAGE_MARGIN, y)
        .text(`Status: ${String(order.paymentStatus || "-").toUpperCase()}`, PAGE_MARGIN, doc.y + 2);

      // ---- Footer ----
      const footerText = `Thank you for shopping with ${COMPANY_NAME}!${
        COMPANY_SUPPORT_EMAIL ? ` For any queries, reach us at ${COMPANY_SUPPORT_EMAIL}.` : ""
      }`;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text(footerText, PAGE_MARGIN, doc.page.height - doc.page.margins.bottom - 20, {
          width: PAGE_WIDTH,
          align: "center",
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { buildOrderBillPdfBuffer };
