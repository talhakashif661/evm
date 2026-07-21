import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchAdminBookings = createAsyncThunk('bookings/fetch', async (params = {}, { rejectWithValue }) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await api.get(`/admin/bookings?${query}`);
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

// The backend already lets an admin cancel any booking (owner-cancel checks
// role, not just station ownership) — this was previously unreachable from
// the admin UI, which only ever rendered a read-only table.
export const cancelAdminBooking = createAsyncThunk('bookings/cancel', async (id, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/bookings/${id}/owner-cancel`);
    return { id, ...res.data };
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

const bookingsSlice = createSlice({
  name: 'bookings',
  initialState: { bookings: [], pagination: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminBookings.pending, (state) => { state.loading = true; })
      .addCase(fetchAdminBookings.fulfilled, (state, action) => {
        state.loading = false;
        state.bookings = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAdminBookings.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load bookings');
      })
      .addCase(cancelAdminBooking.fulfilled, (state, action) => {
        const idx = state.bookings.findIndex(b => b.id === action.payload.id);
        if (idx !== -1) state.bookings[idx].status = 'CANCELLED';
        toast.success(action.payload.data?.refunded ? 'Booking cancelled and customer refunded' : 'Booking cancelled');
      })
      .addCase(cancelAdminBooking.rejected, (_, action) => toast.error(action.payload));
  }
});

export default bookingsSlice.reducer;
