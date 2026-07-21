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

export const fetchMyBids = createAsyncThunk('bids/fetchMine', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/bids/mine');
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchSlotBids = createAsyncThunk('bids/fetchSlot', async (slotId, { rejectWithValue }) => {
  try {
    const res = await api.get(`/bids/slot/${slotId}`);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchAuctionResults = createAsyncThunk('bids/results', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/bids/results');
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

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
  initialState: { bids: [], slotBids: [], results: [], loading: false, lastBidResult: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(placeBid.pending, (state) => { state.loading = true; })
      .addCase(placeBid.fulfilled, (state, action) => {
        state.loading = false;
        state.lastBidResult = action.payload.data;
        toast.success(`Bid placed! Your rank: #${action.payload.data.yourRank} of ${action.payload.data.totalBids}`);
      })
      .addCase(placeBid.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload);
      })
      .addCase(fetchMyBids.fulfilled, (state, action) => { state.bids = action.payload.data; })
      .addCase(fetchSlotBids.fulfilled, (state, action) => { state.slotBids = action.payload.data; })
      .addCase(fetchAuctionResults.fulfilled, (state, action) => { state.results = action.payload.data; })
      .addCase(cancelBid.fulfilled, (state, action) => {
        state.bids = state.bids.filter(b => b.id !== action.payload);
        toast.info('Bid cancelled');
      });
  }
});

export default bidSlice.reducer;
