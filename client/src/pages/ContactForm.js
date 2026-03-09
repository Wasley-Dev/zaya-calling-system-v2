import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Phone, Paperclip, Clock, Plus, Trash2, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getContact, createContact, updateContact, saveDriver, updateDriver, uploadAttachment, deleteAttachment, logCall, deleteCall, getActiveSystemUsers, getStoredAuthUser } from '../utils/api';
import { CALLER_TYPES, STATUS_OPTIONS, STAGE_OPTIONS, BOOKING_OPTIONS, COUNTRIES, LICENSE_CLASSES, VEHICLE_TYPES, CHECK_OPTIONS, CALL_OUTCOMES, PRIORITY_OPTIONS, fmt, fmtDT, fmtAgo, checkClass, outcomeClass, activityColor, initials, parseDocumentItems, getDocumentCoverageGrade, getDocumentGrade, getComplianceStatus, normalizeLicenseNumber, isValidLicenseNumber, normalizeBookingValue } from '../utils/helpers';

const EMPTY_FORM = {
  First_Name:'', Last_Name:'', Job_Title:'', Mobile_Phone:'', E_mail_Address:'',
  Address:'', Country_Region:'Zanzibar', Caller_Type:'DRIVER',
  Status:'Pending', Stage:'1 - New Caller', Booking:'', Documentations:'',
  Remarks:'', Notes:'', Priority:'Normal', Assigned_To:'', Next_Call_Date:'',
};
const EMPTY_DRV = { DriverName:'', LicenseNumber:'', LicenseClass:'', LicenseIssueDate:'', LicenseExpiryDate:'', DVLACheck:'Pending', DBSCheck:'Pending', PCOCheck:'Pending', VehicleType:'', Notes:'' };
const EMPTY_CALL = { Outcome:'Successful', Duration_Min:'', Notes:'', Called_By:'', Next_Action:'', Next_Call_Date:'' };

export default function ContactForm() {
  const { id }  = useParams();
  const isEdit  = Boolean(id);
  const navigate = useNavigate();
  const currentUser = getStoredAuthUser();

  const [form,       setForm]       = useState(EMPTY_FORM);
  const [driver,     setDriver]     = useState(EMPTY_DRV);
  const [drvId,      setDrvId]      = useState(null);
  const [sessions,   setSessions]   = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [attachments,setAttachments]= useState([]);
  const [loading,    setLoading]    = useState(isEdit);
  const [saving,     setSaving]     = useState(false);
  const [tab,        setTab]        = useState('main');
  const [callModal,  setCallModal]  = useState(false);
  const [callForm,   setCallForm]   = useState({ ...EMPTY_CALL, Called_By: currentUser?.name || '' });
  const [loggingCall,setLoggingCall]= useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [systemUsers,setSystemUsers]= useState([]);

  useEffect(() => {
    getActiveSystemUsers()
      .then(response => setSystemUsers(response.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getContact(id).then(r => {
      const c = r.data.data;
      setForm({
        First_Name: c.First_Name||'', Last_Name: c.Last_Name||'',
        Job_Title: c.Job_Title||'', Mobile_Phone: c.Mobile_Phone||'',
        E_mail_Address: c.E_mail_Address||'', Address: c.Address||'',
        Country_Region: c.Country_Region||'Zanzibar',
        Caller_Type: c.Caller_Type||'DRIVER', Status: c.Status||'Pending',
        Stage: c.Stage||'1 - New Caller', Booking: normalizeBookingValue(c.Booking),
        Documentations: c.Documentations||'', Remarks: c.Remarks||'',
        Notes: c.Notes||'', Priority: c.Priority||'Normal',
        Assigned_To: c.Assigned_To||'',
        Next_Call_Date: c.Next_Call_Date||'',
      });
      setSessions(c.sessions || []);
      setActivity(c.activity || []);
      setAttachments(c.attachments || []);
      if (c.DriverDetailID) {
        setDriver({
          DriverName: c.DriverName||'', LicenseNumber: c.LicenseNumber||'',
          LicenseClass: c.LicenseClass||'', LicenseIssueDate: c.LicenseIssueDate||'',
          LicenseExpiryDate: c.LicenseExpiryDate||'', DVLACheck: c.DVLACheck||'Pending',
          DBSCheck: c.DBSCheck||'Pending', PCOCheck: c.PCOCheck||'Pending',
          VehicleType: c.VehicleType||'', Notes: c.DriverNotes||'',
        });
        setDrvId(c.DriverDetailID);
      }
    }).finally(() => setLoading(false));
  }, [id, isEdit]);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const d = k => e => setDriver(p => ({ ...p, [k]: e.target.value }));
  const documentItems = parseDocumentItems(form.Documentations);
  const documentCoverage = getDocumentCoverageGrade(form.Documentations);
  const complianceGrade = getComplianceStatus(form.Documentations, driver);
  const licensePreview = normalizeLicenseNumber(driver.LicenseNumber);

  async function handleSave() {
    if (!form.First_Name.trim()) { toast.error('First name required'); return; }
    if (form.Caller_Type === 'DRIVER') {
      const normalizedLicense = normalizeLicenseNumber(driver.LicenseNumber);
      if (normalizedLicense && !isValidLicenseNumber(normalizedLicense)) {
        toast.error('Licence number must use the format Z- followed by numbers.');
        return;
      }
      if (driver.LicenseClass && !LICENSE_CLASSES.includes(driver.LicenseClass)) {
        toast.error('Select a valid ZARTSA licence class.');
        return;
      }
    }
    setSaving(true);
    try {
      let cid = id;
      const normalizedForm = { ...form, Booking: normalizeBookingValue(form.Booking) };
      if (isEdit) {
        const result = await updateContact(id, normalizedForm);
        toast.success(result?.data?.queued ? 'Contact queued offline' : 'Contact saved');
      }
      else {
        const r = await createContact(normalizedForm);
        cid = r.data.data.ID;
        toast.success(r?.data?.queued ? 'Contact queued offline' : 'Contact created');
      }
      if (form.Caller_Type === 'DRIVER') {
        const payload = {
          ...driver,
          LicenseNumber: normalizeLicenseNumber(driver.LicenseNumber),
          CallLogsID: cid,
        };
        if (!payload.DriverName) payload.DriverName = `${form.First_Name} ${form.Last_Name}`;
        if (drvId) {
          const response = await updateDriver(drvId, payload);
          if (response?.data?.queued) toast.success('Driver details queued offline');
        } else {
          const response = await saveDriver(payload);
          if (response?.data?.queued) toast.success('Driver details queued offline');
        }
      }
      navigate('/contacts');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleLogCall() {
    if (!id) return;
    setLoggingCall(true);
    try {
      const response = await logCall(id, callForm);
      toast.success(response?.data?.queued ? 'Call queued offline' : 'Call logged');
      // Reload
      const r = await getContact(id);
      setSessions(r.data.data.sessions || []);
      setActivity(r.data.data.activity || []);
      if (callForm.Next_Call_Date) setForm(p => ({ ...p, Next_Call_Date: callForm.Next_Call_Date }));
      setCallModal(false);
      setCallForm({ ...EMPTY_CALL, Called_By: currentUser?.name || '' });
    } catch { toast.error('Failed to log call'); }
    finally { setLoggingCall(false); }
  }

  async function handleDeleteSession(sid) {
    if (!id) return;
    try {
      await deleteCall(id, sid);
      setSessions(prev => prev.filter(s => s.SessionID !== sid));
      toast.success('Session removed');
    } catch { toast.error('Failed'); }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const r = await uploadAttachment(id, file);
      setAttachments(prev => [...prev, r.data.data]);
      toast.success(r?.data?.queued ? 'File queued offline' : 'File uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function handleDeleteAttachment(attId) {
    if (!id) return;
    try {
      await deleteAttachment(id, attId);
      setAttachments(prev => prev.filter(a => a.id !== attId));
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  }

  const licExpired  = driver.LicenseExpiryDate && new Date(driver.LicenseExpiryDate) < new Date();
  const licExpiring = driver.LicenseExpiryDate && !licExpired && (new Date(driver.LicenseExpiryDate) - new Date()) / 86400000 < 60;
  const tabs = [
    { key:'main',        label:'Contact Info' },
    { key:'driver',      label:'Driver & Licence', show: form.Caller_Type==='DRIVER' },
    { key:'calls',       label:`Calls (${sessions.length})` },
    { key:'files',       label:`Files (${attachments.length})`,  show: isEdit },
    { key:'activity',    label:'Activity', show: isEdit },
  ].filter(t => t.show !== false);

  if (loading) return <div className="page-spin"><div className="spin" /></div>;

  return (
    <div>
      <div className="pg-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-secondary btn-icon" onClick={() => navigate(-1)}><ArrowLeft size={15}/></button>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {isEdit && <div className="avatar" style={{ width:38,height:38,fontSize:14 }}>{initials(form.First_Name,form.Last_Name)}</div>}
            <div>
              <div className="pg-title">{isEdit ? `${form.First_Name} ${form.Last_Name}` : 'New Contact'}</div>
              <div className="pg-subtitle">{isEdit ? form.Job_Title || form.Caller_Type : 'Fill in the details below'}</div>
            </div>
          </div>
        </div>
        <div className="pg-actions">
          {isEdit && (
            <button className="btn btn-success btn-sm" onClick={() => setCallModal(true)}>
              <Phone size={13}/> Log Call
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={13}/> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.key} className={`tab-btn${tab===t.key?' on':''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* ── CONTACT INFO ───────────────────────────────────────── */}
        {tab==='main' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            <div className="card">
              <div className="card-title">Personal Information</div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">First Name *</label><input className="form-input" value={form.First_Name} onChange={f('First_Name')} placeholder="First name"/></div>
                <div className="form-group"><label className="form-label">Last Name</label><input className="form-input" value={form.Last_Name} onChange={f('Last_Name')} placeholder="Last name"/></div>
              </div>
              <div className="form-group"><label className="form-label">Job Title</label><input className="form-input" value={form.Job_Title} onChange={f('Job_Title')} placeholder="e.g. Driver, Manager"/></div>
              <div className="form-group"><label className="form-label">Mobile Phone</label><input className="form-input" value={form.Mobile_Phone} onChange={f('Mobile_Phone')} placeholder="+44 7700 000000"/></div>
              <div className="form-group"><label className="form-label">Email Address</label><input className="form-input" type="email" value={form.E_mail_Address} onChange={f('E_mail_Address')} placeholder="name@email.com"/></div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={form.Address} onChange={f('Address')} placeholder="Street address, city"/></div>
              <div className="form-group"><label className="form-label">Country</label>
                <select className="form-input" value={form.Country_Region} onChange={f('Country_Region')}>
                  {COUNTRIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Classification & Status</div>
              <div className="form-group"><label className="form-label">Caller Type</label>
                <select className="form-input" value={form.Caller_Type} onChange={f('Caller_Type')}>
                  {CALLER_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Status</label>
                  <select className="form-input" value={form.Status} onChange={f('Status')}>
                    {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Priority</label>
                  <select className="form-input" value={form.Priority} onChange={f('Priority')}>
                    {PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Stage</label>
                <select className="form-input" value={form.Stage} onChange={f('Stage')}>
                  {STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Booking</label>
                  <select className="form-input" value={form.Booking} onChange={f('Booking')}>
                    <option value="">— None —</option>
                    {BOOKING_OPTIONS.map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Assigned To</label>
                  <select className="form-input" value={form.Assigned_To} onChange={f('Assigned_To')}>
                    <option value="">Unassigned</option>
                    {systemUsers.map(name => <option key={name}>{name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Next Call Date</label>
                <input className="form-input" type="date" value={form.Next_Call_Date} onChange={f('Next_Call_Date')}/>
              </div>
              <div className="form-group"><label className="form-label">Documentations</label>
                <input className="form-input" value={form.Documentations} onChange={f('Documentations')} placeholder="TIN Number, Updated CV, Certificates, ID cards, NIDA, Zanzibar ID, PSV Drivers License, Police Certificate…"/>
              </div>
              <div className="document-grade-card">
                <div className="document-grade-head">
                  <span className="form-label" style={{ margin: 0 }}>Document Grade</span>
                  <span className={`badge ${documentCoverage.tone}`}>
                    <span className={documentCoverage.dot} />
                    {documentCoverage.label}
                  </span>
                </div>
                {documentItems.length ? (
                  <div className="document-chip-grid">
                    {documentItems.map(item => {
                      const grade = getDocumentGrade(item);
                      return (
                        <div key={item} className="document-chip">
                          <span>{item}</span>
                          <span className={`badge ${grade.tone}`}>{grade.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="form-hint">Required pack: TIN Number, Updated CV, Certificates, ID cards, NIDA, Zanzibar ID, PSV Drivers License, Police Certificate.</div>
                )}
              </div>
              <div className="document-grade-card">
                <div className="document-grade-head">
                  <span className="form-label" style={{ margin: 0 }}>Compliance Grade</span>
                  <span className={`badge ${complianceGrade.tone}`}>
                    <span className={complianceGrade.dot} />
                    {complianceGrade.label}
                  </span>
                </div>
                <div className="form-hint">
                  Compliance complete means documentation and checks are finished. In progress means some items are still pending. Missing means no documentation has been captured yet.
                </div>
              </div>
              <div className="form-group"><label className="form-label">Remarks</label>
                <textarea className="form-input" value={form.Remarks} onChange={f('Remarks')} placeholder="Latest remark…"/>
              </div>
              <div className="form-group"><label className="form-label">Internal Notes</label>
                <textarea className="form-input" value={form.Notes} onChange={f('Notes')} placeholder="Private notes…" style={{ minHeight:60 }}/>
              </div>
            </div>
          </div>
        )}

        {/* ── DRIVER & LICENCE ───────────────────────────────────── */}
        {tab==='driver' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
            <div className="card">
              <div className="card-title">Licence Details</div>
              <div className="form-group"><label className="form-label">Driver Full Name</label>
                <input className="form-input" value={driver.DriverName} onChange={d('DriverName')} placeholder="As on licence"/>
              </div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Licence Number</label>
                  <input
                    className="form-input"
                    value={driver.LicenseNumber}
                    onChange={e => setDriver(p => ({ ...p, LicenseNumber: normalizeLicenseNumber(e.target.value) }))}
                    placeholder="e.g. Z-123456789"
                  />
                  <div className="form-hint">Required format: Z- followed by numbers only.</div>
                  {driver.LicenseNumber && !isValidLicenseNumber(driver.LicenseNumber) ? (
                    <div className="alert alert-error" style={{ marginTop: 8 }}>
                      <AlertCircle size={14}/> Invalid licence format. Use {`Z-123456789`}.
                    </div>
                  ) : null}
                  {licensePreview ? <div className="form-hint">Stored as: {licensePreview}</div> : null}
                </div>
                <div className="form-group"><label className="form-label">Licence Class</label>
                  <select className="form-input" value={driver.LicenseClass} onChange={d('LicenseClass')}>
                    <option value="">Select…</option>
                    {LICENSE_CLASSES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Issue Date</label>
                  <input className="form-input" type="date" value={driver.LicenseIssueDate} onChange={d('LicenseIssueDate')}/>
                </div>
                <div className="form-group"><label className="form-label">Expiry Date</label>
                  <input className="form-input" type="date" value={driver.LicenseExpiryDate} onChange={d('LicenseExpiryDate')}/>
                </div>
              </div>
              {licExpired  && <div className="alert alert-error" style={{ marginTop:0 }}><AlertCircle size={14}/> Licence has expired!</div>}
              {licExpiring && <div className="alert alert-warn"  style={{ marginTop:0 }}><AlertCircle size={14}/> Licence expires within 60 days</div>}
              <div className="form-group"><label className="form-label">Vehicle Type</label>
                <select className="form-input" value={driver.VehicleType} onChange={d('VehicleType')}>
                  <option value="">Select…</option>
                  {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Notes</label>
                <textarea className="form-input" value={driver.Notes} onChange={d('Notes')} placeholder="Driver-specific notes…" style={{ minHeight:60 }}/>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Compliance Checks</div>
              {[
                { key:'DVLACheck', label:'DVLA Check' },
                { key:'DBSCheck',  label:'Police Certificate' },
                { key:'PCOCheck',  label:'TIN Number' },
              ].map(row => (
                <div key={row.key} className="check-row">
                  <div>
                    <div className="check-label">{row.label}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span className={`badge ${checkClass(driver[row.key])}`}>{driver[row.key]}</span>
                    <select className="filter-sel" value={driver[row.key]} onChange={d(row.key)} style={{ fontSize:12 }}>
                      {CHECK_OPTIONS.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div style={{ padding:'8px 0' }}>
                <div style={{ fontSize:12.5, color:'var(--txt2)', marginBottom:10 }}>Quick set all checks:</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-success btn-sm" onClick={() => setDriver(p=>({...p,DVLACheck:'Approved',DBSCheck:'Approved',PCOCheck:'Approved'}))}>
                    <CheckCircle size={12}/> All Approved
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDriver(p=>({...p,DVLACheck:'Pending',DBSCheck:'Pending',PCOCheck:'Pending'}))}>
                    <XCircle size={12}/> Reset All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CALL SESSIONS ──────────────────────────────────────── */}
        {tab==='calls' && (
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div className="card-title" style={{ margin:0 }}>Call Sessions ({sessions.length})</div>
              {isEdit && (
                <button className="btn btn-primary btn-sm" onClick={() => setCallModal(true)}>
                  <Plus size={13}/> Log Call
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="empty"><Phone size={32}/><p>No calls logged yet</p></div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Outcome</th><th>Duration</th><th>Notes</th><th>By</th><th>Next Action</th><th></th></tr></thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.SessionID}>
                        <td style={{ whiteSpace:'nowrap', fontSize:12, color:'var(--txt2)' }}>{fmtDT(s.Called_At)}</td>
                        <td><span className={`badge ${outcomeClass(s.Outcome)}`}>{s.Outcome}</span></td>
                        <td style={{ fontSize:12, color:'var(--txt2)' }}>{s.Duration_Min ? `${s.Duration_Min} min` : '—'}</td>
                        <td style={{ fontSize:12.5, maxWidth:200 }}>{s.Notes||'—'}</td>
                        <td style={{ fontSize:12, color:'var(--txt2)' }}>{s.Called_By||'—'}</td>
                        <td style={{ fontSize:12, color:'var(--txt2)' }}>{s.Next_Action||'—'}</td>
                        <td>
                          <button className="btn btn-danger btn-icon btn-xs" onClick={() => handleDeleteSession(s.SessionID)}><Trash2 size={11}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ATTACHMENTS ────────────────────────────────────────── */}
        {tab==='files' && (
          <div className="card" style={{ maxWidth:700 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div className="card-title" style={{ margin:0 }}>Attachments</div>
              <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer' }}>
                <Paperclip size={13}/> {uploading?'Uploading…':'Upload File'}
                <input type="file" style={{ display:'none' }} onChange={handleUpload} />
              </label>
            </div>
            {attachments.length === 0 ? (
              <div className="empty" style={{ padding:'32px 0' }}><Paperclip size={32}/><p>No files attached</p></div>
            ) : attachments.map(att => (
              <div key={att.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <Paperclip size={15} color="var(--txt3)"/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{att.filename}</div>
                  <div style={{ fontSize:11.5, color:'var(--txt3)' }}>{att.size ? `${(att.size/1024).toFixed(1)} KB · ` : ''}{fmtAgo(att.uploaded)}</div>
                </div>
                <a href={`/uploads/${att.path}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Download</a>
                <button className="btn btn-danger btn-icon btn-xs" onClick={() => handleDeleteAttachment(att.id)}><Trash2 size={11}/></button>
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVITY TIMELINE ──────────────────────────────────── */}
        {tab==='activity' && (
          <div className="card" style={{ maxWidth:700 }}>
            <div className="card-title">Activity Timeline</div>
            {activity.length === 0 ? (
              <div className="empty" style={{ padding:'32px 0' }}><Clock size={32}/><p>No activity yet</p></div>
            ) : activity.map(a => {
              const col = activityColor(a.Action);
              return (
                <div key={a.ActivityID} className="activity-item">
                  <div className="activity-dot" style={{ background:col.bg }}><Clock size={13} color={col.color}/></div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{a.Action}</div>
                    {a.Detail && <div style={{ fontSize:12.5, color:'var(--txt2)' }}>{a.Detail}</div>}
                    <div style={{ fontSize:11, color:'var(--txt3)', marginTop:3 }}>{fmtDT(a.Created_At)} · {a.Created_By}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── LOG CALL MODAL ─────────────────────────────────────── */}
      {callModal && (
        <div className="overlay" onClick={() => setCallModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div className="modal-ttl">Log Call — {form.First_Name} {form.Last_Name}</div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCallModal(false)}><X size={16}/></button>
            </div>
            <div className="modal-bd">
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Outcome *</label>
                  <select className="form-input" value={callForm.Outcome} onChange={e => setCallForm(p=>({...p,Outcome:e.target.value}))}>
                    {CALL_OUTCOMES.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Duration (mins)</label>
                  <input className="form-input" type="number" min="0" value={callForm.Duration_Min} onChange={e => setCallForm(p=>({...p,Duration_Min:e.target.value}))} placeholder="0"/>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Call Notes</label>
                <textarea className="form-input" value={callForm.Notes} onChange={e => setCallForm(p=>({...p,Notes:e.target.value}))} placeholder="What was discussed?" style={{ minHeight:80 }}/>
              </div>
              <div className="form-row cols-2">
                <div className="form-group"><label className="form-label">Called By</label>
                  <select className="form-input" value={callForm.Called_By} onChange={e => setCallForm(p=>({...p,Called_By:e.target.value}))}>
                    <option value="">Select…</option>
                    {systemUsers.map(name => <option key={name}>{name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Next Call Date</label>
                  <input className="form-input" type="date" value={callForm.Next_Call_Date} onChange={e => setCallForm(p=>({...p,Next_Call_Date:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Next Action</label>
                <input className="form-input" value={callForm.Next_Action} onChange={e => setCallForm(p=>({...p,Next_Action:e.target.value}))} placeholder="e.g. Send training docs, Book interview…"/>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-secondary" onClick={() => setCallModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLogCall} disabled={loggingCall}>
                <Phone size={13}/> {loggingCall?'Saving…':'Log Call'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
