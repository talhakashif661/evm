import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchAdminStations = createAsyncThunk(
  'stations/fetch',
  async (params = {}, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/admin/stations?${query}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const updateStationStatus = createAsyncThunk(
  'stations/updateStatus',
  async ({ id, action }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/stations/${id}/status`, { action });
      return { id, status: action, ...res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const stationsSlice = createSlice({
  name: 'stations',
  initialState: { stations: [], pagination: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminStations.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAdminStations.fulfilled, (state, action) => {
        state.loading = false;
        state.stations = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAdminStations.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load stations');
      })
      .addCase(updateStationStatus.fulfilled, (state, action) => {
        const idx = state.stations.findIndex((s) => s.id === action.payload.id);
        if (idx !== -1) state.stations[idx].status = action.payload.status;
        toast.success(`Station ${action.payload.status.toLowerCase()}`);
      })
      .addCase(updateStationStatus.rejected, (_, a) => toast.error(a.payload));
  },
});

export default stationsSlice.reducer;
