const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');
const pg = require('../db/pg');

router.get('/', (_req, res) => {
  if (pg.isPgEnabled()) {
    (async () => {
      try {
        await pg.ensureSchema();
        const g = async (sql, params = []) => {
          const result = await pg.pgQuery(sql, params);
          return result.rows[0] || null;
        };
        const all = async (sql, params = []) => {
          const result = await pg.pgQuery(sql, params);
          return result.rows;
        };

        const total = Number((await g('SELECT COUNT(*)::int AS c FROM "CallLogs"')).c);
        const approved = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Status"='Approved'`)).c);
        const pending = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Status"='Pending'`)).c);
        const drivers = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Caller_Type"='DRIVER'`)).c);
        const managers = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Caller_Type"='MANAGER'`)).c);
        const newCallers = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Stage"='1 - New Caller'`)).c);
        const inTraining = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Stage"='2 - Training'`)).c);
        const inInterview = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Stage" ILIKE '%Interview%'`)).c);
        const booked = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Stage" ILIKE '%Booked%'`)).c);
        const newCallerBooking = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Booking"='1 - New Caller'`)).c);
        const callbacks = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Booking"='2 - Callbacks'`)).c);
        const highPriority = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Priority"='High'`)).c);
        const totalCalls = Number((await g(`SELECT COALESCE(SUM("Call_Count"),0)::int AS c FROM "CallLogs"`)).c);
        const overdueFollowUp = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Next_Call_Date" IS NOT NULL AND "Next_Call_Date" < CURRENT_DATE`)).c);
        const expiredLicences = Number((await g(`SELECT COUNT(*)::int AS c FROM "DriverDetails" WHERE "LicenseExpiryDate" IS NOT NULL AND "LicenseExpiryDate" < CURRENT_DATE`)).c);
        const expiringLicences = Number((await g(`SELECT COUNT(*)::int AS c FROM "DriverDetails" WHERE "LicenseExpiryDate" BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '60 days')`)).c);

        const callOutcomes = await all(`SELECT "Outcome", COUNT(*)::int AS count FROM "CallSessions" GROUP BY "Outcome" ORDER BY count DESC`);

        const addedThisWeek = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Created_At" >= (now() - interval '7 days')`)).c);
        const addedLastWeek = Number((await g(`SELECT COUNT(*)::int AS c FROM "CallLogs" WHERE "Created_At" BETWEEN (now() - interval '14 days') AND (now() - interval '7 days')`)).c);

        const byCallerType = await all(`SELECT "Caller_Type", COUNT(*)::int AS count FROM "CallLogs" GROUP BY "Caller_Type" ORDER BY count DESC`);
        const byStage = await all(`SELECT "Stage", COUNT(*)::int AS count FROM "CallLogs" WHERE "Stage" IS NOT NULL GROUP BY "Stage" ORDER BY count DESC`);
        const byStatus = await all(`SELECT "Status", COUNT(*)::int AS count FROM "CallLogs" GROUP BY "Status"`);
        const byAssignee = await all(`SELECT "Assigned_To", COUNT(*)::int AS count FROM "CallLogs" WHERE "Assigned_To" <> '' GROUP BY "Assigned_To" ORDER BY count DESC`);
        const complianceStats = (await all(`
          SELECT
            SUM(CASE WHEN "DVLACheck"='Approved' THEN 1 ELSE 0 END)::int AS dvla_ok,
            SUM(CASE WHEN "DBSCheck"='Approved'  THEN 1 ELSE 0 END)::int AS dbs_ok,
            SUM(CASE WHEN "PCOCheck"='Approved'  THEN 1 ELSE 0 END)::int AS pco_ok,
            COUNT(*)::int AS total
          FROM "DriverDetails"
        `))[0] || { dvla_ok: 0, dbs_ok: 0, pco_ok: 0, total: 0 };

        const recentContacts = await all(`
          SELECT "ID", "First_Name", "Last_Name", "Caller_Type", "Status", "Stage",
                 "Priority", "Assigned_To", "Call_Count", "Created_At"
          FROM "CallLogs"
          ORDER BY "Created_At" DESC
          LIMIT 8
        `);

        res.json({ success: true, data: {
          totals: {
            total, approved, pending, drivers, managers, newCallers, inTraining,
            inInterview, booked, newCallerBooking, callbacks, highPriority, totalCalls,
            overdueFollowUp, expiredLicences, expiringLicences,
            addedThisWeek, addedLastWeek,
          },
          callOutcomes, byCallerType, byStage, byStatus, byAssignee,
          complianceStats, recentContacts,
        }});
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    })();
    return;
  }

  try {
    const db  = getDb();
    const g   = (sql, ...p) => db.prepare(sql).get(...p);
    const all = (sql, ...p) => db.prepare(sql).all(...p);

    const total          = g('SELECT COUNT(*) c FROM CallLogs').c;
    const approved       = g("SELECT COUNT(*) c FROM CallLogs WHERE Status='Approved'").c;
    const pending        = g("SELECT COUNT(*) c FROM CallLogs WHERE Status='Pending'").c;
    const drivers        = g("SELECT COUNT(*) c FROM CallLogs WHERE Caller_Type='DRIVER'").c;
    const managers       = g("SELECT COUNT(*) c FROM CallLogs WHERE Caller_Type='MANAGER'").c;
    const newCallers     = g("SELECT COUNT(*) c FROM CallLogs WHERE Stage='1 - New Caller'").c;
    const inTraining     = g("SELECT COUNT(*) c FROM CallLogs WHERE Stage='2 - Training'").c;
    const inInterview    = g("SELECT COUNT(*) c FROM CallLogs WHERE Stage LIKE '%Interview%'").c;
    const booked         = g("SELECT COUNT(*) c FROM CallLogs WHERE Stage LIKE '%Booked%'").c;
    const newCallerBooking = g("SELECT COUNT(*) c FROM CallLogs WHERE Booking='1 - New Caller'").c;
    const callbacks      = g("SELECT COUNT(*) c FROM CallLogs WHERE Booking='2 - Callbacks'").c;
    const highPriority   = g("SELECT COUNT(*) c FROM CallLogs WHERE Priority='High'").c;
    const totalCalls     = g('SELECT COALESCE(SUM(Call_Count),0) c FROM CallLogs').c;
    const overdueFollowUp = g("SELECT COUNT(*) c FROM CallLogs WHERE Next_Call_Date IS NOT NULL AND Next_Call_Date < date('now')").c;
    const expiredLicences = g("SELECT COUNT(*) c FROM DriverDetails WHERE LicenseExpiryDate IS NOT NULL AND LicenseExpiryDate < date('now')").c;
    const expiringLicences = g("SELECT COUNT(*) c FROM DriverDetails WHERE LicenseExpiryDate BETWEEN date('now') AND date('now','+60 days')").c;

    // Call outcomes breakdown
    const callOutcomes = all(`SELECT Outcome, COUNT(*) count FROM CallSessions GROUP BY Outcome ORDER BY count DESC`);

    // Contacts added this week vs last week
    const addedThisWeek = g("SELECT COUNT(*) c FROM CallLogs WHERE Created_At >= date('now','-7 days')").c;
    const addedLastWeek = g("SELECT COUNT(*) c FROM CallLogs WHERE Created_At BETWEEN date('now','-14 days') AND date('now','-7 days')").c;

    const byCallerType   = all('SELECT Caller_Type, COUNT(*) count FROM CallLogs GROUP BY Caller_Type ORDER BY count DESC');
    const byStage        = all('SELECT Stage, COUNT(*) count FROM CallLogs WHERE Stage IS NOT NULL GROUP BY Stage ORDER BY count DESC');
    const byStatus       = all('SELECT Status, COUNT(*) count FROM CallLogs GROUP BY Status');
    const byAssignee     = all("SELECT Assigned_To, COUNT(*) count FROM CallLogs WHERE Assigned_To!='' GROUP BY Assigned_To ORDER BY count DESC");
    const complianceStats = all(`SELECT
      SUM(CASE WHEN DVLACheck='Approved' THEN 1 ELSE 0 END) dvla_ok,
      SUM(CASE WHEN DBSCheck='Approved'  THEN 1 ELSE 0 END) dbs_ok,
      SUM(CASE WHEN PCOCheck='Approved'  THEN 1 ELSE 0 END) pco_ok,
      COUNT(*) total FROM DriverDetails`)[0];

    const recentContacts = all(`
      SELECT ID, First_Name, Last_Name, Caller_Type, Status, Stage,
             Priority, Assigned_To, Call_Count, Created_At
      FROM CallLogs ORDER BY Created_At DESC LIMIT 8
    `);

    res.json({ success: true, data: {
      totals: {
        total, approved, pending, drivers, managers, newCallers, inTraining,
        inInterview, booked, newCallerBooking, callbacks, highPriority, totalCalls,
        overdueFollowUp, expiredLicences, expiringLicences,
        addedThisWeek, addedLastWeek
      },
      callOutcomes, byCallerType, byStage, byStatus, byAssignee,
      complianceStats, recentContacts
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
