import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchLogs = createAsyncThunk(
  'adminLogs/fetch',
  async (params = {}, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/admin/logs?${query}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const adminLogsSlice = createSlice({
  name: 'adminLogs',
  initialState: { logs: [], pagination: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLogs.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchLogs.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load audit logs');
      });
  },
});

export default adminLogsSlice.reducer;
