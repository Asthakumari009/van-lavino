import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatReceiptDate } from '../lib/format';
import type { OrderItemRow, OrderRow } from '../types';

// Van Lavino luxury receipt generator.
// Builds an off-screen DOM node styled inline, captures it with html2canvas,
// drops the image into a jsPDF document and triggers a download.

export interface ReceiptOptions {
  brandName?: string;
  cityLine?: string;
  webHandle?: string;
  fssai?: string;
  gstNo?: string;
  /** Resolved branch name (for pickup/delivery receipts where the channel
   *  pill replaces the "Table" row). Looked up by caller from branches. */
  branchName?: string;
}

const DEFAULTS: Required<ReceiptOptions> = {
  brandName: 'VAN LAVINO',
  cityLine: '✦ Hyderabad ✦',
  webHandle: 'vanlavino.com  |  @vanlavino',
  fssai: 'FSSAI: XXXXXXXXXXXX',
  gstNo: 'GST No: XXXXXXXXXXXX',
  branchName: '',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettyPaymentLabel(order: OrderRow): string {
  if (order.payment_status === 'cash') return 'Cash / Pay at counter';
  if (order.payment_method === 'razorpay') return 'Razorpay (UPI / Card / Wallet)';
  if (order.payment_method) {
    return order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1);
  }
  return 'Unpaid';
}

function receiptHtml(
  order: OrderRow,
  items: OrderItemRow[],
  opts: Required<ReceiptOptions>
): string {
  const { date, time } = formatReceiptDate(order.created_at);
  const orderNumber = `VL-${order.id.slice(-6).toUpperCase()}`;
  const subtotal = Number(order.subtotal ?? 0);
  const cgst = subtotal * 0.025;
  const sgst = subtotal * 0.025;
  const total = Number(order.total ?? subtotal + cgst + sgst);

  const itemsRows = items
    .map((i) => {
      const qty = i.quantity;
      const unit = Number(i.unit_price).toFixed(2);
      const lineTotal = Number(i.total_price ?? i.unit_price * i.quantity).toFixed(2);
      return `
        <div style="margin: 6px 0;">
          <div style="display:flex; justify-content:space-between; font-size:13px; color:#111;">
            <span style="font-weight:600;">${qty}× ${escapeHtml(i.item_name)}</span>
          </div>
          <div style="text-align:right; font-size:12px; color:#666; font-family: ui-monospace, Menlo, Consolas, monospace;">
            ₹${unit} × ${qty} = ₹${lineTotal}
          </div>
        </div>`;
    })
    .join('');

  const noteBlock = order.customer_note
    ? `
      <div style="margin: 16px 0; padding: 12px 14px; background: #fff8e1; border-left: 3px solid #f59e0b; border-radius: 4px;">
        <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #b45309; margin-bottom: 6px;">
          ⚠️ SPECIAL NOTE
        </div>
        <div style="font-size: 13px; color: #111; font-style: italic; line-height: 1.5;">
          "${escapeHtml(order.customer_note)}"
        </div>
      </div>
      <div style="border-top: 1px dashed #ddd; margin: 16px 0;"></div>
    `
    : '';

  const txnBlock =
    order.razorpay_payment_id
      ? `<div style="font-size: 11px; color: #666; font-family: ui-monospace, Menlo, Consolas, monospace; margin-top: 4px;">
          Txn ID: ${escapeHtml(order.razorpay_payment_id)}
        </div>`
      : '';

  return `
    <div style="
      width: 380px;
      padding: 28px 28px;
      background: #ffffff;
      color: #111;
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      box-sizing: border-box;
    ">
      <!-- Header -->
      <div style="text-align: center;">
        <div style="
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-style: italic;
          font-size: 28px;
          letter-spacing: 6px;
          color: #c17820;
          font-weight: 500;
        ">
          ${opts.brandName}
        </div>
        <div style="font-size: 12px; color: #c17820; margin-top: 4px; letter-spacing: 2px;">
          ${opts.cityLine}
        </div>
        <div style="font-size: 11px; color: #666; margin-top: 6px;">
          ${opts.webHandle}
        </div>
      </div>

      <div style="border-top: 1px dashed #ddd; margin: 18px 0;"></div>

      <!-- Meta — channel-aware. Dine-in shows table; pickup shows the
           branch the customer is collecting from; delivery shows
           "Delivery" + branch (the dispatch origin). -->
      ${(() => {
        if (order.fulfillment_type === 'pickup') {
          return `
            <div style="font-size: 12px; color: #111; line-height: 1.8;">
              <div style="display:flex; justify-content:space-between;">
                <span>Order #</span>
                <span style="font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700;">${orderNumber}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Channel</span>
                <span style="font-weight:700;">Pickup</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Branch</span>
                <span>${escapeHtml(opts.branchName || '—')}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Date</span>
                <span>${date}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Time</span>
                <span>${time}</span>
              </div>
            </div>`;
        }
        if (order.fulfillment_type === 'delivery') {
          const addrLines: string[] = [];
          if (order.delivery_address) addrLines.push(escapeHtml(order.delivery_address));
          if (order.delivery_landmark) addrLines.push(`Landmark: ${escapeHtml(order.delivery_landmark)}`);
          if (order.delivery_pincode) addrLines.push(`Pincode: ${escapeHtml(order.delivery_pincode)}`);
          const addrBlock = addrLines.length
            ? `<div style="margin-top: 10px; padding: 10px 12px; background: #fff8e1; border-left: 3px solid #c17820; border-radius: 4px; font-size: 12px; color: #111; line-height: 1.5;">
                <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #b45309; margin-bottom: 4px;">DELIVER TO</div>
                ${addrLines.map((l) => `<div>${l}</div>`).join('')}
              </div>`
            : '';
          return `
            <div style="font-size: 12px; color: #111; line-height: 1.8;">
              <div style="display:flex; justify-content:space-between;">
                <span>Order #</span>
                <span style="font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700;">${orderNumber}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Channel</span>
                <span style="font-weight:700;">Delivery</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Dispatched from</span>
                <span>${escapeHtml(opts.branchName || '—')}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Date</span>
                <span>${date}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Time</span>
                <span>${time}</span>
              </div>
              ${addrBlock}
            </div>`;
        }
        // dine_in (default)
        return `
          <div style="font-size: 12px; color: #111; line-height: 1.8;">
            <div style="display:flex; justify-content:space-between;">
              <span>Order #</span>
              <span style="font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700;">${orderNumber}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>Table</span>
              <span style="font-family: ui-monospace, Menlo, Consolas, monospace;">${
                order.table_number ? escapeHtml(order.table_number) : '—'
              }</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>Date</span>
              <span>${date}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span>Time</span>
              <span>${time}</span>
            </div>
          </div>`;
      })()}

      <div style="border-top: 1px dashed #ddd; margin: 16px 0;"></div>

      <!-- Items -->
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #c17820; margin-bottom: 6px;">
        ITEMS
      </div>
      ${itemsRows}

      <div style="border-top: 1px dashed #ddd; margin: 16px 0;"></div>

      ${noteBlock}

      <!-- Totals -->
      <div style="font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; color: #111; line-height: 1.9;">
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal</span>
          <span>₹${subtotal.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; color: #555;">
          <span>CGST (2.5%)</span>
          <span>₹${cgst.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; color: #555;">
          <span>SGST (2.5%)</span>
          <span>₹${sgst.toFixed(2)}</span>
        </div>
        <div style="border-top: 1px dashed #ddd; margin: 8px 0;"></div>
        <div style="display:flex; justify-content:space-between; font-weight: 700; font-size: 16px; color: #c17820;">
          <span>TOTAL</span>
          <span>₹${total.toFixed(2)}</span>
        </div>
      </div>

      <div style="border-top: 1px dashed #ddd; margin: 16px 0;"></div>

      <!-- Payment -->
      <div style="font-size: 12px; color: #111;">
        <div>Payment: <b>${escapeHtml(prettyPaymentLabel(order))}</b></div>
        ${txnBlock}
      </div>

      <div style="border-top: 1px dashed #ddd; margin: 18px 0;"></div>

      <!-- Footer -->
      <div style="text-align: center; font-size: 11px; color: #666; line-height: 1.8;">
        <div style="color: #c17820; font-size: 12px; letter-spacing: 2px; margin-bottom: 4px;">
          ${
            order.fulfillment_type === 'pickup'
              ? '✦ Thank you for choosing Van Lavino ✦'
              : order.fulfillment_type === 'delivery'
                ? '✦ Thank you — see you at the door ✦'
                : '✦ Thank you for dining with us ✦'
          }
        </div>
        <div>Made with love in Hyderabad</div>
        <div style="margin-top: 8px; font-family: ui-monospace, Menlo, Consolas, monospace;">
          ${opts.fssai}
        </div>
        <div style="font-family: ui-monospace, Menlo, Consolas, monospace;">
          ${opts.gstNo}
        </div>
      </div>
    </div>
  `;
}

export async function generateReceipt(
  order: OrderRow,
  items: OrderItemRow[],
  options: ReceiptOptions = {}
): Promise<void> {
  const opts = { ...DEFAULTS, ...options };

  // Build an off-screen host.
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.style.background = '#ffffff';
  host.innerHTML = receiptHtml(order, items, opts);
  document.body.appendChild(host);

  try {
    const receiptEl = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(receiptEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    // Use A4 portrait (210mm × 297mm); fit the receipt to page width with margin.
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      margin,
      margin,
      imgWidth,
      Math.min(imgHeight, pageHeight - margin * 2)
    );

    const orderIdShort = order.id.slice(-6).toUpperCase();
    const dateStamp = new Date(order.created_at ?? Date.now())
      .toISOString()
      .slice(0, 10);
    pdf.save(`VanLavino_Receipt_VL-${orderIdShort}_${dateStamp}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
