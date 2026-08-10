-- Protocol code for public tracking
CREATE OR REPLACE FUNCTION public.gen_demanda_protocol()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE code text; ok boolean := false;
BEGIN
  WHILE NOT ok LOOP
    code := 'DM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    SELECT NOT EXISTS(SELECT 1 FROM public.demandas WHERE protocol = code) INTO ok;
  END LOOP;
  RETURN code;
END; $$;

ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS protocol text;

UPDATE public.demandas SET protocol = 'DM-' || upper(substr(replace(id::text,'-',''),1,6)) WHERE protocol IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS demandas_protocol_key ON public.demandas(protocol);

ALTER TABLE public.demandas ALTER COLUMN protocol SET DEFAULT public.gen_demanda_protocol();

CREATE OR REPLACE FUNCTION public.set_demanda_protocol()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.protocol IS NULL THEN NEW.protocol := public.gen_demanda_protocol(); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_demandas_protocol ON public.demandas;
CREATE TRIGGER trg_demandas_protocol BEFORE INSERT ON public.demandas
FOR EACH ROW EXECUTE FUNCTION public.set_demanda_protocol();

REVOKE ALL ON FUNCTION public.gen_demanda_protocol() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_demanda_protocol() FROM PUBLIC, anon;

-- Realtime for in-app notifications of new demands
ALTER PUBLICATION supabase_realtime ADD TABLE public.demandas;