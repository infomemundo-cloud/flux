
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id=_org AND user_id=_user)
$$;

CREATE OR REPLACE FUNCTION private.has_org_role(_org uuid, _user uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id=_org AND user_id=_user AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION private.user_org_ids(_user uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.memberships WHERE user_id = _user
$$;

REVOKE ALL ON FUNCTION private.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_org_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_org_ids(uuid) TO authenticated, service_role;

-- Rewrite policies to reference private.* functions
DROP POLICY "members read orgs" ON public.organizations;
CREATE POLICY "members read orgs" ON public.organizations FOR SELECT USING (private.is_org_member(id, auth.uid()));
DROP POLICY "owners/admins update org" ON public.organizations;
CREATE POLICY "owners/admins update org" ON public.organizations FOR UPDATE
  USING (private.has_org_role(id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_org_role(id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));
DROP POLICY "owners delete org" ON public.organizations;
CREATE POLICY "owners delete org" ON public.organizations FOR DELETE USING (private.has_org_role(id, auth.uid(), ARRAY['owner'::app_role]));

DROP POLICY "members read own memberships" ON public.memberships;
CREATE POLICY "members read own memberships" ON public.memberships FOR SELECT USING ((user_id = auth.uid()) OR private.is_org_member(org_id, auth.uid()));
DROP POLICY "self-insert first membership as owner" ON public.memberships;
CREATE POLICY "self-insert first membership as owner" ON public.memberships FOR INSERT WITH CHECK ((user_id = auth.uid()) OR private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));
DROP POLICY "owners/admins update memberships" ON public.memberships;
CREATE POLICY "owners/admins update memberships" ON public.memberships FOR UPDATE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));
DROP POLICY "owners/admins delete memberships" ON public.memberships;
CREATE POLICY "owners/admins delete memberships" ON public.memberships FOR DELETE USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

DROP POLICY "members access contacts" ON public.contacts;
CREATE POLICY "members access contacts" ON public.contacts FOR ALL USING (private.is_org_member(org_id, auth.uid())) WITH CHECK (private.is_org_member(org_id, auth.uid()));

DROP POLICY "members read channels" ON public.channels;
CREATE POLICY "members read channels" ON public.channels FOR SELECT USING (private.is_org_member(org_id, auth.uid()));
DROP POLICY "admins manage channels" ON public.channels;
CREATE POLICY "admins manage channels" ON public.channels FOR ALL
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

DROP POLICY "members read demandas" ON public.demandas;
CREATE POLICY "members read demandas" ON public.demandas FOR SELECT USING (private.is_org_member(org_id, auth.uid()));
DROP POLICY "agents insert demandas" ON public.demandas;
CREATE POLICY "agents insert demandas" ON public.demandas FOR INSERT WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'agent'::app_role]));
DROP POLICY "agents update demandas" ON public.demandas;
CREATE POLICY "agents update demandas" ON public.demandas FOR UPDATE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'agent'::app_role]))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'agent'::app_role]));
DROP POLICY "admins delete demandas" ON public.demandas;
CREATE POLICY "admins delete demandas" ON public.demandas FOR DELETE USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

DROP POLICY "members read events" ON public.demanda_events;
CREATE POLICY "members read events" ON public.demanda_events FOR SELECT USING (private.is_org_member(org_id, auth.uid()));
DROP POLICY "agents insert events" ON public.demanda_events;
CREATE POLICY "agents insert events" ON public.demanda_events FOR INSERT WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'agent'::app_role]));

DROP POLICY "admins manage tokens" ON public.webhook_tokens;
CREATE POLICY "admins manage tokens" ON public.webhook_tokens FOR ALL
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

-- Drop the public-schema versions so they're no longer exposed via the Data API
DROP FUNCTION public.is_org_member(uuid, uuid);
DROP FUNCTION public.has_org_role(uuid, uuid, public.app_role[]);
DROP FUNCTION public.user_org_ids(uuid);
