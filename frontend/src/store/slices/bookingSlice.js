import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createElement } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchMyBookings = createAsyncThunk(
  'bookings/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/bookings?${query}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const createBooking = createAsyncThunk(
  'bookings/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await api.post('/bookings', data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const cancelBooking = createAsyncThunk(
  'bookings/cancel',
  async (id, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/bookings/${id}/cancel`);
      return { id, ...res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const completeBooking = createAsyncThunk(
  'bookings/complete',
  async (id, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/bookings/${id}/complete`);
      return { id, ...res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

// Customer confirms arrival at the station; optionally swaps which EV they're
// charging. Locks in totalCost and starts the payment-deadline clock.
export const checkIn = createAsyncThunk(
  'bookings/checkIn',
  async ({ id, evId }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/bookings/${id}/check-in`, evId ? { evId } : {});
      return { id, ...res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

// Creates a Stripe PaymentIntent for a checked-in booking's locked-in cost.
// The returned clientSecret is confirmed client-side via Stripe Elements —
// the booking only flips to ACTIVE once the webhook confirms the charge.
// In mock mode (no real Stripe key on the backend), data.clientSecret is
// null and data.mock is true instead — the booking is already ACTIVE by
// the time this resolves (see PaymentModal.jsx's mock branch).
export const createPaymentIntent = createAsyncThunk(
  'bookings/createPaymentIntent',
  async (id, { rejectWithValue }) => {
    try {
      const res = await api.post(`/bookings/${id}/payment-intent`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

// Powers /payments — every booking's payment happens exclusively through
// createPaymentIntent above (either the real Stripe flow + webhook, or the
// backend's mock-mode simulation when no Stripe key is configured — see
// utils/stripe.js's isMockPayments), never a client-reported "I paid".
export const fetchPayments = createAsyncThunk(
  'bookings/fetchPayments',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/payments/history');
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const bookingSlice = createSlice({
  name: 'bookings',
  initialState: {
    bookings: [],
    pagination: null,
    loading: false,
    error: null,
    payments: [],
    paymentsLoading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyBookings.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMyBookings.fulfilled, (state, action) => {
        state.loading = false;
        state.bookings = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchMyBookings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load bookings');
      })
      .addCase(createBooking.fulfilled, (state, action) => {
        state.bookings.unshift(action.payload.data);
        // Plain string toasts can't hold a link — this needs createElement (not
        // JSX) since this file has a .js extension, not .jsx.
        toast.success(
          createElement(
            'span',
            null,
            'Booking confirmed! ',
            createElement(
              Link,
              {
                to: '/bookings',
                style: { color: 'inherit', fontWeight: 700, textDecoration: 'underline' },
              },
              'View My Bookings'
            )
          ),
          { autoClose: 6000 }
        );
      })
      .addCase(createBooking.rejected, (_, action) => toast.error(action.payload))
      .addCase(cancelBooking.fulfilled, (state, action) => {
        const idx = state.bookings.findIndex((b) => b.id === action.payload.id);
        if (idx !== -1) state.bookings[idx].status = 'CANCELLED';
        toast.info('Booking cancelled');
      })
      .addCase(cancelBooking.rejected, (_, action) => toast.error(action.payload))
      .addCase(completeBooking.fulfilled, (state, action) => {
        const idx = state.bookings.findIndex((b) => b.id === action.payload.id);
        if (idx !== -1) state.bookings[idx].status = 'COMPLETED';
        toast.success('Charging session completed!');
      })
      .addCase(checkIn.fulfilled, (state, action) => {
        const idx = state.bookings.findIndex((b) => b.id === action.payload.id);
        if (idx !== -1) state.bookings[idx] = { ...state.bookings[idx], ...action.payload.data };
        toast.success('Checked in — complete payment to start charging');
      })
      .addCase(checkIn.rejected, (_, action) => toast.error(action.payload))
      .addCase(createPaymentIntent.rejected, (_, action) => toast.error(action.payload))
      .addCase(fetchPayments.pending, (state) => {
        state.paymentsLoading = true;
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        state.paymentsLoading = false;
        state.payments = action.payload.data;
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        state.paymentsLoading = false;
        toast.error(action.payload || 'Failed to load payments');
      });
  },
});

export default bookingSlice.reducer;
