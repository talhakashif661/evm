import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const fetchUsers = createAsyncThunk(
  'users/fetch',
  async (params = {}, { rejectWithValue }) => {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await api.get(`/admin/users?${query}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const toggleBlockUser = createAsyncThunk('users/block', async (id, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/admin/users/${id}/block`);
    return { id, ...res.data };
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const deleteUser = createAsyncThunk('users/delete', async (id, { rejectWithValue }) => {
  try {
    await api.delete(`/admin/users/${id}`);
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const promoteToAdmin = createAsyncThunk('users/promote', async (id, { rejectWithValue }) => {
  try {
    const res = await api.patch(`/admin/users/${id}/promote`);
    return { id, ...res.data };
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const usersSlice = createSlice({
  name: 'users',
  initialState: { users: [], pagination: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        toast.error(action.payload || 'Failed to load users');
      })
      .addCase(toggleBlockUser.fulfilled, (state, action) => {
        const idx = state.users.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.users[idx].isBlocked = !state.users[idx].isBlocked;
        toast.success(action.payload.message);
      })
      .addCase(toggleBlockUser.rejected, (_, a) => toast.error(a.payload))
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
        toast.success('User deleted');
      })
      .addCase(deleteUser.rejected, (_, a) => toast.error(a.payload))
      .addCase(promoteToAdmin.fulfilled, (state, action) => {
        const idx = state.users.findIndex((u) => u.id === action.payload.id);
        if (idx !== -1) state.users[idx].role = 'ADMIN';
        toast.success(action.payload.message);
      })
      .addCase(promoteToAdmin.rejected, (_, a) => toast.error(a.payload));
  },
});

export default usersSlice.reducer;
