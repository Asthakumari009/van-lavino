import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '../types';

export const GST_RATE = 0.05;
export const CGST_RATE = 0.025;
export const SGST_RATE = 0.025;
export const CUSTOMER_NOTE_MAX = 200;

interface CartState {
  items: CartItem[];
  tableNumber: string;
  branchId: string;
  customerNote: string;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setTableInfo: (tableNumber: string, branchId: string) => void;
  setCustomerNote: (note: string) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      tableNumber: '',
      branchId: '',
      customerNote: '',
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      updateQuantity: (id, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => i.id !== id) };
          }
          return {
            items: state.items.map((i) =>
              i.id === id ? { ...i, quantity } : i
            ),
          };
        }),
      clearCart: () => set({ items: [], customerNote: '' }),
      setTableInfo: (tableNumber, branchId) =>
        set({ tableNumber, branchId }),
      setCustomerNote: (note) =>
        set({ customerNote: note.slice(0, CUSTOMER_NOTE_MAX) }),
    }),
    {
      name: 'vanlavino-cart',
      partialize: (state) => ({
        items: state.items,
        tableNumber: state.tableNumber,
        branchId: state.branchId,
        customerNote: state.customerNote,
      }),
    }
  )
);

// Reactive selectors — use these inside components so React re-renders
// when the underlying items change. (Computed methods on the store return
// stable function refs and break reactivity.)
export const selectTotalItems = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectSubtotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectGrandTotal = (s: CartState) =>
  selectSubtotal(s) * (1 + GST_RATE);
