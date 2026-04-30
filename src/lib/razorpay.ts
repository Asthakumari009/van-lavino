export interface RazorpayOptions {
  amount: number; // in paise (INR * 100)
  orderId: string; // Razorpay order_id from backend
  name?: string;
  description?: string;
  tableNumber: string;
  /**
   * URL Razorpay should redirect to after a successful payment when the
   * customer is on a flow that breaks the in-page modal — primarily mobile
   * UPI intents, where the OS swaps to a UPI app and the JS context can be
   * suspended so the `handler` callback never fires reliably.
   *
   * When this is set, Razorpay returns to `callbackUrl` with the response
   * params appended as query string. The receiving page must verify the
   * signature server-side before trusting the payment.
   */
  callbackUrl?: string;
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
  callbackUrl,
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

  // Mobile UPI flow: when redirect+callback_url are set, Razorpay navigates
  // to the callback_url after a successful payment with the response in the
  // query string. This is the only reliable path on phones because the JS
  // handler can be killed when the OS pulls the user into a UPI app.
  // Desktop modal still triggers `handler` first; redirect is a fallback.
  if (callbackUrl) {
    options.callback_url = callbackUrl;
    options.redirect = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rzp = new (window as any).Razorpay(options);
  rzp.open();
}
