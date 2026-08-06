import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import evReducer from './slices/evSlice';
import stationReducer from './slices/stationSlice';
import bookingReducer from './slices/bookingSlice';
import bidReducer from './slices/bidSlice';
import auctionReducer from './slices/auctionSlice';
import aiReducer from './slices/aiSlice';
import verificationReducer from './slices/verificationSlice';
// Admin slices (merged into frontend)
import adminDashboardReducer from './slices/adminDashboardSlice';
import adminUsersReducer from './slices/adminUsersSlice';
import adminStationsReducer from './slices/adminStationsSlice';
import adminBookingsReducer from './slices/adminBookingsSlice';
import adminLogsReducer from './slices/adminLogsSlice';
import adminComplaintsReducer from './slices/adminComplaintsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ev: evReducer,
    stations: stationReducer,
    bookings: bookingReducer,
    bids: bidReducer,
    auctions: auctionReducer,
    ai: aiReducer,
    verification: verificationReducer,
    adminDashboard: adminDashboardReducer,
    adminUsers: adminUsersReducer,
    adminStations: adminStationsReducer,
    adminBookings: adminBookingsReducer,
    adminLogs: adminLogsReducer,
    adminComplaints: adminComplaintsReducer,
  },
});
