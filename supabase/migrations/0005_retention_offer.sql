alter table memberships add column next_charge_discount_pct int not null default 0 check (next_charge_discount_pct between 0 and 100);
