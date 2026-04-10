import { NextResponse } from "next/server";
import { duckQuery } from "@/lib/duck";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [distRaw, sumRaw, branchList] = await Promise.all([
      duckQuery(`
        WITH lt_raw AS (
          SELECT branchId,
            DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) AS lt
          FROM fact_reservation_event
          WHERE oc_rn > 0 AND isSales = true
            AND date >= CURRENT_DATE - INTERVAL '180' DAY
            AND date < CURRENT_DATE
            AND reservedAt IS NOT NULL
            AND DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) >= 0
        )
        SELECT branchId,
          CASE
            WHEN lt = 0 THEN 'D0'
            WHEN lt BETWEEN 1 AND 3 THEN 'D1'
            WHEN lt BETWEEN 4 AND 7 THEN 'D4'
            WHEN lt BETWEEN 8 AND 14 THEN 'D8'
            WHEN lt BETWEEN 15 AND 30 THEN 'D15'
            WHEN lt BETWEEN 31 AND 60 THEN 'D31'
            WHEN lt BETWEEN 61 AND 90 THEN 'D61'
            ELSE 'D90'
          END AS band,
          COUNT(*) AS cnt,
          ROUND(AVG(lt), 1) AS avg_lt
        FROM lt_raw
        GROUP BY branchId, band
      `),
      duckQuery(`
        WITH lt_raw AS (
          SELECT branchId,
            DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) AS lt
          FROM fact_reservation_event
          WHERE oc_rn > 0 AND isSales = true
            AND date >= CURRENT_DATE - INTERVAL '180' DAY
            AND date < CURRENT_DATE
            AND reservedAt IS NOT NULL
            AND DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) >= 0
        )
        SELECT branchId,
          COUNT(*) AS total,
          ROUND(AVG(lt), 1) AS avg_lt,
          APPROX_QUANTILE(lt, 0.5) AS median_lt,
          ROUND(SUM(CASE WHEN lt <= 7 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS within_7d_pct
        FROM lt_raw
        GROUP BY branchId
      `),
      duckQuery(`SELECT id, name FROM dim_branch`),
    ]);

    // branchId -> name mapping
    const nameMap = {};
    for (const b of branchList) nameMap[b.id] = b.name;

    const distribution = distRaw.map(r => ({
      ...r, b_name: nameMap[r.branchId] || r.branchId,
    }));
    const summary = sumRaw.map(r => ({
      ...r, b_name: nameMap[r.branchId] || r.branchId,
    }));

    return NextResponse.json({ distribution, summary }, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e) {
    console.error("leadtime API error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
