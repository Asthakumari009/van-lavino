import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Landing from './pages/Landing';
import Menu from './pages/Menu';
import OrderOnline from './pages/OrderOnline';
import OrderCheckout from './pages/OrderCheckout';
import OrderSuccess from './pages/OrderSuccess';
import RiderConsole from './pages/RiderConsole';
import SetupMfa from './pages/SetupMfa';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import { useAuth } from './lib/useAuth';
import { useCustomerAccess } from './lib/useCustomerAccess';
import type { Staff, StaffRole } from './types';
import CustomerAuth from './pages/CustomerAuth';
import ScanQR from './pages/ScanQR';
import CustomerDashboard from './pages/CustomerDashboard';
import OrderTracking from './pages/OrderTracking';
import LeaveReview from './pages/LeaveReview';
import Reserve from './pages/Reserve';
import Blog from './pages/Blog';
import BlogPostPage from './pages/BlogPostPage';

// Heavy dashboards (recharts, PDF libs). Splitting them out keeps them out of
// the customer-facing bundle.
const StaffDashboard = lazy(() => import('./pages/StaffDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function AuthLoading() {
  return (
    <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center">
      <span className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase animate-pulse">
        Loading…
      </span>
    </div>
  );
}

function homeForStaff(staff: Staff | null): string | null {
  if (!staff) return null;
  if (staff.role === 'admin') return '/admin';
  if (staff.role === 'staff' || staff.role === 'manager') return '/staff';
  return null;
}

function ProtectedRoute({
  allow,
  children,
}: {
  allow: StaffRole[];
  children: ReactNode;
}) {
  const isLoading = useAuth((s) => s.isLoading);
  const staffRecord = useAuth((s) => s.staffRecord);
  const currentAal = useAuth((s) => s.currentAal);
  const nextAal = useAuth((s) => s.nextAal);
  if (isLoading) return <AuthLoading />;
  if (!staffRecord) return <Navigate to="/login" replace />;
  if (!allow.includes(staffRecord.role)) {
    const target = homeForStaff(staffRecord);
    return <Navigate to={target ?? '/login'} replace />;
  }

  // Hard MFA enforcement for admin role:
  //   - already at aal2  → through
  //   - factor exists but not yet challenged (nextAal=aal2, currentAal=aal1)
  //                       → bounce to /login so they enter the code
  //   - no factor at all (nextAal=aal1) → bounce to /setup-mfa
  // This pairs with the RLS in migration 016 — admins literally
  // can't write at aal1 even if they bypass the frontend.
  if (staffRecord.role === 'admin' && currentAal !== 'aal2') {
    if (nextAal === 'aal2') {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/setup-mfa" replace />;
  }

  return <>{children}</>;
}

function CustomerAuthRoute({ children }: { children: ReactNode }) {
  const isActive = useCustomerAccess((s) => s.isCustomerActive);
  if (!isActive()) return <Navigate to="/customer-auth" replace />;
  return <>{children}</>;
}

// Wraps the current route in a keyed <div> so navigation triggers a fresh
// CSS fade-in. Remounts the page — intentional; routes are treated as
// disposable on navigation.
function RouteFade({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname + location.search} className="route-fade">
      {children}
    </div>
  );
}

function AppRoutes() {
  return (
    <RouteFade>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/customer-auth" element={<CustomerAuth />} />
        <Route
          path="/scan"
          element={
            <CustomerAuthRoute>
              <ScanQR />
            </CustomerAuthRoute>
          }
        />
        {/* /menu is publicly browseable — customers wanted to see the
            menu before visiting. Ordering gates re-engage inside Menu:
            without a table session, "Add" sends the user to /scan. */}
        <Route path="/menu" element={<Menu />} />
        <Route
          path="/customer"
          element={
            <CustomerAuthRoute>
              <CustomerDashboard />
            </CustomerAuthRoute>
          }
        />
        <Route path="/order" element={<OrderOnline />} />
        <Route path="/order/checkout" element={<OrderCheckout />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/rider/:token" element={<RiderConsole />} />
        <Route path="/track" element={<OrderTracking />} />
        <Route path="/review" element={<LeaveReview />} />
        <Route path="/reserve" element={<Reserve />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/setup-mfa" element={<SetupMfa />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute allow={['staff', 'manager']}>
              <Suspense fallback={<AuthLoading />}>
                <StaffDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allow={['admin']}>
              <Suspense fallback={<AuthLoading />}>
                <AdminDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </RouteFade>
  );
}

export default function App() {
  const initialize = useAuth((s) => s.initialize);
  const isCustomerActive = useCustomerAccess((s) => s.isCustomerActive);
  const isTableSessionActive = useCustomerAccess((s) => s.isTableSessionActive);
  const clearCustomer = useCustomerAccess((s) => s.clearCustomer);
  const clearTableSession = useCustomerAccess((s) => s.clearTableSession);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isCustomerActive()) clearCustomer();
    if (!isTableSessionActive()) clearTableSession();
  }, [clearCustomer, clearTableSession, isCustomerActive, isTableSessionActive]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#fbf5e5',
            color: '#000000',
            border: '1px solid #c17820',
            boxShadow: '0 18px 50px -18px rgba(10, 7, 5, 0.35)',
          },
          iconTheme: { primary: '#c17820', secondary: '#fbf5e5' },
        }}
      />
      <AppRoutes />
    </BrowserRouter>
  );
}
