import axios from 'axios';

function getRuntimeApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const raw = window.__ZAYA_CONFIG__?.apiBaseUrl;
  return raw ? String(raw).trim() : '';
}

const api = axios.create({
  baseURL: getRuntimeApiBaseUrl() || process.env.REACT_APP_API_BASE_URL || '/api',
});

const AUTH_KEY = 'zaya-auth-session';
const REMEMBER_ME_KEY = 'zaya-remember-me';
const CACHE_KEY = 'zaya-offline-cache-v1';
const QUEUE_KEY = 'zaya-offline-queue-v1';
const CONTACTS_KEY = 'zaya-offline-contacts-v1';
const DRIVERS_KEY = 'zaya-offline-drivers-v1';
const CALLS_KEY = 'zaya-offline-calls-v1';
const ATTACHMENTS_KEY = 'zaya-offline-attachments-v1';
const SYNC_EVENT = 'zaya-sync-state';

let syncState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
};

function getPreferredStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REMEMBER_ME_KEY) === 'true' ? window.localStorage : window.sessionStorage;
}

export function getStoredAuthUser() {
  if (typeof window === 'undefined') return null;
  try {
    const preferred = getPreferredStorage();
    const raw = preferred?.getItem(AUTH_KEY) || window.localStorage.getItem(AUTH_KEY) || window.sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function makeCacheKey(url, params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, value);
  });
  const query = search.toString();
  return `${url}${query ? `?${query}` : ''}`;
}

function getCacheStore() {
  return readJson(CACHE_KEY, {});
}

function setCachedResponse(url, params, payload) {
  const store = getCacheStore();
  store[makeCacheKey(url, params)] = {
    payload,
    cachedAt: new Date().toISOString(),
  };
  writeJson(CACHE_KEY, store);
}

function getCachedResponse(url, params) {
  const store = getCacheStore();
  return store[makeCacheKey(url, params)]?.payload || null;
}

function getQueue() {
  return readJson(QUEUE_KEY, []);
}

function setQueue(queue) {
  writeJson(QUEUE_KEY, queue);
  updateSyncState({ pending: queue.length });
}

function getOfflineContacts() {
  return readJson(CONTACTS_KEY, {});
}

function setOfflineContacts(next) {
  writeJson(CONTACTS_KEY, next);
}

function getOfflineDrivers() {
  return readJson(DRIVERS_KEY, {});
}

function setOfflineDrivers(next) {
  writeJson(DRIVERS_KEY, next);
}

function getOfflineCalls() {
  return readJson(CALLS_KEY, {});
}

function setOfflineCalls(next) {
  writeJson(CALLS_KEY, next);
}

function getOfflineAttachments() {
  return readJson(ATTACHMENTS_KEY, {});
}

function setOfflineAttachments(next) {
  writeJson(ATTACHMENTS_KEY, next);
}

function emitSyncState() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: syncState }));
}

function updateSyncState(patch) {
  syncState = { ...syncState, ...patch };
  emitSyncState();
}

export function getOfflineSyncState() {
  return { ...syncState };
}

function createTempId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isNetworkError(error) {
  return !error?.response && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error' || error?.message?.includes('Network'));
}

function isOfflineFallbackError(error) {
  if (isNetworkError(error)) return true;
  const status = Number(error?.response?.status || 0);
  return status === 408 || status >= 500;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildAxiosResponse(data, status = 200) {
  return { data, status };
}

function invalidateCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
}

function enqueueOperation(operation) {
  const queue = getQueue();
  queue.push(operation);
  setQueue(queue);
}

function updateOfflineContactRecord(contactId, record) {
  const contacts = getOfflineContacts();
  contacts[contactId] = { ...(contacts[contactId] || {}), ...record };
  setOfflineContacts(contacts);
}

function removeOfflineContactRecord(contactId) {
  const contacts = getOfflineContacts();
  delete contacts[contactId];
  setOfflineContacts(contacts);
}

function updateOfflineDriverRecord(key, record) {
  const drivers = getOfflineDrivers();
  drivers[key] = { ...(drivers[key] || {}), ...record };
  setOfflineDrivers(drivers);
}

function removeOfflineDriverRecord(key) {
  const drivers = getOfflineDrivers();
  delete drivers[key];
  setOfflineDrivers(drivers);
}

function addOfflineCall(contactId, call) {
  const calls = getOfflineCalls();
  const existing = calls[contactId] || [];
  calls[contactId] = [call, ...existing];
  setOfflineCalls(calls);
}

function removeOfflineCall(contactId, sessionId) {
  const calls = getOfflineCalls();
  calls[contactId] = (calls[contactId] || []).filter(item => item.SessionID !== sessionId);
  setOfflineCalls(calls);
}

function addOfflineAttachment(contactId, attachment) {
  const attachments = getOfflineAttachments();
  const existing = attachments[contactId] || [];
  attachments[contactId] = [attachment, ...existing];
  setOfflineAttachments(attachments);
}

function removeOfflineAttachment(contactId, attachmentId) {
  const attachments = getOfflineAttachments();
  attachments[contactId] = (attachments[contactId] || []).filter(item => item.id !== attachmentId);
  setOfflineAttachments(attachments);
}

function applyContactFilters(items, params = {}) {
  return items.filter(item => {
    const search = String(params.search || '').trim().toLowerCase();
    if (search) {
      const haystack = [
        item.First_Name,
        item.Last_Name,
        item.Job_Title,
        item.Mobile_Phone,
        item.E_mail_Address,
        item.Address,
        item.Caller_Type,
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (params.status && item.Status !== params.status) return false;
    if (params.stage && item.Stage !== params.stage) return false;
    if (params.caller_type && item.Caller_Type !== params.caller_type) return false;
    if (params.priority && item.Priority !== params.priority) return false;
    if (params.booking && item.Booking !== params.booking) return false;
    if (params.assigned_to && item.Assigned_To !== params.assigned_to) return false;
    if (params.overdue === 'true' && !(item.Next_Call_Date && new Date(item.Next_Call_Date) < new Date())) return false;
    if (item.__deletedOffline) return false;
    return true;
  });
}

function mergeContacts(baseItems = [], params = {}) {
  const contacts = getOfflineContacts();
  const map = new Map(baseItems.map(item => [String(item.ID), { ...item }]));

  Object.entries(contacts).forEach(([id, record]) => {
    if (record.__deletedOffline) {
      map.delete(String(id));
      return;
    }
    const base = map.get(String(id)) || {};
    map.set(String(id), { ...base, ...record, ID: record.ID || id });
  });

  const merged = Array.from(map.values()).sort((a, b) => new Date(b.Updated_At || 0) - new Date(a.Updated_At || 0));
  return applyContactFilters(merged, params);
}

function mergeDriverRows(baseItems = []) {
  const contacts = getOfflineContacts();
  const drivers = getOfflineDrivers();
  const map = new Map(baseItems.map(item => [String(item.DriverDetailID || item.CallLogsID), { ...item }]));

  Object.entries(drivers).forEach(([key, driver]) => {
    const contact = contacts[String(driver.CallLogsID)] || contacts[String(driver._offlineCallLogsId)] || {};
    const recordKey = String(driver.DriverDetailID || key);
    map.set(recordKey, {
      ...contact,
      ...driver,
      CallLogsID: driver.CallLogsID || driver._offlineCallLogsId,
      DriverDetailID: driver.DriverDetailID || key,
    });
  });

  return Array.from(map.values()).filter(item => !item.__deletedOffline);
}

function getOfflineContactDetail(id) {
  const contacts = getOfflineContacts();
  const contact = contacts[String(id)];
  if (!contact) return null;
  const calls = getOfflineCalls()[String(id)] || [];
  const attachments = getOfflineAttachments()[String(id)] || [];
  const driver = Object.values(getOfflineDrivers()).find(item => String(item.CallLogsID || item._offlineCallLogsId) === String(id)) || null;
  return {
    ...contact,
    ...(driver ? {
      DriverDetailID: driver.DriverDetailID || null,
      DriverName: driver.DriverName,
      LicenseNumber: driver.LicenseNumber,
      LicenseClass: driver.LicenseClass,
      LicenseIssueDate: driver.LicenseIssueDate,
      LicenseExpiryDate: driver.LicenseExpiryDate,
      DVLACheck: driver.DVLACheck,
      DBSCheck: driver.DBSCheck,
      PCOCheck: driver.PCOCheck,
      VehicleType: driver.VehicleType,
      DriverNotes: driver.Notes,
    } : {}),
    sessions: calls,
    activity: contact.activity || [],
    attachments,
  };
}

function recordQueuedActivity(contactId, action, detail, createdBy = 'Offline Queue') {
  const contacts = getOfflineContacts();
  const existing = contacts[String(contactId)] || {};
  const activity = existing.activity || [];
  activity.unshift({
    ActivityID: createTempId('offline-activity'),
    Action: action,
    Detail: detail,
    Created_By: createdBy,
    Created_At: new Date().toISOString(),
  });
  contacts[String(contactId)] = { ...existing, activity };
  setOfflineContacts(contacts);
}

function normalizeForReplay(operation, idMap) {
  const normalized = clone(operation);

  const resolveValue = value => {
    if (typeof value === 'string' && idMap[value]) return idMap[value];
    return value;
  };

  if (normalized.url) {
    Object.entries(idMap).forEach(([tempId, realId]) => {
      normalized.url = normalized.url.replace(tempId, realId);
    });
  }

  if (normalized.data && typeof normalized.data === 'object') {
    Object.keys(normalized.data).forEach(key => {
      normalized.data[key] = resolveValue(normalized.data[key]);
    });
  }

  if (normalized.meta?.contactId) normalized.meta.contactId = resolveValue(normalized.meta.contactId);
  if (normalized.meta?.tempId && idMap[normalized.meta.tempId]) normalized.meta.tempId = idMap[normalized.meta.tempId];

  return normalized;
}

function createFileFromDataUrl(fileName, dataUrl, mimeType) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], fileName, { type: mimeType || 'application/octet-stream' });
}

async function replayOperation(operation, idMap) {
  const next = normalizeForReplay(operation, idMap);

  if (next.meta?.kind === 'uploadAttachment') {
    const file = createFileFromDataUrl(next.meta.fileName, next.meta.dataUrl, next.meta.mimeType);
    const formData = new FormData();
    formData.append('file', file);
    return api.post(next.url, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }

  return api.request({
    method: next.method,
    url: next.url,
    data: next.data,
    params: next.params,
    headers: next.headers,
  });
}

async function flushOfflineQueue() { 
  if (typeof window === 'undefined' || syncState.syncing) return; 
  if (!navigator.onLine) { 
    updateSyncState({ online: false }); 
    return; 
  } 
  const queue = getQueue(); 
  if (!queue.length) { 
    updateSyncState({ online: true, pending: 0, syncing: false }); 
    return; 
  } 
 
  updateSyncState({ online: true, syncing: true, pending: queue.length }); 
  const idMap = {}; 
  const remaining = []; 

  for (const operation of queue) {
    try {
      const response = await replayOperation(operation, idMap);
      if (operation.meta?.kind === 'createContact' && operation.meta?.tempId) {
        const realId = response?.data?.data?.ID;
        if (realId) {
          idMap[operation.meta.tempId] = String(realId);
          const contacts = getOfflineContacts();
          const record = contacts[operation.meta.tempId];
          delete contacts[operation.meta.tempId];
          if (record) contacts[String(realId)] = { ...record, ID: realId };
          setOfflineContacts(contacts);
        }
      }

      if (operation.meta?.kind === 'saveDriver') {
        const drivers = getOfflineDrivers();
        const key = operation.meta.driverKey;
        const resolvedKey = idMap[key] || key;
        delete drivers[key];
        if (response?.data?.data) {
          drivers[resolvedKey] = {
            ...response.data.data,
            CallLogsID: response.data.data.CallLogsID,
          };
        }
        setOfflineDrivers(drivers);
      }

      if (operation.meta?.kind === 'logCall') {
        const resolvedContactId = String(idMap[operation.meta.contactId] || operation.meta.contactId);
        removeOfflineCall(resolvedContactId, operation.meta.sessionId);
      }

      if (operation.meta?.kind === 'uploadAttachment') {
        const resolvedContactId = String(idMap[operation.meta.contactId] || operation.meta.contactId);
        removeOfflineAttachment(resolvedContactId, operation.meta.attachmentId);
      }

      if (operation.meta?.kind === 'deleteContact') {
        removeOfflineContactRecord(String(idMap[operation.meta.contactId] || operation.meta.contactId));
      }
    } catch (error) { 
      if (isOfflineFallbackError(error)) { 
        remaining.push(operation, ...queue.slice(queue.indexOf(operation) + 1)); 
        break; 
      } 
      remaining.push(operation); 
    } 
  }

  setQueue(remaining);
  invalidateCache();
  updateSyncState({
    online: navigator.onLine,
    syncing: false,
    pending: remaining.length,
    lastSyncedAt: remaining.length ? syncState.lastSyncedAt : new Date().toISOString(),
  });
}

function startOfflineSyncListeners() { 
  if (typeof window === 'undefined' || window.__zayaOfflineSyncInitialized) return; 
  window.__zayaOfflineSyncInitialized = true; 
  updateSyncState({ pending: getQueue().length, online: navigator.onLine }); 
  window.addEventListener('online', () => { 
    updateSyncState({ online: true }); 
    flushOfflineQueue(); 
  }); 
  window.addEventListener('offline', () => updateSyncState({ online: false })); 
  window.setTimeout(() => flushOfflineQueue(), 400); 
  window.setInterval(() => { 
    if (!navigator.onLine) return; 
    if (getQueue().length === 0) return; 
    flushOfflineQueue(); 
  }, 30000); 
} 

startOfflineSyncListeners();

api.interceptors.request.use(config => {
  const auth = getStoredAuthUser();
  if (auth?.sessionId) {
    config.headers = config.headers || {};
    config.headers['x-system-session-id'] = auth.sessionId;
  }
  return config;
});

async function getWithOfflineFallback(url, params, transform) {
  try {
    const response = await api.get(url, { params });
    setCachedResponse(url, params, response.data);
    return response;
  } catch (error) {
    if (!isOfflineFallbackError(error)) throw error;
    const cached = getCachedResponse(url, params);
    if (!cached) throw error;
    const payload = transform ? transform(cached) : cached;
    return buildAxiosResponse(payload, 200);
  }
}

function queueMutation(operation, optimisticData) {
  enqueueOperation(operation);
  return buildAxiosResponse({ success: true, data: optimisticData, queued: true }, 202);
}

export const getContacts = params => getWithOfflineFallback('/contacts', params, cached => ({
  ...cached,
  data: mergeContacts(cached.data || [], params),
}));

export const getContact = async id => {
  if (String(id).startsWith('offline-contact-')) {
    return buildAxiosResponse({ success: true, data: getOfflineContactDetail(id) }, 200);
  }

  try {
    const response = await api.get(`/contacts/${id}`);
    setCachedResponse(`/contacts/${id}`, null, response.data);
    return response;
  } catch (error) {
    if (!isNetworkError(error) && navigator.onLine) throw error;
    const cached = getCachedResponse(`/contacts/${id}`, null);
    const offline = getOfflineContactDetail(id);
    if (!cached && !offline) throw error;
    return buildAxiosResponse({
      success: true,
      data: {
        ...(cached?.data || {}),
        ...(offline || {}),
        sessions: [...(offline?.sessions || []), ...(cached?.data?.sessions || [])],
        attachments: [...(offline?.attachments || []), ...(cached?.data?.attachments || [])],
      },
    }, 200);
  }
};

export const createContact = async data => {
  try {
    const response = await api.post('/contacts', data);
    invalidateCache();
    return response;
  } catch (error) {
    if (!isOfflineFallbackError(error)) throw error;
    const tempId = createTempId('offline-contact');
    const now = new Date().toISOString();
    const optimistic = {
      ID: tempId,
      ...data,
      Call_Count: 0,
      Created_At: now,
      Updated_At: now,
      __offline: true,
    };
    updateOfflineContactRecord(tempId, optimistic);
    recordQueuedActivity(tempId, 'Contact Queued Offline', `${data.First_Name || ''} ${data.Last_Name || ''}`.trim());
    return queueMutation({
      id: createTempId('queue'),
      method: 'post',
      url: '/contacts',
      data,
      meta: { kind: 'createContact', tempId },
    }, optimistic);
  }
};

export const updateContact = async (id, data) => {
  if (String(id).startsWith('offline-contact-') || !navigator.onLine) {
    const existing = getOfflineContactDetail(id) || {};
    const optimistic = { ...existing, ...data, ID: id, Updated_At: new Date().toISOString(), __offline: true };
    updateOfflineContactRecord(id, optimistic);
    recordQueuedActivity(id, 'Contact Updated Offline', 'Changes queued for sync');
    return queueMutation({
      id: createTempId('queue'),
      method: 'put',
      url: `/contacts/${id}`,
      data,
      meta: { kind: 'updateContact', contactId: id },
    }, optimistic);
  }

  try {
    const response = await api.put(`/contacts/${id}`, data);
    invalidateCache();
    return response;
  } catch (error) {
    if (!isOfflineFallbackError(error)) throw error;
    const existing = getOfflineContactDetail(id) || {};
    const optimistic = { ...existing, ...data, ID: id, Updated_At: new Date().toISOString(), __offline: true };
    updateOfflineContactRecord(id, optimistic);
    recordQueuedActivity(id, 'Contact Updated Offline', 'Changes queued for sync');
    return queueMutation({
      id: createTempId('queue'),
      method: 'put',
      url: `/contacts/${id}`,
      data,
      meta: { kind: 'updateContact', contactId: id },
    }, optimistic);
  }
};

export const quickUpdate = async (id, data) => {
  if (String(id).startsWith('offline-contact-') || !navigator.onLine) {
    const existing = getOfflineContactDetail(id) || {};
    const optimistic = { ...existing, ...data, ID: id, Updated_At: new Date().toISOString(), __offline: true };
    updateOfflineContactRecord(id, optimistic);
    return queueMutation({
      id: createTempId('queue'),
      method: 'patch',
      url: `/contacts/${id}/quick`,
      data,
      meta: { kind: 'quickUpdate', contactId: id },
    }, optimistic);
  }

  try {
    const response = await api.patch(`/contacts/${id}/quick`, data);
    invalidateCache();
    return response;
  } catch (error) {
    if (!isOfflineFallbackError(error)) throw error;
    const existing = getOfflineContactDetail(id) || {};
    const optimistic = { ...existing, ...data, ID: id, Updated_At: new Date().toISOString(), __offline: true };
    updateOfflineContactRecord(id, optimistic);
    return queueMutation({
      id: createTempId('queue'),
      method: 'patch',
      url: `/contacts/${id}/quick`,
      data,
      meta: { kind: 'quickUpdate', contactId: id },
    }, optimistic);
  }
};

export const deleteContact = async id => {
  if (String(id).startsWith('offline-contact-') || !navigator.onLine) {
    updateOfflineContactRecord(id, { __deletedOffline: true, Updated_At: new Date().toISOString() });
    return queueMutation({
      id: createTempId('queue'),
      method: 'delete',
      url: `/contacts/${id}`,
      meta: { kind: 'deleteContact', contactId: id },
    }, { id });
  }

  try {
    const response = await api.delete(`/contacts/${id}`);
    invalidateCache();
    return response;
  } catch (error) {
    if (!isOfflineFallbackError(error)) throw error;
    updateOfflineContactRecord(id, { __deletedOffline: true, Updated_At: new Date().toISOString() });
    return queueMutation({
      id: createTempId('queue'),
      method: 'delete',
      url: `/contacts/${id}`,
      meta: { kind: 'deleteContact', contactId: id },
    }, { id });
  }
};

export const logCall = async (id, data) => { 
  if (String(id).startsWith('offline-contact-') || !navigator.onLine) { 
    const sessionId = createTempId('offline-call');
    const optimistic = {
      SessionID: sessionId,
      CallLogsID: id,
      Outcome: data.Outcome || 'Successful',
      Duration_Min: data.Duration_Min || 0,
      Notes: data.Notes || '',
      Called_By: data.Called_By || '',
      Called_At: new Date().toISOString(),
      Next_Action: data.Next_Action || '',
      __offline: true,
    };
    addOfflineCall(String(id), optimistic);
    recordQueuedActivity(id, 'Call Logged Offline', optimistic.Outcome, optimistic.Called_By || 'Offline User');
    return queueMutation({
      id: createTempId('queue'),
      method: 'post',
      url: `/contacts/${id}/calls`,
      data,
      meta: { kind: 'logCall', contactId: id, sessionId },
    }, optimistic); 
  } 
 
  try { 
    const response = await api.post(`/contacts/${id}/calls`, data); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    const sessionId = createTempId('offline-call'); 
    const optimistic = { 
      SessionID: sessionId, 
      CallLogsID: id, 
      Outcome: data.Outcome || 'Successful', 
      Duration_Min: data.Duration_Min || 0, 
      Notes: data.Notes || '', 
      Called_By: data.Called_By || '', 
      Called_At: new Date().toISOString(), 
      Next_Action: data.Next_Action || '', 
      __offline: true, 
    }; 
    addOfflineCall(String(id), optimistic); 
    recordQueuedActivity(id, 'Call Logged Offline', optimistic.Outcome, optimistic.Called_By || 'Offline User'); 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'post', 
      url: `/contacts/${id}/calls`, 
      data, 
      meta: { kind: 'logCall', contactId: id, sessionId }, 
    }, optimistic); 
  } 
}; 
 
export const deleteCall = async (id, sid) => { 
  if (String(sid).startsWith('offline-call') || !navigator.onLine) { 
    removeOfflineCall(String(id), sid);
    return queueMutation({
      id: createTempId('queue'),
      method: 'delete',
      url: `/contacts/${id}/calls/${sid}`,
      meta: { kind: 'deleteCall', contactId: id, sessionId: sid },
    }, { SessionID: sid }); 
  } 
 
  try { 
    const response = await api.delete(`/contacts/${id}/calls/${sid}`); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'delete', 
      url: `/contacts/${id}/calls/${sid}`, 
      meta: { kind: 'deleteCall', contactId: id, sessionId: sid }, 
    }, { SessionID: sid }); 
  } 
}; 

export const uploadAttachment = async (id, file) => { 
  if (!navigator.onLine || String(id).startsWith('offline-contact-')) { 
    const attachmentId = createTempId('offline-attachment');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const optimistic = {
      id: attachmentId,
      filename: file.name,
      path: '',
      size: file.size,
      uploaded: new Date().toISOString(),
      __offline: true,
    };
    addOfflineAttachment(String(id), optimistic);
    return queueMutation({
      id: createTempId('queue'),
      method: 'post',
      url: `/contacts/${id}/attachments`,
      meta: {
        kind: 'uploadAttachment',
        contactId: id,
        attachmentId,
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
      },
    }, optimistic);
  } 
 
  const formData = new FormData(); 
  formData.append('file', file); 
  try { 
    const response = await api.post(`/contacts/${id}/attachments`, formData, { 
      headers: { 'Content-Type': 'multipart/form-data' }, 
    }); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    const attachmentId = createTempId('offline-attachment'); 
    const dataUrl = await new Promise((resolve, reject) => { 
      const reader = new FileReader(); 
      reader.onload = () => resolve(reader.result); 
      reader.onerror = reject; 
      reader.readAsDataURL(file); 
    }); 
    const optimistic = { 
      id: attachmentId, 
      filename: file.name, 
      path: '', 
      size: file.size, 
      uploaded: new Date().toISOString(), 
      __offline: true, 
    }; 
    addOfflineAttachment(String(id), optimistic); 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'post', 
      url: `/contacts/${id}/attachments`, 
      meta: { 
        kind: 'uploadAttachment', 
        contactId: id, 
        attachmentId, 
        fileName: file.name, 
        mimeType: file.type, 
        dataUrl, 
      }, 
    }, optimistic); 
  } 
}; 
 
export const deleteAttachment = async (id, attachmentId) => { 
  if (String(attachmentId).startsWith('offline-attachment') || !navigator.onLine) { 
    removeOfflineAttachment(String(id), attachmentId);
    return queueMutation({
      id: createTempId('queue'),
      method: 'delete',
      url: `/contacts/${id}/attachments/${attachmentId}`,
      meta: { kind: 'deleteAttachment', contactId: id, attachmentId },
    }, { id: attachmentId }); 
  } 
 
  try { 
    const response = await api.delete(`/contacts/${id}/attachments/${attachmentId}`); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'delete', 
      url: `/contacts/${id}/attachments/${attachmentId}`, 
      meta: { kind: 'deleteAttachment', contactId: id, attachmentId }, 
    }, { id: attachmentId }); 
  } 
}; 

export const getAllDrivers = () => getWithOfflineFallback('/driver-details', null, cached => ({
  ...cached,
  data: mergeDriverRows(cached.data || []),
}));

export const getExpiringDrivers = () => getWithOfflineFallback('/driver-details/expiring', null, cached => {
  const merged = mergeDriverRows(cached.data || []);
  return {
    ...cached,
    data: merged.filter(item => item.LicenseExpiryDate && new Date(item.LicenseExpiryDate) <= new Date(Date.now() + (60 * 86400000))),
  };
});

export const getDriverByContact = id => getWithOfflineFallback(`/driver-details/by-contact/${id}`, null, cached => {
  const offline = Object.values(getOfflineDrivers()).find(item => String(item.CallLogsID || item._offlineCallLogsId) === String(id));
  return { ...cached, data: offline || cached.data };
});

export const saveDriver = async data => { 
  if (!navigator.onLine || String(data.CallLogsID).startsWith('offline-contact-')) { 
    const driverKey = String(data.CallLogsID);
    const optimistic = {
      ...data,
      DriverDetailID: createTempId('offline-driver'),
      _offlineCallLogsId: data.CallLogsID,
      __offline: true,
      Updated_At: new Date().toISOString(),
    };
    updateOfflineDriverRecord(driverKey, optimistic);
    return queueMutation({
      id: createTempId('queue'),
      method: 'post',
      url: '/driver-details',
      data,
      meta: { kind: 'saveDriver', driverKey },
    }, optimistic); 
  } 
 
  try { 
    const response = await api.post('/driver-details', data); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    const driverKey = String(data.CallLogsID); 
    const optimistic = { 
      ...data, 
      DriverDetailID: createTempId('offline-driver'), 
      _offlineCallLogsId: data.CallLogsID, 
      __offline: true, 
      Updated_At: new Date().toISOString(), 
    }; 
    updateOfflineDriverRecord(driverKey, optimistic); 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'post', 
      url: '/driver-details', 
      data, 
      meta: { kind: 'saveDriver', driverKey }, 
    }, optimistic); 
  } 
}; 
 
export const updateDriver = async (id, data) => { 
  if (!navigator.onLine) { 
    const driverKey = String(data.CallLogsID || id);
    const optimistic = { ...data, DriverDetailID: id, Updated_At: new Date().toISOString(), __offline: true };
    updateOfflineDriverRecord(driverKey, optimistic);
    return queueMutation({
      id: createTempId('queue'),
      method: 'put',
      url: `/driver-details/${id}`,
      data,
      meta: { kind: 'updateDriver', driverKey },
    }, optimistic); 
  } 
 
  try { 
    const response = await api.put(`/driver-details/${id}`, data); 
    invalidateCache(); 
    return response; 
  } catch (error) { 
    if (!isOfflineFallbackError(error)) throw error; 
    const driverKey = String(data.CallLogsID || id); 
    const optimistic = { ...data, DriverDetailID: id, Updated_At: new Date().toISOString(), __offline: true }; 
    updateOfflineDriverRecord(driverKey, optimistic); 
    return queueMutation({ 
      id: createTempId('queue'), 
      method: 'put', 
      url: `/driver-details/${id}`, 
      data, 
      meta: { kind: 'updateDriver', driverKey }, 
    }, optimistic); 
  } 
}; 

export const getCallLogs = () => getWithOfflineFallback('/call-logs');
export const getActivity = n => getWithOfflineFallback(`/activity`, { limit: n || 40 });
export const getStats = () => getWithOfflineFallback('/stats');
export const loginToSystem = credentials => api.post('/system/login', credentials);
export const getSystemUsers = () => getWithOfflineFallback('/system/users');
export const getActiveSystemUsers = () => getWithOfflineFallback('/system/users/active');
export const getLiveSystemUsers = () => getWithOfflineFallback('/system/users/live');
export const createSystemUser = payload => api.post('/system/users', payload);
export const updateSystemUser = (id, payload) => api.patch(`/system/users/${id}`, payload);
export const resetSystemUserPassword = (id, password) => api.post(`/system/users/${id}/password`, { password });
export const getOwnProfile = () => getWithOfflineFallback('/system/profile');
export const updateOwnProfile = payload => api.patch('/system/profile', payload);
export const changeOwnPassword = payload => api.post('/system/profile/password', payload);
export const getSystemSettings = () => getWithOfflineFallback('/system/settings');
export const updateSystemSettings = payload => api.patch('/system/settings', payload);
export const getSystemBackups = () => getWithOfflineFallback('/system/backups');
export const createSystemBackup = payload => api.post('/system/backups', payload || {});
export const restoreSystemBackup = backupName => api.post('/system/recovery/restore', { backupName });
export const sendSystemHeartbeat = sessionId => api.post('/system/session/heartbeat', { sessionId });
export const logoutSystemSession = sessionId => api.post('/system/session/logout', { sessionId });
export const getSystemStatus = () => getWithOfflineFallback('/system/status');
export const runSystemMaintenance = action => api.post('/system/maintenance', { action });
export const getSystemVersion = () => getWithOfflineFallback('/system/version');
export const syncOfflineChanges = () => flushOfflineQueue();
export const subscribeToSyncState = callback => {
  if (typeof window === 'undefined') return () => {};
  const handler = event => callback(event.detail);
  window.addEventListener(SYNC_EVENT, handler);
  callback(getOfflineSyncState());
  return () => window.removeEventListener(SYNC_EVENT, handler);
};

export default api;
