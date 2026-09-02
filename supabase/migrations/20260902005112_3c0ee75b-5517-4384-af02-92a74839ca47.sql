revoke all on function public.guard_ai_demanda_state() from anon, authenticated;
revoke all on function public.set_demanda_protocol() from anon, authenticated;
revoke all on function public.set_updated_at() from anon, authenticated;
revoke all on function public.gen_demanda_protocol() from anon, authenticated;

create or replace function private.org_has_members(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.memberships where org_id = _org_id)
$$;

revoke all on function private.org_has_members(uuid) from public;
grant execute on function private.org_has_members(uuid) to authenticated, service_role;

drop policy if exists "self-insert first membership as owner" on public.memberships;

create policy "insert memberships"
on public.memberships
for insert
to authenticated
with check (
  private.has_org_role(org_id, auth.uid(), array['owner','admin'])
  or (
    user_id = auth.uid()
    and role = 'owner'
    and not private.org_has_members(org_id)
    and exists (
      select 1 from public.organizations o
      where o.id = org_id and o.created_by = auth.uid()
    )
  )
);