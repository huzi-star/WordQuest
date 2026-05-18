# Supabase migration — add preferences column

If you set up Supabase earlier following SUPABASE_SETUP.md, run this ONE
SQL statement in your Supabase **SQL Editor** to add the column that
stores per-user theme / language / sound / vibration:

```sql
alter table public.user_stats
  add column if not exists preferences jsonb default '{}'::jsonb;
```

That's it. Existing rows get an empty `{}` and new rows will populate it
automatically.
