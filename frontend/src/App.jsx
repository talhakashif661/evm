import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Marquee from './components/Marquee';
import BackToTop from './components/BackToTop';
import AdminLayout from './components/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import { trackPageView } from './utils/analytics';

// Auth pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// User pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Stations = lazy(() => import('./pages/Stations'));
const StationDetail = lazy(() => import('./pages/StationDetail'));
const Bookings = lazy(() => import('./pages/Bookings'));
const UserHistory = lazy(() => import('./pages/UserHistory'));
const AuctionHub = lazy(() => import('./pages/AuctionHub'));
const Profile = lazy(() => import('./pages/Profile'));
const Payments = lazy(() => import('./pages/Payments'));
const EVManagement = lazy(() => import('./pages/MyEVs'));
const AIRecommend = lazy(() => import('./pages/AIRecommend'));
const Landing = lazy(() => import('./pages/Landing'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));

// Station owner pages
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const StationReport = lazy(() => import('./pages/StationReport'));

// Admin pages (merged into frontend)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminStations = lazy(() => import('./pages/admin/AdminStations'));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminComplaints = lazy(() => import('./pages/admin/AdminComplaints'));

const NotFound = lazy(() => import('./pages/NotFound'));

const Spinner = () => (
  <div
    style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}
  >
    <div className="ev-spinner" />
  </div>
);

function PrivateRoute({ children, roles }) {
  const { user, token } = useSelector((s) => s.auth);
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { token, user } = useSelector((s) => s.auth);
  if (token)
    return <Navigate to={user?.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard'} replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <OfflineBanner />
      {/* Admin section uses its own sidebar layout — the public/user Navbar
          would otherwise double-stack on top of it. */}
      {!isAdminRoute && <Marquee />}
      {!isAdminRoute && <Navbar />}
      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
          >
            <Suspense fallback={<Spinner />}>
              <ErrorBoundary>
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route
                    path="/login"
                    element={
                      <PublicRoute>
                        <Login />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <PublicRoute>
                        <Register />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/forgot-password"
                    element={
                      <PublicRoute>
                        <ForgotPassword />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/reset-password"
                    element={
                      <PublicRoute>
                        <ResetPassword />
                      </PublicRoute>
                    }
                  />

                  {/* Email verification */}
                  <Route
                    path="/verify-email"
                    element={
                      <PrivateRoute>
                        <VerifyEmail />
                      </PrivateRoute>
                    }
                  />

                  {/* EV User routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <PrivateRoute>
                        <Dashboard />
                      </PrivateRoute>
                    }
                  />
                  <Route path="/stations" element={<Stations />} />
                  <Route path="/stations/:id" element={<StationDetail />} />
                  <Route
                    path="/bookings"
                    element={
                      <PrivateRoute>
                        <Bookings />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/payments"
                    element={
                      <PrivateRoute>
                        <Payments />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/history"
                    element={
                      <PrivateRoute>
                        <UserHistory />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/auction"
                    element={
                      <PrivateRoute>
                        <AuctionHub />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/evs"
                    element={
                      <PrivateRoute>
                        <EVManagement />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/ai-recommend"
                    element={
                      <PrivateRoute>
                        <AIRecommend />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <PrivateRoute>
                        <Profile />
                      </PrivateRoute>
                    }
                  />

                  {/* Station Owner routes */}
                  <Route
                    path="/owner/station"
                    element={
                      <PrivateRoute roles={['STATION_OWNER']}>
                        <OwnerDashboard />
                      </PrivateRoute>
                    }
                  />
                  <Route path="/owner/slots" element={<Navigate to="/owner/station" replace />} />
                  <Route
                    path="/owner/bookings"
                    element={<Navigate to="/owner/station" replace />}
                  />
                  <Route
                    path="/owner/reports"
                    element={
                      <PrivateRoute roles={['STATION_OWNER']}>
                        <StationReport />
                      </PrivateRoute>
                    }
                  />

                  {/* Admin routes — nested under AdminLayout (sidebar shell), same port, same frontend */}
                  <Route
                    path="/admin"
                    element={
                      <PrivateRoute roles={['ADMIN']}>
                        <AdminLayout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="stations" element={<AdminStations />} />
                    <Route path="bookings" element={<AdminBookings />} />
                    <Route path="logs" element={<AdminLogs />} />
                    <Route path="complaints" element={<AdminComplaints />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <BackToTop />}
    </div>
  );
}
