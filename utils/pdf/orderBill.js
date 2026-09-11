const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
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
  "shagun-beauty-logo.png"
);

const COMPANY_NAME = process.env.COMPANY_NAME || "Shagun Beauty";
const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS || "Pachraya, Etawah (U.P.)- 206001";
const COMPANY_GSTIN = process.env.COMPANY_GSTIN || "09FCCPS7816H1Z4";
const COMPANY_UPI_ID = process.env.COMPANY_UPI_ID || "9045791373-3@ybl";
const COMPANY_SUPPORT_EMAIL =
  process.env.COMPANY_SUPPORT_EMAIL || "helpshagunbeauty@gmail.com";

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

// Table column coordinates: ITEM | QTY | MRP | DISCOUNT | TOTAL
const colX = {
  item: PAGE_MARGIN,
  qty: 235,
  mrp: 280,
  discount: 365,
  total: 450,
};

// Draws the items-table column header at the given y, returns the y just below it.
const drawTableHeader = (doc, y) => {
  doc.rect(PAGE_MARGIN, y, PAGE_WIDTH, 22).fill(BRAND_GREEN);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
  doc.text("ITEM", colX.item + 8, y + 6);
  doc.text("QTY", colX.qty, y + 6, { width: 40, align: "right" });
  doc.text("MRP", colX.mrp, y + 6, { width: 80, align: "right" });
  doc.text("DISCOUNT", colX.discount, y + 6, { width: 80, align: "right" });
  doc.text("TOTAL", colX.total, y + 6, { width: 90, align: "right" });
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
const buildOrderBillPdfBuffer = async ({ order, customer }) => {
  // Static (no amount) UPI payment QR — identical across every invoice, so
  // it's generated fresh per PDF rather than cached as a file.
  const upiUri = `upi://pay?pa=${encodeURIComponent(COMPANY_UPI_ID)}&pn=${encodeURIComponent(
    COMPANY_NAME
  )}&cu=INR`;
  const qrCodeBuffer = await QRCode.toBuffer(upiUri, {
    type: "png",
    width: 150,
    margin: 1,
  });

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
          doc.image(LOGO_PATH, PAGE_MARGIN, headerTop, { width: 90 });
          logoDrawn = true;
        } catch (_) {
          // Fall back to text-only header if the logo can't be read/decoded.
        }
      }

      const companyBlockX = logoDrawn ? PAGE_MARGIN + 100 : PAGE_MARGIN;
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
        companyInfoY = doc.y + 2;
      }
      if (COMPANY_SUPPORT_EMAIL) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(TEXT_MUTED)
          .text(`Email: ${COMPANY_SUPPORT_EMAIL}`, companyBlockX, companyInfoY);
        companyInfoY = doc.y + 2;
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
      const billedLines = [customer?.name, customer?.email].filter(Boolean);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(billedLines.join("\n") || "-", PAGE_MARGIN, y + 16, { width: 220 });
      const billedBottom = doc.y;

      doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT_DARK).text("Shipping Address", 300, y);
      const addr = order.address || {};
      const phone = addr.mobile || addr.phone || customer?.mobile;
      const formatPhone = (val, prefix = "Phone") => {
        if (!val) return null;
        const str = String(val).trim();
        return str.toLowerCase().startsWith("phone") ? str : `${prefix}: ${str}`;
      };
      const addressLines = [
        addr.name,
        addr.address,
        [addr.locality, addr.city].filter(Boolean).join(", "),
        [addr.state, addr.pincode].filter(Boolean).join(" - "),
        formatPhone(phone, "Phone"),
        formatPhone(addr.alternatePhone, "Alt Phone"),
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

      // ---- Items table: ITEM | QTY | MRP | DISCOUNT | TOTAL ----
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
        doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(9);

        const lineMrp = toNumber(item.total_amount);
        const lineTotal = toNumber(item.discounted_total_amount);
        const lineDiscount = Math.max(0, lineMrp - lineTotal);

        doc.text(getItemName(item), colX.item + 8, y + 6, {
          width: 175,
          height: rowHeight - 4,
          ellipsis: true,
        });
        doc.text(String(item.quantity), colX.qty, y + 6, { width: 40, align: "right" });
        doc.text(formatCurrency(lineMrp), colX.mrp, y + 6, { width: 80, align: "right" });
        doc.text(
          lineDiscount > 0 ? `-${formatCurrency(lineDiscount)}` : "-",
          colX.discount,
          y + 6,
          { width: 80, align: "right" }
        );
        doc.text(formatCurrency(lineTotal), colX.total, y + 6, { width: 90, align: "right" });

        y += rowHeight;
      });

      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).strokeColor(BORDER_LIGHT).stroke();
      y += 12;

      // ---- Totals Summary ----
      y = ensureSpace(doc, y, 140);
      const summaryX = 330;
      const summaryLabelWidth = 115;
      const summaryValueWidth = 100;

      const addSummaryLine = (label, value, opts = {}) => {
        doc
          .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts.bold ? 11 : 9.5)
          .fillColor(opts.bold ? TEXT_DARK : TEXT_MUTED)
          .text(label, summaryX, y, { width: summaryLabelWidth })
          .text(value, summaryX + summaryLabelWidth, y, {
            width: summaryValueWidth,
            align: "right",
          });
        y += opts.bold ? 18 : 15;
      };

      const subtotalMrp = toNumber(order.totalAmount);
      const productDiscount = Math.max(0, subtotalMrp - toNumber(order.discountedTotalAmount));
      const shipping = toNumber(order.shippingCost);
      const couponDiscount = toNumber(order.couponDiscountAmount);
      const grandTotal = toNumber(order.finalTotalAmount);

      addSummaryLine("Total MRP", formatCurrency(subtotalMrp));
      if (productDiscount > 0) {
        addSummaryLine("Product Discount", `- ${formatCurrency(productDiscount)}`);
      }
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

      // ---- Payment details + UPI QR ----
      y = ensureSpace(doc, y + 16, 110);
      const paymentBlockTop = y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_DARK).text("Payment Details", PAGE_MARGIN, y);
      y = doc.y + 4;
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(`Mode: ${order.paymentMode || "-"}`, PAGE_MARGIN, y)
        .text(`Status: ${String(order.paymentStatus || "-").toUpperCase()}`, PAGE_MARGIN, doc.y + 2);

      const qrSize = 70;
      const captionWidth = 110;
      const captionX = PAGE_MARGIN + PAGE_WIDTH - captionWidth;
      const qrX = captionX + (captionWidth - qrSize) / 2;
      doc.image(qrCodeBuffer, qrX, paymentBlockTop, { width: qrSize, height: qrSize });
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(TEXT_DARK)
        .text("Scan & Pay via UPI", captionX, paymentBlockTop + qrSize + 4, {
          width: captionWidth,
          align: "center",
        });
      // Phone number removed from UPI caption as well

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
