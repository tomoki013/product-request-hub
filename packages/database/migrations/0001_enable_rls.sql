-- The API connects as a privileged role and enforces authorization itself.
-- Enable RLS without policies so Supabase's anon/authenticated roles
-- (PostgREST) cannot read or write these tables directly.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discord_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discord_channel_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_number_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_origins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_events" ENABLE ROW LEVEL SECURITY;
