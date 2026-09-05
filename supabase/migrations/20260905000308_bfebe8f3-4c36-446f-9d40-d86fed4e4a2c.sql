CREATE TYPE public.demanda_channel_type AS ENUM ('simulation','evolution','whatsapp_official');

ALTER TABLE public.demandas
  ADD COLUMN whatsapp_jid text,
  ADD COLUMN last_message_id text,
  ADD COLUMN instance_name text,
  ADD COLUMN channel_type public.demanda_channel_type NOT NULL DEFAULT 'simulation';

CREATE INDEX IF NOT EXISTS demandas_whatsapp_jid_idx ON public.demandas (org_id, whatsapp_jid);

CREATE TABLE public.whatsapp_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_url text,
  api_key text,
  instance_name text,
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage whatsapp settings" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (private.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']));

CREATE TRIGGER whatsapp_settings_set_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();