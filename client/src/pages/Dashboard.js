import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Car, CheckCircle, Clock, TrendingUp, Phone, UserCheck, AlertTriangle, ArrowUpRight, ArrowDownRight, PhoneCall, Activity } from 'lucide-react';
import { getStats, getActivity } from '../utils/api';
import { fmt, fmtAgo, statusClass, stageClass, typeClass, activityColor, initials } from '../utils/helpers';

const STAGES = ['1 - New Caller','2 - Training','1 - Interview','3 - Booked'];

function Kpi({ label, value, sub, color, icon: Icon, trend, trendLabel }) {
  const up = trend > 0, down = trend < 0;
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value ?? '—'}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {trend !== undefined && (
        <div className={`kpi-trend ${up ? 'trend-up' : down ? 'trend-down' : ''}`}>
          {up ? <ArrowUpRight size={12}/> : down ? <ArrowDownRight size={12}/> : null}
          {trendLabel}
        </div>
      )}
      {Icon && <Icon size={36} className="kpi-icon" color={color} />}
    </div>
  );
}

export default function Dashboard() {
  const [stats,    setStats]   = useState(null);
  const [activity, setActivity] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getStats(), getActivity(15)]).then(([sr, ar]) => {
      setStats(sr.data.data);
      setActivity(ar.data.data);
      // group recent contacts into pipeline stages
      setContacts(sr.data.data.recentContacts || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <div className="pg-header"><div><div className="pg-title">Dashboard</div></div></div>
      <div className="page-spin"><div className="spin" /></div>
    </div>
  );

  const t  = stats?.totals || {};
  const cs = stats?.complianceStats || {};
  const weekTrend = t.addedLastWeek > 0 ? Math.round(((t.addedThisWeek - t.addedLastWeek) / t.addedLastWeek) * 100) : 0;

  // Build pipeline columns from recent contacts
  const pipeline = STAGES.map(stage => ({
    label: stage.replace(/^\d+ - /, ''),
    stage,
    items: (stats?.recentContacts || []).filter(c => c.Stage === stage),
  }));

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Dashboard</div>
          <div className="pg-subtitle">Good to see you — here's what's happening today</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/reports')}>View Reports</button>
          <button className="btn btn-primary" onClick={() => navigate('/contacts/new')}>+ New Contact</button>
        </div>
      </div>

      <div className="content">

        {/* Alerts */}
        {t.overdueFollowUp > 0 && (
          <div className="alert alert-warn" style={{ cursor: 'pointer' }} onClick={() => navigate('/contacts?overdue=true')}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <div><strong>{t.overdueFollowUp} overdue follow-up{t.overdueFollowUp !== 1 ? 's' : ''}</strong> — contacts with a past due next-call date. <span style={{ textDecoration: 'underline' }}>View them →</span></div>
          </div>
        )}
        {t.expiredLicences > 0 && (
          <div className="alert alert-error">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <strong>{t.expiredLicences} expired driver licence{t.expiredLicences !== 1 ? 's' : ''}</strong> — immediate action required.
          </div>
        )}

        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <Kpi label="Total Contacts" value={t.total}       color="var(--txt)"     icon={Users}     trend={weekTrend} trendLabel={`${Math.abs(weekTrend)}% vs last week`} />
          <Kpi label="Approved"       value={t.approved}    color="var(--green)"   icon={CheckCircle} sub={`${t.total ? Math.round((t.approved/t.total)*100) : 0}% of total`} />
          <Kpi label="Pending"        value={t.pending}     color="var(--orange)"  icon={Clock} />
          <Kpi label="Drivers"        value={t.drivers}     color="var(--blue)"    icon={Car} />
          <Kpi label="In Training"    value={t.inTraining}  color="var(--purple)"  icon={TrendingUp} />
          <Kpi label="Interviews"     value={t.inInterview} color="var(--accent)"  icon={UserCheck} />
          <Kpi label="Booked"         value={t.booked}      color="var(--green)"   icon={PhoneCall} />
          <Kpi label="Total Calls"    value={t.totalCalls}  color="var(--teal)"    icon={Phone} />
        </div>

        {/* Pipeline + Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>

          {/* Pipeline */}
          <div className="card" style={{ padding: '18px 18px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="card-title" style={{ margin: 0 }}>Contact Pipeline</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/contacts')}>View All</button>
            </div>
            <div className="pipeline">
              {pipeline.map(col => (
                <div key={col.stage} className="pipe-col">
                  <div className="pipe-head">
                    <span className={`badge ${stageClass(col.stage)} pipe-head-label`}>{col.label}</span>
                    <span className="pipe-count">{(stats?.byStage||[]).find(s=>s.Stage===col.stage)?.count || col.items.length}</span>
                  </div>
                  <div className="pipe-body">
                    {col.items.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt3)', textAlign: 'center', marginTop: 16 }}>No contacts</div>}
                    {col.items.slice(0,4).map(c => (
                      <div key={c.ID} className="pipe-card" onClick={() => navigate(`/contacts/${c.ID}/edit`)}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{initials(c.First_Name,c.Last_Name)}</div>
                          <div>
                            <div className="pipe-name">{c.First_Name} {c.Last_Name}</div>
                            <div className="pipe-type">{c.Caller_Type}</div>
                          </div>
                        </div>
                        <div className="pipe-footer">
                          <span className={`badge ${typeClass(c.Caller_Type)}`} style={{ fontSize: 10 }}>{c.Caller_Type}</span>
                          {c.Priority === 'High' && <span className="prio-dot prio-high" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card" style={{ maxHeight: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>Activity</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/activity')}><Activity size={12} /> All</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {activity.slice(0,10).map(a => {
                const col = activityColor(a.Action);
                return (
                  <div key={a.ActivityID} className="activity-item">
                    <div className="activity-dot" style={{ background: col.bg }}>
                      <Activity size={13} color={col.color} />
                    </div>
                    <div>
                      <div className="activity-text">
                        <span style={{ fontWeight: 600 }}>{a.Action}</span>
                        {a.First_Name && <span style={{ color: 'var(--txt2)' }}> · {a.First_Name} {a.Last_Name}</span>}
                      </div>
                      {a.Detail && <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 1 }}>{a.Detail}</div>}
                      <div className="activity-meta">{fmtAgo(a.Created_At)} · {a.Created_By}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom row: type breakdown + stage breakdown + compliance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>

          <div className="card">
            <div className="card-title">By Caller Type</div>
            {(stats?.byCallerType||[]).map(r => (
              <div key={r.Caller_Type} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className={`badge ${typeClass(r.Caller_Type)}`} style={{ minWidth: 100 }}>{r.Caller_Type}</span>
                <div className="prog-wrap"><div className="prog-bar" style={{ width: `${t.total?(r.count/t.total)*100:0}%`, background: 'var(--accent)' }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{r.count}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">By Stage</div>
            {(stats?.byStage||[]).filter(r=>r.Stage).map(r => (
              <div key={r.Stage} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className={`badge ${stageClass(r.Stage)}`} style={{ minWidth: 120, fontSize: 10.5 }}>{r.Stage}</span>
                <div className="prog-wrap"><div className="prog-bar" style={{ width: `${t.total?(r.count/t.total)*100:0}%`, background: 'var(--blue)' }} /></div>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{r.count}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Driver Compliance</div>
            {[
              { label: 'DVLA Checks',  ok: cs.dvla_ok, total: cs.total },
              { label: 'Police Certificates',   ok: cs.dbs_ok,  total: cs.total },
              { label: 'TIN Numbers',           ok: cs.pco_ok,  total: cs.total },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{row.ok||0} / {row.total||0}</span>
                </div>
                <div className="prog-wrap">
                  <div className="prog-bar" style={{ width: `${row.total?(row.ok/row.total)*100:0}%`, background: 'var(--green)' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              {t.expiringLicences > 0 && (
                <div className="alert alert-warn" style={{ padding: '8px 10px', fontSize: 12 }}>
                  <AlertTriangle size={13}/> {t.expiringLicences} licences expiring within 60 days
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
