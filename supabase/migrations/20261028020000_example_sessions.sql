-- Example personas ship with a short played history (simulated caregiver taps run
-- through the real learning pipeline) so the engagement report has something to show.
alter table sessions add column is_example boolean not null default false;
