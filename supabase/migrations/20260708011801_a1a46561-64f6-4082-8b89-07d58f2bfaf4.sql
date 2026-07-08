
-- ====== ENUMS ======
CREATE TYPE public.app_role AS ENUM ('owner','admin','agent','viewer');
CREATE TYPE public.demanda_state AS ENUM ('novo','em_analise','aguardando_cliente','resolvido','fechado');
CREATE TYPE public.demanda_priority AS ENUM ('baixa','media','alta','urgente');
CREATE TYPE public.channel_kind AS ENUM ('whatsapp','instagram','telegram','email','portal','api','manual');
CREATE TYPE public.event_kind AS ENUM ('created','state_changed','assigned','commented','message_in','message_out','due_updated','priority_changed','closed');

-- ====== ORGANIZATIONS ======
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ====== MEMBERSHIPS ======
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.memberships (user_id);
CREATE INDEX ON public.memberships (org_id);

-- ====== SECURITY DEFINER HELPERS ======
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id=_org AND user_id=_user)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _user UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE org_id=_org AND user_id=_user AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user UUID)
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT org_id FROM public.memberships WHERE user_id = _user
$$;

-- ====== ORGANIZATIONS POLICIES ======
CREATE POLICY "members read orgs" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "any user create org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "owners/admins update org" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "owners delete org" ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner']::public.app_role[]));

-- ====== MEMBERSHIPS POLICIES ======
CREATE POLICY "members read own memberships" ON public.memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "self-insert first membership as owner" ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "owners/admins update memberships" ON public.memberships FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "owners/admins delete memberships" ON public.memberships FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ====== CONTACTS ======
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  email TEXT,
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.contacts (org_id);
CREATE INDEX ON public.contacts (org_id, phone);
CREATE POLICY "members access contacts" ON public.contacts FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- ====== CHANNELS ======
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.channel_kind NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read channels" ON public.channels FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "admins manage channels" ON public.channels FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ====== DEMANDAS ======
CREATE TABLE public.demandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  state public.demanda_state NOT NULL DEFAULT 'novo',
  priority public.demanda_priority NOT NULL DEFAULT 'media',
  category TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demandas TO authenticated;
GRANT ALL ON public.demandas TO service_role;
ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.demandas (org_id, state);
CREATE INDEX ON public.demandas (org_id, assignee_id);
CREATE INDEX ON public.demandas (org_id, due_at);
CREATE INDEX ON public.demandas (org_id, created_at DESC);

CREATE POLICY "members read demandas" ON public.demandas FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "agents insert demandas" ON public.demandas FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.app_role[]));
CREATE POLICY "agents update demandas" ON public.demandas FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.app_role[]));
CREATE POLICY "admins delete demandas" ON public.demandas FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ====== DEMANDA EVENTS (histórico/audit log) ======
CREATE TABLE public.demanda_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  kind public.event_kind NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  from_value TEXT,
  to_value TEXT,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.demanda_events TO authenticated;
GRANT ALL ON public.demanda_events TO service_role;
ALTER TABLE public.demanda_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.demanda_events (demanda_id, created_at DESC);
CREATE POLICY "members read events" ON public.demanda_events FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "agents insert events" ON public.demanda_events FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::public.app_role[]));

-- ====== WEBHOOK TOKENS ======
CREATE TABLE public.webhook_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_tokens TO authenticated;
GRANT ALL ON public.webhook_tokens TO service_role;
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tokens" ON public.webhook_tokens FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ====== updated_at trigger ======
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_orgs_upd BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_demandas_upd BEFORE UPDATE ON public.demandas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== Auto-owner on org creation ======
CREATE OR REPLACE FUNCTION public.create_org_owner_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.memberships (org_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_orgs_owner AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.create_org_owner_membership();

-- ====== Auto-log demanda state changes ======
CREATE OR REPLACE FUNCTION public.log_demanda_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, to_value, content)
    VALUES (NEW.org_id, NEW.id, 'created', NEW.created_by, NEW.state::TEXT, NEW.title);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      INSERT INTO public.demanda_events (org_id, demanda_id, kind, actor_id, from_value, to_value)
      VALUES (NEW.org_id, NEW.id, 'state_changed', auth.uid(), OLD.state::TEXT, NEW.state::TEXT);
      IF NEW.state = 'resolvido' AND OLD.state <> 'resolvido' THEN NEW.resolved_at = now(); END IF;
      IF NEW.state = 'fechado' AND OLD.state <> 'fechado' THEN NEW.closed_at = now(); END IF;
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
CREATE TRIGGER trg_demandas_log AFTER INSERT ON public.demandas FOR EACH ROW EXECUTE FUNCTION public.log_demanda_changes();
CREATE TRIGGER trg_demandas_log_upd BEFORE UPDATE ON public.demandas FOR EACH ROW EXECUTE FUNCTION public.log_demanda_changes();
