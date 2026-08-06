import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const placeBid = createAsyncThunk('bids/place', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/bids', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchMyBids = createAsyncThunk(
  'bids/fetchMine',
  async ({ status, page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const res = await api.get('/bids/mine', { params: { status, page, limit } });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchSlotBids = createAsyncThunk(
  'bids/fetchSlot',
  async (slotId, { rejectWithValue }) => {
    try {
      const res = await api.get(`/bids/slot/${slotId}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchAuctionResults = createAsyncThunk(
  'bids/results',
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const res = await api.get('/bids/results', { params: { page, limit } });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const cancelBid = createAsyncThunk('bids/cancel', async (id, { rejectWithValue }) => {
  try {
    await api.patch(`/bids/${id}/cancel`);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const bidSlice = createSlice({
  name: 'bids',
  initialState: {
    bids: [],
    bidsPagination: null,
    bidsLoading: false,
    slotBids: [],
    results: [],
    resultsPagination: null,
    resultsLoading: false,
    loading: false,
    lastBidResult: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(placeBid.pending, (state) => {
        state.loading = true;
      })
      .addCase(placeBid.fulfilled, (state, action) => {
        state.loading = false;
        state.lastBidResult = action.payload.data;
        toast.success(
          `Bid placed! Your rank: #${action.payload.data.yourRank} of ${action.payload.data.totalBids}`
        );
      })
      .addCase(placeBid.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload);
      })
      .addCase(fetchMyBids.pending, (state) => {
        state.bidsLoading = true;
      })
      .addCase(fetchMyBids.fulfilled, (state, action) => {
        state.bidsLoading = false;
        state.bids = action.payload.data;
        state.bidsPagination = action.payload.pagination || null;
      })
      .addCase(fetchMyBids.rejected, (state) => {
        state.bidsLoading = false;
      })
      .addCase(fetchSlotBids.fulfilled, (state, action) => {
        state.slotBids = action.payload.data;
      })
      .addCase(fetchAuctionResults.pending, (state) => {
        state.resultsLoading = true;
      })
      .addCase(fetchAuctionResults.fulfilled, (state, action) => {
        state.resultsLoading = false;
        state.results = action.payload.data;
        state.resultsPagination = action.payload.pagination || null;
      })
      .addCase(fetchAuctionResults.rejected, (state) => {
        state.resultsLoading = false;
      })
      .addCase(cancelBid.fulfilled, (state, action) => {
        state.bids = state.bids.filter((b) => b.id !== action.payload);
        toast.info('Bid cancelled');
      });
  },
});

export default bidSlice.reducer;
