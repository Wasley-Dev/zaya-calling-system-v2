import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw } from 'lucide-react';
import { getActivity } from '../utils/api';
import { fmtDT, activityColor } from '../utils/helpers';

export default function ActivityPage() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(40);

  const load = (lim) => {
    setLoading(true);
    getActivity(lim || limit).then(r => setItems(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="pg-header">
        <div>
          <div className="pg-title">Activity Feed</div>
          <div className="pg-subtitle">All system events across contacts</div>
        </div>
        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => load()}><RefreshCw size={14}/></button>
      </div>

      <div className="content">
        <div className="card" style={{ maxWidth:760 }}>
          {loading ? (
            <div className="page-spin"><div className="spin"/></div>
          ) : items.length === 0 ? (
            <div className="empty"><Activity size={36}/><p>No activity yet</p></div>
          ) : (
            <>
              {items.map(a => {
                const col = activityColor(a.Action);
                return (
                  <div key={a.ActivityID} className="activity-item" style={{ cursor: a.CallLogsID ? 'pointer' : 'default' }}
                    onClick={() => a.CallLogsID && navigate(`/contacts/${a.CallLogsID}/edit`)}>
                    <div className="activity-dot" style={{ background: col.bg }}>
                      <Activity size={13} color={col.color}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <span style={{ fontWeight:600, fontSize:13 }}>{a.Action}</span>
                          {a.First_Name && (
                            <span style={{ fontSize:13, color:'var(--txt2)' }}> — {a.First_Name} {a.Last_Name}</span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:'var(--txt3)', whiteSpace:'nowrap', marginLeft:12 }}>{fmtDT(a.Created_At)}</div>
                      </div>
                      {a.Detail && <div style={{ fontSize:12.5, color:'var(--txt2)', marginTop:2 }}>{a.Detail}</div>}
                      <div style={{ fontSize:11, color:'var(--txt3)', marginTop:2 }}>by {a.Created_By}</div>
                    </div>
                  </div>
                );
              })}
              {items.length >= limit && (
                <div style={{ textAlign:'center', marginTop:16 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { const l = limit + 40; setLimit(l); load(l); }}>Load more</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
