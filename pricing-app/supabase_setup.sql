-- ================================================================
-- 스마트 프라이싱 엔진 · Supabase 테이블 생성 SQL
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행하세요
-- ================================================================

-- 1. 원본 판매 데이터 테이블
create table if not exists sales_raw (
  id            bigint generated always as identity primary key,
  booking_id    text unique not null,        -- 예약번호 (중복 방지 기준)
  channel       text,                        -- 채널
  property      text not null,               -- 지점
  room_type     text,                        -- 객실타입
  booked_at     date,                        -- 예약날짜
  checkin_date  date not null,               -- 체크인날짜
  checkout_date date,                        -- 체크아웃날짜
  amount        numeric default 0,           -- 예약금액
  nights        integer default 1,           -- 숙박일수
  lead_time     integer default 0,           -- 리드타임
  created_at    timestamptz default now()
);

-- 인덱스 (조회 속도 향상)
create index if not exists idx_sales_property     on sales_raw (property);
create index if not exists idx_sales_checkin      on sales_raw (checkin_date);
create index if not exists idx_sales_lead_time    on sales_raw (lead_time);

-- 2. 지점별 설정 테이블 (RevPAR 등 사용자 입력값 저장)
create table if not exists property_settings (
  id            bigint generated always as identity primary key,
  property      text not null,
  room_type     text not null,
  target_revpar numeric default 0,
  min_price     numeric default 0,
  max_price     numeric default 0,
  room_count    integer default 1,
  updated_at    timestamptz default now(),
  unique(property, room_type)
);

-- 3. 요약 뷰 (대시보드에서 빠르게 로드)
create or replace view sales_summary as
select
  property,
  checkin_date,
  count(*)                          as bookings,
  sum(amount)                       as total_revenue,
  avg(amount / nullif(nights, 0))   as avg_adr,
  avg(lead_time)                    as avg_lead_time,
  extract(dow from checkin_date)    as dow
from sales_raw
where lead_time >= 0 and lead_time <= 365
group by property, checkin_date;

-- 4. RLS 비활성화 (비공개 URL 방식 — 팀 내부 도구이므로 단순하게)
alter table sales_raw          disable row level security;
alter table property_settings  disable row level security;
