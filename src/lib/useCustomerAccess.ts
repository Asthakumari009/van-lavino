import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const CUSTOMER_SESSION_TTL_MS = 3 * 60 * 60 * 1000;

export interface CustomerProfile {
  name: string;
  phone: string;
}

export interface TableSession {
  branchId: string;
  branchName: string;
  tableNumber: string;
  token: string;
  customerSessionId?: string;
}

interface CustomerAccessState {
  customer: CustomerProfile | null;
  customerExpiresAt: number | null;
  tableSession: TableSession | null;
  tableSessionExpiresAt: number | null;
  // Last order placed in this session, so the customer can jump back to the
  // tracking page from anywhere (Menu banner, account dropdown).
  lastOrderId: string | null;
  setCustomer: (input: CustomerProfile) => void;
  clearCustomer: () => void;
  setTableSession: (input: TableSession) => void;
  clearTableSession: () => void;
  setLastOrderId: (id: string | null) => void;
  clearAll: () => void;
  isCustomerActive: () => boolean;
  isTableSessionActive: () => boolean;
  getCustomer: () => CustomerProfile | null;
  getTableSession: () => TableSession | null;
}

export const useCustomerAccess = create<CustomerAccessState>()(
  persist(
    (set, get) => ({
      customer: null,
      customerExpiresAt: null,
      tableSession: null,
      tableSessionExpiresAt: null,
      lastOrderId: null,

      setLastOrderId: (id) => set({ lastOrderId: id }),

      setCustomer: (input) =>
        set({
          customer: {
            name: input.name.trim(),
            phone: normalizePhone(input.phone),
          },
          customerExpiresAt: Date.now() + CUSTOMER_SESSION_TTL_MS,
        }),

      clearCustomer: () =>
        set({
          customer: null,
          customerExpiresAt: null,
          tableSession: null,
          tableSessionExpiresAt: null,
          lastOrderId: null,
        }),

      setTableSession: (input) =>
        set({
          tableSession: input,
          tableSessionExpiresAt: Date.now() + CUSTOMER_SESSION_TTL_MS,
        }),

      clearTableSession: () =>
        set({
          tableSession: null,
          tableSessionExpiresAt: null,
        }),

      clearAll: () =>
        set({
          customer: null,
          customerExpiresAt: null,
          tableSession: null,
          tableSessionExpiresAt: null,
          lastOrderId: null,
        }),

      isCustomerActive: () => {
        const { customer, customerExpiresAt } = get();
        return !!customer && !!customerExpiresAt && customerExpiresAt > Date.now();
      },

      isTableSessionActive: () => {
        const { tableSession, tableSessionExpiresAt } = get();
        return (
          !!tableSession &&
          !!tableSessionExpiresAt &&
          tableSessionExpiresAt > Date.now()
        );
      },

      getCustomer: () => {
        const state = get();
        return state.isCustomerActive() ? state.customer : null;
      },

      getTableSession: () => {
        const state = get();
        return state.isTableSessionActive() ? state.tableSession : null;
      },
    }),
    {
      name: 'vanlavino-customer-access',
      partialize: (state) => ({
        customer: state.customer,
        customerExpiresAt: state.customerExpiresAt,
        tableSession: state.tableSession,
        tableSessionExpiresAt: state.tableSessionExpiresAt,
        lastOrderId: state.lastOrderId,
      }),
    }
  )
);

/**
 * Strip country code / spaces / separators / leading 0 and return a clean
 * 10-digit Indian mobile number (or the cleaned input if not recognisable).
 *
 * Accepts:
 *   "+91 98765 43210" → "9876543210"
 *   "+919876543210"   → "9876543210"
 *   "919876543210"    → "9876543210"
 *   "09876543210"     → "9876543210"
 *   "9876543210"      → "9876543210"
 */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  // Strip leading country code "91" if the result would still be 10 digits.
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Strip a leading "0" (common India domestic prefix) if it leaves 10 digits.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isValidIndianPhone(input: string): boolean {
  const phone = normalizePhone(input);
  return /^[6-9]\d{9}$/.test(phone);
}
