import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'react-toastify';
import { updateUser } from '../store/slices/authSlice';
import { compressImageToUnder, dataUrlByteLength } from '../utils/imageCompress';
import { logger } from '../utils/logger';
import SEO from '../components/SEO';

// MongoDB's free (M0) tier has a small total storage cap, so we keep every
// avatar comfortably under 50KB.
const MAX_AVATAR_BYTES = 50 * 1024;

export default function Profile() {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef(null);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/users/profile', form);
      // Bug fix: push the saved values into Redux (and localStorage via the
      // reducer) immediately, so the navbar/greeting update without a
      // manual refresh or re-login.
      dispatch(updateUser(res.data.data));
      toast.success('Profile updated!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update');
    }
    setSaving(false);
  };

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setAvatarBusy(true);
    try {
      const compressed = await compressImageToUnder(file, MAX_AVATAR_BYTES);
      const res = await api.put('/users/profile', { avatar: compressed });
      dispatch(updateUser(res.data.data));
      toast.success(`Avatar updated (${Math.round(dataUrlByteLength(compressed) / 1024)}KB)`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update avatar');
    }
    setAvatarBusy(false);
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    try {
      const res = await api.put('/users/profile', { avatar: null });
      dispatch(updateUser(res.data.data));
      toast.success('Avatar removed');
    } catch (err) {
      logger.error(err);
      toast.error('Failed to remove avatar');
    }
    setAvatarBusy(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      await api.put('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password updated!');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 680, padding: '44px 32px' }}>
      <SEO
        title="Profile Settings"
        description="Update your profile, change your password, and manage your ChargeEV account preferences."
        noIndex
      />
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title">
          My <span>Profile</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Manage your account settings
        </p>
      </div>

      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 32,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            onClick={handleAvatarPick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAvatarPick();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Change profile picture"
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              background: user?.avatar
                ? `center/cover no-repeat url(${user.avatar})`
                : 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: '2rem',
              color: 'var(--on-dark)',
              cursor: 'pointer',
              border: '3px solid var(--bg-card)',
              boxShadow: 'var(--shadow-sm)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {!user?.avatar && (user?.name?.[0]?.toUpperCase() || '?')}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: avatarBusy ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              {avatarBusy ? (
                <Loader2 size={22} color="var(--on-dark)" className="spin" />
              ) : (
                <Camera size={20} color="var(--on-dark)" />
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAvatarPick}
            aria-label="Upload new photo"
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--primary)',
              border: '2px solid var(--bg-card)',
              color: 'var(--on-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Camera size={13} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
        </div>
        <div>
          <h2
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '1.9rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {user?.name}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{user?.email}</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <span className="badge-gold" style={{ fontSize: '0.72rem' }}>
              {user?.role?.replace('_', ' ')}
            </span>
            {user?.avatar && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={avatarBusy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Trash2 size={12} /> Remove photo
              </button>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 6 }}>
            Photos are auto-compressed to stay under 50KB.
          </p>
        </div>
      </motion.div>

      <div className="row g-4">
        {/* Edit profile */}
        <div className="col-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="ev-card"
            style={{ padding: 28 }}
          >
            <h3
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '1.4rem',
                letterSpacing: '0.02em',
                marginBottom: 20,
              }}
            >
              Personal Information
            </h3>
            <form onSubmit={handleSaveProfile}>
              <div className="mb-3">
                <label className="form-label" htmlFor="profile-name">
                  Full Name
                </label>
                <input
                  id="profile-name"
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="profile-email">
                  Email (read-only)
                </label>
                <input
                  id="profile-email"
                  className="form-control"
                  value={user?.email}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>
              <div className="mb-4">
                <label className="form-label" htmlFor="profile-phone">
                  Phone
                </label>
                <input
                  id="profile-phone"
                  className="form-control"
                  placeholder="+1 555 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <button
                type="submit"
                className="btn-gold"
                style={{ padding: '10px 28px' }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </motion.div>
        </div>

        {/* Change password */}
        <div className="col-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="ev-card"
            style={{ padding: 28 }}
          >
            <h3
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '1.4rem',
                letterSpacing: '0.02em',
                marginBottom: 20,
              }}
            >
              Change Password
            </h3>
            <form onSubmit={handleChangePassword}>
              <div className="mb-3">
                <label className="form-label" htmlFor="profile-currentPw">
                  Current Password
                </label>
                <input
                  id="profile-currentPw"
                  type="password"
                  className="form-control"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="profile-newPw">
                  New Password
                </label>
                <input
                  id="profile-newPw"
                  type="password"
                  className="form-control"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="mb-4">
                <label className="form-label" htmlFor="profile-confirmPw">
                  Confirm New Password
                </label>
                <input
                  id="profile-confirmPw"
                  type="password"
                  className="form-control"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px 28px' }}>
                Update Password
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
