import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/api',
});

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('zaya-auth-session');
      if (raw) {
        const auth = JSON.parse(raw);
        if (auth?.sessionId) {
          config.headers = config.headers || {};
          config.headers['x-system-session-id'] = auth.sessionId;
        }
      }
    } catch (_) {
      // Ignore malformed local session state.
    }
  }

  return config;
});

export const getContacts = p => api.get('/contacts', { params: p });
export const getContact = id => api.get(`/contacts/${id}`);
export const createContact = d => api.post('/contacts', d);
export const updateContact = (id, d) => api.put(`/contacts/${id}`, d);
export const quickUpdate = (id, d) => api.patch(`/contacts/${id}/quick`, d);
export const deleteContact = id => api.delete(`/contacts/${id}`);
export const logCall = (id, d) => api.post(`/contacts/${id}/calls`, d);
export const deleteCall = (id, sid) => api.delete(`/contacts/${id}/calls/${sid}`);
export const uploadAttachment = (id, f) => {
  const fd = new FormData();
  fd.append('file', f);
  return api.post(`/contacts/${id}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const deleteAttachment = (id, aid) => api.delete(`/contacts/${id}/attachments/${aid}`);

export const getAllDrivers = () => api.get('/driver-details');
export const getExpiringDrivers = () => api.get('/driver-details/expiring');
export const getDriverByContact = id => api.get(`/driver-details/by-contact/${id}`);
export const saveDriver = d => api.post('/driver-details', d);
export const updateDriver = (id, d) => api.put(`/driver-details/${id}`, d);

export const getCallLogs = () => api.get('/call-logs');
export const getActivity = n => api.get(`/activity?limit=${n || 40}`);
export const getStats = () => api.get('/stats');
export const loginToSystem = credentials => api.post('/system/login', credentials);
export const getSystemUsers = () => api.get('/system/users');
export const getActiveSystemUsers = () => api.get('/system/users/active');
export const getLiveSystemUsers = () => api.get('/system/users/live');
export const createSystemUser = payload => api.post('/system/users', payload);
export const updateSystemUser = (id, payload) => api.patch(`/system/users/${id}`, payload);
export const resetSystemUserPassword = (id, password) => api.post(`/system/users/${id}/password`, { password });
export const getOwnProfile = () => api.get('/system/profile');
export const updateOwnProfile = payload => api.patch('/system/profile', payload);
export const changeOwnPassword = payload => api.post('/system/profile/password', payload);
export const getSystemSettings = () => api.get('/system/settings');
export const updateSystemSettings = payload => api.patch('/system/settings', payload);
export const getSystemBackups = () => api.get('/system/backups');
export const createSystemBackup = payload => api.post('/system/backups', payload || {});
export const restoreSystemBackup = backupName => api.post('/system/recovery/restore', { backupName });
export const sendSystemHeartbeat = sessionId => api.post('/system/session/heartbeat', { sessionId });
export const logoutSystemSession = sessionId => api.post('/system/session/logout', { sessionId });
export const getSystemStatus = () => api.get('/system/status');
export const runSystemMaintenance = action => api.post('/system/maintenance', { action });
export const getSystemVersion = () => api.get('/system/version');

export default api;
