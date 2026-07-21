import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';
import { isFresh } from '../cacheCondition';

export const fetchStations = createAsyncThunk(
  'stations/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/stations?${query}`);
      return { ...res.data, queryKey: JSON.stringify(params) };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  },
  {
    // Only skip the network call if this is the EXACT SAME query (same
    // filters/page) as the last one, and it's still within the TTL — a
    // genuinely different search/filter/page always goes through, this
    // only catches redundant re-fetches of what's already on screen.
    condition: (params = {}, { getState }) => {
      const { lastFetchedAt, lastQueryKey } = getState().stations;
      const queryKey = JSON.stringify(params);
      return !(queryKey === lastQueryKey && isFresh(lastFetchedAt));
    },
  }
);

export const fetchStationById = createAsyncThunk('stations/fetchById', async (id, { rejectWithValue }) => {
  try {
    const res = await api.get(`/stations/${id}`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchMyStation = createAsyncThunk('stations/fetchMine', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/stations/owner/mine');
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const createStation = createAsyncThunk('stations/create', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/stations', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchStationSlots = createAsyncThunk('stations/fetchSlots', async (stationId, { rejectWithValue }) => {
  try {
    const res = await api.get(`/slots/station/${stationId}`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const addSlot = createAsyncThunk('stations/addSlot', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/slots', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const openSlotAuction = createAsyncThunk('stations/openAuction', async ({ slotId, durationMinutes }, { rejectWithValue }) => {
  try {
    const res = await api.post(`/slots/${slotId}/auction/open`, { durationMinutes });
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const closeSlotAuction = createAsyncThunk('stations/closeAuction', async (slotId, { rejectWithValue }) => {
  try {
    const res = await api.post(`/slots/${slotId}/auction/close`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const stationSlice = createSlice({
  name: 'stations',
  initialState: {
    stations: [],
    currentStation: null,
    myStation: null,
    slots: [],
    pagination: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
    lastQueryKey: null
  },
  reducers: {
    clearCurrentStation: (state) => { state.currentStation = null; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStations.pending, (state) => { state.loading = true; })
      .addCase(fetchStations.fulfilled, (state, action) => {
        state.loading = false;
        state.stations = action.payload.data;
        state.pagination = action.payload.pagination;
        state.lastFetchedAt = Date.now();
        state.lastQueryKey = action.payload.queryKey;
      })
      .addCase(fetchStations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load stations');
      })
      .addCase(fetchStationById.fulfilled, (state, action) => {
        state.currentStation = action.payload.data;
      })
      .addCase(fetchMyStation.pending, (state) => { state.loading = true; })
      .addCase(fetchMyStation.fulfilled, (state, action) => {
        state.loading = false;
        state.myStation = action.payload.data;
      })
      .addCase(fetchMyStation.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load your station');
      })
      .addCase(createStation.fulfilled, (state, action) => {
        state.myStation = action.payload.data;
        toast.success('Station submitted for approval!');
      })
      .addCase(createStation.rejected, (_, action) => toast.error(action.payload))
      .addCase(fetchStationSlots.fulfilled, (state, action) => {
        state.slots = action.payload.data;
      })
      .addCase(addSlot.fulfilled, (state, action) => {
        state.slots.push(action.payload.data);
        toast.success('Slot added!');
      })
      .addCase(addSlot.rejected, (_, action) => toast.error(action.payload))
      .addCase(openSlotAuction.fulfilled, (state, action) => {
        const idx = state.slots.findIndex(s => s.id === action.payload.data.id);
        if (idx !== -1) state.slots[idx] = action.payload.data;
        toast.success('Auction opened!');
      })
      .addCase(closeSlotAuction.fulfilled, (_, action) => {
        toast.success(action.payload.message || 'Auction closed');
      });
  }
});

export const { clearCurrentStation } = stationSlice.actions;
export default stationSlice.reducer;
