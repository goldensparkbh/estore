CREATE DATABASE IF NOT EXISTS erp_analytics;

CREATE TABLE IF NOT EXISTS erp_analytics.events_sales_daily
(
    tenant_id UUID,
    day Date,
    total_amount Decimal(18, 4),
    event_at DateTime
)
ENGINE = MergeTree
ORDER BY (tenant_id, day);
