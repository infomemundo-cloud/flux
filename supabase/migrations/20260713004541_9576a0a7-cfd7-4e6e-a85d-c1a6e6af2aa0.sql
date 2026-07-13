
-- 1) Rename demanda_state values
ALTER TYPE public.demanda_state RENAME VALUE 'resolvido' TO 'aguardando_revisao_humana';
ALTER TYPE public.demanda_state RENAME VALUE 'fechado' TO 'concluido';

-- 2) Drop ALL policies referencing app_role[] via has_org_role
DROP POLICY IF EXISTS "owners/admins delete memberships" ON public.memberships;
DROP POLICY IF EXISTS "owners/admins update memberships" ON public.memberships;
DROP POLICY IF EXISTS "self-insert first membership as owner" ON public.memberships;
DROP POLICY IF EXISTS "members read own memberships" ON public.memberships;

DROP POLICY IF EXISTS "admins delete demandas" ON public.demandas;
DROP POLICY IF EXISTS "agents insert demandas" ON public.demandas;
DROP POLICY IF EXISTS "agents update demandas" ON public.demandas;
DROP POLICY IF EXISTS "members read demandas" ON public.demandas;

DROP POLICY IF EXISTS "owners/admins update org" ON public.organizations;
DROP POLICY IF EXISTS "owners delete org" ON public.organizations;
DROP POLICY IF EXISTS "admins manage channels" ON public.channels;
DROP POLICY IF EXISTS "agents insert events" ON public.demanda_events;
DROP POLICY IF EXISTS "admins manage tokens" ON public.webhook_tokens;

DROP FUNCTION IF EXISTS private.has_org_role(uuid, uuid, public.app_role[]);

ALTER TABLE public.memberships ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.memberships ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.memberships ALTER COLUMN role SET DEFAULT 'operador';

UPDATE public.memberships SET role = 'operador' WHERE role = 'agent';

CREATE OR REPLACE FUNCTION private.has_org_role(_org uuid, _user uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;
REVOKE EXECUTE ON FUNCTION private.has_org_role(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, uuid, text[]) TO authenticated, service_role;

-- Recreate memberships policies
CREATE POLICY "members read own memberships" ON public.memberships FOR SELECT
  USING (user_id = auth.uid() OR private.is_org_member(org_id, auth.uid()));
CREATE POLICY "self-insert first membership as owner" ON public.memberships FOR INSERT
  WITH CHECK (user_id = auth.uid() OR private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "owners/admins update memberships" ON public.memberships FOR UPDATE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "owners/admins delete memberships" ON public.memberships FOR DELETE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));

-- Recreate demandas policies
CREATE POLICY "members read demandas" ON public.demandas FOR SELECT
  USING (private.is_org_member(org_id, auth.uid()));
CREATE POLICY "agents insert demandas" ON public.demandas FOR INSERT
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente','operador','agente_ia']));
CREATE POLICY "agents update demandas" ON public.demandas FOR UPDATE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente','operador','agente_ia']))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente','operador','agente_ia']));
CREATE POLICY "admins delete demandas" ON public.demandas FOR DELETE
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));

-- Recreate organizations policies
CREATE POLICY "owners/admins update org" ON public.organizations FOR UPDATE
  USING (private.has_org_role(id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (private.has_org_role(id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "owners delete org" ON public.organizations FOR DELETE
  USING (private.has_org_role(id, auth.uid(), ARRAY['owner']));

-- Recreate channels/events/tokens policies
CREATE POLICY "admins manage channels" ON public.channels FOR ALL
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));
CREATE POLICY "agents insert events" ON public.demanda_events FOR INSERT
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente','operador','agente_ia']));
CREATE POLICY "admins manage tokens" ON public.webhook_tokens FOR ALL
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));

-- 3) is_ai_generated on audit
ALTER TABLE public.demanda_status_audit
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.log_demanda_status_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  is_ai boolean := false;
BEGIN
  IF actor IS NOT NULL THEN
    SELECT role INTO actor_role FROM public.memberships WHERE org_id = NEW.org_id AND user_id = actor;
    is_ai := actor_role = 'agente_ia';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.demanda_status_audit (org_id, demanda_id, actor_id, from_state, to_state, is_ai_generated)
    VALUES (NEW.org_id, NEW.id, actor, OLD.state::TEXT, NEW.state::TEXT, is_ai);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.demanda_status_audit (org_id, demanda_id, actor_id, from_state, to_state, is_ai_generated)
    VALUES (NEW.org_id, NEW.id, NEW.created_by, NULL, NEW.state::TEXT, is_ai);
  END IF;
  RETURN NEW;
END; $$;

-- Guard: AI cannot conclude
CREATE OR REPLACE FUNCTION public.guard_ai_demanda_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO actor_role FROM public.memberships
    WHERE org_id = NEW.org_id AND user_id = auth.uid();
  IF actor_role = 'agente_ia'
     AND NEW.state = 'concluido'::public.demanda_state
     AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM NEW.state) THEN
    RAISE EXCEPTION 'Agente de IA nao pode concluir demandas. Encaminhe para revisao humana.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_ai_demanda_state ON public.demandas;
CREATE TRIGGER trg_guard_ai_demanda_state
BEFORE INSERT OR UPDATE OF state ON public.demandas
FOR EACH ROW EXECUTE FUNCTION public.guard_ai_demanda_state();

-- Update log_demanda_changes trigger to use new state names
CREATE OR REPLACE FUNCTION public.log_demanda_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, to_value, content)
    VALUES (NEW.org_id, NEW.id, 'created', NEW.created_by, NEW.state::TEXT, NEW.title);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, from_value, to_value)
      VALUES (NEW.org_id, NEW.id, 'state_changed', auth.uid(), OLD.state::TEXT, NEW.state::TEXT);
      IF NEW.state = 'aguardando_revisao_humana' AND OLD.state <> 'aguardando_revisao_humana' THEN NEW.resolved_at = now(); END IF;
      IF NEW.state = 'concluido' AND OLD.state <> 'concluido' THEN NEW.closed_at = now(); END IF;
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, from_value, to_value)
      VALUES (NEW.org_id, NEW.id, 'assigned', auth.uid(), OLD.assignee_id::TEXT, NEW.assignee_id::TEXT);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, from_value, to_value)
      VALUES (NEW.org_id, NEW.id, 'priority_changed', auth.uid(), OLD.priority::TEXT, NEW.priority::TEXT);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 4) invites table
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email text,
  suggested_role text NOT NULL DEFAULT 'operador',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invites_org_status ON public.invites(org_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_requested_by ON public.invites(requested_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers view invites" ON public.invites FOR SELECT TO authenticated
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente'])
         OR requested_by = auth.uid());
CREATE POLICY "managers insert invites" ON public.invites FOR INSERT TO authenticated
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente']));
CREATE POLICY "managers update invites" ON public.invites FOR UPDATE TO authenticated
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente'])
         OR requested_by = auth.uid())
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente'])
         OR requested_by = auth.uid());
CREATE POLICY "managers delete invites" ON public.invites FOR DELETE TO authenticated
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','gerente']));

CREATE TRIGGER trg_invites_updated_at BEFORE UPDATE ON public.invites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
