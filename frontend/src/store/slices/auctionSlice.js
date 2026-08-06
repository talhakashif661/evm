import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

// One auction status tab (Active/Completed/Cancelled) on the owner's slots —
// backs the dedicated Auctions page. `status` selects the tab server-side so
// each tab is its own paginated (10/page) request, not a client-side bucket
// of one big fetch.
export const fetchOwnerAuctions = createAsyncThunk(
  'auctions/fetchOwner',
  async ({ status, page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const res = await api.get('/auctions/owner', { params: { status, page, limit } });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

// Ranked bid list for one auction round — the "View Bids" action.
export const fetchAuctionBids = createAsyncThunk(
  'auctions/fetchBids',
  async ({ auctionId, page = 1, limit = 10 }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/auctions/${auctionId}/bids`, { params: { page, limit } });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const auctionSlice = createSlice({
  name: 'auctions',
  initialState: {
    ownerAuctions: [],
    ownerAuctionsPagination: null,
    loading: false,
    error: null,
    bidsModal: null, // { auction, bids } for the currently-open "View Bids" modal
    bidsPagination: null,
    bidsLoading: false,
  },
  reducers: {
    clearAuctionBids: (state) => {
      state.bidsModal = null;
      state.bidsPagination = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOwnerAuctions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOwnerAuctions.fulfilled, (state, action) => {
        state.loading = false;
        state.ownerAuctions = action.payload.data;
        state.ownerAuctionsPagination = action.payload.pagination || null;
      })
      .addCase(fetchOwnerAuctions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load auctions', { toastId: 'auctions-fetch-error' });
      })
      .addCase(fetchAuctionBids.pending, (state) => {
        state.bidsLoading = true;
      })
      .addCase(fetchAuctionBids.fulfilled, (state, action) => {
        state.bidsLoading = false;
        state.bidsModal = action.payload.data;
        state.bidsPagination = action.payload.pagination || null;
      })
      .addCase(fetchAuctionBids.rejected, (state, action) => {
        state.bidsLoading = false;
        toast.error(action.payload || 'Failed to load bids');
      });
  },
});

export const { clearAuctionBids } = auctionSlice.actions;
export default auctionSlice.reducer;
