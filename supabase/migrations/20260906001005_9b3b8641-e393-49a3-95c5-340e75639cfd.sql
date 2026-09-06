ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS connected_number text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS use_master_credentials boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_settings
  DROP CONSTRAINT IF EXISTS whatsapp_settings_connection_status_check;
ALTER TABLE public.whatsapp_settings
  ADD CONSTRAINT whatsapp_settings_connection_status_check
  CHECK (connection_status IN ('disconnected','connecting','connected'));