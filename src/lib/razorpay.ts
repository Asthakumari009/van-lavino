export interface RazorpayOptions {
  amount: number; // in paise (INR * 100)
  orderId: string; // Razorpay order_id from backend
  name?: string;
  description?: string;
  tableNumber: string;
  prefill?: { name?: string; contact?: string; email?: string };
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onFailure: () => void;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function initiatePayment({
  amount,
  orderId,
  name,
  description,
  tableNumber,
  prefill,
  onSuccess,
  onFailure,
}: RazorpayOptions) {
  const loaded = await loadRazorpay();
  if (!loaded) throw new Error('Razorpay failed to load');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount,
    currency: 'INR',
    name: name || 'Van Lavino',
    description: description || `Table ${tableNumber} Order`,
    order_id: orderId,
    theme: { color: '#c17820' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (response: any) => onSuccess(response),
    modal: { ondismiss: onFailure },
  };

  if (prefill) options.prefill = prefill;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rzp = new (window as any).Razorpay(options);
  rzp.open();
}
