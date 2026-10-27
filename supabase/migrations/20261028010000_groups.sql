-- Facility mode: a group profile pools several residents' seeds into one session.
alter table profiles add column kind text not null default 'person' check (kind in ('person', 'group'));
alter table profiles add column member_ids uuid[] not null default '{}';
