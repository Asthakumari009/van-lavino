import type { OrderItemRow } from '../types';

/**
 * Shared formatting helpers — single source of truth so CustomerDashboard,
 * StaffDashboard, ReceiptGenerator, and Menu all agree on how things render.
 */

export function summariseItems(items: OrderItemRow[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items.map((i) => `${i.quantity}× ${i.item_name}`).join(', ');
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatReceiptDate(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  const d = iso ? new Date(iso) : new Date();
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase();
  return { date, time };
}

export function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
  }
  return phone;
}

export function formatPrice(n: number | string | null | undefined): string {
  return Number(n ?? 0).toFixed(2);
}
