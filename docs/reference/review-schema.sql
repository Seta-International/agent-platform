--
-- PostgreSQL database dump
--

\restrict e3Loe7qk13oQEIfYNiDEDdDbjtdYNyCo5Zr9uYSraKgA1VRE7MRsIWbd31wCAqi

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg13+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: agent; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA agent;


--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: hiring; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA hiring;


--
-- Name: identity; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA identity;


--
-- Name: integrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA integrations;


--
-- Name: knowledge; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA knowledge;


--
-- Name: notifications; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA notifications;


--
-- Name: people; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA people;


--
-- Name: planner; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA planner;


--
-- Name: pm; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pm;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: agent; Owner: -
--

CREATE FUNCTION agent.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: _notify_events(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core._notify_events() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN PERFORM pg_notify('events', ''); RETURN NULL; END $$;


--
-- Name: ensure_events_partition(date); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.ensure_events_partition(month_start date) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  part_name  text := format('events_y%sm%s', to_char(month_start, 'YYYY'), to_char(month_start, 'MM'));
  next_month date := (month_start + interval '1 month')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS core.%I PARTITION OF core.events FOR VALUES FROM (%L) TO (%L)',
    part_name, month_start, next_month
  );
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: hiring; Owner: -
--

CREATE FUNCTION hiring.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: identity; Owner: -
--

CREATE FUNCTION identity.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: integrations; Owner: -
--

CREATE FUNCTION integrations.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: knowledge; Owner: -
--

CREATE FUNCTION knowledge.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: notifications; Owner: -
--

CREATE FUNCTION notifications.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: people; Owner: -
--

CREATE FUNCTION people.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: planner; Owner: -
--

CREATE FUNCTION planner.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: tg_touch_updated_at(); Type: FUNCTION; Schema: pm; Owner: -
--

CREATE FUNCTION pm.tg_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: rate_limits; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.rate_limits (
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    tokens_in integer DEFAULT 0 NOT NULL,
    tokens_out integer DEFAULT 0 NOT NULL,
    turns integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY agent.rate_limits FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_settings; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.tenant_settings (
    tenant_id uuid NOT NULL,
    dedup_weights jsonb NOT NULL,
    dedup_thresholds jsonb NOT NULL,
    assignment_weights jsonb NOT NULL,
    approval_ttl_hours integer DEFAULT 72 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY agent.tenant_settings FORCE ROW LEVEL SECURITY;


--
-- Name: workflow_approvals; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.workflow_approvals (
    approval_id uuid NOT NULL,
    run_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    step_id text NOT NULL,
    proposed_payload jsonb NOT NULL,
    approver_user_id uuid NOT NULL,
    fallback_approver_user_id uuid,
    surface_canvas boolean DEFAULT true NOT NULL,
    surface_chat_thread_id text,
    mastra_run_id text,
    tool_call_id text,
    status text NOT NULL,
    decision_payload jsonb,
    decided_by uuid,
    decided_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'modified'::text, 'superseded'::text, 'expired'::text])))
);

ALTER TABLE ONLY agent.workflow_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: workflow_run_events_seen; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.workflow_run_events_seen (
    run_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    event_seq bigint NOT NULL
);

ALTER TABLE ONLY agent.workflow_run_events_seen FORCE ROW LEVEL SECURITY;


--
-- Name: workflow_run_steps; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.workflow_run_steps (
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    step_id text NOT NULL,
    agent_id text NOT NULL,
    reasoning_trace jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_citations jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence_score numeric(4,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_run_steps_confidence_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
);

ALTER TABLE ONLY agent.workflow_run_steps FORCE ROW LEVEL SECURITY;


--
-- Name: workflow_runs; Type: TABLE; Schema: agent; Owner: -
--

CREATE TABLE agent.workflow_runs (
    run_id uuid NOT NULL,
    workflow_id text NOT NULL,
    tenant_id uuid NOT NULL,
    started_by uuid NOT NULL,
    started_via text NOT NULL,
    parent_thread_id uuid,
    parent_run_id uuid,
    source_event_id uuid,
    input_summary jsonb NOT NULL,
    state jsonb DEFAULT '{"outputs": {}}'::jsonb NOT NULL,
    result jsonb,
    status text NOT NULL,
    suspend_reason text,
    error_summary text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    CONSTRAINT workflow_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'paused'::text, 'success'::text, 'failed'::text, 'canceled'::text])))
);

ALTER TABLE ONLY agent.workflow_runs FORCE ROW LEVEL SECURITY;


--
-- Name: __platform_migrations; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.__platform_migrations (
    module text NOT NULL,
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
)
PARTITION BY RANGE (occurred_at);


--
-- Name: audit_v; Type: VIEW; Schema: core; Owner: -
--

CREATE VIEW core.audit_v AS
 SELECT id AS event_id,
    occurred_at,
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor,
    payload,
    before,
    after,
    trace_id
   FROM core.events
  WHERE (actor IS NOT NULL);


--
-- Name: events_y2026m07; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m07 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2026m08; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m08 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2026m09; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m09 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2026m10; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m10 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2026m11; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m11 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2026m12; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2026m12 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m01; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m01 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m02; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m02 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m03; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m03 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m04; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m04 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m05; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m05 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m06; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m06 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: events_y2027m07; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.events_y2027m07 (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    event_version integer NOT NULL,
    payload jsonb NOT NULL,
    caused_by_user_id uuid,
    caused_by_event_id uuid,
    trace_id text,
    trace_parent text,
    trace_state text,
    actor jsonb,
    before jsonb,
    after jsonb
);


--
-- Name: outgoing_emails; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.outgoing_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    dedupe_key text NOT NULL,
    template text NOT NULL,
    to_address text NOT NULL,
    props_hash text NOT NULL,
    transport_kind text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    last_error_at timestamp with time zone,
    transport_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT outgoing_emails_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'permanently_failed'::text]))),
    CONSTRAINT outgoing_emails_transport_kind_check CHECK ((transport_kind = ANY (ARRAY['graph'::text, 'smtp'::text, 'dev-stub'::text, 'operator-smtp'::text, 'operator-dev-stub'::text])))
);


--
-- Name: rpc_idempotency; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.rpc_idempotency (
    idempotency_key text NOT NULL,
    module text NOT NULL,
    method text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_scope_cache; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.session_scope_cache (
    session_id text NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_summary_hash text NOT NULL,
    role_summary jsonb NOT NULL,
    cross_tenant_read boolean DEFAULT false NOT NULL,
    built_at timestamp with time zone DEFAULT now() NOT NULL,
    invalidated_at timestamp with time zone
);

ALTER TABLE ONLY core.session_scope_cache FORCE ROW LEVEL SECURITY;


--
-- Name: skill; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.skill FORCE ROW LEVEL SECURITY;


--
-- Name: skill_category; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.skill_category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY core.skill_category FORCE ROW LEVEL SECURITY;


--
-- Name: subscription_cursors; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.subscription_cursors (
    subscription text NOT NULL,
    last_processed_event_id uuid NOT NULL,
    last_processed_occurred_at timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    last_processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_dead_letter; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.subscription_dead_letter (
    id bigint NOT NULL,
    subscription text NOT NULL,
    event_id uuid NOT NULL,
    event_type text NOT NULL,
    attempts integer NOT NULL,
    last_error text NOT NULL,
    payload jsonb NOT NULL,
    first_failed_at timestamp with time zone NOT NULL,
    dead_lettered_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_dead_letter_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

CREATE SEQUENCE core.subscription_dead_letter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_dead_letter_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: -
--

ALTER SEQUENCE core.subscription_dead_letter_id_seq OWNED BY core.subscription_dead_letter.id;


--
-- Name: subscription_failure_state; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.subscription_failure_state (
    subscription text NOT NULL,
    event_id uuid NOT NULL,
    attempts integer NOT NULL,
    first_failed_at timestamp with time zone NOT NULL,
    last_error text NOT NULL,
    next_retry_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_processed; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.subscription_processed (
    subscription text NOT NULL,
    event_id uuid NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenants (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    idle_timeout_days integer DEFAULT 30 NOT NULL,
    local_password_disabled boolean DEFAULT false NOT NULL,
    email_domains text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    suspended_at timestamp with time zone
);


--
-- Name: application; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.application (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    requisition_id uuid NOT NULL,
    kind text NOT NULL,
    candidate_id uuid,
    worker_id uuid,
    stage text DEFAULT 'new'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    rating integer,
    rejection_reason_id uuid,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    note text,
    closed_at timestamp with time zone,
    superseded_by_application_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_kind_check CHECK ((kind = ANY (ARRAY['external'::text, 'internal'::text]))),
    CONSTRAINT application_one_subject_check CHECK (((candidate_id IS NOT NULL) <> (worker_id IS NOT NULL))),
    CONSTRAINT application_rating_check CHECK (((rating IS NULL) OR ((rating >= 0) AND (rating <= 5)))),
    CONSTRAINT application_stage_check CHECK ((stage = ANY (ARRAY['new'::text, 'screening'::text, 'interview'::text, 'offer'::text]))),
    CONSTRAINT application_status_check CHECK ((status = ANY (ARRAY['active'::text, 'hired'::text, 'rejected'::text, 'transferred'::text])))
);

ALTER TABLE ONLY hiring.application FORCE ROW LEVEL SECURITY;


--
-- Name: candidate; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.candidate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    source text,
    contact jsonb,
    dob date,
    gender text,
    cv_storage_key text,
    seniority text,
    segment text,
    source_cost numeric(15,4),
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'prefer_not_to_say'::text])))
);

ALTER TABLE ONLY hiring.candidate FORCE ROW LEVEL SECURITY;


--
-- Name: candidate_event; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.candidate_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    application_id uuid,
    kind text NOT NULL,
    summary text NOT NULL,
    detail jsonb,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_event_kind_check CHECK ((kind = ANY (ARRAY['created'::text, 'stage_changed'::text, 'rejected'::text, 'transferred'::text, 'rating_changed'::text, 'note_changed'::text, 'skills_changed'::text, 'profile_changed'::text])))
);

ALTER TABLE ONLY hiring.candidate_event FORCE ROW LEVEL SECURITY;


--
-- Name: candidate_skill; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.candidate_skill (
    tenant_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    skill_name text NOT NULL,
    level integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_skill_level_check CHECK (((level IS NULL) OR ((level >= 0) AND (level <= 5))))
);

ALTER TABLE ONLY hiring.candidate_skill FORCE ROW LEVEL SECURITY;


--
-- Name: jd_template; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.jd_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jd_template_kind_check CHECK ((kind = ANY (ARRAY['role'::text, 'intro'::text, 'closing'::text])))
);

ALTER TABLE ONLY hiring.jd_template FORCE ROW LEVEL SECURITY;


--
-- Name: jd_template_section; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.jd_template_section (
    tenant_id uuid NOT NULL,
    template_id uuid NOT NULL,
    variant text NOT NULL,
    section text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jd_template_section_section_check CHECK ((section = ANY (ARRAY['about'::text, 'responsibilities'::text, 'requirements'::text, 'nice_to_have'::text]))),
    CONSTRAINT jd_template_section_variant_check CHECK ((variant = ANY (ARRAY['internal'::text, 'external'::text])))
);

ALTER TABLE ONLY hiring.jd_template_section FORCE ROW LEVEL SECURITY;


--
-- Name: opening; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.opening (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    requisition_id uuid NOT NULL,
    seq integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    close_reason_id uuid,
    closed_at timestamp with time zone,
    hired_application_id uuid,
    resource_request_id uuid,
    position_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT opening_status_check CHECK ((status = ANY (ARRAY['open'::text, 'filled'::text, 'closed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY hiring.opening FORCE ROW LEVEL SECURITY;


--
-- Name: opening_close_reason; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.opening_close_reason (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY hiring.opening_close_reason FORCE ROW LEVEL SECURITY;


--
-- Name: rejection_reason; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.rejection_reason (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rejection_reason_category_check CHECK ((category = ANY (ARRAY['rejected_by_us'::text, 'withdrew'::text, 'other'::text])))
);

ALTER TABLE ONLY hiring.rejection_reason FORCE ROW LEVEL SECURITY;


--
-- Name: requisition; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.requisition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    role_title text,
    grade text,
    account_id uuid,
    kind text DEFAULT 'new'::text NOT NULL,
    approval_status text DEFAULT 'draft'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    stage text DEFAULT 'sourcing'::text NOT NULL,
    owner_user_id uuid,
    due_date date,
    start_date date,
    note text,
    default_interview_mode text,
    closed_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT requisition_approval_status_check CHECK ((approval_status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT requisition_default_interview_mode_check CHECK ((default_interview_mode = ANY (ARRAY['online'::text, 'onsite'::text, 'either'::text]))),
    CONSTRAINT requisition_kind_check CHECK ((kind = ANY (ARRAY['replacement'::text, 'new'::text]))),
    CONSTRAINT requisition_stage_check CHECK ((stage = ANY (ARRAY['sourcing'::text, 'screening'::text, 'interview'::text, 'offer'::text]))),
    CONSTRAINT requisition_status_check CHECK ((status = ANY (ARRAY['open'::text, 'on_hold'::text, 'filled'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY hiring.requisition FORCE ROW LEVEL SECURITY;


--
-- Name: requisition_jd_section; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.requisition_jd_section (
    tenant_id uuid NOT NULL,
    requisition_id uuid NOT NULL,
    variant text NOT NULL,
    section text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT requisition_jd_section_section_check CHECK ((section = ANY (ARRAY['about'::text, 'responsibilities'::text, 'requirements'::text, 'nice_to_have'::text]))),
    CONSTRAINT requisition_jd_section_variant_check CHECK ((variant = ANY (ARRAY['internal'::text, 'external'::text])))
);

ALTER TABLE ONLY hiring.requisition_jd_section FORCE ROW LEVEL SECURITY;


--
-- Name: requisition_skill; Type: TABLE; Schema: hiring; Owner: -
--

CREATE TABLE hiring.requisition_skill (
    tenant_id uuid NOT NULL,
    requisition_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    skill_name text NOT NULL,
    min_level integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY hiring.requisition_skill FORCE ROW LEVEL SECURITY;


--
-- Name: access_group; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.access_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    kind text DEFAULT 'custom'::text NOT NULL,
    is_base boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_group_kind_check CHECK ((kind = ANY (ARRAY['default'::text, 'custom'::text])))
);

ALTER TABLE ONLY identity.access_group FORCE ROW LEVEL SECURITY;


--
-- Name: access_group_membership; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.access_group_membership (
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY identity.access_group_membership FORCE ROW LEVEL SECURITY;


--
-- Name: access_group_role; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.access_group_role (
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    role_slug text NOT NULL,
    scope_kind text DEFAULT 'tenant'::text NOT NULL,
    scope_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    CONSTRAINT access_group_role_scope_check CHECK (((scope_kind = 'org_unit'::text) = (scope_id <> '00000000-0000-0000-0000-000000000000'::uuid))),
    CONSTRAINT access_group_role_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['tenant'::text, 'org_unit'::text, 'self'::text])))
);

ALTER TABLE ONLY identity.access_group_role FORCE ROW LEVEL SECURITY;


--
-- Name: account; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.account (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider_id text NOT NULL,
    account_id text NOT NULL,
    password text,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    id_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: failed_login_alerts_sent; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.failed_login_alerts_sent (
    email text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL
);


--
-- Name: failed_login_attempts; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.failed_login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    ip text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text NOT NULL
);


--
-- Name: org_unit_projection; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.org_unit_projection (
    org_unit_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY identity.org_unit_projection FORCE ROW LEVEL SECURITY;


--
-- Name: person_projection; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.person_projection (
    person_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    full_name text NOT NULL,
    work_email text,
    job_title text,
    employment_status text DEFAULT 'active'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT person_projection_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'terminated'::text])))
);

ALTER TABLE ONLY identity.person_projection FORCE ROW LEVEL SECURITY;


--
-- Name: product_grant; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.product_grant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    product_id text NOT NULL,
    effect text NOT NULL,
    granted_by uuid,
    granted_via text DEFAULT 'admin'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_grant_effect_check CHECK ((effect = ANY (ARRAY['grant'::text, 'revoke'::text]))),
    CONSTRAINT product_grant_granted_via_check CHECK ((granted_via = ANY (ARRAY['admin'::text, 'seed'::text, 'cli'::text]))),
    CONSTRAINT product_grant_subject_type_check CHECK ((subject_type = ANY (ARRAY['tenant'::text, 'group'::text, 'user'::text])))
);

ALTER TABLE ONLY identity.product_grant FORCE ROW LEVEL SECURITY;


--
-- Name: rate_limit; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.rate_limit (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    "lastRequest" bigint NOT NULL
);


--
-- Name: role_assignments; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role_slug text NOT NULL,
    scope_kind text DEFAULT 'tenant'::text NOT NULL,
    scope_id uuid,
    granted_by uuid,
    granted_via text DEFAULT 'admin'::text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    CONSTRAINT role_assignments_granted_via_check CHECK ((granted_via = ANY (ARRAY['admin'::text, 'cli'::text, 'idp'::text]))),
    CONSTRAINT role_assignments_scope_check CHECK ((((scope_kind = 'org_unit'::text) AND (scope_id IS NOT NULL)) OR ((scope_kind = ANY (ARRAY['tenant'::text, 'self'::text])) AND (scope_id IS NULL)))),
    CONSTRAINT role_assignments_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['tenant'::text, 'org_unit'::text, 'self'::text])))
);

ALTER TABLE ONLY identity.role_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: role_permission_overlays; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.role_permission_overlays (
    tenant_id uuid NOT NULL,
    role_slug text NOT NULL,
    permission_key text NOT NULL,
    effect text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_permission_overlays_effect_check CHECK ((effect = ANY (ARRAY['grant'::text, 'revoke'::text])))
);

ALTER TABLE ONLY identity.role_permission_overlays FORCE ROW LEVEL SECURITY;


--
-- Name: session; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.session (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_sso_providers; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.tenant_sso_providers (
    tenant_id uuid NOT NULL,
    provider_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entra_tenant_id uuid
);

ALTER TABLE ONLY identity.tenant_sso_providers FORCE ROW LEVEL SECURITY;


--
-- Name: user; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity."user" (
    id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    tenant_id uuid NOT NULL,
    deactivated_at timestamp with time zone,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.verification (
    id uuid NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: m365_group_links; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.m365_group_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    external_id text NOT NULL,
    delta_link text,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_fields jsonb NOT NULL,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_error text,
    unlinked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT m365_group_links_sync_status_check CHECK ((sync_status = ANY (ARRAY['idle'::text, 'pulling'::text, 'pushing'::text, 'error'::text, 'conflict'::text])))
);

ALTER TABLE ONLY integrations.m365_group_links FORCE ROW LEVEL SECURITY;


--
-- Name: m365_plan_links; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.m365_plan_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    external_id text NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_error text,
    last_reconcile_at timestamp with time zone,
    unlinked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT m365_plan_links_sync_status_check CHECK ((sync_status = ANY (ARRAY['idle'::text, 'pulling'::text, 'pushing'::text, 'error'::text, 'conflict'::text])))
);

ALTER TABLE ONLY integrations.m365_plan_links FORCE ROW LEVEL SECURITY;


--
-- Name: m365_resource_etags; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.m365_resource_etags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_link_id uuid NOT NULL,
    resource_type text NOT NULL,
    platform_id text NOT NULL,
    external_id text NOT NULL,
    etag text NOT NULL,
    last_synced_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT m365_resource_etags_resource_type_check CHECK ((resource_type = ANY (ARRAY['plan'::text, 'planDetails'::text, 'bucket'::text, 'task'::text, 'taskDetails'::text, 'bucketTaskBoardTaskFormat'::text, 'assignment'::text])))
);

ALTER TABLE ONLY integrations.m365_resource_etags FORCE ROW LEVEL SECURITY;


--
-- Name: m365_subscriptions; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.m365_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subscription_id text NOT NULL,
    resource text NOT NULL,
    change_type text NOT NULL,
    expiration_at timestamp with time zone NOT NULL,
    client_state_hmac text NOT NULL,
    renewal_job_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY integrations.m365_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: m365_tenant_config; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.m365_tenant_config (
    tenant_id uuid NOT NULL,
    entra_tenant_id uuid NOT NULL,
    client_id text NOT NULL,
    client_secret_blob jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY integrations.m365_tenant_config FORCE ROW LEVEL SECURITY;


--
-- Name: mail_transport_config; Type: TABLE; Schema: integrations; Owner: -
--

CREATE TABLE integrations.mail_transport_config (
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    sender_address text NOT NULL,
    sender_display_name text,
    config jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_verified_at timestamp with time zone,
    last_verify_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid NOT NULL,
    CONSTRAINT mail_transport_config_kind_check CHECK ((kind = ANY (ARRAY['graph'::text, 'smtp'::text])))
);

ALTER TABLE ONLY integrations.mail_transport_config FORCE ROW LEVEL SECURITY;


--
-- Name: chunks; Type: TABLE; Schema: knowledge; Owner: -
--

CREATE TABLE knowledge.chunks (
    tenant_id uuid NOT NULL,
    file_id uuid NOT NULL,
    chunk_ordinal integer NOT NULL,
    chunk_text text NOT NULL,
    page_hint text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chunks_chunk_ordinal_check CHECK ((chunk_ordinal >= 0))
)
PARTITION BY LIST (tenant_id);

ALTER TABLE ONLY knowledge.chunks FORCE ROW LEVEL SECURITY;


--
-- Name: files; Type: TABLE; Schema: knowledge; Owner: -
--

CREATE TABLE knowledge.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    s3_key text NOT NULL,
    status text NOT NULL,
    scan_status text DEFAULT 'pending'::text NOT NULL,
    scan_at timestamp with time zone,
    scan_detail text,
    error_reason text,
    thread_id uuid,
    origin text DEFAULT 'knowledge_base'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    consumed_at timestamp with time zone,
    CONSTRAINT files_origin_check CHECK ((origin = ANY (ARRAY['knowledge_base'::text, 'chat'::text]))),
    CONSTRAINT files_origin_thread_check CHECK (((origin = 'chat'::text) = (thread_id IS NOT NULL))),
    CONSTRAINT files_scan_status_check CHECK ((scan_status = ANY (ARRAY['pending'::text, 'scanning'::text, 'clean'::text, 'infected'::text, 'error'::text]))),
    CONSTRAINT files_status_check CHECK ((status = ANY (ARRAY['uploading'::text, 'uploaded'::text, 'consumed'::text, 'parsing'::text, 'embedding'::text, 'ready'::text, 'failed'::text])))
);

ALTER TABLE ONLY knowledge.files FORCE ROW LEVEL SECURITY;


--
-- Name: notification_prefs; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.notification_prefs (
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT notification_prefs_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text])))
);

ALTER TABLE ONLY notifications.notification_prefs FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    source_event_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone
);

ALTER TABLE ONLY notifications.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: account_projection; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.account_projection (
    account_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    am_worker_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY people.account_projection FORCE ROW LEVEL SECURITY;


--
-- Name: employment_period; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.employment_period (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    seq integer NOT NULL,
    start_date date,
    end_date date,
    lifecycle_stage text DEFAULT 'preboarding'::text NOT NULL,
    employment_type text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employment_period_lifecycle_stage_check CHECK ((lifecycle_stage = ANY (ARRAY['preboarding'::text, 'onboarding'::text, 'probation'::text, 'active'::text, 'on_leave'::text, 'offboarding'::text, 'alumni'::text, 'did_not_start'::text])))
);

ALTER TABLE ONLY people.employment_period FORCE ROW LEVEL SECURITY;


--
-- Name: org_unit; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.org_unit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    kind text NOT NULL,
    head_worker_id uuid,
    sort integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_unit_kind_check CHECK ((kind = ANY (ARRAY['executive'::text, 'operation'::text, 'function'::text, 'delivery'::text, 'pmo'::text])))
);

ALTER TABLE ONLY people.org_unit FORCE ROW LEVEL SECURITY;


--
-- Name: person; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.person (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid,
    bio text,
    original_hire_date date,
    seniority_date date,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY people.person FORCE ROW LEVEL SECURITY;


--
-- Name: person_skill; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.person_skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    skill_name text NOT NULL,
    level integer,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT person_skill_level_check CHECK (((level >= 0) AND (level <= 5)))
);

ALTER TABLE ONLY people.person_skill FORCE ROW LEVEL SECURITY;


--
-- Name: project_projection; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.project_projection (
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY people.project_projection FORCE ROW LEVEL SECURITY;


--
-- Name: worker; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.worker (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    employee_no text,
    full_name text NOT NULL,
    work_email text,
    dob date,
    gender text,
    phone text,
    emergency_contact jsonb,
    profile_completed_at timestamp with time zone,
    job_title text,
    org_unit_id uuid,
    availability_status text DEFAULT 'available'::text NOT NULL,
    ooo_until timestamp with time zone,
    work_start time without time zone,
    work_end time without time zone,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worker_availability_status_check CHECK ((availability_status = ANY (ARRAY['available'::text, 'busy'::text, 'ooo'::text]))),
    CONSTRAINT worker_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'prefer_not_to_say'::text])))
);

ALTER TABLE ONLY people.worker FORCE ROW LEVEL SECURITY;


--
-- Name: worker_allocation_projection; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.worker_allocation_projection (
    allocation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    worker_id uuid,
    project_id uuid NOT NULL,
    account_id uuid NOT NULL,
    account_name text NOT NULL,
    lead_worker_id uuid,
    date_from date,
    date_to date,
    planned_pct numeric(10,4),
    bucket text,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worker_alloc_bucket_check CHECK (((bucket IS NULL) OR (bucket = ANY (ARRAY['billable'::text, 'internal'::text, 'bench'::text]))))
);

ALTER TABLE ONLY people.worker_allocation_projection FORCE ROW LEVEL SECURITY;


--
-- Name: worker_history; Type: TABLE; Schema: people; Owner: -
--

CREATE TABLE people.worker_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    field text,
    from_val jsonb,
    to_val jsonb,
    by_user_id uuid
);

ALTER TABLE ONLY people.worker_history FORCE ROW LEVEL SECURITY;


--
-- Name: assignee_projection; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.assignee_projection (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    display_name text NOT NULL,
    email text NOT NULL,
    skills text[] DEFAULT '{}'::text[] NOT NULL,
    availability_status text NOT NULL,
    timezone text NOT NULL,
    ooo_until timestamp with time zone,
    deactivated_at timestamp with time zone,
    projection_built_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assignee_projection_availability_status_check CHECK ((availability_status = ANY (ARRAY['available'::text, 'busy'::text, 'ooo'::text])))
);

ALTER TABLE ONLY planner.assignee_projection FORCE ROW LEVEL SECURITY;


--
-- Name: buckets; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    name text NOT NULL,
    order_hint text,
    external_source text DEFAULT 'native'::text NOT NULL,
    external_id text,
    external_etag text,
    external_synced_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT buckets_external_source_check CHECK ((external_source = ANY (ARRAY['native'::text, 'm365'::text])))
);

ALTER TABLE ONLY planner.buckets FORCE ROW LEVEL SECURITY;


--
-- Name: checklist_items; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    label text NOT NULL,
    checked boolean DEFAULT false NOT NULL,
    order_hint text,
    external_id text,
    external_etag text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

ALTER TABLE ONLY planner.checklist_items FORCE ROW LEVEL SECURITY;


--
-- Name: group_join_requests; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.group_join_requests (
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

ALTER TABLE ONLY planner.group_join_requests FORCE ROW LEVEL SECURITY;


--
-- Name: group_members; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.group_members (
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid NOT NULL,
    CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);

ALTER TABLE ONLY planner.group_members FORCE ROW LEVEL SECURITY;


--
-- Name: groups; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    theme text DEFAULT 'blue'::text NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    default_role text DEFAULT 'member'::text NOT NULL,
    external_source text DEFAULT 'native'::text NOT NULL,
    external_id text,
    external_synced_at timestamp with time zone,
    account_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT groups_default_role_check CHECK ((default_role = ANY (ARRAY['owner'::text, 'member'::text]))),
    CONSTRAINT groups_external_id_required_for_linked CHECK (((external_source = 'native'::text) OR (external_id IS NOT NULL))),
    CONSTRAINT groups_external_source_check CHECK ((external_source = ANY (ARRAY['native'::text, 'm365'::text]))),
    CONSTRAINT groups_theme_check CHECK ((theme = ANY (ARRAY['teal'::text, 'purple'::text, 'green'::text, 'blue'::text, 'pink'::text, 'orange'::text, 'red'::text]))),
    CONSTRAINT groups_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text])))
);

ALTER TABLE ONLY planner.groups FORCE ROW LEVEL SECURITY;


--
-- Name: labels; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    category_slot integer,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT labels_category_slot_range CHECK (((category_slot IS NULL) OR ((category_slot >= 1) AND (category_slot <= 25))))
);

ALTER TABLE ONLY planner.labels FORCE ROW LEVEL SECURITY;


--
-- Name: plan_categories; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.plan_categories (
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    slot integer NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_categories_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT plan_categories_slot_check CHECK (((slot >= 1) AND (slot <= 25)))
);

ALTER TABLE ONLY planner.plan_categories FORCE ROW LEVEL SECURITY;


--
-- Name: plans; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    external_source text DEFAULT 'native'::text NOT NULL,
    external_id text,
    external_etag text,
    external_synced_at timestamp with time zone,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_error text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    archived_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT plans_external_source_check CHECK ((external_source = ANY (ARRAY['native'::text, 'm365'::text]))),
    CONSTRAINT plans_sync_status_check CHECK ((sync_status = ANY (ARRAY['idle'::text, 'pulling'::text, 'pushing'::text, 'error'::text, 'conflict'::text])))
);

ALTER TABLE ONLY planner.plans FORCE ROW LEVEL SECURITY;


--
-- Name: task_assignments; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.task_assignments (
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_hint text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    external_assigned_at timestamp with time zone,
    assigned_by uuid NOT NULL
);

ALTER TABLE ONLY planner.task_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: task_comments; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT task_comments_body_max_len CHECK ((length(body) <= 4000)),
    CONSTRAINT task_comments_body_not_empty CHECK ((length(btrim(body)) > 0))
);

ALTER TABLE ONLY planner.task_comments FORCE ROW LEVEL SECURITY;


--
-- Name: task_labels; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.task_labels (
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    label_id uuid NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid NOT NULL
);

ALTER TABLE ONLY planner.task_labels FORCE ROW LEVEL SECURITY;


--
-- Name: task_references; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.task_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    url text NOT NULL,
    alias text,
    type text DEFAULT 'other'::text NOT NULL,
    preview_priority text,
    external_etag text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_references_type_check CHECK ((type = ANY (ARRAY['word'::text, 'excel'::text, 'powerPoint'::text, 'visio'::text, 'other'::text, 'powerBI'::text, 'oneNote'::text, 'sharePoint'::text, 'web'::text, 'link'::text])))
);

ALTER TABLE ONLY planner.task_references FORCE ROW LEVEL SECURITY;


--
-- Name: tasks; Type: TABLE; Schema: planner; Owner: -
--

CREATE TABLE planner.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    bucket_id uuid,
    title text NOT NULL,
    description text,
    description_text text,
    priority text DEFAULT 'medium'::text NOT NULL,
    progress text DEFAULT 'not_started'::text NOT NULL,
    is_deferred boolean DEFAULT false NOT NULL,
    preview_type text DEFAULT 'automatic'::text NOT NULL,
    review_state text,
    start_at timestamp with time zone,
    due_at timestamp with time zone,
    order_hint text,
    assignee_priority text,
    external_source text DEFAULT 'native'::text NOT NULL,
    external_id text,
    external_etag text,
    external_synced_at timestamp with time zone,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_error text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char"))) STORED,
    CONSTRAINT tasks_external_source_check CHECK ((external_source = ANY (ARRAY['native'::text, 'm365'::text]))),
    CONSTRAINT tasks_preview_type_check CHECK ((preview_type = ANY (ARRAY['automatic'::text, 'noPreview'::text, 'checklist'::text, 'description'::text, 'reference'::text]))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'important'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT tasks_progress_check CHECK ((progress = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'done'::text]))),
    CONSTRAINT tasks_review_state_check CHECK ((review_state = 'needs_review'::text)),
    CONSTRAINT tasks_sync_status_check CHECK ((sync_status = ANY (ARRAY['idle'::text, 'pulling'::text, 'pushing'::text, 'error'::text, 'conflict'::text])))
);

ALTER TABLE ONLY planner.tasks FORCE ROW LEVEL SECURITY;


--
-- Name: account; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    industry text,
    am_worker_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY pm.account FORCE ROW LEVEL SECURITY;


--
-- Name: account_recruiter; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.account_recruiter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    recruiter_worker_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY pm.account_recruiter FORCE ROW LEVEL SECURITY;


--
-- Name: allocation; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.allocation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    worker_id uuid,
    task_id uuid,
    role text,
    date_from date,
    date_to date,
    bucket text DEFAULT 'billable'::text NOT NULL,
    planned_pct numeric(10,4),
    minutes_per_day integer,
    weekday_mask integer,
    note text,
    resource_request_id uuid,
    status text DEFAULT 'placeholder'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allocation_bucket_check CHECK ((bucket = ANY (ARRAY['billable'::text, 'internal'::text, 'bench'::text]))),
    CONSTRAINT allocation_committed_dates_check CHECK (((status = 'placeholder'::text) OR (date_from IS NOT NULL))),
    CONSTRAINT allocation_planned_pct_check CHECK (((planned_pct >= (0)::numeric) AND (planned_pct <= (100)::numeric))),
    CONSTRAINT allocation_status_check CHECK ((status = ANY (ARRAY['placeholder'::text, 'tentative'::text, 'committed'::text]))),
    CONSTRAINT allocation_weekday_mask_check CHECK (((weekday_mask >= 0) AND (weekday_mask <= 127))),
    CONSTRAINT allocation_worker_rule_check CHECK ((((status = 'placeholder'::text) AND (worker_id IS NULL)) OR ((status = ANY (ARRAY['tentative'::text, 'committed'::text])) AND (worker_id IS NOT NULL))))
);

ALTER TABLE ONLY pm.allocation FORCE ROW LEVEL SECURITY;


--
-- Name: charter; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.charter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    pm_worker_id uuid NOT NULL,
    submitted_by_user_id uuid,
    decided_by_user_id uuid,
    pmo_worker_id uuid,
    budget_bmm numeric(15,4),
    team_size integer,
    methodology text,
    pricing_model text,
    date_from date,
    date_to date,
    objective text,
    scope jsonb,
    status text DEFAULT 'submitted'::text NOT NULL,
    rejection_reason text,
    rejected_stage text,
    pmo_signed_off_by_user_id uuid,
    pmo_signed_off_at timestamp with time zone,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    project_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT charter_methodology_check CHECK ((methodology = ANY (ARRAY['scrum'::text, 'kanban'::text]))),
    CONSTRAINT charter_pricing_model_check CHECK ((pricing_model = ANY (ARRAY['fixed_price'::text, 'time_materials'::text]))),
    CONSTRAINT charter_rejected_stage_check CHECK ((rejected_stage = ANY (ARRAY['pmo'::text, 'bod'::text]))),
    CONSTRAINT charter_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'pmo_approved'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY pm.charter FORCE ROW LEVEL SECURITY;


--
-- Name: project; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.project (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    objective text,
    scope jsonb,
    budget_bmm numeric(15,4),
    pm_worker_id uuid,
    charter_id uuid,
    pmo_worker_id uuid,
    team_size integer,
    methodology text,
    pricing_model text,
    date_from date,
    date_to date,
    phase text DEFAULT 'initiation'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    planner_group_id uuid,
    org_unit_id uuid,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_methodology_check CHECK ((methodology = ANY (ARRAY['scrum'::text, 'kanban'::text]))),
    CONSTRAINT project_phase_check CHECK ((phase = ANY (ARRAY['initiation'::text, 'discovery'::text, 'execution'::text, 'stabilize'::text, 'uat'::text, 'closed'::text]))),
    CONSTRAINT project_pricing_model_check CHECK ((pricing_model = ANY (ARRAY['fixed_price'::text, 'time_materials'::text]))),
    CONSTRAINT project_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_hold'::text, 'closed'::text])))
);

ALTER TABLE ONLY pm.project FORCE ROW LEVEL SECURITY;


--
-- Name: project_access; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.project_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    worker_id uuid NOT NULL,
    level text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_access_level_check CHECK ((level = ANY (ARRAY['owner'::text, 'edit'::text, 'view'::text])))
);

ALTER TABLE ONLY pm.project_access FORCE ROW LEVEL SECURITY;


--
-- Name: staffing_plan_line; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.staffing_plan_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    role text NOT NULL,
    effort_mm numeric(10,4),
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY pm.staffing_plan_line FORCE ROW LEVEL SECURITY;


--
-- Name: staffing_plan_line_skill; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.staffing_plan_line_skill (
    tenant_id uuid NOT NULL,
    line_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    skill_name text NOT NULL,
    min_level integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staffing_plan_line_skill_min_level_check CHECK (((min_level >= 0) AND (min_level <= 5)))
);

ALTER TABLE ONLY pm.staffing_plan_line_skill FORCE ROW LEVEL SECURITY;


--
-- Name: worker_projection; Type: TABLE; Schema: pm; Owner: -
--

CREATE TABLE pm.worker_projection (
    worker_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    full_name text NOT NULL,
    job_title text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY pm.worker_projection FORCE ROW LEVEL SECURITY;


--
-- Name: events_y2026m07; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: events_y2026m08; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: events_y2026m09; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: events_y2026m10; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: events_y2026m11; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: events_y2026m12; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2026m12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: events_y2027m01; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: events_y2027m02; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: events_y2027m03; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: events_y2027m04; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: events_y2027m05; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m05 FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');


--
-- Name: events_y2027m06; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m06 FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');


--
-- Name: events_y2027m07; Type: TABLE ATTACH; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events ATTACH PARTITION core.events_y2027m07 FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');


--
-- Name: subscription_dead_letter id; Type: DEFAULT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.subscription_dead_letter ALTER COLUMN id SET DEFAULT nextval('core.subscription_dead_letter_id_seq'::regclass);


--
-- Name: rate_limits rate_limits_tenant_id_user_id_window_start_pk; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.rate_limits
    ADD CONSTRAINT rate_limits_tenant_id_user_id_window_start_pk PRIMARY KEY (tenant_id, user_id, window_start);


--
-- Name: tenant_settings tenant_settings_pkey; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.tenant_settings
    ADD CONSTRAINT tenant_settings_pkey PRIMARY KEY (tenant_id);


--
-- Name: workflow_approvals workflow_approvals_pkey; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_approvals
    ADD CONSTRAINT workflow_approvals_pkey PRIMARY KEY (approval_id);


--
-- Name: workflow_approvals workflow_approvals_run_step_unique; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_approvals
    ADD CONSTRAINT workflow_approvals_run_step_unique UNIQUE (run_id, step_id);


--
-- Name: workflow_run_events_seen workflow_run_events_seen_run_id_event_seq_pk; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_run_events_seen
    ADD CONSTRAINT workflow_run_events_seen_run_id_event_seq_pk PRIMARY KEY (run_id, event_seq);


--
-- Name: workflow_run_steps workflow_run_steps_tenant_id_run_id_step_id_pk; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_run_steps
    ADD CONSTRAINT workflow_run_steps_tenant_id_run_id_step_id_pk PRIMARY KEY (tenant_id, run_id, step_id);


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (run_id);


--
-- Name: __platform_migrations __platform_migrations_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.__platform_migrations
    ADD CONSTRAINT __platform_migrations_pkey PRIMARY KEY (module, filename);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m07 events_y2026m07_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m07
    ADD CONSTRAINT events_y2026m07_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m08 events_y2026m08_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m08
    ADD CONSTRAINT events_y2026m08_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m09 events_y2026m09_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m09
    ADD CONSTRAINT events_y2026m09_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m10 events_y2026m10_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m10
    ADD CONSTRAINT events_y2026m10_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m11 events_y2026m11_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m11
    ADD CONSTRAINT events_y2026m11_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2026m12 events_y2026m12_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2026m12
    ADD CONSTRAINT events_y2026m12_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m01 events_y2027m01_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m01
    ADD CONSTRAINT events_y2027m01_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m02 events_y2027m02_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m02
    ADD CONSTRAINT events_y2027m02_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m03 events_y2027m03_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m03
    ADD CONSTRAINT events_y2027m03_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m04 events_y2027m04_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m04
    ADD CONSTRAINT events_y2027m04_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m05 events_y2027m05_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m05
    ADD CONSTRAINT events_y2027m05_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m06 events_y2027m06_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m06
    ADD CONSTRAINT events_y2027m06_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: events_y2027m07 events_y2027m07_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.events_y2027m07
    ADD CONSTRAINT events_y2027m07_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: outgoing_emails outgoing_emails_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.outgoing_emails
    ADD CONSTRAINT outgoing_emails_pkey PRIMARY KEY (id);


--
-- Name: rpc_idempotency rpc_idempotency_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.rpc_idempotency
    ADD CONSTRAINT rpc_idempotency_pkey PRIMARY KEY (idempotency_key);


--
-- Name: session_scope_cache session_scope_cache_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.session_scope_cache
    ADD CONSTRAINT session_scope_cache_pkey PRIMARY KEY (session_id);


--
-- Name: skill_category skill_category_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.skill_category
    ADD CONSTRAINT skill_category_pkey PRIMARY KEY (id);


--
-- Name: skill skill_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.skill
    ADD CONSTRAINT skill_pkey PRIMARY KEY (id);


--
-- Name: subscription_cursors subscription_cursors_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.subscription_cursors
    ADD CONSTRAINT subscription_cursors_pkey PRIMARY KEY (subscription);


--
-- Name: subscription_dead_letter subscription_dead_letter_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.subscription_dead_letter
    ADD CONSTRAINT subscription_dead_letter_pkey PRIMARY KEY (id);


--
-- Name: subscription_failure_state subscription_failure_state_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.subscription_failure_state
    ADD CONSTRAINT subscription_failure_state_pkey PRIMARY KEY (subscription);


--
-- Name: subscription_processed subscription_processed_subscription_event_id_pk; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.subscription_processed
    ADD CONSTRAINT subscription_processed_subscription_event_id_pk PRIMARY KEY (subscription, event_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenants
    ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);


--
-- Name: application application_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.application
    ADD CONSTRAINT application_pkey PRIMARY KEY (id);


--
-- Name: candidate_event candidate_event_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate_event
    ADD CONSTRAINT candidate_event_pkey PRIMARY KEY (id);


--
-- Name: candidate candidate_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate
    ADD CONSTRAINT candidate_pkey PRIMARY KEY (id);


--
-- Name: candidate_skill candidate_skill_tenant_id_candidate_id_skill_id_pk; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate_skill
    ADD CONSTRAINT candidate_skill_tenant_id_candidate_id_skill_id_pk PRIMARY KEY (tenant_id, candidate_id, skill_id);


--
-- Name: jd_template jd_template_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.jd_template
    ADD CONSTRAINT jd_template_pkey PRIMARY KEY (id);


--
-- Name: jd_template_section jd_template_section_tenant_id_template_id_variant_section_pk; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.jd_template_section
    ADD CONSTRAINT jd_template_section_tenant_id_template_id_variant_section_pk PRIMARY KEY (tenant_id, template_id, variant, section);


--
-- Name: opening_close_reason opening_close_reason_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.opening_close_reason
    ADD CONSTRAINT opening_close_reason_pkey PRIMARY KEY (id);


--
-- Name: opening opening_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.opening
    ADD CONSTRAINT opening_pkey PRIMARY KEY (id);


--
-- Name: rejection_reason rejection_reason_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.rejection_reason
    ADD CONSTRAINT rejection_reason_pkey PRIMARY KEY (id);


--
-- Name: requisition_jd_section requisition_jd_section_tenant_id_requisition_id_variant_section; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.requisition_jd_section
    ADD CONSTRAINT requisition_jd_section_tenant_id_requisition_id_variant_section PRIMARY KEY (tenant_id, requisition_id, variant, section);


--
-- Name: requisition requisition_pkey; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.requisition
    ADD CONSTRAINT requisition_pkey PRIMARY KEY (id);


--
-- Name: requisition_skill requisition_skill_tenant_id_requisition_id_skill_id_pk; Type: CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.requisition_skill
    ADD CONSTRAINT requisition_skill_tenant_id_requisition_id_skill_id_pk PRIMARY KEY (tenant_id, requisition_id, skill_id);


--
-- Name: access_group_membership access_group_membership_tenant_id_group_id_user_id_pk; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.access_group_membership
    ADD CONSTRAINT access_group_membership_tenant_id_group_id_user_id_pk PRIMARY KEY (tenant_id, group_id, user_id);


--
-- Name: access_group access_group_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.access_group
    ADD CONSTRAINT access_group_pkey PRIMARY KEY (id);


--
-- Name: access_group_role access_group_role_tenant_id_group_id_role_slug_scope_kind_scope; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.access_group_role
    ADD CONSTRAINT access_group_role_tenant_id_group_id_role_slug_scope_kind_scope PRIMARY KEY (tenant_id, group_id, role_slug, scope_kind, scope_id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: failed_login_alerts_sent failed_login_alerts_sent_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.failed_login_alerts_sent
    ADD CONSTRAINT failed_login_alerts_sent_pkey PRIMARY KEY (email);


--
-- Name: failed_login_attempts failed_login_attempts_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.failed_login_attempts
    ADD CONSTRAINT failed_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: org_unit_projection org_unit_projection_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.org_unit_projection
    ADD CONSTRAINT org_unit_projection_pkey PRIMARY KEY (org_unit_id);


--
-- Name: person_projection person_projection_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.person_projection
    ADD CONSTRAINT person_projection_pkey PRIMARY KEY (person_id);


--
-- Name: product_grant product_grant_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.product_grant
    ADD CONSTRAINT product_grant_pkey PRIMARY KEY (id);


--
-- Name: rate_limit rate_limit_key_unique; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.rate_limit
    ADD CONSTRAINT rate_limit_key_unique UNIQUE (key);


--
-- Name: rate_limit rate_limit_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.rate_limit
    ADD CONSTRAINT rate_limit_pkey PRIMARY KEY (id);


--
-- Name: role_assignments role_assignments_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.role_assignments
    ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id);


--
-- Name: role_permission_overlays role_permission_overlays_tenant_id_role_slug_permission_key_pk; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.role_permission_overlays
    ADD CONSTRAINT role_permission_overlays_tenant_id_role_slug_permission_key_pk PRIMARY KEY (tenant_id, role_slug, permission_key);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: tenant_sso_providers tenant_sso_providers_tenant_id_provider_id_pk; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.tenant_sso_providers
    ADD CONSTRAINT tenant_sso_providers_tenant_id_provider_id_pk PRIMARY KEY (tenant_id, provider_id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: m365_group_links m365_group_links_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_group_links
    ADD CONSTRAINT m365_group_links_pkey PRIMARY KEY (id);


--
-- Name: m365_plan_links m365_plan_links_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_plan_links
    ADD CONSTRAINT m365_plan_links_pkey PRIMARY KEY (id);


--
-- Name: m365_resource_etags m365_resource_etags_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_resource_etags
    ADD CONSTRAINT m365_resource_etags_pkey PRIMARY KEY (id);


--
-- Name: m365_subscriptions m365_subscriptions_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_subscriptions
    ADD CONSTRAINT m365_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: m365_tenant_config m365_tenant_config_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_tenant_config
    ADD CONSTRAINT m365_tenant_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: mail_transport_config mail_transport_config_pkey; Type: CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.mail_transport_config
    ADD CONSTRAINT mail_transport_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (tenant_id, file_id, chunk_ordinal);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE ONLY knowledge.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: notification_prefs notification_prefs_tenant_id_event_type_channel_pk; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.notification_prefs
    ADD CONSTRAINT notification_prefs_tenant_id_event_type_channel_pk PRIMARY KEY (tenant_id, event_type, channel);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_tenant_source_user_unique; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.notifications
    ADD CONSTRAINT notifications_tenant_source_user_unique UNIQUE (tenant_id, source_event_id, user_id);


--
-- Name: account_projection account_projection_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.account_projection
    ADD CONSTRAINT account_projection_pkey PRIMARY KEY (account_id);


--
-- Name: employment_period employment_period_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.employment_period
    ADD CONSTRAINT employment_period_pkey PRIMARY KEY (id);


--
-- Name: org_unit org_unit_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.org_unit
    ADD CONSTRAINT org_unit_pkey PRIMARY KEY (id);


--
-- Name: person person_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.person
    ADD CONSTRAINT person_pkey PRIMARY KEY (id);


--
-- Name: person_skill person_skill_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.person_skill
    ADD CONSTRAINT person_skill_pkey PRIMARY KEY (id);


--
-- Name: project_projection project_projection_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.project_projection
    ADD CONSTRAINT project_projection_pkey PRIMARY KEY (project_id);


--
-- Name: worker_allocation_projection worker_allocation_projection_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker_allocation_projection
    ADD CONSTRAINT worker_allocation_projection_pkey PRIMARY KEY (allocation_id);


--
-- Name: worker_history worker_history_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker_history
    ADD CONSTRAINT worker_history_pkey PRIMARY KEY (id);


--
-- Name: worker worker_pkey; Type: CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker
    ADD CONSTRAINT worker_pkey PRIMARY KEY (id);


--
-- Name: assignee_projection assignee_projection_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.assignee_projection
    ADD CONSTRAINT assignee_projection_pkey PRIMARY KEY (user_id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: checklist_items checklist_items_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.checklist_items
    ADD CONSTRAINT checklist_items_pkey PRIMARY KEY (id);


--
-- Name: group_join_requests group_join_requests_tenant_id_group_id_user_id_pk; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.group_join_requests
    ADD CONSTRAINT group_join_requests_tenant_id_group_id_user_id_pk PRIMARY KEY (tenant_id, group_id, user_id);


--
-- Name: group_members group_members_tenant_id_group_id_user_id_pk; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.group_members
    ADD CONSTRAINT group_members_tenant_id_group_id_user_id_pk PRIMARY KEY (tenant_id, group_id, user_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: labels labels_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.labels
    ADD CONSTRAINT labels_pkey PRIMARY KEY (id);


--
-- Name: plan_categories plan_categories_plan_slot; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.plan_categories
    ADD CONSTRAINT plan_categories_plan_slot UNIQUE (plan_id, slot);


--
-- Name: plan_categories plan_categories_tenant_id_plan_id_slot_pk; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.plan_categories
    ADD CONSTRAINT plan_categories_tenant_id_plan_id_slot_pk PRIMARY KEY (tenant_id, plan_id, slot);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: task_assignments task_assignments_task_id_user_id_pk; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_assignments
    ADD CONSTRAINT task_assignments_task_id_user_id_pk PRIMARY KEY (task_id, user_id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: task_labels task_labels_tenant_id_task_id_label_id_pk; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_labels
    ADD CONSTRAINT task_labels_tenant_id_task_id_label_id_pk PRIMARY KEY (tenant_id, task_id, label_id);


--
-- Name: task_references task_references_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_references
    ADD CONSTRAINT task_references_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: account_recruiter account_recruiter_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.account_recruiter
    ADD CONSTRAINT account_recruiter_pkey PRIMARY KEY (id);


--
-- Name: allocation allocation_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.allocation
    ADD CONSTRAINT allocation_pkey PRIMARY KEY (id);


--
-- Name: charter charter_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.charter
    ADD CONSTRAINT charter_pkey PRIMARY KEY (id);


--
-- Name: project_access project_access_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.project_access
    ADD CONSTRAINT project_access_pkey PRIMARY KEY (id);


--
-- Name: project project_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: staffing_plan_line staffing_plan_line_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.staffing_plan_line
    ADD CONSTRAINT staffing_plan_line_pkey PRIMARY KEY (id);


--
-- Name: staffing_plan_line_skill staffing_plan_line_skill_tenant_id_line_id_skill_id_pk; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.staffing_plan_line_skill
    ADD CONSTRAINT staffing_plan_line_skill_tenant_id_line_id_skill_id_pk PRIMARY KEY (tenant_id, line_id, skill_id);


--
-- Name: worker_projection worker_projection_pkey; Type: CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.worker_projection
    ADD CONSTRAINT worker_projection_pkey PRIMARY KEY (worker_id);


--
-- Name: rl_by_tenant_window; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX rl_by_tenant_window ON agent.rate_limits USING btree (tenant_id, window_start);


--
-- Name: rl_cleanup_window; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX rl_cleanup_window ON agent.rate_limits USING btree (window_start);


--
-- Name: workflow_approvals_approver_status_idx; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX workflow_approvals_approver_status_idx ON agent.workflow_approvals USING btree (approver_user_id, status);


--
-- Name: workflow_approvals_pending_expires_idx; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX workflow_approvals_pending_expires_idx ON agent.workflow_approvals USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: workflow_runs_actor_started_at_idx; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX workflow_runs_actor_started_at_idx ON agent.workflow_runs USING btree (tenant_id, started_by, started_at DESC);


--
-- Name: workflow_runs_source_event_id_idx; Type: INDEX; Schema: agent; Owner: -
--

CREATE UNIQUE INDEX workflow_runs_source_event_id_idx ON agent.workflow_runs USING btree (tenant_id, source_event_id);


--
-- Name: workflow_runs_tenant_status_started_at_idx; Type: INDEX; Schema: agent; Owner: -
--

CREATE INDEX workflow_runs_tenant_status_started_at_idx ON agent.workflow_runs USING btree (tenant_id, status, started_at DESC);


--
-- Name: events_aggregate_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_aggregate_idx ON ONLY core.events USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_occurred_brin; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_occurred_brin ON ONLY core.events USING brin (occurred_at);


--
-- Name: events_tenant_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_tenant_idx ON ONLY core.events USING btree (tenant_id, occurred_at);


--
-- Name: events_type_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_type_idx ON ONLY core.events USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m07_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m07_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m07 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m07_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m07_event_type_event_version_occurred_at_idx ON core.events_y2026m07 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m07_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m07_occurred_at_idx ON core.events_y2026m07 USING brin (occurred_at);


--
-- Name: events_y2026m07_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m07_tenant_id_occurred_at_idx ON core.events_y2026m07 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2026m08_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m08_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m08 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m08_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m08_event_type_event_version_occurred_at_idx ON core.events_y2026m08 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m08_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m08_occurred_at_idx ON core.events_y2026m08 USING brin (occurred_at);


--
-- Name: events_y2026m08_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m08_tenant_id_occurred_at_idx ON core.events_y2026m08 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2026m09_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m09_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m09 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m09_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m09_event_type_event_version_occurred_at_idx ON core.events_y2026m09 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m09_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m09_occurred_at_idx ON core.events_y2026m09 USING brin (occurred_at);


--
-- Name: events_y2026m09_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m09_tenant_id_occurred_at_idx ON core.events_y2026m09 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2026m10_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m10_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m10 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m10_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m10_event_type_event_version_occurred_at_idx ON core.events_y2026m10 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m10_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m10_occurred_at_idx ON core.events_y2026m10 USING brin (occurred_at);


--
-- Name: events_y2026m10_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m10_tenant_id_occurred_at_idx ON core.events_y2026m10 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2026m11_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m11_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m11 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m11_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m11_event_type_event_version_occurred_at_idx ON core.events_y2026m11 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m11_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m11_occurred_at_idx ON core.events_y2026m11 USING brin (occurred_at);


--
-- Name: events_y2026m11_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m11_tenant_id_occurred_at_idx ON core.events_y2026m11 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2026m12_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m12_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2026m12 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2026m12_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m12_event_type_event_version_occurred_at_idx ON core.events_y2026m12 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2026m12_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m12_occurred_at_idx ON core.events_y2026m12 USING brin (occurred_at);


--
-- Name: events_y2026m12_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2026m12_tenant_id_occurred_at_idx ON core.events_y2026m12 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m01_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m01_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m01 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m01_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m01_event_type_event_version_occurred_at_idx ON core.events_y2027m01 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m01_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m01_occurred_at_idx ON core.events_y2027m01 USING brin (occurred_at);


--
-- Name: events_y2027m01_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m01_tenant_id_occurred_at_idx ON core.events_y2027m01 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m02_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m02_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m02 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m02_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m02_event_type_event_version_occurred_at_idx ON core.events_y2027m02 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m02_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m02_occurred_at_idx ON core.events_y2027m02 USING brin (occurred_at);


--
-- Name: events_y2027m02_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m02_tenant_id_occurred_at_idx ON core.events_y2027m02 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m03_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m03_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m03 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m03_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m03_event_type_event_version_occurred_at_idx ON core.events_y2027m03 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m03_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m03_occurred_at_idx ON core.events_y2027m03 USING brin (occurred_at);


--
-- Name: events_y2027m03_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m03_tenant_id_occurred_at_idx ON core.events_y2027m03 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m04_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m04_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m04 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m04_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m04_event_type_event_version_occurred_at_idx ON core.events_y2027m04 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m04_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m04_occurred_at_idx ON core.events_y2027m04 USING brin (occurred_at);


--
-- Name: events_y2027m04_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m04_tenant_id_occurred_at_idx ON core.events_y2027m04 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m05_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m05_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m05 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m05_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m05_event_type_event_version_occurred_at_idx ON core.events_y2027m05 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m05_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m05_occurred_at_idx ON core.events_y2027m05 USING brin (occurred_at);


--
-- Name: events_y2027m05_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m05_tenant_id_occurred_at_idx ON core.events_y2027m05 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m06_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m06_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m06 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m06_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m06_event_type_event_version_occurred_at_idx ON core.events_y2027m06 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m06_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m06_occurred_at_idx ON core.events_y2027m06 USING brin (occurred_at);


--
-- Name: events_y2027m06_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m06_tenant_id_occurred_at_idx ON core.events_y2027m06 USING btree (tenant_id, occurred_at);


--
-- Name: events_y2027m07_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m07_aggregate_type_aggregate_id_occurred_at_idx ON core.events_y2027m07 USING btree (aggregate_type, aggregate_id, occurred_at);


--
-- Name: events_y2027m07_event_type_event_version_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m07_event_type_event_version_occurred_at_idx ON core.events_y2027m07 USING btree (event_type, event_version, occurred_at);


--
-- Name: events_y2027m07_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m07_occurred_at_idx ON core.events_y2027m07 USING brin (occurred_at);


--
-- Name: events_y2027m07_tenant_id_occurred_at_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX events_y2027m07_tenant_id_occurred_at_idx ON core.events_y2027m07 USING btree (tenant_id, occurred_at);


--
-- Name: outgoing_emails_pending_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX outgoing_emails_pending_idx ON core.outgoing_emails USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: outgoing_emails_tenant_created_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX outgoing_emails_tenant_created_idx ON core.outgoing_emails USING btree (tenant_id, created_at);


--
-- Name: outgoing_emails_tenant_dedupe_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX outgoing_emails_tenant_dedupe_idx ON core.outgoing_emails USING btree (tenant_id, dedupe_key);


--
-- Name: skill_by_category; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX skill_by_category ON core.skill USING btree (tenant_id, category_id);


--
-- Name: skill_category_uniq_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX skill_category_uniq_name ON core.skill_category USING btree (tenant_id, name);


--
-- Name: skill_uniq_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX skill_uniq_name ON core.skill USING btree (tenant_id, name);


--
-- Name: application_by_candidate; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX application_by_candidate ON hiring.application USING btree (tenant_id, candidate_id);


--
-- Name: application_by_requisition; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX application_by_requisition ON hiring.application USING btree (tenant_id, requisition_id);


--
-- Name: application_by_worker; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX application_by_worker ON hiring.application USING btree (tenant_id, worker_id);


--
-- Name: application_uniq_candidate; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX application_uniq_candidate ON hiring.application USING btree (tenant_id, requisition_id, candidate_id) WHERE ((candidate_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: application_uniq_worker; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX application_uniq_worker ON hiring.application USING btree (tenant_id, requisition_id, worker_id) WHERE ((worker_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: candidate_by_tenant; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX candidate_by_tenant ON hiring.candidate USING btree (tenant_id, created_at);


--
-- Name: candidate_event_by_application; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX candidate_event_by_application ON hiring.candidate_event USING btree (tenant_id, application_id);


--
-- Name: candidate_event_by_candidate; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX candidate_event_by_candidate ON hiring.candidate_event USING btree (tenant_id, candidate_id, created_at);


--
-- Name: candidate_name_trgm; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX candidate_name_trgm ON hiring.candidate USING gin (name public.gin_trgm_ops);


--
-- Name: candidate_skill_by_skill; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX candidate_skill_by_skill ON hiring.candidate_skill USING btree (tenant_id, skill_id);


--
-- Name: close_reason_uniq_label; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX close_reason_uniq_label ON hiring.opening_close_reason USING btree (tenant_id, label);


--
-- Name: jd_template_uniq_name; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX jd_template_uniq_name ON hiring.jd_template USING btree (tenant_id, name);


--
-- Name: opening_by_hired_application; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX opening_by_hired_application ON hiring.opening USING btree (tenant_id, hired_application_id);


--
-- Name: opening_by_requisition; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX opening_by_requisition ON hiring.opening USING btree (tenant_id, requisition_id);


--
-- Name: opening_uniq_resource_request; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX opening_uniq_resource_request ON hiring.opening USING btree (tenant_id, resource_request_id) WHERE (resource_request_id IS NOT NULL);


--
-- Name: opening_uniq_seq; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX opening_uniq_seq ON hiring.opening USING btree (tenant_id, requisition_id, seq);


--
-- Name: rejection_reason_uniq_label; Type: INDEX; Schema: hiring; Owner: -
--

CREATE UNIQUE INDEX rejection_reason_uniq_label ON hiring.rejection_reason USING btree (tenant_id, label);


--
-- Name: requisition_by_account; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX requisition_by_account ON hiring.requisition USING btree (tenant_id, account_id);


--
-- Name: requisition_by_status_stage; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX requisition_by_status_stage ON hiring.requisition USING btree (tenant_id, status, stage);


--
-- Name: requisition_skill_by_skill; Type: INDEX; Schema: hiring; Owner: -
--

CREATE INDEX requisition_skill_by_skill ON hiring.requisition_skill USING btree (tenant_id, skill_id);


--
-- Name: access_group_membership_by_tenant; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX access_group_membership_by_tenant ON identity.access_group_membership USING btree (tenant_id);


--
-- Name: access_group_membership_by_user; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX access_group_membership_by_user ON identity.access_group_membership USING btree (user_id);


--
-- Name: access_group_role_by_tenant; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX access_group_role_by_tenant ON identity.access_group_role USING btree (tenant_id);


--
-- Name: access_group_tenant_slug; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX access_group_tenant_slug ON identity.access_group USING btree (tenant_id, slug);


--
-- Name: account_user_id_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX account_user_id_idx ON identity.account USING btree (user_id);


--
-- Name: failed_login_attempted_at_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX failed_login_attempted_at_idx ON identity.failed_login_attempts USING btree (attempted_at);


--
-- Name: failed_login_email_ip_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX failed_login_email_ip_idx ON identity.failed_login_attempts USING btree (lower(email), ip, attempted_at DESC);


--
-- Name: org_unit_projection_by_tenant; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX org_unit_projection_by_tenant ON identity.org_unit_projection USING btree (tenant_id);


--
-- Name: person_projection_by_tenant; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX person_projection_by_tenant ON identity.person_projection USING btree (tenant_id);


--
-- Name: product_grant_subject_product; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX product_grant_subject_product ON identity.product_grant USING btree (tenant_id, subject_type, subject_id, product_id);


--
-- Name: role_assignment_active_unique; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX role_assignment_active_unique ON identity.role_assignments USING btree (tenant_id, user_id, role_slug, scope_kind, COALESCE((scope_id)::text, ''::text)) WHERE (revoked_at IS NULL);


--
-- Name: role_assignment_by_user; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX role_assignment_by_user ON identity.role_assignments USING btree (user_id);


--
-- Name: session_user_id_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX session_user_id_idx ON identity.session USING btree (user_id);


--
-- Name: user_tenant_email_uniq; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX user_tenant_email_uniq ON identity."user" USING btree (tenant_id, lower(email)) WHERE (deactivated_at IS NULL);


--
-- Name: user_tenant_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX user_tenant_idx ON identity."user" USING btree (tenant_id);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX verification_identifier_idx ON identity.verification USING btree (identifier);


--
-- Name: m365_group_links_by_status; Type: INDEX; Schema: integrations; Owner: -
--

CREATE INDEX m365_group_links_by_status ON integrations.m365_group_links USING btree (tenant_id, sync_status);


--
-- Name: m365_group_links_uniq_external_live; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_group_links_uniq_external_live ON integrations.m365_group_links USING btree (tenant_id, external_id) WHERE (unlinked_at IS NULL);


--
-- Name: m365_group_links_uniq_group_live; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_group_links_uniq_group_live ON integrations.m365_group_links USING btree (tenant_id, group_id) WHERE (unlinked_at IS NULL);


--
-- Name: m365_plan_links_by_group_live; Type: INDEX; Schema: integrations; Owner: -
--

CREATE INDEX m365_plan_links_by_group_live ON integrations.m365_plan_links USING btree (tenant_id, group_id) WHERE (unlinked_at IS NULL);


--
-- Name: m365_plan_links_uniq_external_live; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_plan_links_uniq_external_live ON integrations.m365_plan_links USING btree (tenant_id, external_id) WHERE (unlinked_at IS NULL);


--
-- Name: m365_plan_links_uniq_plan_live; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_plan_links_uniq_plan_live ON integrations.m365_plan_links USING btree (tenant_id, plan_id) WHERE (unlinked_at IS NULL);


--
-- Name: m365_resource_etags_uniq; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_resource_etags_uniq ON integrations.m365_resource_etags USING btree (tenant_id, plan_link_id, resource_type, platform_id);


--
-- Name: m365_subscriptions_uniq_tenant_resource; Type: INDEX; Schema: integrations; Owner: -
--

CREATE UNIQUE INDEX m365_subscriptions_uniq_tenant_resource ON integrations.m365_subscriptions USING btree (tenant_id, resource);


--
-- Name: files_by_tenant; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX files_by_tenant ON knowledge.files USING btree (tenant_id, created_at DESC);


--
-- Name: files_by_thread; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX files_by_thread ON knowledge.files USING btree (tenant_id, thread_id);


--
-- Name: files_scan_status; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE INDEX files_scan_status ON knowledge.files USING btree (scan_status) WHERE (scan_status = ANY (ARRAY['pending'::text, 'scanning'::text, 'error'::text]));


--
-- Name: files_tenant_id_id; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE UNIQUE INDEX files_tenant_id_id ON knowledge.files USING btree (tenant_id, id);


--
-- Name: files_uniq_s3_key_per_tenant; Type: INDEX; Schema: knowledge; Owner: -
--

CREATE UNIQUE INDEX files_uniq_s3_key_per_tenant ON knowledge.files USING btree (tenant_id, s3_key);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX notifications_unread_idx ON notifications.notifications USING btree (user_id, created_at DESC NULLS LAST) WHERE ((read_at IS NULL) AND (dismissed_at IS NULL));


--
-- Name: employment_period_by_person; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX employment_period_by_person ON people.employment_period USING btree (tenant_id, person_id);


--
-- Name: employment_period_one_open; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX employment_period_one_open ON people.employment_period USING btree (person_id) WHERE (end_date IS NULL);


--
-- Name: employment_period_uniq_seq; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX employment_period_uniq_seq ON people.employment_period USING btree (tenant_id, person_id, seq);


--
-- Name: org_unit_by_head; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX org_unit_by_head ON people.org_unit USING btree (tenant_id, head_worker_id);


--
-- Name: org_unit_by_parent; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX org_unit_by_parent ON people.org_unit USING btree (tenant_id, parent_id);


--
-- Name: person_by_tenant_user; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX person_by_tenant_user ON people.person USING btree (tenant_id, user_id);


--
-- Name: person_skill_by_person; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX person_skill_by_person ON people.person_skill USING btree (tenant_id, person_id);


--
-- Name: person_skill_by_skill; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX person_skill_by_skill ON people.person_skill USING btree (tenant_id, skill_id);


--
-- Name: person_skill_uniq; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX person_skill_uniq ON people.person_skill USING btree (tenant_id, person_id, skill_id);


--
-- Name: project_proj_by_account; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX project_proj_by_account ON people.project_projection USING btree (tenant_id, account_id);


--
-- Name: worker_alloc_by_account; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_alloc_by_account ON people.worker_allocation_projection USING btree (tenant_id, account_id);


--
-- Name: worker_alloc_by_project; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_alloc_by_project ON people.worker_allocation_projection USING btree (tenant_id, project_id);


--
-- Name: worker_alloc_by_worker; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_alloc_by_worker ON people.worker_allocation_projection USING btree (tenant_id, worker_id);


--
-- Name: worker_by_org_unit; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_by_org_unit ON people.worker USING btree (tenant_id, org_unit_id);


--
-- Name: worker_by_tenant_live; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_by_tenant_live ON people.worker USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: worker_full_name_trgm; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_full_name_trgm ON people.worker USING gin (full_name public.gin_trgm_ops);


--
-- Name: worker_history_by_person; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_history_by_person ON people.worker_history USING btree (tenant_id, person_id, at);


--
-- Name: worker_job_title_trgm; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_job_title_trgm ON people.worker USING gin (job_title public.gin_trgm_ops);


--
-- Name: worker_uniq_email_per_tenant; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX worker_uniq_email_per_tenant ON people.worker USING btree (tenant_id, work_email) WHERE ((work_email IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: worker_uniq_employee_no_per_tenant; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX worker_uniq_employee_no_per_tenant ON people.worker USING btree (tenant_id, employee_no) WHERE ((employee_no IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: worker_uniq_person; Type: INDEX; Schema: people; Owner: -
--

CREATE UNIQUE INDEX worker_uniq_person ON people.worker USING btree (person_id);


--
-- Name: worker_work_email_trgm; Type: INDEX; Schema: people; Owner: -
--

CREATE INDEX worker_work_email_trgm ON people.worker USING gin (work_email public.gin_trgm_ops);


--
-- Name: assignee_projection_by_tenant_active; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX assignee_projection_by_tenant_active ON planner.assignee_projection USING btree (tenant_id, deactivated_at);


--
-- Name: buckets_by_plan_hint; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX buckets_by_plan_hint ON planner.buckets USING btree (tenant_id, plan_id, order_hint);


--
-- Name: buckets_external_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX buckets_external_uniq ON planner.buckets USING btree (tenant_id, external_source, external_id) WHERE ((external_source <> 'native'::text) AND (external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: checklist_items_by_task_hint; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX checklist_items_by_task_hint ON planner.checklist_items USING btree (task_id, order_hint);


--
-- Name: checklist_items_external_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX checklist_items_external_uniq ON planner.checklist_items USING btree (tenant_id, task_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: group_members_by_user; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX group_members_by_user ON planner.group_members USING btree (tenant_id, user_id);


--
-- Name: groups_by_tenant_live; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX groups_by_tenant_live ON planner.groups USING btree (tenant_id, deleted_at);


--
-- Name: groups_external_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX groups_external_uniq ON planner.groups USING btree (tenant_id, external_source, external_id) WHERE ((external_source <> 'native'::text) AND (external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: groups_uniq_name_per_tenant; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX groups_uniq_name_per_tenant ON planner.groups USING btree (tenant_id, name) WHERE (deleted_at IS NULL);


--
-- Name: join_requests_by_group_pending; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX join_requests_by_group_pending ON planner.group_join_requests USING btree (group_id, status);


--
-- Name: join_requests_by_user; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX join_requests_by_user ON planner.group_join_requests USING btree (user_id);


--
-- Name: labels_by_plan_live; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX labels_by_plan_live ON planner.labels USING btree (plan_id, deleted_at);


--
-- Name: labels_category_slot_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX labels_category_slot_uniq ON planner.labels USING btree (plan_id, category_slot) WHERE ((category_slot IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: labels_uniq_name_per_plan; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX labels_uniq_name_per_plan ON planner.labels USING btree (tenant_id, plan_id, name) WHERE (deleted_at IS NULL);


--
-- Name: plans_by_group_live; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX plans_by_group_live ON planner.plans USING btree (group_id, deleted_at);


--
-- Name: plans_external_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX plans_external_uniq ON planner.plans USING btree (tenant_id, external_source, external_id) WHERE ((external_source <> 'native'::text) AND (external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: task_assignments_by_task_hint; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_assignments_by_task_hint ON planner.task_assignments USING btree (task_id, order_hint);


--
-- Name: task_assignments_by_user; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_assignments_by_user ON planner.task_assignments USING btree (tenant_id, user_id);


--
-- Name: task_assignments_by_user_due; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_assignments_by_user_due ON planner.task_assignments USING btree (tenant_id, user_id, assigned_at);


--
-- Name: task_comments_by_task_recent; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_comments_by_task_recent ON planner.task_comments USING btree (task_id, created_at DESC NULLS LAST) WHERE (deleted_at IS NULL);


--
-- Name: task_labels_by_label; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_labels_by_label ON planner.task_labels USING btree (tenant_id, label_id);


--
-- Name: task_references_by_task; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX task_references_by_task ON planner.task_references USING btree (task_id);


--
-- Name: task_references_uniq_task_url; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX task_references_uniq_task_url ON planner.task_references USING btree (tenant_id, task_id, url);


--
-- Name: tasks_by_assignee_priority; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_by_assignee_priority ON planner.tasks USING btree (tenant_id, assignee_priority) WHERE (deleted_at IS NULL);


--
-- Name: tasks_by_bucket_hint; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_by_bucket_hint ON planner.tasks USING btree (tenant_id, bucket_id, order_hint) WHERE (deleted_at IS NULL);


--
-- Name: tasks_by_due_soon; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_by_due_soon ON planner.tasks USING btree (tenant_id, due_at) WHERE ((deleted_at IS NULL) AND (is_deferred = false) AND (progress <> 'done'::text));


--
-- Name: tasks_by_plan_live; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_by_plan_live ON planner.tasks USING btree (tenant_id, plan_id, deleted_at);


--
-- Name: tasks_by_review_state; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_by_review_state ON planner.tasks USING btree (tenant_id, review_state) WHERE ((review_state IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: tasks_external_uniq; Type: INDEX; Schema: planner; Owner: -
--

CREATE UNIQUE INDEX tasks_external_uniq ON planner.tasks USING btree (tenant_id, external_source, external_id) WHERE ((external_source <> 'native'::text) AND (external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: tasks_search_tsv_gin_idx; Type: INDEX; Schema: planner; Owner: -
--

CREATE INDEX tasks_search_tsv_gin_idx ON planner.tasks USING gin (search_tsv);


--
-- Name: account_by_tenant; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX account_by_tenant ON pm.account USING btree (tenant_id);


--
-- Name: account_recruiter_by_account; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX account_recruiter_by_account ON pm.account_recruiter USING btree (tenant_id, account_id);


--
-- Name: account_recruiter_by_recruiter; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX account_recruiter_by_recruiter ON pm.account_recruiter USING btree (tenant_id, recruiter_worker_id);


--
-- Name: account_recruiter_uniq; Type: INDEX; Schema: pm; Owner: -
--

CREATE UNIQUE INDEX account_recruiter_uniq ON pm.account_recruiter USING btree (tenant_id, account_id, recruiter_worker_id);


--
-- Name: allocation_by_project; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX allocation_by_project ON pm.allocation USING btree (tenant_id, project_id);


--
-- Name: allocation_by_task; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX allocation_by_task ON pm.allocation USING btree (tenant_id, task_id);


--
-- Name: allocation_by_worker; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX allocation_by_worker ON pm.allocation USING btree (tenant_id, worker_id) WHERE ((worker_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: allocation_one_placeholder_per_request; Type: INDEX; Schema: pm; Owner: -
--

CREATE UNIQUE INDEX allocation_one_placeholder_per_request ON pm.allocation USING btree (tenant_id, resource_request_id) WHERE ((resource_request_id IS NOT NULL) AND (worker_id IS NULL));


--
-- Name: allocation_open_demand; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX allocation_open_demand ON pm.allocation USING btree (tenant_id, status) WHERE ((worker_id IS NULL) AND (deleted_at IS NULL));


--
-- Name: charter_by_account_status; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX charter_by_account_status ON pm.charter USING btree (tenant_id, account_id, status);


--
-- Name: charter_by_project; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX charter_by_project ON pm.charter USING btree (tenant_id, project_id);


--
-- Name: charter_by_tenant; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX charter_by_tenant ON pm.charter USING btree (tenant_id);


--
-- Name: project_access_by_project; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX project_access_by_project ON pm.project_access USING btree (tenant_id, project_id);


--
-- Name: project_access_uniq; Type: INDEX; Schema: pm; Owner: -
--

CREATE UNIQUE INDEX project_access_uniq ON pm.project_access USING btree (tenant_id, project_id, worker_id);


--
-- Name: project_by_account_status; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX project_by_account_status ON pm.project USING btree (tenant_id, account_id, status);


--
-- Name: project_by_charter; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX project_by_charter ON pm.project USING btree (tenant_id, charter_id);


--
-- Name: project_by_org_unit; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX project_by_org_unit ON pm.project USING btree (tenant_id, org_unit_id);


--
-- Name: staffing_plan_line_by_project; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX staffing_plan_line_by_project ON pm.staffing_plan_line USING btree (tenant_id, project_id);


--
-- Name: staffing_plan_line_skill_by_skill; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX staffing_plan_line_skill_by_skill ON pm.staffing_plan_line_skill USING btree (tenant_id, skill_id);


--
-- Name: worker_projection_by_name; Type: INDEX; Schema: pm; Owner: -
--

CREATE INDEX worker_projection_by_name ON pm.worker_projection USING btree (tenant_id, full_name);


--
-- Name: events_y2026m07_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m07_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m07_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m07_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m07_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m07_occurred_at_idx;


--
-- Name: events_y2026m07_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m07_pkey;


--
-- Name: events_y2026m07_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m07_tenant_id_occurred_at_idx;


--
-- Name: events_y2026m08_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m08_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m08_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m08_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m08_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m08_occurred_at_idx;


--
-- Name: events_y2026m08_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m08_pkey;


--
-- Name: events_y2026m08_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m08_tenant_id_occurred_at_idx;


--
-- Name: events_y2026m09_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m09_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m09_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m09_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m09_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m09_occurred_at_idx;


--
-- Name: events_y2026m09_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m09_pkey;


--
-- Name: events_y2026m09_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m09_tenant_id_occurred_at_idx;


--
-- Name: events_y2026m10_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m10_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m10_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m10_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m10_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m10_occurred_at_idx;


--
-- Name: events_y2026m10_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m10_pkey;


--
-- Name: events_y2026m10_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m10_tenant_id_occurred_at_idx;


--
-- Name: events_y2026m11_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m11_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m11_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m11_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m11_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m11_occurred_at_idx;


--
-- Name: events_y2026m11_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m11_pkey;


--
-- Name: events_y2026m11_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m11_tenant_id_occurred_at_idx;


--
-- Name: events_y2026m12_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2026m12_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2026m12_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2026m12_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2026m12_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2026m12_occurred_at_idx;


--
-- Name: events_y2026m12_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2026m12_pkey;


--
-- Name: events_y2026m12_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2026m12_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m01_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m01_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m01_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m01_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m01_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m01_occurred_at_idx;


--
-- Name: events_y2027m01_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m01_pkey;


--
-- Name: events_y2027m01_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m01_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m02_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m02_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m02_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m02_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m02_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m02_occurred_at_idx;


--
-- Name: events_y2027m02_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m02_pkey;


--
-- Name: events_y2027m02_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m02_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m03_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m03_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m03_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m03_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m03_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m03_occurred_at_idx;


--
-- Name: events_y2027m03_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m03_pkey;


--
-- Name: events_y2027m03_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m03_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m04_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m04_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m04_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m04_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m04_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m04_occurred_at_idx;


--
-- Name: events_y2027m04_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m04_pkey;


--
-- Name: events_y2027m04_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m04_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m05_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m05_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m05_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m05_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m05_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m05_occurred_at_idx;


--
-- Name: events_y2027m05_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m05_pkey;


--
-- Name: events_y2027m05_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m05_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m06_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m06_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m06_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m06_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m06_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m06_occurred_at_idx;


--
-- Name: events_y2027m06_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m06_pkey;


--
-- Name: events_y2027m06_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m06_tenant_id_occurred_at_idx;


--
-- Name: events_y2027m07_aggregate_type_aggregate_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_aggregate_idx ATTACH PARTITION core.events_y2027m07_aggregate_type_aggregate_id_occurred_at_idx;


--
-- Name: events_y2027m07_event_type_event_version_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_type_idx ATTACH PARTITION core.events_y2027m07_event_type_event_version_occurred_at_idx;


--
-- Name: events_y2027m07_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_occurred_brin ATTACH PARTITION core.events_y2027m07_occurred_at_idx;


--
-- Name: events_y2027m07_pkey; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_pkey ATTACH PARTITION core.events_y2027m07_pkey;


--
-- Name: events_y2027m07_tenant_id_occurred_at_idx; Type: INDEX ATTACH; Schema: core; Owner: -
--

ALTER INDEX core.events_tenant_idx ATTACH PARTITION core.events_y2027m07_tenant_id_occurred_at_idx;


--
-- Name: tenant_settings tenant_settings_touch_updated_at; Type: TRIGGER; Schema: agent; Owner: -
--

CREATE TRIGGER tenant_settings_touch_updated_at BEFORE UPDATE ON agent.tenant_settings FOR EACH ROW EXECUTE FUNCTION agent.tg_touch_updated_at();


--
-- Name: events events_notify; Type: TRIGGER; Schema: core; Owner: -
--

CREATE CONSTRAINT TRIGGER events_notify AFTER INSERT ON core.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION core._notify_events();


--
-- Name: skill_category skill_category_touch_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER skill_category_touch_updated_at BEFORE UPDATE ON core.skill_category FOR EACH ROW EXECUTE FUNCTION core.tg_touch_updated_at();


--
-- Name: skill skill_touch_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER skill_touch_updated_at BEFORE UPDATE ON core.skill FOR EACH ROW EXECUTE FUNCTION core.tg_touch_updated_at();


--
-- Name: subscription_failure_state subscription_failure_state_touch_updated_at; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER subscription_failure_state_touch_updated_at BEFORE UPDATE ON core.subscription_failure_state FOR EACH ROW EXECUTE FUNCTION core.tg_touch_updated_at();


--
-- Name: application application_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER application_touch_updated_at BEFORE UPDATE ON hiring.application FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: candidate_skill candidate_skill_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER candidate_skill_touch_updated_at BEFORE UPDATE ON hiring.candidate_skill FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: candidate candidate_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER candidate_touch_updated_at BEFORE UPDATE ON hiring.candidate FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: jd_template_section jd_template_section_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER jd_template_section_touch_updated_at BEFORE UPDATE ON hiring.jd_template_section FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: jd_template jd_template_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER jd_template_touch_updated_at BEFORE UPDATE ON hiring.jd_template FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: opening_close_reason opening_close_reason_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER opening_close_reason_touch_updated_at BEFORE UPDATE ON hiring.opening_close_reason FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: opening opening_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER opening_touch_updated_at BEFORE UPDATE ON hiring.opening FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: rejection_reason rejection_reason_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER rejection_reason_touch_updated_at BEFORE UPDATE ON hiring.rejection_reason FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: requisition_jd_section requisition_jd_section_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER requisition_jd_section_touch_updated_at BEFORE UPDATE ON hiring.requisition_jd_section FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: requisition_skill requisition_skill_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER requisition_skill_touch_updated_at BEFORE UPDATE ON hiring.requisition_skill FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: requisition requisition_touch_updated_at; Type: TRIGGER; Schema: hiring; Owner: -
--

CREATE TRIGGER requisition_touch_updated_at BEFORE UPDATE ON hiring.requisition FOR EACH ROW EXECUTE FUNCTION hiring.tg_touch_updated_at();


--
-- Name: access_group access_group_touch_updated_at; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER access_group_touch_updated_at BEFORE UPDATE ON identity.access_group FOR EACH ROW EXECUTE FUNCTION identity.tg_touch_updated_at();


--
-- Name: org_unit_projection org_unit_projection_touch_updated_at; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER org_unit_projection_touch_updated_at BEFORE UPDATE ON identity.org_unit_projection FOR EACH ROW EXECUTE FUNCTION identity.tg_touch_updated_at();


--
-- Name: person_projection person_projection_touch_updated_at; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER person_projection_touch_updated_at BEFORE UPDATE ON identity.person_projection FOR EACH ROW EXECUTE FUNCTION identity.tg_touch_updated_at();


--
-- Name: role_permission_overlays role_permission_overlays_touch_updated_at; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER role_permission_overlays_touch_updated_at BEFORE UPDATE ON identity.role_permission_overlays FOR EACH ROW EXECUTE FUNCTION identity.tg_touch_updated_at();


--
-- Name: tenant_sso_providers tenant_sso_providers_touch_updated_at; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER tenant_sso_providers_touch_updated_at BEFORE UPDATE ON identity.tenant_sso_providers FOR EACH ROW EXECUTE FUNCTION identity.tg_touch_updated_at();


--
-- Name: m365_group_links m365_group_links_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER m365_group_links_touch_updated_at BEFORE UPDATE ON integrations.m365_group_links FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: m365_plan_links m365_plan_links_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER m365_plan_links_touch_updated_at BEFORE UPDATE ON integrations.m365_plan_links FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: m365_resource_etags m365_resource_etags_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER m365_resource_etags_touch_updated_at BEFORE UPDATE ON integrations.m365_resource_etags FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: m365_subscriptions m365_subscriptions_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER m365_subscriptions_touch_updated_at BEFORE UPDATE ON integrations.m365_subscriptions FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: m365_tenant_config m365_tenant_config_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER m365_tenant_config_touch_updated_at BEFORE UPDATE ON integrations.m365_tenant_config FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: mail_transport_config mail_transport_config_touch_updated_at; Type: TRIGGER; Schema: integrations; Owner: -
--

CREATE TRIGGER mail_transport_config_touch_updated_at BEFORE UPDATE ON integrations.mail_transport_config FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();


--
-- Name: files files_touch_updated_at; Type: TRIGGER; Schema: knowledge; Owner: -
--

CREATE TRIGGER files_touch_updated_at BEFORE UPDATE ON knowledge.files FOR EACH ROW EXECUTE FUNCTION knowledge.tg_touch_updated_at();


--
-- Name: notification_prefs notification_prefs_touch_updated_at; Type: TRIGGER; Schema: notifications; Owner: -
--

CREATE TRIGGER notification_prefs_touch_updated_at BEFORE UPDATE ON notifications.notification_prefs FOR EACH ROW EXECUTE FUNCTION notifications.tg_touch_updated_at();


--
-- Name: account_projection account_projection_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER account_projection_touch_updated_at BEFORE UPDATE ON people.account_projection FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: employment_period employment_period_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER employment_period_touch_updated_at BEFORE UPDATE ON people.employment_period FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: org_unit org_unit_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER org_unit_touch_updated_at BEFORE UPDATE ON people.org_unit FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: person_skill person_skill_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER person_skill_touch_updated_at BEFORE UPDATE ON people.person_skill FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: person person_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER person_touch_updated_at BEFORE UPDATE ON people.person FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: project_projection project_projection_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER project_projection_touch_updated_at BEFORE UPDATE ON people.project_projection FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: worker_allocation_projection worker_allocation_projection_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER worker_allocation_projection_touch_updated_at BEFORE UPDATE ON people.worker_allocation_projection FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: worker worker_touch_updated_at; Type: TRIGGER; Schema: people; Owner: -
--

CREATE TRIGGER worker_touch_updated_at BEFORE UPDATE ON people.worker FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();


--
-- Name: buckets buckets_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER buckets_touch_updated_at BEFORE UPDATE ON planner.buckets FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: checklist_items checklist_items_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER checklist_items_touch_updated_at BEFORE UPDATE ON planner.checklist_items FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: group_join_requests group_join_requests_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER group_join_requests_touch_updated_at BEFORE UPDATE ON planner.group_join_requests FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: groups groups_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER groups_touch_updated_at BEFORE UPDATE ON planner.groups FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: labels labels_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER labels_touch_updated_at BEFORE UPDATE ON planner.labels FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: plan_categories plan_categories_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER plan_categories_touch_updated_at BEFORE UPDATE ON planner.plan_categories FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: plans plans_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER plans_touch_updated_at BEFORE UPDATE ON planner.plans FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: task_comments task_comments_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER task_comments_touch_updated_at BEFORE UPDATE ON planner.task_comments FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: task_references task_references_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER task_references_touch_updated_at BEFORE UPDATE ON planner.task_references FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: tasks tasks_touch_updated_at; Type: TRIGGER; Schema: planner; Owner: -
--

CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON planner.tasks FOR EACH ROW EXECUTE FUNCTION planner.tg_touch_updated_at();


--
-- Name: account_recruiter account_recruiter_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER account_recruiter_touch_updated_at BEFORE UPDATE ON pm.account_recruiter FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: account account_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER account_touch_updated_at BEFORE UPDATE ON pm.account FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: allocation allocation_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER allocation_touch_updated_at BEFORE UPDATE ON pm.allocation FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: charter charter_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER charter_touch_updated_at BEFORE UPDATE ON pm.charter FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: project_access project_access_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER project_access_touch_updated_at BEFORE UPDATE ON pm.project_access FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: project project_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER project_touch_updated_at BEFORE UPDATE ON pm.project FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: staffing_plan_line_skill staffing_plan_line_skill_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER staffing_plan_line_skill_touch_updated_at BEFORE UPDATE ON pm.staffing_plan_line_skill FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: staffing_plan_line staffing_plan_line_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER staffing_plan_line_touch_updated_at BEFORE UPDATE ON pm.staffing_plan_line FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: worker_projection worker_projection_touch_updated_at; Type: TRIGGER; Schema: pm; Owner: -
--

CREATE TRIGGER worker_projection_touch_updated_at BEFORE UPDATE ON pm.worker_projection FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();


--
-- Name: workflow_approvals workflow_approvals_run_id_workflow_runs_run_id_fk; Type: FK CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_approvals
    ADD CONSTRAINT workflow_approvals_run_id_workflow_runs_run_id_fk FOREIGN KEY (run_id) REFERENCES agent.workflow_runs(run_id) ON DELETE CASCADE;


--
-- Name: workflow_run_events_seen workflow_run_events_seen_run_id_workflow_runs_run_id_fk; Type: FK CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_run_events_seen
    ADD CONSTRAINT workflow_run_events_seen_run_id_workflow_runs_run_id_fk FOREIGN KEY (run_id) REFERENCES agent.workflow_runs(run_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workflow_run_steps workflow_run_steps_run_id_workflow_runs_run_id_fk; Type: FK CONSTRAINT; Schema: agent; Owner: -
--

ALTER TABLE ONLY agent.workflow_run_steps
    ADD CONSTRAINT workflow_run_steps_run_id_workflow_runs_run_id_fk FOREIGN KEY (run_id) REFERENCES agent.workflow_runs(run_id) ON DELETE CASCADE;


--
-- Name: skill skill_category_id_skill_category_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.skill
    ADD CONSTRAINT skill_category_id_skill_category_id_fk FOREIGN KEY (category_id) REFERENCES core.skill_category(id);


--
-- Name: application application_candidate_id_candidate_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.application
    ADD CONSTRAINT application_candidate_id_candidate_id_fk FOREIGN KEY (candidate_id) REFERENCES hiring.candidate(id);


--
-- Name: application application_rejection_reason_id_rejection_reason_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.application
    ADD CONSTRAINT application_rejection_reason_id_rejection_reason_id_fk FOREIGN KEY (rejection_reason_id) REFERENCES hiring.rejection_reason(id);


--
-- Name: application application_requisition_id_requisition_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.application
    ADD CONSTRAINT application_requisition_id_requisition_id_fk FOREIGN KEY (requisition_id) REFERENCES hiring.requisition(id);


--
-- Name: application application_superseded_by_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.application
    ADD CONSTRAINT application_superseded_by_fk FOREIGN KEY (superseded_by_application_id) REFERENCES hiring.application(id) ON DELETE SET NULL;


--
-- Name: candidate_event candidate_event_application_id_application_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate_event
    ADD CONSTRAINT candidate_event_application_id_application_id_fk FOREIGN KEY (application_id) REFERENCES hiring.application(id) ON DELETE SET NULL;


--
-- Name: candidate_event candidate_event_candidate_id_candidate_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate_event
    ADD CONSTRAINT candidate_event_candidate_id_candidate_id_fk FOREIGN KEY (candidate_id) REFERENCES hiring.candidate(id) ON DELETE CASCADE;


--
-- Name: candidate_skill candidate_skill_candidate_id_candidate_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.candidate_skill
    ADD CONSTRAINT candidate_skill_candidate_id_candidate_id_fk FOREIGN KEY (candidate_id) REFERENCES hiring.candidate(id) ON DELETE CASCADE;


--
-- Name: jd_template_section jd_template_section_template_id_jd_template_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.jd_template_section
    ADD CONSTRAINT jd_template_section_template_id_jd_template_id_fk FOREIGN KEY (template_id) REFERENCES hiring.jd_template(id) ON DELETE CASCADE;


--
-- Name: opening opening_close_reason_id_opening_close_reason_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.opening
    ADD CONSTRAINT opening_close_reason_id_opening_close_reason_id_fk FOREIGN KEY (close_reason_id) REFERENCES hiring.opening_close_reason(id);


--
-- Name: opening opening_hired_application_id_application_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.opening
    ADD CONSTRAINT opening_hired_application_id_application_id_fk FOREIGN KEY (hired_application_id) REFERENCES hiring.application(id) ON DELETE SET NULL;


--
-- Name: opening opening_requisition_id_requisition_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.opening
    ADD CONSTRAINT opening_requisition_id_requisition_id_fk FOREIGN KEY (requisition_id) REFERENCES hiring.requisition(id);


--
-- Name: requisition_jd_section requisition_jd_section_requisition_id_requisition_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.requisition_jd_section
    ADD CONSTRAINT requisition_jd_section_requisition_id_requisition_id_fk FOREIGN KEY (requisition_id) REFERENCES hiring.requisition(id) ON DELETE CASCADE;


--
-- Name: requisition_skill requisition_skill_requisition_id_requisition_id_fk; Type: FK CONSTRAINT; Schema: hiring; Owner: -
--

ALTER TABLE ONLY hiring.requisition_skill
    ADD CONSTRAINT requisition_skill_requisition_id_requisition_id_fk FOREIGN KEY (requisition_id) REFERENCES hiring.requisition(id) ON DELETE CASCADE;


--
-- Name: account account_user_id_fkey; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.account
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity."user"(id) ON DELETE CASCADE;


--
-- Name: session session_user_id_fkey; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.session
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity."user"(id) ON DELETE CASCADE;


--
-- Name: m365_resource_etags m365_resource_etags_plan_link_id_m365_plan_links_id_fk; Type: FK CONSTRAINT; Schema: integrations; Owner: -
--

ALTER TABLE ONLY integrations.m365_resource_etags
    ADD CONSTRAINT m365_resource_etags_plan_link_id_m365_plan_links_id_fk FOREIGN KEY (plan_link_id) REFERENCES integrations.m365_plan_links(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_tenant_id_file_id_fkey; Type: FK CONSTRAINT; Schema: knowledge; Owner: -
--

ALTER TABLE knowledge.chunks
    ADD CONSTRAINT chunks_tenant_id_file_id_fkey FOREIGN KEY (tenant_id, file_id) REFERENCES knowledge.files(tenant_id, id) ON DELETE CASCADE;


--
-- Name: employment_period employment_period_person_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.employment_period
    ADD CONSTRAINT employment_period_person_fk FOREIGN KEY (person_id) REFERENCES people.person(id);


--
-- Name: org_unit org_unit_head_worker_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.org_unit
    ADD CONSTRAINT org_unit_head_worker_fk FOREIGN KEY (head_worker_id) REFERENCES people.person(id) ON DELETE SET NULL;


--
-- Name: org_unit org_unit_parent_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.org_unit
    ADD CONSTRAINT org_unit_parent_fk FOREIGN KEY (parent_id) REFERENCES people.org_unit(id);


--
-- Name: person_skill person_skill_person_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.person_skill
    ADD CONSTRAINT person_skill_person_fk FOREIGN KEY (person_id) REFERENCES people.person(id);


--
-- Name: worker_history worker_history_person_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker_history
    ADD CONSTRAINT worker_history_person_fk FOREIGN KEY (person_id) REFERENCES people.person(id) ON DELETE CASCADE;


--
-- Name: worker worker_org_unit_id_org_unit_id_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker
    ADD CONSTRAINT worker_org_unit_id_org_unit_id_fk FOREIGN KEY (org_unit_id) REFERENCES people.org_unit(id);


--
-- Name: worker worker_person_fk; Type: FK CONSTRAINT; Schema: people; Owner: -
--

ALTER TABLE ONLY people.worker
    ADD CONSTRAINT worker_person_fk FOREIGN KEY (person_id) REFERENCES people.person(id);


--
-- Name: buckets buckets_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.buckets
    ADD CONSTRAINT buckets_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES planner.plans(id) ON DELETE CASCADE;


--
-- Name: checklist_items checklist_items_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.checklist_items
    ADD CONSTRAINT checklist_items_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES planner.tasks(id) ON DELETE CASCADE;


--
-- Name: group_join_requests group_join_requests_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.group_join_requests
    ADD CONSTRAINT group_join_requests_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES planner.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.group_members
    ADD CONSTRAINT group_members_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES planner.groups(id) ON DELETE CASCADE;


--
-- Name: labels labels_category_slot_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.labels
    ADD CONSTRAINT labels_category_slot_fk FOREIGN KEY (plan_id, category_slot) REFERENCES planner.plan_categories(plan_id, slot) ON DELETE SET NULL;


--
-- Name: labels labels_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.labels
    ADD CONSTRAINT labels_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES planner.plans(id) ON DELETE CASCADE;


--
-- Name: plan_categories plan_categories_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.plan_categories
    ADD CONSTRAINT plan_categories_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES planner.plans(id) ON DELETE CASCADE;


--
-- Name: plans plans_group_id_groups_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.plans
    ADD CONSTRAINT plans_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES planner.groups(id);


--
-- Name: task_assignments task_assignments_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_assignments
    ADD CONSTRAINT task_assignments_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES planner.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_comments
    ADD CONSTRAINT task_comments_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES planner.tasks(id) ON DELETE CASCADE;


--
-- Name: task_labels task_labels_label_id_labels_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_labels
    ADD CONSTRAINT task_labels_label_id_labels_id_fk FOREIGN KEY (label_id) REFERENCES planner.labels(id) ON DELETE CASCADE;


--
-- Name: task_labels task_labels_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_labels
    ADD CONSTRAINT task_labels_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES planner.tasks(id) ON DELETE CASCADE;


--
-- Name: task_references task_references_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.task_references
    ADD CONSTRAINT task_references_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES planner.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_bucket_id_buckets_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.tasks
    ADD CONSTRAINT tasks_bucket_id_buckets_id_fk FOREIGN KEY (bucket_id) REFERENCES planner.buckets(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_plan_id_plans_id_fk; Type: FK CONSTRAINT; Schema: planner; Owner: -
--

ALTER TABLE ONLY planner.tasks
    ADD CONSTRAINT tasks_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES planner.plans(id);


--
-- Name: account_recruiter account_recruiter_account_id_account_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.account_recruiter
    ADD CONSTRAINT account_recruiter_account_id_account_id_fk FOREIGN KEY (account_id) REFERENCES pm.account(id) ON DELETE CASCADE;


--
-- Name: allocation allocation_project_id_project_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.allocation
    ADD CONSTRAINT allocation_project_id_project_id_fk FOREIGN KEY (project_id) REFERENCES pm.project(id);


--
-- Name: charter charter_account_id_account_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.charter
    ADD CONSTRAINT charter_account_id_account_id_fk FOREIGN KEY (account_id) REFERENCES pm.account(id);


--
-- Name: charter charter_project_id_project_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.charter
    ADD CONSTRAINT charter_project_id_project_id_fk FOREIGN KEY (project_id) REFERENCES pm.project(id) ON DELETE SET NULL;


--
-- Name: project_access project_access_project_id_project_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.project_access
    ADD CONSTRAINT project_access_project_id_project_id_fk FOREIGN KEY (project_id) REFERENCES pm.project(id) ON DELETE CASCADE;


--
-- Name: project project_account_id_account_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.project
    ADD CONSTRAINT project_account_id_account_id_fk FOREIGN KEY (account_id) REFERENCES pm.account(id);


--
-- Name: project project_charter_id_charter_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.project
    ADD CONSTRAINT project_charter_id_charter_id_fk FOREIGN KEY (charter_id) REFERENCES pm.charter(id) ON DELETE SET NULL;


--
-- Name: staffing_plan_line staffing_plan_line_project_id_project_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.staffing_plan_line
    ADD CONSTRAINT staffing_plan_line_project_id_project_id_fk FOREIGN KEY (project_id) REFERENCES pm.project(id) ON DELETE CASCADE;


--
-- Name: staffing_plan_line_skill staffing_plan_line_skill_line_id_staffing_plan_line_id_fk; Type: FK CONSTRAINT; Schema: pm; Owner: -
--

ALTER TABLE ONLY pm.staffing_plan_line_skill
    ADD CONSTRAINT staffing_plan_line_skill_line_id_staffing_plan_line_id_fk FOREIGN KEY (line_id) REFERENCES pm.staffing_plan_line(id) ON DELETE CASCADE;


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.rate_limits USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tenant_settings tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.tenant_settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: workflow_approvals tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.workflow_approvals USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: workflow_run_events_seen tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.workflow_run_events_seen USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: workflow_run_steps tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.workflow_run_steps USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: workflow_runs tenant_isolation; Type: POLICY; Schema: agent; Owner: -
--

CREATE POLICY tenant_isolation ON agent.workflow_runs USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tenant_settings; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.tenant_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_approvals; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.workflow_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_run_events_seen; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.workflow_run_events_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_run_steps; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.workflow_run_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_runs; Type: ROW SECURITY; Schema: agent; Owner: -
--

ALTER TABLE agent.workflow_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: session_scope_cache; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.session_scope_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: skill; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.skill ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_category; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.skill_category ENABLE ROW LEVEL SECURITY;

--
-- Name: session_scope_cache tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.session_scope_cache USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: skill tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.skill USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: skill_category tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.skill_category USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: application; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.application ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.candidate ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_event; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.candidate_event ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_skill; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.candidate_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: jd_template; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.jd_template ENABLE ROW LEVEL SECURITY;

--
-- Name: jd_template_section; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.jd_template_section ENABLE ROW LEVEL SECURITY;

--
-- Name: opening; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.opening ENABLE ROW LEVEL SECURITY;

--
-- Name: opening_close_reason; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.opening_close_reason ENABLE ROW LEVEL SECURITY;

--
-- Name: rejection_reason; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.rejection_reason ENABLE ROW LEVEL SECURITY;

--
-- Name: requisition; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.requisition ENABLE ROW LEVEL SECURITY;

--
-- Name: requisition_jd_section; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.requisition_jd_section ENABLE ROW LEVEL SECURITY;

--
-- Name: requisition_skill; Type: ROW SECURITY; Schema: hiring; Owner: -
--

ALTER TABLE hiring.requisition_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: application tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.application USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: candidate tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.candidate USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: candidate_event tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.candidate_event USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: candidate_skill tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.candidate_skill USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: jd_template tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.jd_template USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: jd_template_section tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.jd_template_section USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: opening tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.opening USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: opening_close_reason tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.opening_close_reason USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: rejection_reason tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.rejection_reason USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: requisition tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.requisition USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: requisition_jd_section tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.requisition_jd_section USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: requisition_skill tenant_isolation; Type: POLICY; Schema: hiring; Owner: -
--

CREATE POLICY tenant_isolation ON hiring.requisition_skill USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: access_group; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.access_group ENABLE ROW LEVEL SECURITY;

--
-- Name: access_group_membership; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.access_group_membership ENABLE ROW LEVEL SECURITY;

--
-- Name: access_group_role; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.access_group_role ENABLE ROW LEVEL SECURITY;

--
-- Name: org_unit_projection; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.org_unit_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: person_projection; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.person_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: product_grant; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.product_grant ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignments; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permission_overlays; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.role_permission_overlays ENABLE ROW LEVEL SECURITY;

--
-- Name: access_group tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.access_group USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: access_group_membership tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.access_group_membership USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: access_group_role tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.access_group_role USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: org_unit_projection tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.org_unit_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: person_projection tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.person_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: product_grant tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.product_grant USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: role_assignments tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.role_assignments USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: role_permission_overlays tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.role_permission_overlays USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tenant_sso_providers tenant_isolation; Type: POLICY; Schema: identity; Owner: -
--

CREATE POLICY tenant_isolation ON identity.tenant_sso_providers USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tenant_sso_providers; Type: ROW SECURITY; Schema: identity; Owner: -
--

ALTER TABLE identity.tenant_sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_group_links; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.m365_group_links ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_plan_links; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.m365_plan_links ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_resource_etags; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.m365_resource_etags ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_subscriptions; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.m365_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_tenant_config; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.m365_tenant_config ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_transport_config; Type: ROW SECURITY; Schema: integrations; Owner: -
--

ALTER TABLE integrations.mail_transport_config ENABLE ROW LEVEL SECURITY;

--
-- Name: m365_group_links tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.m365_group_links USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: m365_plan_links tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.m365_plan_links USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: m365_resource_etags tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.m365_resource_etags USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: m365_subscriptions tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.m365_subscriptions USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: m365_tenant_config tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.m365_tenant_config USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: mail_transport_config tenant_isolation; Type: POLICY; Schema: integrations; Owner: -
--

CREATE POLICY tenant_isolation ON integrations.mail_transport_config USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: chunks; Type: ROW SECURITY; Schema: knowledge; Owner: -
--

ALTER TABLE knowledge.chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: knowledge; Owner: -
--

ALTER TABLE knowledge.files ENABLE ROW LEVEL SECURITY;

--
-- Name: chunks tenant_isolation; Type: POLICY; Schema: knowledge; Owner: -
--

CREATE POLICY tenant_isolation ON knowledge.chunks USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: files tenant_isolation; Type: POLICY; Schema: knowledge; Owner: -
--

CREATE POLICY tenant_isolation ON knowledge.files USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: notification_prefs; Type: ROW SECURITY; Schema: notifications; Owner: -
--

ALTER TABLE notifications.notification_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: notifications; Owner: -
--

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_prefs tenant_isolation; Type: POLICY; Schema: notifications; Owner: -
--

CREATE POLICY tenant_isolation ON notifications.notification_prefs USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: notifications tenant_isolation; Type: POLICY; Schema: notifications; Owner: -
--

CREATE POLICY tenant_isolation ON notifications.notifications USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: account_projection; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.account_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: employment_period; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.employment_period ENABLE ROW LEVEL SECURITY;

--
-- Name: org_unit; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.org_unit ENABLE ROW LEVEL SECURITY;

--
-- Name: person; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.person ENABLE ROW LEVEL SECURITY;

--
-- Name: person_skill; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.person_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: project_projection; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.project_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: account_projection tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.account_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: employment_period tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.employment_period USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: org_unit tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.org_unit USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: person tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.person USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: person_skill tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.person_skill USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: project_projection tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.project_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.worker USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker_allocation_projection tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.worker_allocation_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker_history tenant_isolation; Type: POLICY; Schema: people; Owner: -
--

CREATE POLICY tenant_isolation ON people.worker_history USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.worker ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_allocation_projection; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.worker_allocation_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_history; Type: ROW SECURITY; Schema: people; Owner: -
--

ALTER TABLE people.worker_history ENABLE ROW LEVEL SECURITY;

--
-- Name: assignee_projection; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.assignee_projection ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_items; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: group_join_requests; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.group_join_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: labels; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.labels ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_categories; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.plan_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: task_assignments; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.task_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_labels; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.task_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: task_references; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.task_references ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: planner; Owner: -
--

ALTER TABLE planner.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: assignee_projection tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.assignee_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: buckets tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.buckets USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: checklist_items tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.checklist_items USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: group_join_requests tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.group_join_requests USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: group_members tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.group_members USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: groups tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.groups USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: labels tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.labels USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: plan_categories tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.plan_categories USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: plans tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.plans USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: task_assignments tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.task_assignments USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: task_comments tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.task_comments USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: task_labels tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.task_labels USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: task_references tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.task_references USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: tasks tenant_isolation; Type: POLICY; Schema: planner; Owner: -
--

CREATE POLICY tenant_isolation ON planner.tasks USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: account; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.account ENABLE ROW LEVEL SECURITY;

--
-- Name: account_recruiter; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.account_recruiter ENABLE ROW LEVEL SECURITY;

--
-- Name: allocation; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.allocation ENABLE ROW LEVEL SECURITY;

--
-- Name: charter; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.charter ENABLE ROW LEVEL SECURITY;

--
-- Name: project; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.project ENABLE ROW LEVEL SECURITY;

--
-- Name: project_access; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.project_access ENABLE ROW LEVEL SECURITY;

--
-- Name: staffing_plan_line; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.staffing_plan_line ENABLE ROW LEVEL SECURITY;

--
-- Name: staffing_plan_line_skill; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.staffing_plan_line_skill ENABLE ROW LEVEL SECURITY;

--
-- Name: account tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.account USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: account_recruiter tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.account_recruiter USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: allocation tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.allocation USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: charter tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.charter USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: project tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.project USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: project_access tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.project_access USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: staffing_plan_line tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.staffing_plan_line USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: staffing_plan_line_skill tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.staffing_plan_line_skill USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker_projection tenant_isolation; Type: POLICY; Schema: pm; Owner: -
--

CREATE POLICY tenant_isolation ON pm.worker_projection USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: worker_projection; Type: ROW SECURITY; Schema: pm; Owner: -
--

ALTER TABLE pm.worker_projection ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict e3Loe7qk13oQEIfYNiDEDdDbjtdYNyCo5Zr9uYSraKgA1VRE7MRsIWbd31wCAqi

