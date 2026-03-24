import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Bell,
  Car,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserCircle2,
  Users,
  Wrench,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ContactList from './pages/ContactList';
import ContactForm from './pages/ContactForm';
import Drivers from './pages/Drivers';
import Reports from './pages/Reports';
import {
  changeOwnPassword,
  createSystemBackup,
  createSystemUser,
  getLiveSystemUsers,
  getOfflineSyncState,
  getOwnProfile,
  getStats,
  getSystemBackups,
  getSystemSettings,
  getSystemStatus,
  getSystemUsers,
  getSystemVersion,
  loginToSystem,
  logoutSystemSession,
  resetSystemUserPassword,
  restoreSystemBackup,
  runSystemMaintenance,
  sendSystemHeartbeat,
  subscribeToSyncState,
  syncOfflineChanges,
  updateOwnProfile,
  updateSystemSettings,
  updateSystemUser,
} from './utils/api';

const AUTH_KEY = 'zaya-auth-session';
const REMEMBER_ME_KEY = 'zaya-remember-me';
const LAST_LOGIN_ID_KEY = 'zaya-last-login-id'; 
const THEME_KEY = 'zaya-theme'; 
const ORIENTATION_KEY = 'zaya-ai-orientation-complete'; 
const ROOT_SYSTEM_EMAIL = 'it@zayagroupltd.com'; 
const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const ROTATING_LOGIN_IMAGES = [
  '/login-visual.jpg?v=20260309-2',
];
const DEFAULT_CORPORATE_FACTS = [
  'Sales velocity improves when handoffs between sourcing, calling, and compliance are explicit.',
  'Most stalled deals are process problems before they become people problems.',
  'Teams that measure next-action quality usually outperform teams that only measure volume.',
];
const POWERED_BADGE_TEXT = 'Powered and protected by WAS for Zaya Calling System'; 
const DEFAULT_USER = { name: 'Zaya Operations', email: '', role: 'Super Admin' }; 
const FALLBACK_SETTINGS = { 
  systemName: 'Zaya Calling System',
  systemTagline: 'Enterprise operations workspace',
  welcomeMessage: 'Welcome back',
  systemSummary: 'Corporate dark and light aligned to the logo palette',
  logoUrl: '/zaya-logo.png?v=20260309-2',
  loginImage: ROTATING_LOGIN_IMAGES.join('\n'),
  appBackgroundImage: '',
  loginHeadline: "Enter with today's business-development focus.",
  loginCopy: 'Use the workspace to convert follow-up clarity into pipeline movement and stronger execution.',
  quote: 'Growth becomes predictable when every interaction leaves the client with less uncertainty than before.',
  quoteAuthor: 'Enterprise Strategy Note',
  facts: DEFAULT_CORPORATE_FACTS,
};

function normalizeSettings(settings) {
  return {
    ...FALLBACK_SETTINGS,
    ...(settings || {}),
    facts: Array.isArray(settings?.facts) && settings.facts.length ? settings.facts : FALLBACK_SETTINGS.facts,
  };
}

function parseRotatingImages(value) {
  const items = String(value || '')
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);

  return Array.from(new Set(items));
}

function getUtcDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / UTC_DAY_MS);
}

function getRotatingLoginExperience(settings) {
  const imagePool = parseRotatingImages(settings.loginImage);
  const facts = Array.isArray(settings.facts) && settings.facts.length ? settings.facts : DEFAULT_CORPORATE_FACTS;
  const dayNumber = getUtcDayNumber();
  const imageIndex = imagePool.length ? dayNumber % imagePool.length : 0;
  const visibleFacts = facts.length ? facts.slice(0, 3) : DEFAULT_CORPORATE_FACTS;

  return {
    imageUrl: imagePool[imageIndex] || ROTATING_LOGIN_IMAGES[dayNumber % ROTATING_LOGIN_IMAGES.length],
    visibleFacts,
  };
}

function userInitials(name = '') {
  return String(name || '').split(' ').map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function LoadingScreen({ label, settings }) {
  return (
    <div className="startup-screen">
      <div className="startup-card">
        <div className="startup-kicker">{settings.systemName}</div>
        <div className="startup-title">Syncing your workspace</div>
        <div className="startup-copy">{label}</div>
        <div className="startup-bar"><span /></div>
      </div>
    </div>
  );
}

function UpdateBanner({ updateInfo, onRefresh, syncInfo, onSyncNow }) {
  const hasUpdate = Boolean(updateInfo?.available);
  const hasSyncNotice = Boolean(syncInfo && (!syncInfo.online || syncInfo.pending > 0 || syncInfo.syncing));
  if (!hasUpdate && !hasSyncNotice) return null;
  return (
    <>
      {hasSyncNotice ? (
        <div className="update-banner" role="status">
          <div>
            <strong>
              {!syncInfo.online ? 'Offline mode active.' : syncInfo.syncing ? 'Syncing offline changes.' : `${syncInfo.pending} offline change${syncInfo.pending === 1 ? '' : 's'} waiting.`}
            </strong>
            <span>
              {!syncInfo.online
                ? 'Cached data stays available and new changes will queue until the connection returns.'
                : syncInfo.syncing
                  ? 'Your queued updates are being sent to the server now.'
                  : 'Reconnect and sync to push queued updates to the shared system.'}
            </span>
          </div>
          {syncInfo.online ? (
            <button className="btn btn-primary btn-sm" onClick={onSyncNow} disabled={syncInfo.syncing || syncInfo.pending === 0}>
              <RefreshCw size={14} />
              {syncInfo.syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          ) : null}
        </div>
      ) : null}
      {hasUpdate ? (
        <div className="update-banner" role="status">
          <div>
            <strong>System update available.</strong>
            <span>A newer release is ready{updateInfo.version ? ` (${updateInfo.version})` : ''}. Refresh to load the latest changes.</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onRefresh}>
            <RefreshCw size={14} />
            Refresh Now
          </button>
        </div>
      ) : null}
    </>
  );
}

function LoginPage({ onLogin, settings, updateInfo, onRefresh, initialRememberMe, syncInfo, onSyncNow }) { 
  const branding = normalizeSettings(settings);
  const rotatingExperience = getRotatingLoginExperience(branding);
  const [email, setEmail] = useState(() => { 
    if (!initialRememberMe) return ''; 
    const stored = localStorage.getItem(LAST_LOGIN_ID_KEY) || ''; 
    if (stored.trim().toLowerCase() === ROOT_SYSTEM_EMAIL) return ''; 
    return stored; 
  }); 
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(initialRememberMe);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await loginToSystem({ email: email.trim().toLowerCase(), password }); 
      if (rememberMe) { 
        const trimmed = email.trim(); 
        if (trimmed.toLowerCase() !== ROOT_SYSTEM_EMAIL) localStorage.setItem(LAST_LOGIN_ID_KEY, trimmed); 
        else localStorage.removeItem(LAST_LOGIN_ID_KEY); 
      } else { 
        localStorage.removeItem(LAST_LOGIN_ID_KEY); 
      } 
      onLogin(response.data.data, rememberMe); 
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed. Check the configured credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell auth-shell-enterprise">
      <div className="auth-frame">
        <section
          className="login-visual-panel"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(9, 23, 42, 0.18), rgba(9, 23, 42, 0.58)), url(${rotatingExperience.imageUrl})`,
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center, center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="login-visual-overlay">
            <div className="login-visual-top">
              <div className="login-brand-lockup">
                <div className="login-brand-mark">
                  <img src={branding.logoUrl || FALLBACK_SETTINGS.logoUrl} alt={`${branding.systemName} logo`} className="login-brand-image" />
                </div>
                <div>
                  <div className="login-brand-title">{branding.systemName}</div>
                  <div className="login-brand-subtitle">{branding.systemTagline}</div>
                </div>
              </div>
              <div className="login-powered-badge">{POWERED_BADGE_TEXT}</div>
              <div className="login-visual-copy">
                <div className="hero-card-kicker">Daily Business Development Brief</div>
                <h2>{branding.loginHeadline}</h2>
                <p>{branding.loginCopy}</p>
              </div>
            </div>
            <div className="login-quote-card">
              <ShieldCheck size={18} />
              <div>
                <div className="login-quote-text">{branding.quote}</div>
                <div className="login-quote-author">{branding.quoteAuthor || branding.quote || 'WAS Corporate Systems'}</div>
              </div>
            </div>
            <div className="login-fact-list">
              {rotatingExperience.visibleFacts.map(fact => (
                <div key={fact} className="login-fact-item">
                  <span className="fact-dot" />
                  <span>{fact}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="auth-panel auth-panel-enterprise">
          <UpdateBanner updateInfo={updateInfo} onRefresh={onRefresh} syncInfo={syncInfo} onSyncNow={onSyncNow} />
          <div className="auth-kicker">Secure Login</div>
          <div className="auth-heading-block">
            <h2>Access the control center.</h2>
            <p>Sign in to manage candidates, users, reports, recovery, and daily operational execution.</p>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="form-group">
              <span className="form-label">Email or username</span>
              <input
                className="form-input"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Enter email or username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
            <label className="form-group">
              <span className="form-label">Password</span>
              <input className="form-input" type="password" value={password} onChange={event => setPassword(event.target.value)} />
            </label>
            <label className="remember-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={event => {
                  const nextValue = event.target.checked;
                  setRememberMe(nextValue);
                  if (!nextValue) localStorage.removeItem(LAST_LOGIN_ID_KEY);
                }}
              />
              <span>Remember me</span>
            </label>
            {error ? <div className="alert alert-error">{error}</div> : null}
            <button className="btn btn-primary auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Signing In...' : 'Enter Workspace'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function OrientationPage({ user, onFinish, settings }) {
  const cards = [
    ['Search the right records fast', 'Use global search to jump into contacts or job-role filtered candidate lists.'],
    ['Keep user administration contained', 'Super admins control administrator creation while admins stay focused on user operations.'],
    ['Recover without leaving the system', 'Backups, recovery, and maintenance actions now live inside the admin console.'],
  ];

  return (
    <div className="orientation-shell">
      <div className="orientation-card">
        <div className="orientation-kicker">{settings.systemName}</div>
        <h2>{settings.welcomeMessage}, {user.name.split(' ')[0]}.</h2>
        <p>{settings.systemTagline}</p>
        <div className="orientation-grid">
          {cards.map(([title, copy]) => (
            <div key={title} className="orientation-step">
              <div className="orientation-icon"><BadgeCheck size={16} /></div>
              <strong>{title}</strong>
              <span>{copy}</span>
            </div>
          ))}
        </div>
        <div className="orientation-actions">
          <button className="btn btn-primary" onClick={onFinish}>Continue to Dashboard</button>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user, onUpdateUser }) {
  const [profile, setProfile] = useState(user);
  const [passwords, setPasswords] = useState({ currentPassword: '', nextPassword: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { setProfile(user); }, [user]);

  useEffect(() => {
    getOwnProfile().then(response => {
      const nextUser = { ...user, ...(response.data.data || {}) };
      setProfile(nextUser);
      onUpdateUser(nextUser);
    }).catch(() => {});
  }, []);

  async function saveProfile() {
    setBusy(true);
    try {
      const response = await updateOwnProfile({ name: profile.name, avatarUrl: profile.avatarUrl });
      const nextUser = { ...user, ...(response.data.data || {}) };
      setProfile(nextUser);
      onUpdateUser(nextUser);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update profile');
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (!passwords.currentPassword || !passwords.nextPassword) {
      toast.error('Enter your current and new password.');
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(passwords);
      setPasswords({ currentPassword: '', nextPassword: '' });
      toast.success('Password updated');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update password');
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Select an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    try {
      const avatarUrl = await fileToDataUrl(file);
      setProfile(current => ({ ...current, avatarUrl }));
      toast.success('Profile picture ready to save.');
    } catch (_) {
      toast.error('Failed to load profile image.');
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Profile</div>
          <div className="pg-subtitle">Update your name, password, and profile picture.</div>
        </div>
      </div>
      <div className="content">
        <div className="admin-grid">
          <div className="card">
            <div className="card-title">Profile Details</div>
            <div className="profile-hero">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.name} className="profile-avatar profile-avatar-lg" /> : <div className="avatar profile-avatar-lg">{userInitials(profile.name)}</div>}
              <div>
                <div className="profile-greeting">Hello, {profile.name.split(' ')[0]}.</div>
                <div className="profile-role">{profile.role}</div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={profile.name || ''} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={profile.email || ''} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Profile Picture Upload</label>
              <label className="btn btn-secondary" style={{ width: 'fit-content' }}>
                Upload Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileImageUpload} />
              </label>
              <div className="form-hint">Upload a picture or paste an image URL below.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Profile Picture URL</label>
              <input className="form-input" value={profile.avatarUrl || ''} onChange={event => setProfile(current => ({ ...current, avatarUrl: event.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>Save Profile</button>
          </div>

          <div className="card">
            <div className="card-title">Change Password</div>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" value={passwords.currentPassword} onChange={event => setPasswords(current => ({ ...current, currentPassword: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" value={passwords.nextPassword} onChange={event => setPasswords(current => ({ ...current, nextPassword: event.target.value }))} />
            </div>
            <button className="btn btn-secondary" onClick={savePassword} disabled={busy}>Update Password</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminConsole({ user, settings, onSaveSettings }) {
  const canManageAdmins = user.role === 'Super Admin';
  const [tab, setTab] = useState('users');
  const [draft, setDraft] = useState(normalizeSettings(settings));
  const [systemUsers, setSystemUsers] = useState([]);
  const [liveUsers, setLiveUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'User', password: '' });

  useEffect(() => { setDraft(normalizeSettings(settings)); }, [settings]);

  async function loadAdminData() {
    try {
      const requests = [getSystemUsers(), getSystemBackups(), getSystemStatus()];
      if (canManageAdmins) requests.push(getLiveSystemUsers());
      const responses = await Promise.all(requests);
      setSystemUsers(responses[0].data.data || []);
      setBackups(responses[1].data.data || []);
      setSystemStatus(responses[2].data.data || null);
      setLiveUsers(canManageAdmins ? (responses[3]?.data.data || []) : []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load admin data');
    }
  }

  useEffect(() => { loadAdminData(); }, []);

  useEffect(() => {
    if (!canManageAdmins || tab !== 'live') return undefined;
    const interval = window.setInterval(() => {
      getLiveSystemUsers().then(response => setLiveUsers(response.data.data || [])).catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, [canManageAdmins, tab]);

  function updateDraft(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  const roleSummary = ['Super Admin', 'Admin', 'User'].map(role => ({
    role,
    members: systemUsers.filter(member => member.role === role),
  }));

  async function createUser() {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      toast.error('Name, email, and password are required.');
      return;
    }
    setBusy(true);
    try {
      await createSystemUser({ ...newUser, role: roleOptions.includes(newUser.role) ? newUser.role : 'User' });
      setNewUser({ name: '', email: '', role: 'User', password: '' });
      await loadAdminData();
      toast.success('User created');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to create user');
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(target) {
    setBusy(true);
    try {
      await updateSystemUser(target.id, { name: target.name, role: roleOptions.includes(target.role) ? target.role : 'User', isActive: !target.isActive });
      await loadAdminData();
      toast.success(target.isActive ? 'User disabled' : 'User enabled');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update user');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(target, role) {
    setBusy(true);
    try {
      await updateSystemUser(target.id, { name: target.name, role, isActive: target.isActive });
      await loadAdminData();
      toast.success('Role updated');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(target) {
    const nextPassword = String(passwordDrafts[target.id] || '').trim();
    if (!nextPassword) {
      toast.error('Enter a new password first.');
      return;
    }
    setBusy(true);
    try {
      await resetSystemUserPassword(target.id, nextPassword);
      setPasswordDrafts(current => ({ ...current, [target.id]: '' }));
      toast.success('Password reset');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const response = await updateSystemSettings({
        ...draft,
        facts: Array.isArray(draft.facts) ? draft.facts.map(item => String(item).trim()).filter(Boolean) : String(draft.facts || '').split('\n').map(item => item.trim()).filter(Boolean),
      });
      onSaveSettings(response.data.data);
      toast.success('System settings updated');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  }

  async function createBackupNow() {
    setBusy(true);
    try {
      await createSystemBackup({ type: 'manual', label: user.name });
      await loadAdminData();
      toast.success('Backup created');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to create backup');
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackupNow(backupName) {
    if (!window.confirm(`Restore backup ${backupName}? A safety backup will be created first.`)) return;
    setBusy(true);
    try {
      await restoreSystemBackup(backupName);
      await loadAdminData();
      toast.success('Backup restored. Reloading workspace.');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to restore backup');
    } finally {
      setBusy(false);
    }
  }

  async function runMaintenance(action) {
    setBusy(true);
    try {
      const response = await runSystemMaintenance(action);
      toast.success(response.data.data?.message || 'Maintenance completed');
      await loadAdminData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Maintenance failed');
    } finally {
      setBusy(false);
    }
  }

  const roleOptions = user.role === 'Super Admin'
    ? ['User', 'Admin', 'Super Admin']
    : user.role === 'Admin'
      ? ['User', 'Admin']
      : ['User'];
  const tabs = [
    { key: 'users', label: canManageAdmins ? 'Users & Admins' : 'Users' },
    canManageAdmins ? { key: 'live', label: 'Live Sessions' } : null,
    canManageAdmins ? { key: 'appearance', label: 'Branding & Theme' } : null,
    canManageAdmins ? { key: 'settings', label: 'System Settings' } : null,
    { key: 'recovery', label: 'Backup & Recovery' },
    canManageAdmins ? { key: 'maintenance', label: 'Maintenance' } : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">{canManageAdmins ? 'Super Admin Console' : 'Admin Console'}</div>
          <div className="pg-subtitle">{canManageAdmins ? 'Manage users, live sessions, system settings, recovery, and appearance.' : 'Manage users, recovery, and approved system settings.'}</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary" onClick={loadAdminData}>Refresh Admin Data</button>
        </div>
      </div>

      <div className="content">
        <div className="tabs">
          {tabs.map(item => <button key={item.key} className={`tab-btn${tab === item.key ? ' on' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>)}
        </div>

        {tab === 'users' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">{roleOptions.includes('Admin') ? 'Create User or Admin' : 'Create User'}</div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={newUser.name} onChange={event => setNewUser(current => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label> 
                  <input className="form-input" type="email" value={newUser.email} onChange={event => setNewUser(current => ({ ...current, email: event.target.value }))} /> 
                  <div className="form-hint">The primary super admin email is reserved and cannot be assigned to another user.</div> 
                </div> 
              </div> 
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={newUser.role} onChange={event => setNewUser(current => ({ ...current, role: event.target.value }))}>
                    {roleOptions.map(role => <option key={role}>{role}</option>)}
                  </select>
                  {user.role === 'Super Admin'
                    ? <div className="form-hint">Only the super admin can add another super admin.</div>
                    : user.role === 'Admin'
                      ? <div className="form-hint">Admins can create admin and user accounts. Only the super admin can create super admin accounts.</div>
                      : <div className="form-hint">Only admins can create accounts.</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={newUser.password} onChange={event => setNewUser(current => ({ ...current, password: event.target.value }))} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={createUser} disabled={busy}>Create Account</button>
            </div>

            <div className="card">
              <div className="card-title">Users Side Panel</div>
              <div className="role-summary-list">
                {roleSummary.map(group => (
                  <div key={group.role} className="role-summary-block">
                    <div className="role-summary-head">
                      <span>{group.role}</span>
                      <strong>{group.members.length}</strong>
                    </div>
                    {group.members.length ? (
                      <div className="role-summary-members">
                        {group.members.map(member => (
                          <div key={member.id} className="role-summary-member">
                            {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="profile-avatar profile-avatar-sm" /> : <div className="avatar profile-avatar-sm">{userInitials(member.name)}</div>}
                            <span>{member.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="form-hint">No {group.role.toLowerCase()} accounts yet.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">All Users</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th>Password Reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsers.map(member => {
                      const protectedRoot = member.email === ROOT_SYSTEM_EMAIL;
                      const locked = protectedRoot || (!canManageAdmins && member.role !== 'User');
                      return (
                        <tr key={member.id}>
                          <td>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="profile-avatar" /> : <div className="avatar">{userInitials(member.name)}</div>}
                              <div>
                                <div style={{ fontWeight: 700 }}>{member.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <select className="filter-sel" value={member.role} onChange={event => changeRole(member, event.target.value)} disabled={locked}>
                              {(canManageAdmins ? ['User', 'Admin', 'Super Admin'] : ['User']).map(role => <option key={role}>{role}</option>)}
                            </select>
                            {protectedRoot ? <div className="form-hint">Primary super admin account is protected.</div> : null}
                          </td>
                          <td><button className={`btn btn-xs ${member.isActive ? 'btn-success' : 'btn-danger'}`} onClick={() => toggleUser(member)} disabled={locked}>{member.isActive ? 'Active' : 'Disabled'}</button></td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.lastLoginAt || 'Never'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input className="form-input" type="password" placeholder="New password" value={passwordDrafts[member.id] || ''} onChange={event => setPasswordDrafts(current => ({ ...current, [member.id]: event.target.value }))} style={{ minWidth: 160 }} disabled={locked} />
                              <button className="btn btn-secondary btn-sm" onClick={() => resetPassword(member)} disabled={locked}>Reset</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'live' && canManageAdmins ? (
          <div className="card">
            <div className="card-title">Live Users, IP Addresses, and Geo Locations</div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>IP Address</th>
                    <th>Geo Location</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {liveUsers.length ? liveUsers.map(member => (
                    <tr key={member.sessionId}>
                      <td>{member.name}</td>
                      <td><span className="badge b-gold">{member.role}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.ipAddress || 'Unavailable'}</td>
                      <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.location || 'Unavailable'}</td>
                      <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.lastSeenAt}</td>
                    </tr>
                  )) : <tr><td colSpan="5" style={{ color: 'var(--txt2)' }}>No live sessions detected.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === 'appearance' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">Branding and Backgrounds</div>
              <div className="form-group">
                <label className="form-label">System Name</label>
                <input className="form-input" value={draft.systemName} onChange={event => updateDraft('systemName', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">System Tagline</label>
                <input className="form-input" value={draft.systemTagline} onChange={event => updateDraft('systemTagline', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Logo URL</label>
                <input className="form-input" value={draft.logoUrl} onChange={event => updateDraft('logoUrl', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Login Background Images</label>
                <input className="form-input" value={draft.loginImage} onChange={event => updateDraft('loginImage', event.target.value)} />
                <div className="form-hint">Use one URL or multiple image URLs separated by commas or new lines. The login visual rotates globally every 24 hours using UTC.</div>
              </div>
              <div className="form-group">
                <label className="form-label">System Background Image</label>
                <input className="form-input" value={draft.appBackgroundImage} onChange={event => updateDraft('appBackgroundImage', event.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={busy}>Save Appearance</button>
            </div>

            <div className="card">
              <div className="card-title">Preview</div>
              <div
                className="admin-preview admin-preview-image"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(4,13,35,0.56), rgba(4,13,35,0.78)), url(${getRotatingLoginExperience(draft).imageUrl})`,
                }}
              >
                <div className="login-brand-lockup">
                  <div className="login-brand-mark">
                    <img src={draft.logoUrl || FALLBACK_SETTINGS.logoUrl} alt={draft.systemName} className="login-brand-image" />
                  </div>
                  <div>
                    <div className="login-brand-title">{draft.systemName}</div>
                    <div className="login-brand-subtitle">{draft.systemTagline}</div>
                  </div>
                </div>
                <div className="admin-preview-copy">
                  <strong>{draft.loginHeadline || FALLBACK_SETTINGS.loginHeadline}</strong>
                  <p>{draft.loginCopy || FALLBACK_SETTINGS.loginCopy}</p>
                  <div className="form-hint" style={{ marginTop: 10 }}>{POWERED_BADGE_TEXT}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'settings' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">System Messaging</div>
              <div className="form-group">
                <label className="form-label">Welcome Message</label>
                <input className="form-input" value={draft.welcomeMessage} onChange={event => updateDraft('welcomeMessage', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Login Headline</label>
                <input className="form-input" value={draft.loginHeadline} onChange={event => updateDraft('loginHeadline', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Login Copy</label>
                <textarea className="form-input" value={draft.loginCopy} onChange={event => updateDraft('loginCopy', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Quote</label>
                <textarea className="form-input" value={draft.quote} onChange={event => updateDraft('quote', event.target.value)} />
                <div className="form-hint">This now supports the rotating spotlight caption beneath the daily login image.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Quote Author</label>
                <input className="form-input" value={draft.quoteAuthor} onChange={event => updateDraft('quoteAuthor', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Corporate Facts</label>
                <textarea className="form-input" value={Array.isArray(draft.facts) ? draft.facts.join('\n') : ''} onChange={event => updateDraft('facts', event.target.value.split('\n'))} />
                <div className="form-hint">These facts rotate globally every 24 hours and prioritize development, growth, and productivity themes.</div>
              </div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={busy}>Save System Settings</button>
            </div>

            <div className="card">
              <div className="card-title">System Summary</div>
              <div className="settings-stack">
                <div className="settings-row"><span>Name</span><strong>{draft.systemName}</strong></div>
                <div className="settings-row"><span>Tagline</span><strong>{draft.systemTagline}</strong></div>
                <div className="settings-row"><span>Welcome</span><strong>{draft.welcomeMessage}</strong></div>
                <div className="settings-row">
                  <span>Summary</span>
                  <textarea className="form-input" value={draft.systemSummary || ''} onChange={event => updateDraft('systemSummary', event.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={saveSettings} disabled={busy}>Save System Summary</button>
            </div>
          </div>
        ) : null}

        {tab === 'recovery' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">Automatic Backup and Recovery</div>
              <div className="form-group">
                <label className="form-label">Backup Interval</label>
                <div className="form-hint">A recovery snapshot is created automatically every {systemStatus?.backupIntervalHours || 6} hours while the local server is running.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Database Path</label>
                <div className="form-hint">{systemStatus?.dbPath || 'Loading...'}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Backups Folder</label>
                <div className="form-hint">{systemStatus?.backupsDir || 'Loading...'}</div>
              </div>
              <button className="btn btn-primary" onClick={createBackupNow} disabled={busy}>Create Backup Now</button>
            </div>

            <div className="card">
              <div className="card-title">Restore a Backup</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Backup</th>
                      <th>Type</th>
                      <th>Created</th>
                      <th>Size</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map(backup => (
                      <tr key={backup.name}>
                        <td>{backup.name}</td>
                        <td><span className="badge b-blue">{backup.type}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{backup.createdAt}</td>
                        <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{(backup.size / 1024 / 1024).toFixed(2)} MB</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => restoreBackupNow(backup.name)}>Restore</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'maintenance' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">System Maintenance</div>
              <div className="maintenance-actions">
                <button className="btn btn-secondary" onClick={() => runMaintenance('checkpoint')} disabled={busy}>Run Checkpoint</button>
                <button className="btn btn-secondary" onClick={() => runMaintenance('vacuum')} disabled={busy}>Optimize Database</button>
                <button className="btn btn-secondary" onClick={() => runMaintenance('clear-offline-sessions')} disabled={busy}>Clear Offline Sessions</button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (!window.confirm('This will permanently delete all contacts, call history, driver details, and activity logs from this machine. Continue?')) return;
                    runMaintenance('purge-demo-data');
                  }}
                  disabled={busy}
                >
                  Purge Demo Data
                </button>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Maintenance Notes</div>
              <div className="form-hint">Use checkpoints before backups, vacuum when the local database needs cleanup, clear offline sessions if live-user tracking looks stale, and purge demo data once before entering official records.</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({ alerts, roleGroups, settings, theme, onToggleTheme, user, onLogout }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [rolesOpen, setRolesOpen] = useState(false);
  const canAccessAdminConsole = user.role === 'Super Admin' || user.role === 'Admin';
  const items = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Contacts', path: '/contacts' },
    { icon: Car, label: 'Drivers', path: '/drivers', badge: alerts.expiring > 0 ? alerts.expiring : null },
    { icon: FileText, label: 'Reports', path: '/reports' },
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-row">
          <img src={settings.logoUrl || FALLBACK_SETTINGS.logoUrl} alt={settings.systemName} className="sb-brand-logo" />
          <div>
            <div className="sb-logo">{settings.systemName}</div>
            <div className="sb-tagline">{settings.systemTagline}</div>
          </div>
        </div>
      </div>

      <div className="sb-usercard">
        {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="profile-avatar" /> : <div className="avatar">{userInitials(user.name)}</div>}
        <div>
          <div className="sb-username">{user.name}</div>
          <div className="sb-userrole">{user.role}</div>
        </div>
      </div>

      <nav className="sb-nav">
        <div className="sb-section">Workspace</div>
        {items.map(item => {
          const Icon = item.icon;
          const active = item.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.path);
          return (
            <button key={item.path} className={`nav-item${active ? ' active' : ''}`} onClick={() => nav(item.path)}>
              <Icon size={16} />
              {item.label}
              {item.badge != null ? <span className="nav-badge">{item.badge}</span> : null}
              {active ? <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} /> : null}
            </button>
          );
        })}

        <button className={`nav-item nav-item-toggle${rolesOpen ? ' active-lite' : ''}`} onClick={() => setRolesOpen(current => !current)}>
          <Wrench size={16} />
          Job Roles
          {rolesOpen ? <ChevronDown size={14} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
        </button>
        {rolesOpen ? (
          <div className="nav-submenu">
            {roleGroups.map(role => (
              <button key={role.Caller_Type} className="nav-subitem" onClick={() => nav(`/contacts?caller_type=${encodeURIComponent(role.Caller_Type)}`)}>
                <span>{role.Caller_Type}</span>
                <span className="nav-badge">{role.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {alerts.overdue > 0 ? (
          <>
            <div className="sb-section" style={{ marginTop: 8 }}>Attention</div>
            <button className="nav-item" onClick={() => nav('/contacts?overdue=true')}>
              <Bell size={16} color="var(--orange)" />
              <span style={{ color: 'var(--orange)', fontSize: 12.5 }}>Overdue Follow-ups</span>
              <span className="nav-badge warn">{alerts.overdue}</span>
            </button>
          </>
        ) : null}

        <div className="sb-section" style={{ marginTop: 8 }}>Access Level</div>
        <div className="sidebar-role-note">
          <strong>{user.role}</strong>
          <span>{user.role === 'Super Admin' ? 'Full system authority' : user.role === 'Admin' ? 'User and workflow control' : 'Operational workspace access'}</span>
        </div>

        {canAccessAdminConsole ? (
          <button className={`nav-item${loc.pathname.startsWith('/admin') ? ' active' : ''}`} onClick={() => nav('/admin')}>
            <Settings2 size={16} />
            Admin Console
            {loc.pathname.startsWith('/admin') ? <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} /> : null}
          </button>
        ) : null}
      </nav>

      <div className="sb-controls">
        <button className="btn btn-secondary sidebar-utility" onClick={() => nav('/profile')}><UserCircle2 size={14} />Profile</button>
        <button className="btn btn-secondary sidebar-utility" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</button>
        <button className="btn btn-ghost sidebar-utility" onClick={onLogout}><LogOut size={14} />Logout</button>
      </div>

      <div className="sb-footer">{settings.systemName} Copyright {new Date().getFullYear()}</div>
    </aside>
  );
}

function Shell({ user, settings, theme, onToggleTheme, onLogout, onSaveSettings, onUpdateUser, updateInfo, onRefresh, syncInfo, onSyncNow }) {
  const nav = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState({ overdue: 0, expiring: 0 });
  const [roleGroups, setRoleGroups] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getStats().then(response => {
      const data = response.data.data || {};
      const totals = data.totals || {};
      setAlerts({ overdue: totals.overdueFollowUp || 0, expiring: totals.expiringLicences || 0 });
      setRoleGroups(data.byCallerType || []);
    }).catch(() => {});
  }, [location.pathname]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const term = search.trim();
    nav(term ? `/contacts?search=${encodeURIComponent(term)}` : '/contacts');
  }

  const appBackgroundStyle = settings.appBackgroundImage
    ? { backgroundImage: `linear-gradient(180deg, rgba(4, 13, 35, 0.76), rgba(4, 13, 35, 0.92)), url(${settings.appBackgroundImage})` }
    : undefined;

  return (
    <div className="shell">
      <Sidebar alerts={alerts} roleGroups={roleGroups} settings={settings} theme={theme} onToggleTheme={onToggleTheme} user={user} onLogout={onLogout} />
      <main className="main app-main-surface" style={appBackgroundStyle}>
        <UpdateBanner updateInfo={updateInfo} onRefresh={onRefresh} syncInfo={syncInfo} onSyncNow={onSyncNow} />
        <div className="workspace-topbar">
          <div>
            <div className="workspace-kicker">{settings.systemTagline}</div>
            <div className="workspace-title-row">
              <h1 className="workspace-title">{settings.welcomeMessage}, {user.name.split(' ')[0]}</h1>
              <span className="workspace-badge"><BadgeCheck size={13} />{user.role}</span>
            </div>
          </div>
          <div className="workspace-actions">
            <form className="workspace-search" onSubmit={handleSearchSubmit}>
              <Search size={14} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search candidates, phones, emails, roles" />
              <button type="submit" className="btn btn-primary btn-sm">Search</button>
            </form>
            <div className="workspace-meta">
              <span className="metric-pill">{alerts.overdue} overdue</span>
              <span className="metric-pill">{alerts.expiring} expiring</span>
              <button className="metric-pill user-pill user-pill-button" onClick={() => nav('/profile')}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="profile-avatar profile-avatar-sm" /> : <UserCircle2 size={14} />}
                {user.name}
              </button>
            </div>
          </div>
        </div>
        <div className="workspace-body">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/new" element={<ContactForm />} />
            <Route path="/contacts/:id/edit" element={<ContactForm />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/profile" element={<ProfilePage user={user} onUpdateUser={onUpdateUser} />} />
            <Route path="/admin" element={(user.role === 'Super Admin' || user.role === 'Admin') ? <AdminConsole user={user} settings={settings} onSaveSettings={onSaveSettings} /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AppFlow() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [authUser, setAuthUser] = useState(() => {
    const storage = localStorage.getItem(REMEMBER_ME_KEY) === 'true' ? localStorage : sessionStorage;
    const raw = storage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_ME_KEY) === 'true');
  const [bootStage, setBootStage] = useState('loading');
  const [orientationComplete, setOrientationComplete] = useState(() => localStorage.getItem(ORIENTATION_KEY) === 'true');
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [updateInfo, setUpdateInfo] = useState({ available: false, version: '' });
  const [syncInfo, setSyncInfo] = useState(() => getOfflineSyncState());
  const authSessionId = authUser?.sessionId || null;

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    getSystemSettings().then(response => setSettings(normalizeSettings(response.data.data))).catch(() => setSettings(FALLBACK_SETTINGS));
  }, []);

  useEffect(() => subscribeToSyncState(setSyncInfo), []);

  useEffect(() => {
    if (!authSessionId) {
      setBootStage('loading');
      const timer = window.setTimeout(() => setBootStage('login'), 350);
      return () => window.clearTimeout(timer);
    }
    setBootStage('loading');
    const timer = window.setTimeout(() => setBootStage(orientationComplete ? 'app' : 'orientation'), 350);
    return () => window.clearTimeout(timer);
  }, [authSessionId, orientationComplete]);

  useEffect(() => {
    if (!authUser?.sessionId) return undefined;
    const beat = () => sendSystemHeartbeat(authUser.sessionId).then(response => {
      const session = response.data.data || {};
      if (session.name && (session.name !== authUser.name || session.avatarUrl !== authUser.avatarUrl || session.role !== authUser.role)) {
        updateAuthUser({ ...authUser, name: session.name, role: session.role, avatarUrl: session.avatarUrl || authUser.avatarUrl });
      }
    }).catch(() => {});
    beat();
    const interval = window.setInterval(beat, 60000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;
    async function syncReleaseInfo() {
      try {
        const response = await getSystemVersion();
        const nextRelease = response.data?.data;
        if (!nextRelease || cancelled) return;
        setUpdateInfo(current => ({
          available: Boolean(current.version && nextRelease.releaseId && current.releaseId && current.releaseId !== nextRelease.releaseId),
          version: nextRelease.version || current.version || '',
          releaseId: nextRelease.releaseId,
        }));
      } catch (_) {}
    }
    syncReleaseInfo();
    const interval = window.setInterval(syncReleaseInfo, 300000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const toasterTheme = useMemo(() => ({
    style: { background: 'var(--bg3)', color: 'var(--txt)', border: '1px solid var(--border2)', fontFamily: 'var(--font)', fontSize: 13 },
    success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg)' } },
    error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg)' } },
  }), []);

  function updateAuthUser(nextUser, shouldRemember = rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, shouldRemember ? 'true' : 'false');
    setRememberMe(shouldRemember);
    const storage = shouldRemember ? localStorage : sessionStorage;
    const otherStorage = shouldRemember ? sessionStorage : localStorage;
    storage.setItem(AUTH_KEY, JSON.stringify(nextUser));
    otherStorage.removeItem(AUTH_KEY);
    setAuthUser(nextUser);
  }

  function handleLogout() {
    if (authUser?.sessionId) logoutSystemSession(authUser.sessionId).catch(() => {});
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    setAuthUser(null);
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={toasterTheme} />
      {!authUser && bootStage === 'loading' ? <LoadingScreen label="Loading secure access and system settings." settings={settings} /> : null}
      {!authUser && bootStage === 'login' ? <LoginPage onLogin={updateAuthUser} settings={settings} updateInfo={updateInfo} onRefresh={() => window.location.reload()} initialRememberMe={rememberMe} syncInfo={syncInfo} onSyncNow={() => syncOfflineChanges().catch(() => {})} /> : null}
      {authUser && bootStage === 'loading' ? <LoadingScreen label="Loading workspace, profile, and reporting modules." settings={settings} /> : null}
      {authUser && bootStage === 'orientation' ? <OrientationPage user={authUser} onFinish={() => { localStorage.setItem(ORIENTATION_KEY, 'true'); setOrientationComplete(true); setBootStage('app'); }} settings={settings} /> : null}
      {authUser && bootStage === 'app' ? <Shell user={authUser} settings={settings} theme={theme} onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} onLogout={handleLogout} onSaveSettings={nextSettings => setSettings(normalizeSettings(nextSettings))} onUpdateUser={updateAuthUser} updateInfo={updateInfo} onRefresh={() => window.location.reload()} syncInfo={syncInfo} onSyncNow={() => syncOfflineChanges().catch(() => {})} /> : null}
    </BrowserRouter>
  );
}

export default function App() {
  return <AppFlow />;
}
