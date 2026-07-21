import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';
import { isFresh } from '../cacheCondition';

export const fetchMyEVs = createAsyncThunk(
  'ev/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/evs');
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  },
  {
    // Skip the network call entirely if we already fetched within the TTL —
    // e.g. navigating Dashboard -> My EVs -> Dashboard -> My EVs shouldn't
    // re-fetch an unchanged list every time.
    condition: (_, { getState }) => !isFresh(getState().ev.lastFetchedAt),
  }
);

export const addEV = createAsyncThunk('ev/add', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/evs', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const updateEV = createAsyncThunk('ev/update', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await api.put(`/evs/${id}`, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const deleteEV = createAsyncThunk('ev/delete', async (id, { rejectWithValue }) => {
  try {
    await api.delete(`/evs/${id}`);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const updateBattery = createAsyncThunk('ev/updateBattery', async ({ id, batteryPercentage }, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/evs/${id}/battery`, { batteryPercentage });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const evSlice = createSlice({
  name: 'ev',
  initialState: { evs: [], loading: false, error: null, lastFetchedAt: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyEVs.pending, (state) => { state.loading = true; })
      .addCase(fetchMyEVs.fulfilled, (state, action) => {
        state.loading = false;
        state.evs = action.payload.data;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchMyEVs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load your EVs');
      })
      .addCase(addEV.fulfilled, (state, action) => {
        state.evs.unshift(action.payload.data);
        toast.success('EV added successfully!');
      })
      .addCase(addEV.rejected, (_, action) => toast.error(action.payload))
      .addCase(updateEV.fulfilled, (state, action) => {
        const idx = state.evs.findIndex(e => e.id === action.payload.data.id);
        if (idx !== -1) state.evs[idx] = action.payload.data;
        toast.success('EV updated!');
      })
      .addCase(updateEV.rejected, (_, action) => toast.error(action.payload))
      .addCase(deleteEV.fulfilled, (state, action) => {
        state.evs = state.evs.filter(e => e.id !== action.payload);
        toast.success('EV removed');
      })
      .addCase(deleteEV.rejected, (_, action) => toast.error(action.payload))
      .addCase(updateBattery.fulfilled, (state, action) => {
        const idx = state.evs.findIndex(e => e.id === action.payload.data.id);
        if (idx !== -1) state.evs[idx] = action.payload.data;
        toast.success('Battery level updated!');
      })
      .addCase(updateBattery.rejected, (_, action) => toast.error(action.payload));
  }
});

export default evSlice.reducer;
