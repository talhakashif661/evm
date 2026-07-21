import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchComplaints = createAsyncThunk('adminComplaints/fetch', async (params = {}, { rejectWithValue }) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await api.get(`/complaints?${query}`);
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const deleteComplaint = createAsyncThunk('adminComplaints/delete', async (id, { rejectWithValue }) => {
  try {
    await api.delete(`/complaints/${id}`);
    return id;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

const adminComplaintsSlice = createSlice({
  name: 'adminComplaints',
  initialState: { complaints: [], pagination: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchComplaints.pending, (state) => { state.loading = true; })
      .addCase(fetchComplaints.fulfilled, (state, action) => {
        state.loading = false;
        state.complaints = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchComplaints.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load complaints');
      })
      .addCase(deleteComplaint.fulfilled, (state, action) => {
        state.complaints = state.complaints.filter(c => c.id !== action.payload);
        if (state.pagination) state.pagination.total = Math.max(0, state.pagination.total - 1);
        toast.success('Complaint deleted');
      })
      .addCase(deleteComplaint.rejected, (_, action) => toast.error(action.payload || 'Delete failed'));
  }
});

export default adminComplaintsSlice.reducer;
