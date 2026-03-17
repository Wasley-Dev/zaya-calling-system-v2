import { format, parseISO, formatDistanceToNow } from 'date-fns';

export const fmt = s => { try { return s ? format(parseISO(s), 'dd MMM yyyy') : '-'; } catch { return s || '-'; } };
export const fmtDT = s => { try { return s ? format(parseISO(s), 'dd MMM yyyy, HH:mm') : '-'; } catch { return s || '-'; } };
export const fmtAgo = s => { try { return s ? formatDistanceToNow(parseISO(s), { addSuffix: true }) : '-'; } catch { return s || '-'; } };
export const initials = (f, l) => `${(f || '?')[0]}${(l || '')[0] || ''}`.toUpperCase();

export const CALLER_TYPES = ['DRIVER', 'MANAGER', 'ACCOUNTANT', 'RECEPTIONIST', 'OTHER'];
export const STATUS_OPTIONS = ['Approved', 'Pending'];
export const STAGE_OPTIONS = ['1 - New Caller', '2 - Training', '1 - Interview', '2 - Pending', '3 - Booked'];
export const BOOKING_OPTIONS = ['1 - New Caller', '2 - Callbacks'];
export const PRIORITY_OPTIONS = ['High', 'Normal', 'Low'];
export const COUNTRIES = ['Tanzania Mainland', 'Zanzibar', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Democratic Republic of the Congo', 'Malawi', 'Mozambique', 'South Africa', 'Nigeria', 'Ghana', 'Other'];
// Classes commonly used across Zanzibar and Tanzania Mainland licensing.
export const LICENSE_CLASSES = ['M', 'A', 'B1', 'B', 'C1', 'C', 'D1', 'D', 'E', 'G'];
export const VEHICLE_TYPES = ['Car', 'Civil Bus', 'HGV', 'Minibus', 'Motorcycle', 'Other', 'School Bus', 'Van'];
export const CHECK_OPTIONS = ['Pending', 'Approved', 'Rejected', 'Not Required'];
export const CALL_OUTCOMES = ['Successful', 'No Answer', 'Callback Requested', 'Voicemail Left', 'Wrong Number', 'Not Interested'];
export const ASSIGNEES = ['Sarah', 'Mike', 'James', 'Lisa', ''];

const REQUIRED_DOCUMENTS = [
  { key: 'tin number', patterns: ['tin number', 'tin'] },
  { key: 'updated cv', patterns: ['updated cv', 'cv'] },
  { key: 'certificates', patterns: ['certificates', 'certificate'] },
  { key: 'id cards', patterns: ['id cards', 'id card'] },
  { key: 'nida', patterns: ['nida'] },
  { key: 'zanzibar id', patterns: ['zanzibar id'] },
  { key: 'psv drivers license', patterns: ['psv drivers license', 'psv driver license', 'psv drivers licence', 'psv driver licence'] },
  { key: 'police certificate', patterns: ['police certificate'] },
];

export function normalizeLicenseNumber(value) {
  const trimmed = (value || '').toUpperCase().replace(/\s+/g, '');
  if (!trimmed) return '';
  const normalized = trimmed.startsWith('Z-')
    ? trimmed
    : trimmed.startsWith('Z')
      ? `Z-${trimmed.slice(1)}`
      : `Z-${trimmed.replace(/[^0-9]/g, '') || trimmed}`;
  return normalized.replace(/[^A-Z0-9-]/g, '');
}

export function isValidLicenseNumber(value) {
  return /^Z-\d+$/.test(normalizeLicenseNumber(value));
}

export function normalizeBookingValue(value) {
  if (value === '1 - Green') return '1 - New Caller';
  return value || '';
}

export function parseDocumentItems(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function hasDocumentKeyword(items, patterns) {
  return items.some(item => {
    const lower = item.toLowerCase();
    return patterns.some(pattern => lower.includes(pattern));
  });
}

export function getDocumentGrade(label) {
  const value = (label || '').toLowerCase();
  if (!value) return { tone: 'b-red', label: 'Missing' };
  if (/(tin number|cv|certificate|id card|nida|zanzibar id|psv drivers licen[cs]e|police certificate)/.test(value)) {
    return { tone: 'b-green', label: 'Core document' };
  }
  if (/(reference|utility|bank|photo)/.test(value)) {
    return { tone: 'b-orange', label: 'Supporting only' };
  }
  return { tone: 'b-orange', label: 'Review needed' };
}

export function getDocumentCoverageGrade(value) {
  const items = parseDocumentItems(value);
  if (!items.length) return { tone: 'b-red', label: 'No documentation', dot: 'compliance-dot red' };

  const matchedCount = REQUIRED_DOCUMENTS.filter(doc => hasDocumentKeyword(items, doc.patterns)).length;
  if (matchedCount === REQUIRED_DOCUMENTS.length) {
    return { tone: 'b-green', label: 'Complete documentation', dot: 'compliance-dot green' };
  }

  return { tone: 'b-orange', label: 'Incomplete documentation', dot: 'compliance-dot amber' };
}

export function getComplianceStatus(documents, checks = {}) {
  const docGrade = getDocumentCoverageGrade(documents);
  const checkValues = [checks.DVLACheck, checks.DBSCheck, checks.PCOCheck].filter(Boolean);
  const approvedCount = checkValues.filter(value => value === 'Approved').length;
  const allApproved = checkValues.length > 0 && approvedCount === checkValues.length;

  if (docGrade.tone === 'b-red') {
    return { tone: 'b-red', label: 'No documentation', dot: 'compliance-dot red' };
  }

  if (docGrade.tone === 'b-green' && allApproved) {
    return { tone: 'b-green', label: 'Compliance complete', dot: 'compliance-dot green' };
  }

  return { tone: 'b-orange', label: 'Compliance in progress', dot: 'compliance-dot amber' };
}

export function getCallbackStatus(booking, nextCallDate) {
  if (normalizeBookingValue(booking) !== '2 - Callbacks') {
    return { tone: 'b-muted', label: 'No callback', dot: 'compliance-dot neutral' };
  }
  if (!nextCallDate) {
    return { tone: 'b-orange', label: 'Callback pending', dot: 'compliance-dot amber' };
  }
  const target = new Date(nextCallDate);
  const today = new Date();
  if (target < new Date(today.toDateString())) {
    return { tone: 'b-red', label: 'Callback overdue', dot: 'compliance-dot red' };
  }
  return { tone: 'b-blue', label: 'Callback scheduled', dot: 'compliance-dot blue' };
}

export function statusClass(s) {
  if (!s) return 'b-muted';
  if (s.includes('Approved')) return 'b-green';
  if (s.includes('Pending')) return 'b-orange';
  if (s.includes('Callbacks')) return 'b-blue';
  return 'b-muted';
}

export function stageClass(s) {
  if (!s) return 'b-muted';
  if (s.includes('New')) return 'b-blue';
  if (s.includes('Training')) return 'b-purple';
  if (s.includes('Interview')) return 'b-gold';
  if (s.includes('Pending')) return 'b-orange';
  if (s.includes('Booked')) return 'b-green';
  return 'b-muted';
}

export function typeClass(t) {
  switch ((t || '').toUpperCase()) {
    case 'DRIVER': return 'b-green';
    case 'MANAGER': return 'b-blue';
    case 'ACCOUNTANT': return 'b-purple';
    case 'RECEPTIONIST': return 'b-teal';
    default: return 'b-muted';
  }
}

export function bookingClass(b) {
  const value = normalizeBookingValue(b);
  if (!value) return 'b-muted';
  if (value.includes('New Caller')) return 'b-blue';
  if (value.includes('Callbacks')) return 'b-blue';
  return 'b-muted';
}

export function checkClass(c) {
  if (c === 'Approved') return 'b-green';
  if (c === 'Rejected') return 'b-red';
  if (c === 'Not Required') return 'b-muted';
  return 'b-orange';
}

export function outcomeClass(o) {
  if (o === 'Successful') return 'b-green';
  if (o === 'No Answer') return 'b-orange';
  if (o === 'Callback Requested') return 'b-blue';
  if (o === 'Not Interested') return 'b-red';
  return 'b-muted';
}

export function priorityClass(p) {
  if (p === 'High') return 'prio-high';
  if (p === 'Low') return 'prio-low';
  return 'prio-normal';
}

export function activityColor(action) {
  if (action.includes('Created')) return { bg: 'var(--green-bg)', color: 'var(--green)' };
  if (action.includes('Status')) return { bg: 'var(--blue-bg)', color: 'var(--blue)' };
  if (action.includes('Stage')) return { bg: 'var(--purple-bg)', color: 'var(--purple)' };
  if (action.includes('Call')) return { bg: 'var(--teal-bg)', color: 'var(--teal)' };
  if (action.includes('File')) return { bg: 'var(--accent-bg)', color: 'var(--accent)' };
  if (action.includes('Booking')) return { bg: 'var(--green-bg)', color: 'var(--green)' };
  if (action.includes('Compliance')) return { bg: 'var(--orange-bg)', color: 'var(--orange)' };
  return { bg: 'var(--bg4)', color: 'var(--txt2)' };
}
