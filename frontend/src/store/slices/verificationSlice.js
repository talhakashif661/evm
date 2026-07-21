import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';
import { toast } from 'react-toastify';

export const sendOTP = createAsyncThunk('verification/sendOTP', async (_, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/send-otp');
    return res.data;
  } catch (err) {
    return rejectWithValue({
      message: err.response?.data?.message || 'Failed to send verification email',
      secondsLeft: err.response?.data?.secondsLeft
    });
  }
});

export const verifyOTP = createAsyncThunk('verification/verifyOTP', async (otp, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/verify-otp', { otp });
    return res.data;
  } catch (err) {
    return rejectWithValue({ message: err.response?.data?.message || 'Invalid verification code' });
  }
});

export const resendOTP = createAsyncThunk('verification/resendOTP', async (_, { rejectWithValue }) => {
  try {
    const res = await api.post('/auth/resend-otp');
    return res.data;
  } catch (err) {
    return rejectWithValue({
      message: err.response?.data?.message || 'Failed to resend code',
      secondsLeft: err.response?.data?.secondsLeft
    });
  }
});

export const getVerificationStatus = createAsyncThunk('verification/getStatus', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/auth/verification-status');
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const verificationSlice = createSlice({
  name: 'verification',
  initialState: {
    isVerified: false,
    loading: false,
    error: null,
    otpSent: false,
    resendCooldown: 0
  },
  reducers: {
    startCooldown: (state, action) => {
      state.resendCooldown = action.payload || 60;
    },
    tickCooldown: (state) => {
      if (state.resendCooldown > 0) state.resendCooldown -= 1;
    },
    resetState: (state) => {
      state.error = null;
      state.otpSent = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendOTP.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(sendOTP.fulfilled, (state) => {
        state.loading = false;
        state.otpSent = true;
        state.resendCooldown = 60;
        toast.success('Verification code sent to your email');
      })
      .addCase(sendOTP.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
        // A cooldown rejection means a code IS already out there — sync the
        // countdown to the server's real remaining time instead of leaving
        // the resend button clickable again immediately.
        if (action.payload.secondsLeft) state.resendCooldown = action.payload.secondsLeft;
        toast.error(action.payload.message);
      })
      .addCase(verifyOTP.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(verifyOTP.fulfilled, (state) => {
        state.loading = false;
        state.isVerified = true;
        toast.success('Email verified successfully!');
      })
      .addCase(verifyOTP.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
        toast.error(action.payload.message);
      })
      .addCase(resendOTP.pending, (state) => { state.loading = true; })
      .addCase(resendOTP.fulfilled, (state) => {
        state.loading = false;
        state.resendCooldown = 60;
        toast.success('Verification code resent');
      })
      .addCase(resendOTP.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
        if (action.payload.secondsLeft) state.resendCooldown = action.payload.secondsLeft;
        toast.error(action.payload.message);
      })
      .addCase(getVerificationStatus.fulfilled, (state, action) => {
        state.isVerified = action.payload.data.isVerified;
      });
  }
});

export const { startCooldown, tickCooldown, resetState } = verificationSlice.actions;
export default verificationSlice.reducer;
