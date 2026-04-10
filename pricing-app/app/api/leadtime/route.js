import { NextResponse } from "next/server";
import { duckQuery } from "@/lib/duck";

export const dynamic = "force-dynamic";

// unicode escape로 한글 인코딩 이슈 방지
const EV = "\uC7AC\uC2E4"; // 재실

const LT_CTE = `
  WITH lt_raw AS (
    SELECT
      branchId,
      b_name,
      DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) AS lt
    FROM fact_reservation_event
    WHERE event = '${EV}'
      AND isSales = true
      AND date >= CURRENT_DATE - INTERVAL '180' DAY
      AND date < CURRENT_DATE
      AND reservedAt IS NOT NULL
      AND DATE_DIFF('day', CAST(reservedAt AS DATE), CAST(date AS DATE)) >= 0
  )`;

export async function GET() {
  try {
    const [distribution, summary] = await Promise.all([
      duckQuery(`${LT_CTE}
        SELECT
          branchId, b_name,
          CASE
            WHEN lt = 0 THEN 'D-0'
            WHEN lt BETWEEN 1 AND 3 THEN 'D-1~3'
            WHEN lt BETWEEN 4 AND 7 THEN 'D-4~7'
            WHEN lt BETWEEN 8 AND 14 THEN 'D-8~14'
            WHEN lt BETWEEN 15 AND 30 THEN 'D-15~30'
            WHEN lt BETWEEN 31 AND 60 THEN 'D-31~60'
            WHEN lt BETWEEN 61 AND 90 THEN 'D-61~90'
            ELSE 'D-90+'
          END AS band,
          COUNT(*) AS cnt,
          ROUND(AVG(lt), 1) AS avg_lt
        FROM lt_raw
        GROUP BY branchId, b_name, band
        ORDER BY b_name, MIN(lt)
      `),
      duckQuery(`${LT_CTE}
        SELECT
          branchId, b_name,
          COUNT(*) AS total,
          ROUND(AVG(lt), 1) AS avg_lt,
          APPROX_QUANTILE(lt, 0.5) AS median_lt,
          ROUND(SUM(CASE WHEN lt <= 7 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS within_7d_pct
        FROM lt_raw
        GROUP BY branchId, b_name
        ORDER BY median_lt
      `),
    ]);

    return NextResponse.json({ distribution, summary }, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e) {
    console.error("leadtime API error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
