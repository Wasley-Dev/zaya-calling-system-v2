import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Trash2, Edit2, Phone, Mail, MoreHorizontal, RefreshCw, List, Columns } from 'lucide-react';
import toast from 'react-hot-toast';
import { getContacts, deleteContact, quickUpdate } from '../utils/api';
import { statusClass, stageClass, typeClass, bookingClass, fmtAgo, initials, CALLER_TYPES, STATUS_OPTIONS, STAGE_OPTIONS, BOOKING_OPTIONS, PRIORITY_OPTIONS, getComplianceStatus, getCallbackStatus } from '../utils/helpers';

function QuickSelect({ value, options, onSave, colorFn }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span className={`badge ${colorFn(value)}`} style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {value || '—'}
      </span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 4, minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {options.map(opt => (
            <div key={opt} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 12.5, fontWeight: 500 }}
              onClick={() => { onSave(opt); setOpen(false); }}
              onMouseEnter={e => e.target.style.background = 'var(--bg4)'}
              onMouseLeave={e => e.target.style.background = ''}
            >{opt}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContactList() {
  const navigate      = useNavigate();
  const [sp, setSp]   = useSearchParams();
  const [contacts,    setContacts]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [search,      setSearch]     = useState(sp.get('search') || '');
  const [fStatus,     setFStatus]    = useState('');
  const [fType,       setFType]      = useState(sp.get('caller_type') || '');
  const [fStage,      setFStage]     = useState('');
  const [fPriority,   setFPriority]  = useState('');
  const [deleteId,    setDeleteId]   = useState(null);
  const [deleting,    setDeleting]   = useState(false);
  const [view,        setView]       = useState('table'); // table | kanban
  const overdue = sp.get('overdue') === 'true';

  useEffect(() => {
    setSearch(sp.get('search') || '');
    setFType(sp.get('caller_type') || '');
  }, [sp]);

  const load = useCallback(() => {
    setLoading(true);
    const p = {};
    if (search)    p.search      = search;
    if (fStatus)   p.status      = fStatus;
    if (fType)     p.caller_type = fType;
    if (fStage)    p.stage       = fStage;
    if (fPriority) p.priority    = fPriority;
    if (overdue)   p.overdue     = 'true';
    getContacts(p).then(r => setContacts(r.data.data)).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [search, fStatus, fType, fStage, fPriority, overdue]);

  useEffect(() => { load(); }, [load]);

  async function handleQuick(id, field, value) {
    try {
      await quickUpdate(id, { [field]: value });
      setContacts(prev => prev.map(c => c.ID === id ? { ...c, [field]: value } : c));
      toast.success('Updated');
    } catch { toast.error('Update failed'); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await deleteContact(deleteId); toast.success('Deleted'); setDeleteId(null); load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  }

  function syncFiltersToUrl(nextState = {}) {
    const nextParams = new URLSearchParams();
    const nextSearch = (nextState.search ?? search).trim();
    const nextType = nextState.fType ?? fType;
    const nextStatus = nextState.fStatus ?? fStatus;
    const nextStage = nextState.fStage ?? fStage;
    const nextPriority = nextState.fPriority ?? fPriority;

    if (nextSearch) nextParams.set('search', nextSearch);
    if (nextType) nextParams.set('caller_type', nextType);
    if (nextStatus) nextParams.set('status', nextStatus);
    if (nextStage) nextParams.set('stage', nextStage);
    if (nextPriority) nextParams.set('priority', nextPriority);
    if (overdue) nextParams.set('overdue', 'true');
    setSp(nextParams);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    syncFiltersToUrl();
    load();
  }

  const clearFilters = () => {
    setSearch('');
    setFStatus('');
    setFType('');
    setFStage('');
    setFPriority('');
    const nextParams = new URLSearchParams();
    if (overdue) nextParams.set('overdue', 'true');
    setSp(nextParams);
  };
  const hasFilters   = search || fStatus || fType || fStage || fPriority;

  // Kanban grouping
  const stages = ['1 - New Caller','2 - Training','1 - Interview','3 - Booked','2 - Pending'];

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">{overdue ? 'Overdue Follow-ups' : 'Contacts'}</div>
          <div className="pg-subtitle">{contacts.length} record{contacts.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary btn-sm btn-icon" title="Refresh" onClick={load}><RefreshCw size={14} /></button>
          <button className={`btn btn-sm ${view==='table'?'btn-secondary':'btn-ghost'}`} onClick={() => setView('table')}><List size={14}/> Table</button>
          <button className={`btn btn-sm ${view==='kanban'?'btn-secondary':'btn-ghost'}`} onClick={() => setView('kanban')}><Columns size={14}/> Kanban</button>
          <button className="btn btn-primary" onClick={() => navigate('/contacts/new')}><Plus size={14} /> New Contact</button>
        </div>
      </div>

      <div className="toolbar">
        <form className="search-wrap" onSubmit={handleSearchSubmit}>
          <Search size={14} color="var(--txt3)" />
          <input placeholder="Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
        </form>
        <select className="filter-sel" value={fType}     onChange={e => { setFType(e.target.value); syncFiltersToUrl({ fType: e.target.value }); }}>
          <option value="">All Types</option>{CALLER_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select className="filter-sel" value={fStatus}   onChange={e => { setFStatus(e.target.value); syncFiltersToUrl({ fStatus: e.target.value }); }}>
          <option value="">All Statuses</option>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
        </select>
        <select className="filter-sel" value={fStage}    onChange={e => { setFStage(e.target.value); syncFiltersToUrl({ fStage: e.target.value }); }}>
          <option value="">All Stages</option>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}
        </select>
        <select className="filter-sel" value={fPriority} onChange={e => { setFPriority(e.target.value); syncFiltersToUrl({ fPriority: e.target.value }); }}>
          <option value="">All Priorities</option>{PRIORITY_OPTIONS.map(p=><option key={p}>{p}</option>)}
        </select>
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear</button>}
      </div>

      <div className="content" style={{ paddingTop: 0 }}>
        {loading ? (
          <div className="page-spin"><div className="spin" /></div>
        ) : contacts.length === 0 ? (
          <div className="card"><div className="empty"><Search size={36} /><p>No contacts found</p></div></div>
        ) : view === 'kanban' ? (
          // ── KANBAN VIEW ──────────────────────────────────────────
          <div className="pipeline" style={{ paddingBottom: 16 }}>
            {stages.map(stage => {
              const cols = contacts.filter(c => c.Stage === stage);
              return (
                <div key={stage} className="pipe-col" style={{ minWidth: 240, maxWidth: 240 }}>
                  <div className="pipe-head">
                    <span className={`badge ${stageClass(stage)}`} style={{ fontSize: 11 }}>{stage.replace(/^\d+ - /,'')}</span>
                    <span className="pipe-count">{cols.length}</span>
                  </div>
                  <div className="pipe-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
                    {cols.map(c => (
                      <div key={c.ID} className="pipe-card" onClick={() => navigate(`/contacts/${c.ID}/edit`)}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div className="avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>{initials(c.First_Name,c.Last_Name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.First_Name} {c.Last_Name}</div>
                            <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{c.Mobile_Phone}</div>
                          </div>
                          {c.Priority === 'High' && <span className="prio-dot prio-high" style={{ marginTop: 5 }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                          <span className={`badge ${typeClass(c.Caller_Type)}`} style={{ fontSize: 10 }}>{c.Caller_Type}</span>
                          <span className={`badge ${statusClass(c.Status)}`}  style={{ fontSize: 10 }}>{c.Status}</span>
                          <span className={`badge ${getComplianceStatus(c.Documentations, c).tone}`} style={{ fontSize: 10 }}>
                            <span className={getComplianceStatus(c.Documentations, c).dot} />
                            {getComplianceStatus(c.Documentations, c).label}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 5 }}>Updated {fmtAgo(c.Updated_At)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // ── TABLE VIEW ───────────────────────────────────────────
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Phone / Email</th>
                    <th>Status</th>
                    <th>Stage</th>
                    <th>Booking</th>
                    <th>Priority</th>
                    <th>Callback</th>
                    <th>Compliance</th>
                    <th>Calls</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.ID} className="clickable" onClick={() => navigate(`/contacts/${c.ID}/edit`)}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div className="avatar">{initials(c.First_Name,c.Last_Name)}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{c.First_Name} {c.Last_Name}</div>
                            {c.Job_Title && <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{c.Job_Title}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${typeClass(c.Caller_Type)}`}>{c.Caller_Type}</span></td>
                      <td>
                        {c.Mobile_Phone && <div style={{ display:'flex',gap:5,alignItems:'center',color:'var(--txt2)',fontSize:12 }}><Phone size={11}/>{c.Mobile_Phone}</div>}
                        {c.E_mail_Address && <div style={{ display:'flex',gap:5,alignItems:'center',color:'var(--txt2)',fontSize:12,marginTop:2 }}><Mail size={11}/>{c.E_mail_Address}</div>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <QuickSelect value={c.Status} options={STATUS_OPTIONS} colorFn={statusClass}
                          onSave={v => handleQuick(c.ID,'Status',v)} />
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <QuickSelect value={c.Stage} options={STAGE_OPTIONS} colorFn={stageClass}
                          onSave={v => handleQuick(c.ID,'Stage',v)} />
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <QuickSelect value={c.Booking||'—'} options={[...BOOKING_OPTIONS,'—']} colorFn={bookingClass}
                          onSave={v => handleQuick(c.ID,'Booking',v==='—'?'':v)} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span className={`prio-dot ${c.Priority==='High'?'prio-high':c.Priority==='Low'?'prio-low':'prio-normal'}`} />
                          <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{c.Priority||'Normal'}</span>
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const callback = getCallbackStatus(c.Booking, c.Next_Call_Date);
                          return (
                            <span className={`badge ${callback.tone}`}>
                              <span className={callback.dot} />
                              {callback.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const compliance = getComplianceStatus(c.Documentations, c);
                          return (
                            <span className={`badge ${compliance.tone}`}>
                              <span className={compliance.dot} />
                              {compliance.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{c.Call_Count || 0}</td>
                      <td style={{ fontSize: 12, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{fmtAgo(c.Updated_At)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-secondary btn-icon btn-xs" onClick={() => navigate(`/contacts/${c.ID}/edit`)}><Edit2 size={12}/></button>
                          <button className="btn btn-danger btn-icon btn-xs" onClick={() => setDeleteId(c.ID)}><Trash2 size={12}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete modal */}
      {deleteId && (
        <div className="overlay" onClick={() => setDeleteId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><div className="modal-ttl">Delete Contact</div></div>
            <div className="modal-bd">
              <p style={{ color: 'var(--txt2)', fontSize: 13 }}>This will permanently delete the contact and all associated driver details, call sessions, and activity history.</p>
            </div>
            <div className="modal-ft">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting?'Deleting…':'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
