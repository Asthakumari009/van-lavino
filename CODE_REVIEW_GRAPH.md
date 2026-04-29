# Code Review Graph

This graph captures internal TypeScript/TSX import dependencies inside `src/`.
Use it during review to understand impact radius when changing a page, hook, or shared module.

## Dependency Graph

```mermaid
graph LR
  main["src/main.tsx"] --> app["src/App.tsx"]

  app --> pAdmin["src/pages/AdminDashboard.tsx"]
  app --> pCustomerAuth["src/pages/CustomerAuth.tsx"]
  app --> pLanding["src/pages/Landing.tsx"]
  app --> pLogin["src/pages/Login.tsx"]
  app --> pMenu["src/pages/Menu.tsx"]
  app --> pNotFound["src/pages/NotFound.tsx"]
  app --> pOrderSuccess["src/pages/OrderSuccess.tsx"]
  app --> pScanQR["src/pages/ScanQR.tsx"]
  app --> pStaff["src/pages/StaffDashboard.tsx"]
  app --> libAuth["src/lib/useAuth.ts"]
  app --> libCustomer["src/lib/useCustomerAccess.ts"]
  app --> types["src/types/index.ts"]

  pLanding --> cNavbar["src/components/Navbar.tsx"]

  pCustomerAuth --> cSpinner["src/components/Spinner.tsx"]
  pCustomerAuth --> libCustomer

  pLogin --> cSpinner
  pLogin --> libSupabase["src/lib/supabase.ts"]
  pLogin --> libAuth
  pLogin --> types

  pMenu --> cSpinner
  pMenu --> libRazorpay["src/lib/razorpay.ts"]
  pMenu --> libSupabase
  pMenu --> libCart["src/lib/useCart.ts"]
  pMenu --> libCustomer
  pMenu --> types

  pOrderSuccess --> cReceipt["src/components/ReceiptGenerator.tsx"]
  pOrderSuccess --> cSpinner
  pOrderSuccess --> libSupabase
  pOrderSuccess --> libCart
  pOrderSuccess --> types

  pScanQR --> cSpinner
  pScanQR --> libSupabase
  pScanQR --> libCart
  pScanQR --> libCustomer

  pStaff --> cReceipt
  pStaff --> libRazorpay
  pStaff --> libSupabase
  pStaff --> libAuth
  pStaff --> types

  pAdmin --> libSupabase
  pAdmin --> libAuth
  pAdmin --> types

  libAuth --> libSupabase
  libAuth --> types
  libCart --> types
  cReceipt --> types
```

## Review Focus Hotspots

1. `src/types/index.ts` is a shared dependency for pages, hooks, and receipt generation.
2. `src/lib/supabase.ts` is the data-access root used by auth and multiple pages.
3. `src/lib/useAuth.ts` is consumed by routing and admin/staff/login flows.
4. `src/lib/useCustomerAccess.ts` influences route guards and customer journey pages.
5. `src/components/Spinner.tsx` is shared across customer, auth, and order flows.
