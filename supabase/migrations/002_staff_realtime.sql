-- Staff-specific RLS additions + realtime publication for the dashboard.

-- Staff can mark tables occupied/free in their own branch.
create policy "restaurant_tables_update_staff"
  on restaurant_tables for update
  to authenticated
  using (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = restaurant_tables.branch_id
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.user_id = auth.uid()
        and s.branch_id = restaurant_tables.branch_id
    )
  );

-- Enable realtime so the staff dashboard can subscribe to changes.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table restaurant_tables;
