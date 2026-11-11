create table if not exists messages (
  id bigserial primary key,
  wa_msg_id text unique,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

create table if not exists memories (
  id bigserial primary key,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists reminders (
  id bigserial primary key,
  text text not null,
  due_at timestamptz not null,
  sent boolean default false,
  created_at timestamptz default now()
);

-- Service-role key bypasses RLS, but lock the tables anyway
alter table messages enable row level security;
alter table memories enable row level security;
alter table reminders enable row level security;
create table if not exists brand_profile (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

create table if not exists drafts (
  id bigserial primary key,
  platform text not null,
  content text not null,
  notes text,
  status text not null default 'draft' check (status in ('draft','approved','rejected','posted')),
  created_at timestamptz default now()
);

alter table brand_profile enable row level security;
alter table drafts enable row level security;
