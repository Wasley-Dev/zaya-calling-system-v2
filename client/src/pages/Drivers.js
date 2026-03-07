import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, AlertTriangle, CheckCircle, Search, Filter } from 'lucide-react';
import { getAllDrivers, getExpiringDrivers } from '../utils/api';
import { fmt, statusClass, stageClass, checkClass, getComplianceStatus, getCallbackStatus } from '../utils/helpers';

export default function Drivers() {
  const navigate = useNavigate();
  const [drivers,   setDrivers]   = useState([]);
  const [expiring,  setExpiring]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [fCheck,    setFCheck]    = useState('');
  const [tab,       setTab]       = useState('all');
  const today = new Date();

  useEffect(() => {
    Promise.all([getAllDrivers(), getExpiringDrivers()]).then(([dr, er]) => {
      setDrivers(dr.data.data);
      setExpiring(er.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !search || `${d.First_Name} ${d.Last_Name} ${d.LicenseNumber} ${d.Mobile_Phone}`.toLowerCase().includes(q);
    const matchCheck  = !fCheck || d.DVLACheck === fCheck || d.DBSCheck === fCheck || d.PCOCheck === fCheck;
    return matchSearch && matchCheck;
  });

  const expired   = drivers.filter(d => d.LicenseExpiryDate && new Date(d.LicenseExpiryDate) < today);
  const expiredIds = new Set(expired.map(d => d.DriverDetailID));

  const shown = tab === 'expiring' ? expiring : tab === 'expired' ? expired : filtered;

  function licStatus(d) {
    if (!d.LicenseExpiryDate) return { label: 'No Date', cls: 'b-muted' };
    const exp = new Date(d.LicenseExpiryDate);
    if (exp < today) return { label: 'Expired', cls: 'b-red' };
    const days = (exp - today) / 86400000;
    if (days <= 60) return { label: `${Math.floor(days)}d left`, cls: 'b-orange' };
    return { label: 'Valid', cls: 'b-green' };
  }

  const allApproved = d => d.DVLACheck==='Approved' && d.DBSCheck==='Approved' && d.PCOCheck==='Approved';

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Drivers</div>
          <div className="pg-subtitle">{drivers.length} registered drivers</div>
        </div>
      </div>

      <div className="content">
        {/* KPI row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total Drivers',   value:drivers.length,  color:'var(--blue)',   icon:Car },
            { label:'Expired Licences', value:expired.length, color:'var(--red)',    icon:AlertTriangle },
            { label:'Expiring (60d)',   value:expiring.length, color:'var(--orange)', icon:AlertTriangle },
            { label:'Fully Compliant',  value:drivers.filter(allApproved).length, color:'var(--green)', icon:CheckCircle },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color:k.color }}>{k.value}</div>
              <k.icon size={32} className="kpi-icon" color={k.color}/>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab-btn${tab==='all'?' on':''}`}     onClick={() => setTab('all')}>All Drivers</button>
          <button className={`tab-btn${tab==='expiring'?' on':''}`} onClick={() => setTab('expiring')}>
            Expiring {expiring.length>0 && <span className="nav-badge warn" style={{ marginLeft:6 }}>{expiring.length}</span>}
          </button>
          <button className={`tab-btn${tab==='expired'?' on':''}`}  onClick={() => setTab('expired')}>
            Expired {expired.length>0 && <span className="nav-badge" style={{ marginLeft:6 }}>{expired.length}</span>}
          </button>
        </div>

        {tab === 'all' && (
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <div className="search-wrap">
              <Search size={14} color="var(--txt3)"/>
              <input placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="filter-sel" value={fCheck} onChange={e => setFCheck(e.target.value)}>
              <option value="">All Compliance</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        )}

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {loading ? (
            <div className="page-spin"><div className="spin"/></div>
          ) : shown.length === 0 ? (
            <div className="empty"><Car size={36}/><p>No drivers found</p></div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Stage</th>
                    <th>Licence No.</th>
                    <th>Class</th>
                    <th>Expiry</th>
                    <th>Lic. Status</th>
                    <th>DVLA</th>
                    <th>Police Cert.</th>
                    <th>TIN No.</th>
                    <th>Callback</th>
                    <th>Docs / Compliance</th>
                    <th>Vehicle</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(d => {
                    const ls = licStatus(d);
                    const compliance = getComplianceStatus(d.Documentations, d);
                    const callback = getCallbackStatus(d.Booking, d.Next_Call_Date);
                    return (
                      <tr key={d.DriverDetailID} className="clickable" onClick={() => navigate(`/contacts/${d.CallLogsID}/edit`)}>
                        <td>
                          <div style={{ fontWeight:600 }}>{d.First_Name} {d.Last_Name}</div>
                          <div style={{ fontSize:11.5, color:'var(--txt2)' }}>{d.Mobile_Phone}</div>
                        </td>
                        <td><span className={`badge ${statusClass(d.Status)}`}>{d.Status||'—'}</span></td>
                        <td><span className={`badge ${stageClass(d.Stage)}`} style={{ fontSize:10.5 }}>{d.Stage||'—'}</span></td>
                        <td style={{ fontFamily:'monospace', fontSize:12.5 }}>{d.LicenseNumber||'—'}</td>
                        <td style={{ fontSize:12.5 }}>{d.LicenseClass||'—'}</td>
                        <td style={{ fontSize:12, color: ls.cls==='b-red'?'var(--red)':ls.cls==='b-orange'?'var(--orange)':'var(--txt2)' }}>{fmt(d.LicenseExpiryDate)}</td>
                        <td><span className={`badge ${ls.cls}`}>{ls.label}</span></td>
                        <td><span className={`badge ${checkClass(d.DVLACheck)}`}>{d.DVLACheck}</span></td>
                        <td><span className={`badge ${checkClass(d.DBSCheck)}`}>{d.DBSCheck}</span></td>
                        <td><span className={`badge ${checkClass(d.PCOCheck)}`}>{d.PCOCheck}</span></td>
                        <td>
                          <span className={`badge ${callback.tone}`}>
                            <span className={callback.dot} />
                            {callback.label}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${compliance.tone}`}>
                            <span className={compliance.dot} />
                            {compliance.label}
                          </span>
                        </td>
                        <td style={{ fontSize:12.5, color:'var(--txt2)' }}>{d.VehicleType||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
