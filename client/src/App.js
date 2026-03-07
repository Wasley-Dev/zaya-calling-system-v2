import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import {
  Activity,
  BadgeCheck,
  Bell,
  Bot,
  Car,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Quote,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ContactList from './pages/ContactList';
import ContactForm from './pages/ContactForm';
import Drivers from './pages/Drivers';
import Reports from './pages/Reports';
import ActivityPage from './pages/ActivityPage';
import {
  createSystemBackup,
  createSystemUser,
  getLiveSystemUsers,
  getStats,
  getSystemBackups,
  getSystemStatus,
  getSystemUsers,
  getSystemVersion,
  loginToSystem,
  logoutSystemSession,
  resetSystemUserPassword,
  restoreSystemBackup,
  sendSystemHeartbeat,
  updateSystemUser,
} from './utils/api';

const AUTH_KEY = 'zaya-auth-session';
const THEME_KEY = 'zaya-theme';
const ORIENTATION_KEY = 'zaya-ai-orientation-complete';
const BRANDING_KEY = 'zaya-branding-settings';

const DEFAULT_USER = {
  name: 'Zaya Operations',
  email: 'it@zayagroupltd.com',
  role: 'Super Admin',
};
const LOGO_SRC = '/zaya-logo.png?v=20260306-2';

const ROTATING_LOGIN_STORIES = [
  {
    loginImage: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
    loginHeadline: 'Welcome back to the Zaya enterprise desk.',
    loginCopy: 'Review today\'s operational insights, align your team, and enter the workspace with better context.',
    quote: 'Business development is rarely one breakthrough. It is disciplined consistency, applied long enough to compound trust.',
    quoteAuthor: 'Zaya Development Office',
    facts: [
      'A clean follow-up pipeline usually outperforms a larger but unmanaged lead list.',
      'Corporate growth gets faster when operations, sales, and compliance share the same narrative.',
      'Well-aligned internal systems reduce client hesitation before any sales pitch begins.',
    ],
  },
  {
    loginImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
    loginHeadline: 'Enter with today\'s business-development focus.',
    loginCopy: 'Use the workspace to convert follow-up clarity into pipeline movement and stronger execution.',
    quote: 'Growth becomes predictable when every interaction leaves the client with less uncertainty than before.',
    quoteAuthor: 'Enterprise Strategy Note',
    facts: [
      'Sales velocity improves when handoffs between sourcing, calling, and compliance are explicit.',
      'Most stalled deals are process problems before they become people problems.',
      'Teams that measure next-action quality usually outperform teams that only measure volume.',
    ],
  },
  {
    loginImage: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
    loginHeadline: 'Sharper operations produce stronger commercial outcomes.',
    loginCopy: 'Start from clear data, structured notes, and disciplined next actions before the day accelerates.',
    quote: 'Professional development means building systems that still work when pressure arrives.',
    quoteAuthor: 'Delivery and Growth Review',
    facts: [
      'A documented client journey makes renewal and expansion conversations easier later.',
      'The best enterprise dashboards reduce decision friction instead of adding more dashboards.',
      'Execution quality is often visible first in how quickly teams can recover context after interruption.',
    ],
  },
  {
    loginImage: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80',
    loginHeadline: 'Build confidence before you build volume.',
    loginCopy: 'Today\'s workflow is designed to keep decisions aligned, records clean, and outreach purposeful.',
    quote: 'Reliable growth is built by teams that keep promises internally before making promises externally.',
    quoteAuthor: 'Zaya Business Development Council',
    facts: [
      'Corporate credibility rises when reporting is as disciplined as outreach.',
      'A polished login and welcome flow signals operational maturity before the first action is taken.',
      'Teams move faster when the interface reflects how leadership expects work to be done.',
    ],
  },
];

const DEFAULT_BRANDING = ROTATING_LOGIN_STORIES[0];

function getDailyRotationIndex() {
  return Math.floor(Date.now() / 86400000) % ROTATING_LOGIN_STORIES.length;
}

function getDailyBranding(overrides = {}) {
  const base = ROTATING_LOGIN_STORIES[getDailyRotationIndex()];
  return {
    ...base,
    ...overrides,
    facts: Array.isArray(overrides.facts) && overrides.facts.length ? overrides.facts : base.facts,
  };
}

function loadBrandingSettings() {
  const stored = localStorage.getItem(BRANDING_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed || {};
  } catch (_) {
    return {};
  }
}

function LoadingScreen({ label = 'Preparing workspace' }) {
  return (
    <div className="startup-screen">
      <div className="startup-card">
        <div className="startup-kicker">Zaya Calling System</div>
        <div className="startup-title">Syncing your calling workspace</div>
        <div className="startup-copy">{label}</div>
        <div className="startup-bar"><span /></div>
      </div>
    </div>
  );
}

function UpdateBanner({ updateInfo, onRefresh }) {
  if (!updateInfo?.available) return null;

  return (
    <div className="update-banner" role="status">
      <div>
        <strong>System update available.</strong>
        <span>
          A newer release is ready{updateInfo.version ? ` (${updateInfo.version})` : ''}. Refresh to load the latest changes.
        </span>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onRefresh}>
        <RefreshCw size={14} />
        Refresh Now
      </button>
    </div>
  );
}

function LoginPage({ onLogin, branding, updateInfo, onRefresh }) {
  const [email, setEmail] = useState(DEFAULT_USER.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await loginToSystem({
        email: email.trim().toLowerCase(),
        password,
      });
      onLogin(response.data.data);
    } catch (error) {
      setError(error?.response?.data?.error || 'Login failed. Check the configured credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell auth-shell-enterprise">
      <div className="auth-frame">
        <section className="login-visual-panel" style={{ backgroundImage: `url(${branding.loginImage})` }}>
          <div className="login-visual-overlay">
            <div className="login-brand-lockup">
              <div className="login-brand-mark">
                <img src={LOGO_SRC} alt="Zaya Group logo" className="login-brand-image" />
              </div>
              <div>
                <div className="login-brand-title">ZAYA GROUP</div>
                <div className="login-brand-subtitle">Enterprise operations workspace</div>
              </div>
            </div>

            <div className="login-visual-copy">
              <div className="hero-card-kicker">Daily Business Development Brief</div>
              <h2>{branding.loginHeadline}</h2>
              <p>{branding.loginCopy}</p>
            </div>

            <div className="login-quote-card">
              <Quote size={18} />
              <div>
                <div className="login-quote-text">{branding.quote}</div>
                <div className="login-quote-author">{branding.quoteAuthor}</div>
              </div>
            </div>

            <div className="login-fact-list">
              {branding.facts.map(fact => (
                <div key={fact} className="login-fact-item">
                  <span className="fact-dot" />
                  <span>{fact}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="auth-panel auth-panel-enterprise">
          <UpdateBanner updateInfo={updateInfo} onRefresh={onRefresh} />
          <div className="auth-kicker">Secure Login</div>
          <div className="auth-heading-block">
            <h2>Access the enterprise workspace.</h2>
            <p>Sign in to review contacts, compliance workflows, reporting, and AI-assisted follow-up operations.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="form-group">
              <span className="form-label">Email</span>
              <input className="form-input" value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">Password</span>
              <input className="form-input" type="password" value={password} onChange={event => setPassword(event.target.value)} />
            </label>

            {error ? <div className="alert alert-error">{error}</div> : null}

            <button className="btn btn-primary auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Signing In...' : 'Enter Control Center'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function OrientationPage({ user, onFinish }) {
  const cards = [
    {
      icon: Bot,
      title: 'Use AI for preparation',
      copy: 'Generate concise call summaries, next actions, and document follow-up prompts before each outreach cycle.',
    },
    {
      icon: ShieldCheck,
      title: 'Keep approvals human',
      copy: 'AI supports workflow quality, but compliance decisions, approvals, and escalations remain operator-owned.',
    },
    {
      icon: Sparkles,
      title: 'Keep records structured',
      copy: 'Track blockers, next call dates, and documentation clearly so AI assistance remains grounded in current records.',
    },
  ];

  return (
    <div className="orientation-shell">
      <div className="orientation-card">
        <div className="orientation-kicker">AI Welcome Orientation</div>
        <h2>{user.name}, this is how AI should operate inside Zaya.</h2>
        <p>
          Use AI to accelerate preparation and summarization. Review every recommendation, especially around
          compliance, bookings, and driver-readiness decisions, before it becomes an operational action.
        </p>
        <div className="orientation-grid">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="orientation-step">
                <div className="orientation-icon"><Icon size={18} /></div>
                <strong>{card.title}</strong>
                <span>{card.copy}</span>
              </div>
            );
          })}
        </div>
        <div className="orientation-actions">
          <button className="btn btn-primary" onClick={onFinish}>Continue to Dashboard</button>
        </div>
      </div>
    </div>
  );
}

function AdminConsole({ user, branding, onSave, onReset }) {
  const [draft, setDraft] = useState(branding);
  const [tab, setTab] = useState('users');
  const [systemUsers, setSystemUsers] = useState([]);
  const [liveUsers, setLiveUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'User',
    password: '',
  });
  const [passwordDrafts, setPasswordDrafts] = useState({});

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  async function loadAdminData() {
    try {
      const [usersResponse, backupsResponse, statusResponse] = await Promise.all([
        getSystemUsers(),
        getSystemBackups(),
        getSystemStatus(),
      ]);
      setSystemUsers(usersResponse.data.data || []);
      setBackups(backupsResponse.data.data || []);
      setSystemStatus(statusResponse.data.data || null);
      if (user.role === 'Super Admin') {
        const liveResponse = await getLiveSystemUsers();
        setLiveUsers(liveResponse.data.data || []);
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load admin data');
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (user.role !== 'Super Admin' || tab !== 'users') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      getLiveSystemUsers()
        .then(response => setLiveUsers(response.data.data || []))
        .catch(() => {});
    }, 30000);

    return () => window.clearInterval(interval);
  }, [tab, user.role]);

  function updateField(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function handleSave() {
    onSave({
      ...draft,
      facts: draft.facts
        .join('\n')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
    });
    toast.success('Branding updated');
  }

  async function handleCreateUser() {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      toast.error('Name, email, and password are required.');
      return;
    }

    setBusy(true);
    try {
      await createSystemUser(newUser);
      setNewUser({ name: '', email: '', role: 'User', password: '' });
      await loadAdminData();
      toast.success('User added');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to add user');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleUser(target) {
    setBusy(true);
    try {
      await updateSystemUser(target.id, {
        name: target.name,
        role: target.role,
        isActive: !target.isActive,
      });
      await loadAdminData();
      toast.success(target.isActive ? 'User disabled' : 'User enabled');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update user');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(target, role) {
    setBusy(true);
    try {
      await updateSystemUser(target.id, {
        name: target.name,
        role,
        isActive: target.isActive,
      });
      await loadAdminData();
      toast.success('Role updated');
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset(target) {
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

  async function handleCreateBackup() {
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

  async function handleRestoreBackup(backupName) {
    if (!window.confirm(`Restore backup ${backupName}? The current database will be replaced after a safety backup is created.`)) {
      return;
    }

    setBusy(true);
    try {
      await restoreSystemBackup(backupName);
      await loadAdminData();
      toast.success('Backup restored. Refreshing workspace.');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to restore backup');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Admin Console</div>
          <div className="pg-subtitle">Manage users, backups, recovery, and login experience settings.</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary" onClick={loadAdminData}>Refresh Admin Data</button>
        </div>
      </div>

      <div className="content">
        <div className="tabs">
          {[
            { key: 'users', label: 'Users' },
            { key: 'recovery', label: 'Backup & Recovery' },
            { key: 'branding', label: 'Branding' },
          ].map(item => (
            <button key={item.key} className={`tab-btn${tab===item.key?' on':''}`} onClick={() => setTab(item.key)}>{item.label}</button>
          ))}
        </div>

        {tab === 'users' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">Create User</div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" value={newUser.name} onChange={event => setNewUser(current => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={newUser.email} onChange={event => setNewUser(current => ({ ...current, email: event.target.value }))} />
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={newUser.role} onChange={event => setNewUser(current => ({ ...current, role: event.target.value }))}>
                    {(user.role === 'Super Admin' ? ['Super Admin', 'Admin', 'User'] : ['Admin', 'User']).map(role => <option key={role}>{role}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={newUser.password} onChange={event => setNewUser(current => ({ ...current, password: event.target.value }))} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleCreateUser} disabled={busy}>Add User</button>
            </div>

            <div className="card">
              <div className="card-title">Current Users</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Login</th>
                      <th>Password Reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsers.map(member => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.email}</td>
                        <td>
                          <select
                            className="filter-sel"
                            value={member.role}
                            onChange={event => handleRoleChange(member, event.target.value)}
                            disabled={user.role !== 'Super Admin' && member.role === 'Super Admin'}
                          >
                            {(user.role === 'Super Admin' ? ['Super Admin', 'Admin', 'User'] : ['Admin', 'User']).map(role => <option key={role}>{role}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            className={`btn btn-xs ${member.isActive ? 'btn-success' : 'btn-danger'}`}
                            onClick={() => handleToggleUser(member)}
                            disabled={user.role !== 'Super Admin' && member.role === 'Super Admin'}
                          >
                            {member.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.lastLoginAt || 'Never'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              className="form-input"
                              type="password"
                              placeholder="New password"
                              value={passwordDrafts[member.id] || ''}
                              onChange={event => setPasswordDrafts(current => ({ ...current, [member.id]: event.target.value }))}
                              style={{ minWidth: 160 }}
                              disabled={user.role !== 'Super Admin' && member.role === 'Super Admin'}
                            />
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handlePasswordReset(member)}
                              disabled={user.role !== 'Super Admin' && member.role === 'Super Admin'}
                            >
                              Reset
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {user.role === 'Super Admin' ? (
              <div className="card">
                <div className="card-title">Live Users</div>
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
                          <td><span className="badge b-green">{member.role}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.ipAddress || 'Unavailable'}</td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.location || 'Unavailable'}</td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{member.lastSeenAt}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="5" style={{ color: 'var(--txt2)' }}>No live sessions detected.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'recovery' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">Automatic Backup</div>
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
              <button className="btn btn-primary" onClick={handleCreateBackup} disabled={busy}>Create Backup Now</button>
            </div>

            <div className="card">
              <div className="card-title">System Recovery</div>
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
                        <td><button className="btn btn-danger btn-sm" onClick={() => handleRestoreBackup(backup.name)}>Restore</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'branding' ? (
          <div className="admin-grid">
            <div className="card">
              <div className="card-title">Login Hero Content</div>
              <div className="form-group">
                <label className="form-label">Hero Image URL Override</label>
                <input className="form-input" value={draft.loginImage} onChange={event => updateField('loginImage', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Headline Override</label>
                <input className="form-input" value={draft.loginHeadline} onChange={event => updateField('loginHeadline', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Support Copy Override</label>
                <textarea className="form-input" value={draft.loginCopy} onChange={event => updateField('loginCopy', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Wise Quote Override</label>
                <textarea className="form-input" value={draft.quote} onChange={event => updateField('quote', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Quote Author Override</label>
                <input className="form-input" value={draft.quoteAuthor} onChange={event => updateField('quoteAuthor', event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Corporate Facts Override</label>
                <textarea
                  className="form-input"
                  value={Array.isArray(draft.facts) ? draft.facts.join('\n') : ''}
                  onChange={event => updateField('facts', event.target.value.split('\n'))}
                  placeholder="One fact per line"
                  style={{ minHeight: 160 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={onReset}>Reset Defaults</button>
                <button className="btn btn-primary" onClick={handleSave}>Save Branding</button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Login Preview</div>
              <div className="admin-preview">
                <div className="admin-preview-image" style={{ backgroundImage: `url(${getDailyBranding(draft).loginImage})` }}>
                  <div className="login-brand-lockup">
                    <div className="login-brand-mark">
                      <img src={LOGO_SRC} alt="Zaya Group logo" className="login-brand-image" />
                    </div>
                    <div>
                      <div className="login-brand-title">ZAYA GROUP</div>
                      <div className="login-brand-subtitle">Enterprise operations workspace</div>
                    </div>
                  </div>
                </div>
                <div className="admin-preview-copy">
                  <strong>{getDailyBranding(draft).loginHeadline}</strong>
                  <p>{getDailyBranding(draft).loginCopy}</p>
                  <div className="login-quote-card" style={{ marginTop: 10 }}>
                    <Quote size={18} />
                    <div>
                      <div className="login-quote-text">{getDailyBranding(draft).quote}</div>
                      <div className="login-quote-author">{getDailyBranding(draft).quoteAuthor}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({ alerts, theme, onToggleTheme, user, onLogout }) {
  const loc = useLocation();
  const nav = useNavigate();

  const items = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Contacts', path: '/contacts' },
    { icon: Car, label: 'Drivers', path: '/drivers', badge: alerts.expiring > 0 ? alerts.expiring : null },
    { icon: FileText, label: 'Reports', path: '/reports' },
    { icon: Activity, label: 'Activity', path: '/activity' },
  ];

  if (user.role === 'Super Admin' || user.role === 'Admin') {
    items.push({ icon: Settings2, label: 'Admin Console', path: '/admin' });
  }

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">ZAYA GROUP</div>
        <div className="sb-tagline">Operations Command Layer</div>
      </div>

      <div className="sb-usercard">
        <div className="avatar">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>
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
              {active ? <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.4 }} /> : null}
            </button>
          );
        })}

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
      </nav>

      <div className="sb-controls">
        <button className="btn btn-secondary sidebar-utility" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button className="btn btn-ghost sidebar-utility" onClick={onLogout}>
          <LogOut size={14} />
          Logout
        </button>
      </div>

      <div className="sb-footer">Zaya Group Copyright {new Date().getFullYear()}</div>
    </aside>
  );
}

function Shell({ user, theme, onToggleTheme, onLogout, branding, onSaveBranding, onResetBranding, updateInfo, onRefresh }) {
  const [alerts, setAlerts] = useState({ overdue: 0, expiring: 0 });

  useEffect(() => {
    getStats()
      .then(response => {
        const totals = response.data.data.totals;
        setAlerts({
          overdue: totals.overdueFollowUp || 0,
          expiring: totals.expiringLicences || 0,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="shell">
      <Sidebar
        alerts={alerts}
        theme={theme}
        onToggleTheme={onToggleTheme}
        user={user}
        onLogout={onLogout}
      />
      <main className="main">
        <UpdateBanner updateInfo={updateInfo} onRefresh={onRefresh} />
        <div className="workspace-topbar">
          <div>
            <div className="workspace-kicker">Enterprise Workspace</div>
            <div className="workspace-title-row">
              <h1 className="workspace-title">Operations Control Center</h1>
              <span className="workspace-badge">
                <BadgeCheck size={13} />
                {user.role}
              </span>
            </div>
          </div>
          <div className="workspace-actions">
            <div className="workspace-search">
              <Search size={14} />
              <span>CRM, compliance, activity intelligence</span>
            </div>
            <div className="workspace-meta">
              <span className="metric-pill">{alerts.overdue} overdue</span>
              <span className="metric-pill">{alerts.expiring} expiring</span>
              <span className="metric-pill user-pill">{user.email}</span>
            </div>
          </div>
        </div>
        <div className="workspace-body">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/new" element={<ContactForm />} />
            <Route path="/contacts/:id/edit" element={<ContactForm />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route
              path="/admin"
              element={user.role === 'Super Admin' || user.role === 'Admin'
                ? <AdminConsole user={user} branding={branding} onSave={onSaveBranding} onReset={onResetBranding} />
                : <Navigate to="/" replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AppFlow() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [authUser, setAuthUser] = useState(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [bootStage, setBootStage] = useState('loading');
  const [orientationComplete, setOrientationComplete] = useState(() => localStorage.getItem(ORIENTATION_KEY) === 'true');
  const [branding, setBranding] = useState(() => loadBrandingSettings());
  const [rotationDay, setRotationDay] = useState(() => Math.floor(Date.now() / 86400000));
  const [releaseInfo, setReleaseInfo] = useState(null);
  const [updateInfo, setUpdateInfo] = useState({ available: false, version: '' });
  const activeBranding = useMemo(() => getDailyBranding(branding), [branding, rotationDay]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(BRANDING_KEY, JSON.stringify(branding));
  }, [branding]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextDay = Math.floor(Date.now() / 86400000);
      setRotationDay(current => current === nextDay ? current : nextDay);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncReleaseInfo() {
      try {
        const response = await getSystemVersion();
        const nextRelease = response.data?.data;
        if (!nextRelease || cancelled) return;

        setReleaseInfo(current => {
          if (!current) {
            setUpdateInfo({ available: false, version: nextRelease.version || '' });
            return nextRelease;
          }

          const changed = current.releaseId && nextRelease.releaseId && current.releaseId !== nextRelease.releaseId;
          setUpdateInfo({
            available: Boolean(changed),
            version: nextRelease.version || current.version || '',
          });

          return current;
        });
      } catch (_) {
        // Ignore transient version-check failures.
      }
    }

    syncReleaseInfo();
    const interval = window.setInterval(syncReleaseInfo, 300000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncReleaseInfo();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setBootStage('loading');
      const timer = window.setTimeout(() => {
        setBootStage('login');
      }, 450);
      return () => window.clearTimeout(timer);
    }

    setBootStage('loading');
    const timer = window.setTimeout(() => {
      setBootStage(orientationComplete ? 'app' : 'orientation');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [authUser, orientationComplete]);

  useEffect(() => {
    if (!authUser?.sessionId) return undefined;

    const beat = () => sendSystemHeartbeat(authUser.sessionId).catch(() => {});
    beat();
    const interval = window.setInterval(beat, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        beat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authUser]);

  const toasterTheme = useMemo(() => ({
    style: {
      background: 'var(--bg3)',
      color: 'var(--txt)',
      border: '1px solid var(--border2)',
      fontFamily: 'var(--font)',
      fontSize: 13,
    },
    success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg)' } },
    error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg)' } },
  }), []);

  function handleLogin(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    setAuthUser(user);
  }

  function handleLogout() {
    if (authUser?.sessionId) {
      logoutSystemSession(authUser.sessionId).catch(() => {});
    }
    localStorage.removeItem(AUTH_KEY);
    setAuthUser(null);
  }

  function handleFinishOrientation() {
    localStorage.setItem(ORIENTATION_KEY, 'true');
    setOrientationComplete(true);
    setBootStage('app');
  }

  function toggleTheme() {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  }

  function handleSaveBranding(nextBranding) {
    setBranding({
      ...DEFAULT_BRANDING,
      ...nextBranding,
    });
  }

  function handleResetBranding() {
    setBranding({});
  }

  function refreshToLatestRelease() {
    window.location.reload();
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={toasterTheme} />

      {!authUser && bootStage === 'loading'
        ? <LoadingScreen label="Loading secure access, branding rotation, and workspace preferences." />
        : null}

      {!authUser && bootStage === 'login'
        ? <LoginPage onLogin={handleLogin} branding={activeBranding} updateInfo={updateInfo} onRefresh={refreshToLatestRelease} />
        : null}

      {authUser && bootStage === 'loading'
        ? <LoadingScreen label="Loading CRM, AI orientation, and workspace preferences." />
        : null}

      {authUser && bootStage === 'orientation'
        ? <OrientationPage user={authUser} onFinish={handleFinishOrientation} />
        : null}

      {authUser && bootStage === 'app'
        ? (
          <Shell
            user={authUser}
            theme={theme}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
            branding={activeBranding}
            onSaveBranding={handleSaveBranding}
            onResetBranding={handleResetBranding}
            updateInfo={updateInfo}
            onRefresh={refreshToLatestRelease}
          />
        )
        : null}
    </BrowserRouter>
  );
}

export default function App() {
  return <AppFlow />;
}
