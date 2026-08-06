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
      const { loading, activeQueryKey, lastFetchedAt, lastQueryKey } = getState().stations;
      const queryKey = JSON.stringify(params);
      const sameRequestInFlight = loading && queryKey === activeQueryKey;
      const sameRequestIsFresh = queryKey === lastQueryKey && isFresh(lastFetchedAt);
      return !sameRequestInFlight && !sameRequestIsFresh;
    },
  }
);

export const fetchStationById = createAsyncThunk(
  'stations/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      const res = await api.get(`/stations/${id}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchMyStation = createAsyncThunk(
  'stations/fetchMine',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/stations/owner/mine');
      return res.data;
    } catch (err) {
      // A station owner who has not registered a station yet is a valid empty
      // state, not an error that should interrupt them with a toast.
      if (err.response?.status === 404) {
        return { success: true, data: null };
      }
      return rejectWithValue(err.response?.data?.message);
    }
  },
  {
    // React StrictMode intentionally mounts effects twice in development.
    // Keep the second mount from issuing the same owner lookup concurrently.
    condition: (_, { getState }) => !getState().stations.myStationRequestPending,
  }
);

export const createStation = createAsyncThunk(
  'stations/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await api.post('/stations', data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchStationSlots = createAsyncThunk(
  'stations/fetchSlots',
  async (stationId, { rejectWithValue }) => {
    try {
      const res = await api.get(`/slots/station/${stationId}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const addSlot = createAsyncThunk('stations/addSlot', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/slots', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const openSlotAuction = createAsyncThunk(
  'stations/openAuction',
  async (
    { slotId, durationMinutes, startingBid, minIncrement, reservationMinutes },
    { rejectWithValue }
  ) => {
    try {
      const res = await api.post(`/slots/${slotId}/auction/open`, {
        durationMinutes,
        startingBid,
        minIncrement,
        reservationMinutes,
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const closeSlotAuction = createAsyncThunk(
  'stations/closeAuction',
  async (slotId, { rejectWithValue }) => {
    try {
      const res = await api.post(`/slots/${slotId}/auction/close`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const stationSlice = createSlice({
  name: 'stations',
  initialState: {
    stations: [],
    currentStation: null,
    myStation: null,
    slots: [],
    pagination: null,
    loading: false,
    myStationRequestPending: false,
    error: null,
    lastFetchedAt: null,
    lastQueryKey: null,
    activeQueryKey: null,
  },
  reducers: {
    clearCurrentStation: (state) => {
      state.currentStation = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStations.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.activeQueryKey = JSON.stringify(action.meta.arg || {});
      })
      .addCase(fetchStations.fulfilled, (state, action) => {
        state.loading = false;
        state.stations = action.payload.data;
        state.pagination = action.payload.pagination;
        state.lastFetchedAt = Date.now();
        state.lastQueryKey = action.payload.queryKey;
        state.activeQueryKey = null;
        state.error = null;
      })
      .addCase(fetchStations.rejected, (state, action) => {
        state.loading = false;
        state.activeQueryKey = null;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load stations', {
          toastId: 'stations-fetch-error',
        });
      })
      .addCase(fetchStationById.fulfilled, (state, action) => {
        state.currentStation = action.payload.data;
      })
      .addCase(fetchMyStation.pending, (state) => {
        state.loading = true;
        state.myStationRequestPending = true;
      })
      .addCase(fetchMyStation.fulfilled, (state, action) => {
        state.loading = false;
        state.myStationRequestPending = false;
        state.myStation = action.payload.data;
        state.error = null;
      })
      .addCase(fetchMyStation.rejected, (state, action) => {
        state.loading = false;
        state.myStationRequestPending = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load your station', {
          toastId: 'my-station-fetch-error',
        });
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
        const idx = state.slots.findIndex((s) => s.id === action.payload.data.id);
        if (idx !== -1) state.slots[idx] = action.payload.data;
        toast.success('Auction opened!');
      })
      .addCase(openSlotAuction.rejected, (_, action) => {
        toast.error(action.payload || 'Failed to open auction');
      })
      .addCase(closeSlotAuction.fulfilled, (_, action) => {
        toast.success(action.payload.message || 'Auction closed');
      })
      .addCase(closeSlotAuction.rejected, (_, action) => {
        toast.error(action.payload || 'Failed to close auction');
      });
  },
});

export const { clearCurrentStation } = stationSlice.actions;
export default stationSlice.reducer;
