ALTER TABLE public.demanda_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demanda_events;