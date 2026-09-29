CREATE TYPE "public"."identity_provider" AS ENUM('discord', 'github', 'slack', 'supabase');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."origin_provider" AS ENUM('discord', 'slack', 'web', 'api');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."request_event_type" AS ENUM('request_created', 'request_added', 'status_changed', 'priority_changed', 'impact_changed', 'effort_changed', 'assigned', 'target_release_changed', 'duplicate_merged', 'github_issue_linked', 'pull_request_linked', 'release_linked', 'released');--> statement-breakpoint
CREATE TYPE "public"."request_link_type" AS ENUM('github_issue', 'github_pull_request', 'release');--> statement-breakpoint
CREATE TYPE "public"."request_source_type" AS ENUM('customer', 'sales', 'management', 'internal', 'support', 'developer', 'other');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'reviewing', 'backlog', 'planned', 'in_progress', 'released', 'not_planned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('requester', 'developer', 'product_manager', 'admin');--> statement-breakpoint
CREATE TABLE "discord_channel_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"discord_guild_id" text NOT NULL,
	"discord_channel_id" text NOT NULL,
	"request_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text,
	"discord_guild_id" text NOT NULL,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_integrations_discord_guild_id_unique" UNIQUE("discord_guild_id")
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"external_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" "request_event_type" NOT NULL,
	"old_value" text,
	"new_value" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"link_type" "request_link_type" NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_number_sequences" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_origins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" "origin_provider" NOT NULL,
	"external_workspace_id" text,
	"external_channel_id" text,
	"external_message_id" text,
	"external_thread_id" text,
	"external_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"source_type" "request_source_type",
	"user_id" uuid,
	"external_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"priority" "priority",
	"impact" "level",
	"effort" "level",
	"requester_id" uuid,
	"assignee_id" uuid,
	"target_release_id" uuid,
	"duplicate_of_id" uuid,
	"source_provider" "origin_provider" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" "user_role" DEFAULT 'requester' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "discord_channel_mappings" ADD CONSTRAINT "discord_channel_mappings_integration_id_discord_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."discord_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel_mappings" ADD CONSTRAINT "discord_channel_mappings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel_mappings" ADD CONSTRAINT "discord_channel_mappings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_integrations" ADD CONSTRAINT "discord_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_links" ADD CONSTRAINT "request_links_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_links" ADD CONSTRAINT "request_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_number_sequences" ADD CONSTRAINT "request_number_sequences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_origins" ADD CONSTRAINT "request_origins_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_sources" ADD CONSTRAINT "request_sources_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_sources" ADD CONSTRAINT "request_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_target_release_id_releases_id_fk" FOREIGN KEY ("target_release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_duplicate_of_id_requests_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_channel_mappings_guild_channel_key" ON "discord_channel_mappings" USING btree ("discord_guild_id","discord_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_user_provider_key" ON "external_identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "external_identities_provider_external_idx" ON "external_identities" USING btree ("provider","external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_key" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_project_name_key" ON "releases" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "request_events_request_idx" ON "request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "request_links_request_idx" ON "request_links" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_origins_request_idx" ON "request_origins" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_sources_request_idx" ON "request_sources" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_workspace_number_key" ON "requests" USING btree ("workspace_id","request_number");--> statement-breakpoint
CREATE INDEX "requests_workspace_status_idx" ON "requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "requests_project_idx" ON "requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "requests_duplicate_of_idx" ON "requests" USING btree ("duplicate_of_id") WHERE "requests"."duplicate_of_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_workspace_email_key" ON "users" USING btree ("workspace_id","email");