
CREATE TABLE public.demanda_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  actor_id UUID,
  from_state TEXT,
  to_state TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.demanda_status_audit TO authenticated;
GRANT ALL ON public.demanda_status_audit TO service_role;

ALTER TABLE public.demanda_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view org audit"
ON public.demanda_status_audit FOR SELECT
TO authenticated
USING (private.is_org_member(org_id, auth.uid()));

CREATE INDEX idx_dsa_demanda ON public.demanda_status_audit(demanda_id, changed_at DESC);
CREATE INDEX idx_dsa_org ON public.demanda_status_audit(org_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_demanda_status_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.demanda_status_audit (org_id, demanda_id, actor_id, from_state, to_state)
    VALUES (NEW.org_id, NEW.id, auth.uid(), OLD.state::TEXT, NEW.state::TEXT);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.demanda_status_audit (org_id, demanda_id, actor_id, from_state, to_state)
    VALUES (NEW.org_id, NEW.id, NEW.created_by, NULL, NEW.state::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_demanda_status_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_demanda_status_audit
AFTER INSERT OR UPDATE OF state ON public.demandas
FOR EACH ROW EXECUTE FUNCTION public.log_demanda_status_audit();
