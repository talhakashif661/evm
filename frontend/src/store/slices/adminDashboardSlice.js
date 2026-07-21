import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchDashboard = createAsyncThunk(
  'dashboard/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/admin/dashboard');
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: { stats: null, recentBookings: [], chartData: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload.data.stats;
        state.recentBookings = action.payload.data.recentBookings;
        state.chartData = action.payload.data.chartData;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load dashboard');
      });
  },
});

export default dashboardSlice.reducer;
