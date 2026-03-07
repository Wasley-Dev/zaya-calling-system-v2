// src/pages/Reports.js
import React, { useEffect, useState } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { getCallLogs } from '../utils/api';
import { fmtDT, statusClass, stageClass, typeClass, bookingClass, checkClass } from '../utils/helpers';

export default function Reports() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  const load = () => {
    setLoading(true);
    getCallLogs().then(r => setLogs(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => l.Caller_Type === filter);

  function exportCSV() {
    const cols = ['ID','First Name','Last Name','Type','Status','Stage','Booking','Priority','Phone','Email','Address','Country','Docs','DVLA','Police Certificate','TIN Number','Calls','Next Call','Updated'];
    const rows = filtered.map(l => [
      l.ID, l.First_Name, l.Last_Name, l.Caller_Type, l.Status, l.Stage,
      l.Booking||'', l.Priority||'', l.Mobile_Phone, l.E_mail_Address||'',
      (l.Address||'').replace(/,/g,';'), l.Country_Region, l.Documentations||'',
      l.DVLACheck||'', l.DBSCheck||'', l.PCOCheck||'',
      l.Call_Count||0, l.Next_Call_Date||'', l.Updated_At
    ]);
    const csv  = [cols,...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const url  = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a    = Object.assign(document.createElement('a'),{href:url,download:`zaya-logs-${new Date().toISOString().split('T')[0]}.csv`});
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Reports</div>
          <div className="pg-subtitle">{filtered.length} records</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary btn-sm btn-icon" onClick={load}><RefreshCw size={14}/></button>
          <button className="btn btn-primary" onClick={exportCSV}><Download size={14}/> Export CSV</button>
        </div>
      </div>

      <div className="toolbar">
        {['all','DRIVER','MANAGER','ACCOUNTANT','RECEPTIONIST'].map(f => (
          <button key={f} className={`btn btn-sm ${filter===f?'btn-secondary':'btn-ghost'}`} onClick={() => setFilter(f)}>
            {f==='all'?'All':f}
          </button>
        ))}
      </div>

      <div className="content" style={{ paddingTop:0 }}>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {loading ? (
            <div className="page-spin"><div className="spin"/></div>
          ) : filtered.length === 0 ? (
            <div className="empty"><FileText size={36}/><p>No records</p></div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Name</th><th>Type</th><th>Status</th><th>Stage</th>
                    <th>Booking</th><th>DVLA</th><th>Police Certificate</th><th>TIN Number</th>
                    <th>Calls</th><th>Next Call</th><th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.ID}>
                      <td style={{ color:'var(--txt3)', fontSize:11.5 }}>{l.ID}</td>
                      <td>
                        <div style={{ fontWeight:600 }}>{l.First_Name} {l.Last_Name}</div>
                        <div style={{ fontSize:11.5, color:'var(--txt2)' }}>{l.Mobile_Phone}</div>
                      </td>
                      <td><span className={`badge ${typeClass(l.Caller_Type)}`}>{l.Caller_Type}</span></td>
                      <td><span className={`badge ${statusClass(l.Status)}`}>{l.Status||'—'}</span></td>
                      <td><span className={`badge ${stageClass(l.Stage)}`} style={{ fontSize:10.5 }}>{l.Stage||'—'}</span></td>
                      <td>{l.Booking?<span className={`badge ${bookingClass(l.Booking)}`}>{l.Booking}</span>:<span style={{color:'var(--txt3)'}}>—</span>}</td>
                      <td><span className={`badge ${checkClass(l.DVLACheck)}`} style={{ fontSize:10.5 }}>{l.DVLACheck||'—'}</span></td>
                      <td><span className={`badge ${checkClass(l.DBSCheck)}`}  style={{ fontSize:10.5 }}>{l.DBSCheck||'—'}</span></td>
                      <td><span className={`badge ${checkClass(l.PCOCheck)}`}  style={{ fontSize:10.5 }}>{l.PCOCheck||'—'}</span></td>
                      <td style={{ fontSize:12, color:'var(--txt2)', textAlign:'center' }}>{l.Call_Count||0}</td>
                      <td style={{ fontSize:12, color: l.Next_Call_Date && new Date(l.Next_Call_Date)<new Date()?'var(--red)':'var(--txt2)' }}>
                        {l.Next_Call_Date ? new Date(l.Next_Call_Date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td style={{ fontSize:11.5, color:'var(--txt3)', whiteSpace:'nowrap' }}>{fmtDT(l.Updated_At)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
