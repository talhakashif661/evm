import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';
import { reauthSocket } from '../../utils/socket';

const storedUser = localStorage.getItem('ev_user');
const storedToken = localStorage.getItem('ev_token');

export const registerUser = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/register', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Registration failed');
  }
});

export const loginUser = createAsyncThunk('auth/login', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/login', data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/auth/me');
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

// Calls the server so the token is actually invalidated (not just deleted
// client-side) before clearing local state. Always "succeeds" from the
// caller's point of view — a network failure or already-expired token
// shouldn't leave the user stuck looking logged in on their own device.
export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await api.post('/auth/logout');
  } catch {
    /* best-effort — local session clears regardless, see below */
  }
  return true;
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    loading: false,
    error: null,
    initialized: false,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Called after successful OTP verification so the banner disappears immediately
    // without waiting for the next fetchMe() cycle.
    setUserVerified: (state) => {
      if (state.user) {
        state.user = { ...state.user, isVerified: true };
        localStorage.setItem('ev_user', JSON.stringify(state.user));
      }
    },
    // Merge freshly-saved fields (name, phone, avatar, ...) into the in-memory
    // + persisted user object immediately, so the navbar/greeting update
    // without waiting for a refresh or re-login.
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        localStorage.setItem('ev_user', JSON.stringify(state.user));
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.data.user;
        state.token = action.payload.data.token;
        localStorage.setItem('ev_token', action.payload.data.token);
        localStorage.setItem('ev_user', JSON.stringify(action.payload.data.user));
        reauthSocket();
        toast.success('Account created! Welcome to EV Management');
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload);
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.data.user;
        state.token = action.payload.data.token;
        localStorage.setItem('ev_token', action.payload.data.token);
        localStorage.setItem('ev_user', JSON.stringify(action.payload.data.user));
        reauthSocket();
        toast.success(`Welcome back, ${action.payload.data.user.name}!`);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload);
      })
      // Fetch me
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload.data;
        state.initialized = true;
        localStorage.setItem('ev_user', JSON.stringify(action.payload.data));
      })
      .addCase(fetchMe.rejected, (state) => {
        state.initialized = true;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        localStorage.removeItem('ev_token');
        localStorage.removeItem('ev_user');
        reauthSocket();
        toast.info('Logged out');
      });
  },
});

export const { clearError, setUserVerified, updateUser } = authSlice.actions;
export default authSlice.reducer;
