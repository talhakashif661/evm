import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchRecommendations = createAsyncThunk(
  'ai/recommend',
  async (params, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/ai/recommend?${query}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

const aiSlice = createSlice({
  name: 'ai',
  initialState: { recommendations: [], meta: null, loading: false, error: null },
  reducers: {
    clearRecommendations: (state) => {
      state.recommendations = [];
      state.meta = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecommendations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.loading = false;
        state.recommendations = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchRecommendations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to load recommendations');
      });
  },
});

export const { clearRecommendations } = aiSlice.actions;
export default aiSlice.reducer;
