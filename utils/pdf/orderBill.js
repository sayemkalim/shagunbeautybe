const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { toNumber } = require("../email/emailHelpers");

// ---- Premium Minimalist Design Tokens ----
const COLOR = {
  primary: "#18181b",      // Zinc 900 - Deep Charcoal
  secondary: "#3f3f46",    // Zinc 700 - Sub-heading & values
  muted: "#71717a",        // Zinc 500 - Labels & captions
  faint: "#a1a1aa",        // Zinc 400 - Very subtle text
  border: "#e4e4e7",       // Zinc 200 - Clean hairlines
  borderLight: "#f4f4f5",  // Zinc 100 - Row dividers
  cardBg: "#fafafa",       // Zinc 50 - Card backgrounds
  headerBg: "#f4f4f5",     // Zinc 100 - Table header
  accentGreen: "#059669",  // Emerald 600 - Discounts / Savings
  successBg: "#ecfdf5",    // Emerald 50 - Paid badge bg
  successBorder: "#a7f3d0",// Emerald 200 - Paid badge border
  successText: "#047857",  // Emerald 700 - Paid badge text
  pendingBg: "#fffbeb",    // Amber 50 - Pending badge bg
  pendingBorder: "#fde68a",// Amber 200 - Pending badge border
  pendingText: "#b45309",  // Amber 700 - Pending badge text
};

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

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 515; // A4 (595.28) - 2 * 40

const formatCurrency = (value) => `Rs. ${toNumber(value).toFixed(2)}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Generates consistent 6-digit INV-XXXXXX invoice number from order
const getInvoiceNumber = (order) => {
  if (order.invoiceNumber && String(order.invoiceNumber).startsWith("INV-")) {
    return order.invoiceNumber;
  }
  const seedStr = String(order.orderNumber || order._id || Date.now());
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 900000;
  }
  const sixDigit = String(100000 + Math.abs(hash));
  return `INV-${sixDigit}`;
};

// Formats order number with #OD- prefix (e.g. #OD-1024)
const formatOrderNumber = (order) => {
  const val = order.orderNumber || order._id;
  if (!val) return "-";
  const str = String(val).trim().replace(/^#/, "");
  if (str.toUpperCase().startsWith("OD-")) {
    return `#${str.toUpperCase()}`;
  }
  return `#OD-${str}`;
};

const getItemName = (item) =>
  item.type === "product"
    ? item.product?.name || "Product"
    : item.bundle?.name || "Bundle";

// Table column layout (Total width = 515)
const col = {
  item: { x: PAGE_MARGIN + 10, width: 230 },
  qty: { x: PAGE_MARGIN + 250, width: 40 },
  mrp: { x: PAGE_MARGIN + 295, width: 65 },
  discount: { x: PAGE_MARGIN + 365, width: 65 },
  total: { x: PAGE_MARGIN + 435, width: 70 },
};

// Draws the minimal table header
const drawTableHeader = (doc, y) => {
  const headerHeight = 22;
  
  // Soft background bar
  doc.rect(PAGE_MARGIN, y, PAGE_WIDTH, headerHeight).fill(COLOR.headerBg);
  
  // Border lines
  doc.strokeColor(COLOR.border).lineWidth(0.5);
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).stroke();
  doc.moveTo(PAGE_MARGIN, y + headerHeight).lineTo(PAGE_MARGIN + PAGE_WIDTH, y + headerHeight).stroke();

  // Header labels
  doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5);
  doc.text("ITEM DESCRIPTION", col.item.x, y + 7, { width: col.item.width });
  doc.text("QTY", col.qty.x, y + 7, { width: col.qty.width, align: "center" });
  doc.text("MRP", col.mrp.x, y + 7, { width: col.mrp.width, align: "right" });
  doc.text("DISCOUNT", col.discount.x, y + 7, { width: col.discount.width, align: "right" });
  doc.text("AMOUNT", col.total.x, y + 7, { width: col.total.width, align: "right" });

  return y + headerHeight;
};

// Ensures space for next block or adds a fresh page
const ensureSpace = (doc, y, needed) => {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;
  if (y + needed <= bottomLimit) return y;
  doc.addPage();
  return PAGE_MARGIN;
};

/**
 * Builds a minimalist, modern, luxury-aesthetic invoice PDF buffer.
 */
const buildOrderBillPdfBuffer = async ({ order, customer }) => {
  const upiUri = `upi://pay?pa=${encodeURIComponent(COMPANY_UPI_ID)}&pn=${encodeURIComponent(
    COMPANY_NAME
  )}&cu=INR`;
  const qrCodeBuffer = await QRCode.toBuffer(upiUri, {
    type: "png",
    width: 140,
    margin: 1,
  });

  const invoiceId = getInvoiceNumber(order);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE_MARGIN,
        info: {
          Title: `Invoice - ${invoiceId}`,
          Author: COMPANY_NAME,
          Subject: "Invoice",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ==========================================
      // 1. TOP BAR ACCENT
      // ==========================================
      doc.rect(PAGE_MARGIN, PAGE_MARGIN - 15, PAGE_WIDTH, 2.5).fill(COLOR.primary);

      // ==========================================
      // 2. HEADER: BRAND & INVOICE DETAILS
      // ==========================================
      const headerTop = PAGE_MARGIN + 5;
      let logoDrawn = false;
      const logoWidth = 110; // Prominent large logo
      const logoHeight = 60; // Proportional aspect ratio (110 / 1.837)

      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, PAGE_MARGIN, headerTop, { width: logoWidth, height: logoHeight });
          logoDrawn = true;
        } catch (_) {
          // Fall back to clean text
        }
      }

      const companyBlockX = logoDrawn ? PAGE_MARGIN + logoWidth + 14 : PAGE_MARGIN;
      doc
        .fillColor(COLOR.primary)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(COMPANY_NAME, companyBlockX, headerTop + 2, { width: 200 });

      let compY = headerTop + 18;
      if (COMPANY_ADDRESS) {
        doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text(COMPANY_ADDRESS, companyBlockX, compY, { width: 200 });
        compY = doc.y + 2;
      }
      if (COMPANY_GSTIN) {
        doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text(`GSTIN: ${COMPANY_GSTIN}`, companyBlockX, compY);
        compY = doc.y + 2;
      }
      if (COMPANY_SUPPORT_EMAIL) {
        doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text(`Email: ${COMPANY_SUPPORT_EMAIL}`, companyBlockX, compY);
        compY = doc.y + 2;
      }

      // Right Header: Invoice ID & Meta
      const rightColX = PAGE_MARGIN + 280;
      const rightColWidth = PAGE_WIDTH - 280;

      let metaY = headerTop + 4;
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor(COLOR.primary)
        .text(invoiceId, rightColX, metaY, { width: rightColWidth, align: "right" });

      metaY += 18;
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLOR.muted)
        .text(`Date: ${formatDate(order.createdAt)}`, rightColX, metaY, { width: rightColWidth, align: "right" });

      // Status Pill Badge
      metaY += 14;
      const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
      const statusText = isPaid ? "PAID" : String(order.status || "CONFIRMED").toUpperCase();
      const badgeWidth = 60;
      const badgeHeight = 15;
      const badgeX = PAGE_MARGIN + PAGE_WIDTH - badgeWidth;
      const badgeY = metaY;

      doc
        .roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4)
        .fillAndStroke(
          isPaid ? COLOR.successBg : COLOR.pendingBg,
          isPaid ? COLOR.successBorder : COLOR.pendingBorder
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(isPaid ? COLOR.successText : COLOR.pendingText)
        .text(statusText, badgeX, badgeY + 3.5, {
          width: badgeWidth,
          align: "center",
        });

      // Divider below header
      const headerMaxBottom = Math.max(
        headerTop + (logoDrawn ? logoHeight : 0),
        compY,
        badgeY + badgeHeight + 4
      );
      let y = headerMaxBottom + 12;
      doc.strokeColor(COLOR.border).lineWidth(0.5).moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).stroke();
      y += 12;

      // ==========================================
      // 3. BILLED TO & ORDER DETAILS CARDS
      // ==========================================
      const cardWidth = (PAGE_WIDTH - 12) / 2; // ~251.5
      const cardLeftX = PAGE_MARGIN;
      const cardRightX = PAGE_MARGIN + cardWidth + 12;
      const cardTopY = y;

      // Customer Lines
      const addr = order.address || {};
      const customerName = addr.name || customer?.name || "Valued Customer";
      const customerEmail = customer?.email || "-";
      const phone = addr.mobile || addr.phone || customer?.mobile;
      const formatPhone = (val, prefix = "Phone") => {
        if (!val) return null;
        const str = String(val).trim();
        return str.toLowerCase().startsWith("phone") ? str : `${prefix}: ${str}`;
      };

      const addressLines = [
        addr.address,
        [addr.locality, addr.city].filter(Boolean).join(", "),
        [addr.state, addr.pincode].filter(Boolean).join(" - "),
        formatPhone(phone, "Ph"),
      ].filter(Boolean);

      // Card height
      const cardHeight = 82;

      // Left Card (Bill & Ship To)
      doc.roundedRect(cardLeftX, cardTopY, cardWidth, cardHeight, 6).fillAndStroke(COLOR.cardBg, COLOR.border);
      doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5).text("BILLED & SHIPPED TO", cardLeftX + 10, cardTopY + 8);
      doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(9).text(customerName, cardLeftX + 10, cardTopY + 21, { width: cardWidth - 20, ellipsis: true });
      
      let addrY = cardTopY + 34;
      doc.fillColor(COLOR.secondary).font("Helvetica").fontSize(7.8);
      addressLines.slice(0, 3).forEach((line) => {
        doc.text(line, cardLeftX + 10, addrY, { width: cardWidth - 20, ellipsis: true });
        addrY += 10;
      });
      if (customerEmail && customerEmail !== "-") {
        doc.fillColor(COLOR.muted).font("Helvetica").fontSize(7.5).text(customerEmail, cardLeftX + 10, addrY, { width: cardWidth - 20, ellipsis: true });
      }

      // Right Card (Order & Payment Information)
      doc.roundedRect(cardRightX, cardTopY, cardWidth, cardHeight, 6).fillAndStroke(COLOR.cardBg, COLOR.border);
      doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5).text("ORDER & PAYMENT INFO", cardRightX + 10, cardTopY + 8);

      const renderMetaRow = (label, value, rY, isBold = false) => {
        doc.fillColor(COLOR.muted).font("Helvetica").fontSize(7.8).text(label, cardRightX + 10, rY, { width: 90 });
        doc.fillColor(isBold ? COLOR.primary : COLOR.secondary).font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(7.8).text(value || "-", cardRightX + 105, rY, { width: cardWidth - 115, align: "right", ellipsis: true });
      };

      let metaCardY = cardTopY + 21;
      renderMetaRow("Order ID:", formatOrderNumber(order), metaCardY, true);
      metaCardY += 12;
      renderMetaRow("Payment Method:", order.paymentMode || "Online", metaCardY);
      metaCardY += 12;
      renderMetaRow("Payment Status:", (order.paymentStatus || "Pending").toUpperCase(), metaCardY);
      metaCardY += 12;
      if (order.paymentId) {
        renderMetaRow("Transaction ID:", String(order.paymentId), metaCardY);
        metaCardY += 12;
      }
      if (order.paidAt) {
        renderMetaRow("Paid On:", formatDate(order.paidAt), metaCardY);
      }

      y = cardTopY + cardHeight + 14;

      // ==========================================
      // 4. ITEMS TABLE
      // ==========================================
      y = drawTableHeader(doc, y);

      (order.items || []).forEach((item) => {
        const rowHeight = 26;
        y = ensureSpace(doc, y, rowHeight);
        if (y === PAGE_MARGIN) {
          y = drawTableHeader(doc, y);
        }

        const lineMrp = toNumber(item.total_amount);
        const lineTotal = toNumber(item.discounted_total_amount);
        const lineDiscount = Math.max(0, lineMrp - lineTotal);
        const itemType = item.type === "bundle" ? "Bundle" : "Product";

        // Item Title & Subtitle
        doc
          .fillColor(COLOR.primary)
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .text(getItemName(item), col.item.x, y + 5, {
            width: col.item.width,
            height: 12,
            ellipsis: true,
          });

        doc
          .fillColor(COLOR.muted)
          .font("Helvetica")
          .fontSize(7)
          .text(itemType, col.item.x, y + 16, { width: col.item.width });

        // Quantity
        doc
          .fillColor(COLOR.secondary)
          .font("Helvetica")
          .fontSize(8.5)
          .text(String(item.quantity || 1), col.qty.x, y + 8, {
            width: col.qty.width,
            align: "center",
          });

        // MRP
        doc
          .fillColor(COLOR.muted)
          .font("Helvetica")
          .fontSize(8.5)
          .text(formatCurrency(lineMrp), col.mrp.x, y + 8, {
            width: col.mrp.width,
            align: "right",
          });

        // Discount
        doc
          .fillColor(lineDiscount > 0 ? COLOR.accentGreen : COLOR.muted)
          .font("Helvetica")
          .fontSize(8.5)
          .text(
            lineDiscount > 0 ? `-${formatCurrency(lineDiscount)}` : "-",
            col.discount.x,
            y + 8,
            { width: col.discount.width, align: "right" }
          );

        // Final Amount
        doc
          .fillColor(COLOR.primary)
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .text(formatCurrency(lineTotal), col.total.x, y + 8, {
            width: col.total.width,
            align: "right",
          });

        y += rowHeight;

        // Subtle row bottom divider
        doc.strokeColor(COLOR.borderLight).lineWidth(0.5).moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + PAGE_WIDTH, y).stroke();
      });

      y += 10;

      // ==========================================
      // 5. SUMMARY & PAYMENT / UPI QR
      // ==========================================
      y = ensureSpace(doc, y, 130);

      const summaryCardWidth = 230;
      const summaryCardX = PAGE_MARGIN + PAGE_WIDTH - summaryCardWidth;
      const summaryCardY = y;

      const subtotalMrp = toNumber(order.totalAmount);
      const productDiscount = Math.max(0, subtotalMrp - toNumber(order.discountedTotalAmount));
      const shipping = toNumber(order.shippingCost);
      const couponDiscount = toNumber(order.couponDiscountAmount);
      const grandTotal = toNumber(order.finalTotalAmount);

      // Calculations for summary card height
      let summaryRows = 2; // MRP, Shipping
      if (productDiscount > 0) summaryRows++;
      if (couponDiscount > 0) summaryRows++;
      const summaryCardHeight = 45 + summaryRows * 14;

      doc.roundedRect(summaryCardX, summaryCardY, summaryCardWidth, summaryCardHeight, 6).fillAndStroke(COLOR.cardBg, COLOR.border);

      let sumY = summaryCardY + 10;
      const addSummaryLine = (label, value, opts = {}) => {
        doc
          .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts.bold ? 9.5 : 8)
          .fillColor(opts.green ? COLOR.accentGreen : opts.bold ? COLOR.primary : COLOR.muted)
          .text(label, summaryCardX + 12, sumY, { width: 110 });

        doc
          .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts.bold ? 10 : 8)
          .fillColor(opts.green ? COLOR.accentGreen : opts.bold ? COLOR.primary : COLOR.secondary)
          .text(value, summaryCardX + 125, sumY, {
            width: summaryCardWidth - 137,
            align: "right",
          });

        sumY += opts.bold ? 18 : 14;
      };

      addSummaryLine("Total MRP", formatCurrency(subtotalMrp));
      if (productDiscount > 0) {
        addSummaryLine("Product Savings", `- ${formatCurrency(productDiscount)}`, { green: true });
      }
      if (couponDiscount > 0) {
        const cText = order.couponCode ? `Coupon (${order.couponCode})` : "Coupon Discount";
        addSummaryLine(cText, `- ${formatCurrency(couponDiscount)}`, { green: true });
      }
      addSummaryLine("Delivery Charges", shipping > 0 ? formatCurrency(shipping) : "FREE", {
        green: shipping === 0,
      });

      // Divider inside summary card before Grand Total
      sumY += 2;
      doc.strokeColor(COLOR.border).lineWidth(0.5).moveTo(summaryCardX + 10, sumY).lineTo(summaryCardX + summaryCardWidth - 10, sumY).stroke();
      sumY += 6;

      addSummaryLine("Grand Total", formatCurrency(grandTotal), { bold: true });

      // Left Side: Payment Status / UPI QR
      const leftBlockWidth = PAGE_WIDTH - summaryCardWidth - 16;
      const leftBlockX = PAGE_MARGIN;
      const leftBlockY = summaryCardY;

      if (!isPaid) {
        // UPI QR Card
        const qrSize = 58;
        doc.roundedRect(leftBlockX, leftBlockY, leftBlockWidth, summaryCardHeight, 6).fillAndStroke(COLOR.cardBg, COLOR.border);
        doc.image(qrCodeBuffer, leftBlockX + 12, leftBlockY + 12, { width: qrSize, height: qrSize });

        const upiTextX = leftBlockX + qrSize + 22;
        const upiTextWidth = leftBlockWidth - qrSize - 30;

        doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(9).text("Scan & Pay via UPI", upiTextX, leftBlockY + 14, { width: upiTextWidth });
        doc.fillColor(COLOR.muted).font("Helvetica").fontSize(7.5).text("Use GPay, PhonePe, Paytm or any UPI app to complete payment.", upiTextX, leftBlockY + 28, { width: upiTextWidth });
        doc.fillColor(COLOR.secondary).font("Helvetica-Bold").fontSize(8).text(`UPI ID: ${COMPANY_UPI_ID}`, upiTextX, leftBlockY + 54, { width: upiTextWidth });
      } else {
        // Paid Verification Stamp Box
        doc.roundedRect(leftBlockX, leftBlockY, leftBlockWidth, summaryCardHeight, 6).fillAndStroke(COLOR.successBg, COLOR.successBorder);
        
        doc.fillColor(COLOR.successText).font("Helvetica-Bold").fontSize(10).text("Payment Completed", leftBlockX + 14, leftBlockY + 12);
        doc.fillColor(COLOR.secondary).font("Helvetica").fontSize(8).text(`Mode: ${order.paymentMode || "Online"}`, leftBlockX + 14, leftBlockY + 28);
        if (order.paymentId) {
          doc.fillColor(COLOR.muted).font("Helvetica").fontSize(7.5).text(`Txn ID: ${order.paymentId}`, leftBlockX + 14, leftBlockY + 41);
        }
        if (order.paidAt) {
          doc.fillColor(COLOR.muted).font("Helvetica").fontSize(7.5).text(`Paid At: ${formatDate(order.paidAt)}`, leftBlockX + 14, leftBlockY + 54);
        }
      }

      // ==========================================
      // 6. FOOTER
      // ==========================================
      const footerY = doc.page.height - doc.page.margins.bottom - 24;
      doc.strokeColor(COLOR.border).lineWidth(0.5).moveTo(PAGE_MARGIN, footerY - 8).lineTo(PAGE_MARGIN + PAGE_WIDTH, footerY - 8).stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(COLOR.primary)
        .text(`Thank you for shopping with ${COMPANY_NAME}!`, PAGE_MARGIN, footerY, {
          width: PAGE_WIDTH,
          align: "center",
        });

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLOR.muted)
        .text(
          `For questions or support, reach us at ${COMPANY_SUPPORT_EMAIL} • This is a computer-generated invoice.`,
          PAGE_MARGIN,
          footerY + 11,
          { width: PAGE_WIDTH, align: "center" }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { buildOrderBillPdfBuffer };
