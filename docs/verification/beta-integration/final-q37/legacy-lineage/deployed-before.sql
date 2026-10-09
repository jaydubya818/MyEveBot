--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 17.9 (Homebrew)

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
-- Name: invalidate_reminder_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalidate_reminder_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.prompt,NEW.cron,NEW.timezone,NEW.chat_id,NEW.approval_boundary)
     IS DISTINCT FROM ROW(OLD.prompt,OLD.cron,OLD.timezone,OLD.chat_id,OLD.approval_boundary) THEN
    NEW.configuration_version := OLD.configuration_version+1;
    NEW.reviewed_version := NULL;
    NEW.reviewed_at := NULL;
    IF OLD.execution_routine_id IS NOT NULL THEN
      UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
      WHERE id=OLD.execution_routine_id;
    END IF;
  END IF;
  IF NEW.status IN ('paused','cancelled') AND OLD.execution_routine_id IS NOT NULL THEN
    UPDATE execution_routines SET status='paused',paused_at=now(),updated_at=now()
    WHERE id=OLD.execution_routine_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: revoke_changed_routine_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_changed_routine_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.configuration,NEW.agent_id) IS DISTINCT FROM ROW(OLD.configuration,OLD.agent_id)
     AND NEW.version=OLD.version THEN
    NEW.status := 'paused';
    NEW.paused_at := now();
  END IF;
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_receipts (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    action_id text NOT NULL,
    attempt_number integer NOT NULL,
    event text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: action_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.action_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: action_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.action_receipts_id_seq OWNED BY public.action_receipts.id;


--
-- Name: action_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_requests (
    id text NOT NULL,
    owner_id text NOT NULL,
    run_id text NOT NULL,
    occurrence_id text,
    action_key text NOT NULL,
    executor jsonb NOT NULL,
    trigger jsonb NOT NULL,
    capability_id text NOT NULL,
    action_class text NOT NULL,
    target jsonb NOT NULL,
    parameter_hash text NOT NULL,
    safe_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision text NOT NULL,
    authority_source text NOT NULL,
    approval_id text,
    status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    computer_session_id text,
    control_version bigint,
    provider_receipt jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reason_code text DEFAULT 'legacy_decision'::text NOT NULL,
    policy_version text DEFAULT 'local-v1'::text NOT NULL,
    recovery_token text,
    recovery_expires_at timestamp with time zone,
    recovery_result jsonb,
    approval_generation integer DEFAULT 0 NOT NULL,
    CONSTRAINT action_requests_decision_check CHECK ((decision = ANY (ARRAY['ALLOW'::text, 'REQUIRE_APPROVAL'::text, 'DENY'::text]))),
    CONSTRAINT action_requests_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'awaiting_approval'::text, 'authorized'::text, 'executing'::text, 'verifying'::text, 'completed'::text, 'failed'::text, 'result_unknown'::text, 'cancelled'::text, 'denied'::text, 'recovering'::text, 'needs_you'::text, 'retryable'::text])))
);


--
-- Name: agent_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_audit_events (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    summary text NOT NULL,
    changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_audit_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT agent_audit_events_event_type_check CHECK ((event_type = ANY (ARRAY['created'::text, 'updated'::text, 'capabilities_changed'::text, 'paused'::text, 'resumed'::text, 'disabled'::text, 'archived'::text, 'duplicated'::text])))
);


--
-- Name: agent_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_capabilities (
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    capability_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    assigned_by_type text DEFAULT 'owner'::text NOT NULL,
    assigned_by_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_capabilities_assigned_by_type_check CHECK ((assigned_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text])))
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id text NOT NULL,
    session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    thread_id text,
    status text DEFAULT 'running'::text NOT NULL,
    model_steps integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    executor_kind text DEFAULT 'persistent-agent'::text NOT NULL,
    role_id text,
    CONSTRAINT agent_runs_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
    CONSTRAINT agent_runs_executor_kind_valid CHECK ((executor_kind = ANY (ARRAY['primary-agent'::text, 'persistent-agent'::text, 'on-demand-role'::text]))),
    CONSTRAINT agent_runs_model_steps_check CHECK ((model_steps >= 0)),
    CONSTRAINT agent_runs_role_attribution_valid CHECK (((executor_kind = 'on-demand-role'::text) = (role_id IS NOT NULL))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: agentphone_call; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_call (
    call_id text NOT NULL,
    cursor integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agentphone_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_config (
    id integer DEFAULT 1 NOT NULL,
    number_id text,
    phone_number text,
    agent_id text,
    webhook_secret text,
    owner_number text,
    operational_enabled boolean DEFAULT false NOT NULL,
    daily_message_limit integer DEFAULT 25 NOT NULL,
    daily_call_limit integer DEFAULT 5 NOT NULL,
    quiet_hours_start smallint DEFAULT 21 NOT NULL,
    quiet_hours_end smallint DEFAULT 8 NOT NULL,
    timezone text DEFAULT 'America/Los_Angeles'::text NOT NULL,
    usage_day date DEFAULT CURRENT_DATE NOT NULL,
    message_segments_used integer DEFAULT 0 NOT NULL,
    calls_used integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_config_calls_used_check CHECK ((calls_used >= 0)),
    CONSTRAINT agentphone_config_daily_call_limit_check CHECK (((daily_call_limit >= 1) AND (daily_call_limit <= 50))),
    CONSTRAINT agentphone_config_daily_message_limit_check CHECK (((daily_message_limit >= 1) AND (daily_message_limit <= 500))),
    CONSTRAINT agentphone_config_id_check CHECK ((id = 1)),
    CONSTRAINT agentphone_config_message_segments_used_check CHECK ((message_segments_used >= 0)),
    CONSTRAINT agentphone_config_quiet_hours_end_check CHECK (((quiet_hours_end >= 0) AND (quiet_hours_end <= 23))),
    CONSTRAINT agentphone_config_quiet_hours_start_check CHECK (((quiet_hours_start >= 0) AND (quiet_hours_start <= 23)))
);


--
-- Name: agentphone_contact_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_contact_policy (
    phone_number text NOT NULL,
    consent_status text NOT NULL,
    consent_source text NOT NULL,
    first_outbound_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_contact_policy_consent_status_check CHECK ((consent_status = ANY (ARRAY['allowed'::text, 'blocked'::text])))
);


--
-- Name: agentphone_inbound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_inbound (
    message_id text NOT NULL,
    conversation_id text NOT NULL,
    sender text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'claimed'::text NOT NULL,
    error text,
    text text
);


--
-- Name: agentphone_usage_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agentphone_usage_event (
    id bigint NOT NULL,
    kind text NOT NULL,
    recipient text NOT NULL,
    units integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agentphone_usage_event_kind_check CHECK ((kind = ANY (ARRAY['message_segment'::text, 'call'::text]))),
    CONSTRAINT agentphone_usage_event_units_check CHECK ((units > 0))
);


--
-- Name: agentphone_usage_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agentphone_usage_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agentphone_usage_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agentphone_usage_event_id_seq OWNED BY public.agentphone_usage_event.id;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id text NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    label text,
    role text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    instructions text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    preferred_model text,
    reasoning_preference text DEFAULT 'default'::text NOT NULL,
    avatar_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_ceiling text DEFAULT 'low'::text NOT NULL,
    notification_policy text DEFAULT 'activity'::text NOT NULL,
    max_steps integer DEFAULT 20 NOT NULL,
    max_runtime_seconds integer DEFAULT 900 NOT NULL,
    max_estimated_cost_usd numeric(10,4) DEFAULT 2 NOT NULL,
    max_retries integer DEFAULT 1 NOT NULL,
    created_by_type text DEFAULT 'owner'::text NOT NULL,
    created_by_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT agents_check CHECK (((NOT is_primary) OR (status = 'active'::text))),
    CONSTRAINT agents_check1 CHECK (((status = 'archived'::text) = (archived_at IS NOT NULL))),
    CONSTRAINT agents_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT agents_instructions_check CHECK (((char_length(instructions) >= 1) AND (char_length(instructions) <= 20000))),
    CONSTRAINT agents_max_estimated_cost_usd_check CHECK ((max_estimated_cost_usd > (0)::numeric)),
    CONSTRAINT agents_max_retries_check CHECK (((max_retries >= 0) AND (max_retries <= 10))),
    CONSTRAINT agents_max_runtime_seconds_check CHECK (((max_runtime_seconds >= 10) AND (max_runtime_seconds <= 86400))),
    CONSTRAINT agents_max_steps_check CHECK (((max_steps >= 1) AND (max_steps <= 200))),
    CONSTRAINT agents_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT agents_notification_policy_check CHECK ((notification_policy = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push_on_block'::text]))),
    CONSTRAINT agents_reasoning_preference_check CHECK ((reasoning_preference = ANY (ARRAY['default'::text, 'none'::text, 'minimal'::text, 'low'::text, 'medium'::text, 'high'::text, 'xhigh'::text]))),
    CONSTRAINT agents_risk_ceiling_check CHECK ((risk_ceiling = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT agents_role_check CHECK (((char_length(role) >= 1) AND (char_length(role) <= 120))),
    CONSTRAINT agents_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text, 'archived'::text])))
);


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id bigint NOT NULL,
    kind text NOT NULL,
    automation_id text NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    error text,
    thread_id text
);


--
-- Name: automation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_runs_id_seq OWNED BY public.automation_runs.id;


--
-- Name: browser_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.browser_sessions (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    current_url text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT browser_sessions_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'running'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])))
);


--
-- Name: chat_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_files (
    id text NOT NULL,
    thread_id text NOT NULL,
    filename text NOT NULL,
    media_type text NOT NULL,
    size_bytes bigint NOT NULL,
    blob_url text NOT NULL,
    blob_path text NOT NULL,
    owner_id text DEFAULT 'web:owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_files_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: computer_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_actions (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    run_id text,
    agent_id text NOT NULL,
    call_id text NOT NULL,
    type text NOT NULL,
    target text,
    input_summary text DEFAULT ''::text NOT NULL,
    output_summary text,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    failure_code text,
    failure_summary text,
    control_version bigint NOT NULL,
    CONSTRAINT computer_actions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'denied'::text, 'timed_out'::text]))),
    CONSTRAINT computer_actions_type_check CHECK ((type = ANY (ARRAY['browser.navigate'::text, 'browser.click'::text, 'browser.type'::text, 'browser.read'::text, 'file.read'::text, 'file.write'::text, 'file.download'::text, 'file.upload'::text, 'terminal.command'::text])))
);


--
-- Name: computer_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_artifacts (
    id text NOT NULL,
    owner_id text NOT NULL,
    computer_session_id text NOT NULL,
    action_id text,
    run_id text,
    kind text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    storage_key text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_artifacts_kind_check CHECK ((kind = ANY (ARRAY['screenshot'::text, 'download'::text, 'report'::text, 'file'::text, 'log'::text, 'json'::text]))),
    CONSTRAINT computer_artifacts_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: computer_control_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_control_leases (
    computer_session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    run_id text,
    controller text NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    claimed_by text,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    expires_at timestamp with time zone,
    transition_reason text,
    state_fingerprint text,
    checkpoint jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_input_enabled boolean DEFAULT false NOT NULL,
    owner_input_in_flight integer DEFAULT 0 NOT NULL,
    gateway_actions_in_flight integer DEFAULT 0 NOT NULL,
    CONSTRAINT computer_control_leases_check CHECK (((controller = 'OWNER'::text) = (claimed_by IS NOT NULL))),
    CONSTRAINT computer_control_leases_check1 CHECK (((controller = 'OWNER'::text) = (expires_at IS NOT NULL))),
    CONSTRAINT computer_control_leases_controller_check CHECK ((controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))),
    CONSTRAINT computer_control_leases_gateway_actions_in_flight_check CHECK ((gateway_actions_in_flight >= 0)),
    CONSTRAINT computer_control_leases_owner_input_enabled_check CHECK (((NOT owner_input_enabled) OR (controller = 'OWNER'::text))),
    CONSTRAINT computer_control_leases_owner_input_in_flight_check CHECK ((owner_input_in_flight >= 0)),
    CONSTRAINT computer_control_leases_version_check CHECK ((version > 0))
);


--
-- Name: computer_control_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_control_receipts (
    id text NOT NULL,
    computer_session_id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    run_id text,
    event_type text NOT NULL,
    previous_controller text,
    new_controller text NOT NULL,
    control_version bigint NOT NULL,
    requested_by text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_control_receipts_control_version_check CHECK ((control_version > 0)),
    CONSTRAINT computer_control_receipts_new_controller_check CHECK ((new_controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))),
    CONSTRAINT computer_control_receipts_previous_controller_check CHECK (((previous_controller IS NULL) OR (previous_controller = ANY (ARRAY['AGENT'::text, 'OWNER'::text, 'PAUSED'::text, 'NONE'::text]))))
);


--
-- Name: computer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.computer_sessions (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    run_id text,
    runtime_session_id text NOT NULL,
    sandbox_id text,
    status text DEFAULT 'provisioning'::text NOT NULL,
    environment_type text DEFAULT 'eve-sandbox'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    resource_limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    network_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    failure_code text,
    failure_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT computer_sessions_check CHECK (((status = ANY (ARRAY['completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])) = (completed_at IS NOT NULL))),
    CONSTRAINT computer_sessions_check1 CHECK (((status = ANY (ARRAY['failed'::text, 'lost'::text])) = (failure_code IS NOT NULL))),
    CONSTRAINT computer_sessions_environment_type_check CHECK ((environment_type = ANY (ARRAY['eve-sandbox'::text, 'vercel-sandbox'::text]))),
    CONSTRAINT computer_sessions_status_check CHECK ((status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'lost'::text, 'expired'::text, 'stopped'::text])))
);


--
-- Name: context_assemblies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_assemblies (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    session_id text NOT NULL,
    agent_run_id text,
    thread_id text,
    goal_id text,
    goal_task_id text,
    task_run_id text,
    memory_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    thread_summary_id text,
    source_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_tokens integer NOT NULL,
    budget jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT context_assemblies_estimated_tokens_check CHECK ((estimated_tokens >= 0))
);


--
-- Name: eve_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eve_events (
    id text NOT NULL,
    owner_id text NOT NULL,
    type text NOT NULL,
    source_type text NOT NULL,
    source_id text,
    goal_id text,
    goal_task_id text,
    run_id text,
    severity text DEFAULT 'info'::text NOT NULL,
    summary text NOT NULL,
    rationale jsonb DEFAULT '[]'::jsonb NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_classification text DEFAULT 'activity'::text NOT NULL,
    CONSTRAINT eve_events_delivery_classification_check CHECK ((delivery_classification = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push'::text, 'urgent'::text]))),
    CONSTRAINT eve_events_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'attention'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: execution_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_attempts (
    owner_id text NOT NULL,
    occurrence_id text NOT NULL,
    attempt_number integer NOT NULL,
    claim_version bigint NOT NULL,
    worker_id text NOT NULL,
    status text NOT NULL,
    failure_category text,
    retry_decision text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    cost_status text DEFAULT 'unknown'::text NOT NULL,
    cost_usd numeric(12,6),
    CONSTRAINT execution_attempts_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT execution_attempts_check CHECK (((cost_status = 'unknown'::text) = (cost_usd IS NULL))),
    CONSTRAINT execution_attempts_cost_status_check CHECK ((cost_status = ANY (ARRAY['known'::text, 'estimated'::text, 'unknown'::text]))),
    CONSTRAINT execution_attempts_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT execution_attempts_retry_decision_check CHECK ((retry_decision = ANY (ARRAY['retry'::text, 'stop'::text, 'recovery_required'::text, 'wait'::text]))),
    CONSTRAINT execution_attempts_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'interrupted'::text, 'waiting'::text, 'cancelled'::text])))
);


--
-- Name: execution_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_occurrences (
    id text NOT NULL,
    owner_id text NOT NULL,
    routine_id text NOT NULL,
    routine_version integer NOT NULL,
    occurrence_key text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    run_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    claim_version bigint DEFAULT 0 NOT NULL,
    claimed_by text,
    claimed_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_category text,
    completed_at timestamp with time zone,
    cost_status text DEFAULT 'unknown'::text NOT NULL,
    cost_usd numeric(12,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    runtime_session_id text,
    admission jsonb,
    preflight jsonb,
    CONSTRAINT execution_occurrences_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT execution_occurrences_check CHECK (((status = 'running'::text) = (claimed_by IS NOT NULL))),
    CONSTRAINT execution_occurrences_check1 CHECK (((status = 'running'::text) = (lease_expires_at IS NOT NULL))),
    CONSTRAINT execution_occurrences_check2 CHECK (((cost_status = 'unknown'::text) = (cost_usd IS NULL))),
    CONSTRAINT execution_occurrences_cost_status_check CHECK ((cost_status = ANY (ARRAY['known'::text, 'estimated'::text, 'unknown'::text]))),
    CONSTRAINT execution_occurrences_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT execution_occurrences_run_required CHECK (((run_id IS NOT NULL) OR (status = 'blocked_precheck'::text))),
    CONSTRAINT execution_occurrences_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'waiting'::text, 'retrying'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'recovery_required'::text, 'blocked_precheck'::text])))
);


--
-- Name: execution_routine_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_routine_versions (
    owner_id text NOT NULL,
    routine_id text NOT NULL,
    version integer NOT NULL,
    configuration jsonb NOT NULL,
    changed_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    review_binding jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT execution_routine_versions_version_check CHECK ((version > 0))
);


--
-- Name: execution_routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_routines (
    id text NOT NULL,
    owner_id text NOT NULL,
    source_kind text NOT NULL,
    source_id text NOT NULL,
    name text NOT NULL,
    agent_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    configuration jsonb NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    failure_threshold integer DEFAULT 3 NOT NULL,
    last_failure text,
    last_success_at timestamp with time zone,
    paused_at timestamp with time zone,
    pause_sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT execution_routines_consecutive_failures_check CHECK ((consecutive_failures >= 0)),
    CONSTRAINT execution_routines_failure_threshold_check CHECK (((failure_threshold >= 1) AND (failure_threshold <= 10))),
    CONSTRAINT execution_routines_source_kind_check CHECK ((source_kind = ANY (ARRAY['reminder'::text, 'review'::text, 'webhook'::text, 'manual'::text]))),
    CONSTRAINT execution_routines_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'auto_paused'::text, 'disabled'::text, 'archived'::text]))),
    CONSTRAINT execution_routines_version_check CHECK ((version > 0))
);


--
-- Name: goal_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_milestones (
    id text NOT NULL,
    goal_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    target_date date,
    completed_at timestamp with time zone,
    "position" integer DEFAULT 0 NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text]))),
    CONSTRAINT goal_milestones_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);


--
-- Name: goal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_plans (
    id text NOT NULL,
    goal_id text NOT NULL,
    version integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    summary text NOT NULL,
    strategy text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_at timestamp with time zone,
    CONSTRAINT goal_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text]))),
    CONSTRAINT goal_plans_version_check CHECK ((version > 0))
);


--
-- Name: goal_task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_task_dependencies (
    task_id text NOT NULL,
    depends_on_task_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_task_dependencies_check CHECK ((task_id <> depends_on_task_id))
);


--
-- Name: goal_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_tasks (
    id text NOT NULL,
    goal_id text NOT NULL,
    milestone_id text,
    parent_task_id text,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    due_at timestamp with time zone,
    assigned_to text,
    required_capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_effort_minutes integer,
    estimated_cost_usd numeric(10,4),
    "position" integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_tasks_estimated_cost_usd_check CHECK (((estimated_cost_usd IS NULL) OR (estimated_cost_usd >= (0)::numeric))),
    CONSTRAINT goal_tasks_estimated_effort_minutes_check CHECK (((estimated_effort_minutes IS NULL) OR (estimated_effort_minutes > 0))),
    CONSTRAINT goal_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT goal_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'ready'::text, 'in_progress'::text, 'waiting'::text, 'blocked'::text, 'verification'::text, 'completed'::text, 'cancelled'::text, 'failed'::text]))),
    CONSTRAINT goal_tasks_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 240)))
);


--
-- Name: goal_thread_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_thread_links (
    goal_id text NOT NULL,
    owner_id text NOT NULL,
    thread_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id text NOT NULL,
    owner_id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    motivation text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    planning_mode text DEFAULT 'simple'::text NOT NULL,
    success_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_date date,
    source text DEFAULT 'chat'::text NOT NULL,
    source_reference text,
    workspace_id text,
    idempotency_key text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goals_planning_mode_check CHECK ((planning_mode = ANY (ARRAY['instant'::text, 'simple'::text, 'structured'::text, 'complex'::text]))),
    CONSTRAINT goals_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'blocked'::text, 'waiting'::text, 'completed'::text, 'abandoned'::text, 'archived'::text]))),
    CONSTRAINT goals_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);


--
-- Name: knowledge_provenance_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_provenance_links (
    id text NOT NULL,
    owner_id text NOT NULL,
    knowledge_id text NOT NULL,
    source_id text NOT NULL,
    relation text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_provenance_links_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_provenance_links_relation_check CHECK ((relation = ANY (ARRAY['supports'::text, 'contradicts'::text, 'derived_from'::text, 'mentioned_in'::text, 'confirmed_by'::text])))
);


--
-- Name: knowledge_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_records (
    id text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    title text,
    statement text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    status text NOT NULL,
    occurrence_count integer,
    first_seen_at timestamp with time zone,
    last_confirmed_at timestamp with time zone,
    first_observed_at timestamp with time zone,
    last_observed_at timestamp with time zone,
    test_description text,
    decision_trigger text,
    rationale text,
    alternatives jsonb DEFAULT '[]'::jsonb NOT NULL,
    decided_at timestamp with time zone,
    reopen_condition text,
    subject text,
    due_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    preference_key text,
    preference_value jsonb,
    preference_scope text,
    preference_source_type text,
    preference_source_id text,
    active boolean,
    review_at timestamp with time zone,
    expires_at timestamp with time zone,
    generated_at timestamp with time zone,
    created_by_type text NOT NULL,
    created_by_id text,
    goal_id text,
    project_ref text,
    supersedes_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_records_check CHECK (((supersedes_id IS NULL) OR (supersedes_id <> id))),
    CONSTRAINT knowledge_records_check1 CHECK ((((kind = 'fact'::text) AND (status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))) OR ((kind = 'observation'::text) AND (status = ANY (ARRAY['active'::text, 'dismissed'::text, 'promoted'::text, 'stale'::text, 'contradicted'::text]))) OR ((kind = 'hypothesis'::text) AND (status = ANY (ARRAY['open'::text, 'supported'::text, 'rejected'::text, 'inconclusive'::text, 'promoted'::text]))) OR ((kind = 'decision'::text) AND (status = ANY (ARRAY['active'::text, 'superseded'::text, 'reopened'::text, 'reversed'::text]))) OR ((kind = 'commitment'::text) AND (status = ANY (ARRAY['open'::text, 'fulfilled'::text, 'missed'::text, 'cancelled'::text, 'superseded'::text]))) OR ((kind = 'preference'::text) AND (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text, 'expired'::text]))) OR ((kind = 'insight'::text) AND (status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))))),
    CONSTRAINT knowledge_records_check2 CHECK (((kind <> 'observation'::text) OR (occurrence_count IS NOT NULL))),
    CONSTRAINT knowledge_records_check3 CHECK (((kind <> 'decision'::text) OR ((title IS NOT NULL) AND (decided_at IS NOT NULL)))),
    CONSTRAINT knowledge_records_check4 CHECK (((kind <> 'commitment'::text) OR (subject IS NOT NULL))),
    CONSTRAINT knowledge_records_check5 CHECK (((kind <> 'preference'::text) OR ((preference_key IS NOT NULL) AND (preference_value IS NOT NULL) AND (preference_scope IS NOT NULL) AND (preference_source_type IS NOT NULL) AND (active IS NOT NULL)))),
    CONSTRAINT knowledge_records_check6 CHECK (((kind <> 'insight'::text) OR (generated_at IS NOT NULL))),
    CONSTRAINT knowledge_records_check7 CHECK (((created_by_type = 'agent'::text) = (created_by_id IS NOT NULL))),
    CONSTRAINT knowledge_records_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_records_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text, 'import'::text]))),
    CONSTRAINT knowledge_records_kind_check CHECK ((kind = ANY (ARRAY['fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text]))),
    CONSTRAINT knowledge_records_occurrence_count_check CHECK (((occurrence_count IS NULL) OR (occurrence_count > 0))),
    CONSTRAINT knowledge_records_preference_source_type_check CHECK (((preference_source_type IS NULL) OR (preference_source_type = ANY (ARRAY['explicit_user'::text, 'approved_observation'::text, 'system_default'::text])))),
    CONSTRAINT knowledge_records_statement_check CHECK (((char_length(statement) >= 1) AND (char_length(statement) <= 20000)))
);


--
-- Name: knowledge_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_relationships (
    id text NOT NULL,
    owner_id text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    predicate text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_relationships_check CHECK (((subject_type <> object_type) OR (subject_id <> object_id))),
    CONSTRAINT knowledge_relationships_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT knowledge_relationships_object_type_check CHECK ((object_type = ANY (ARRAY['source'::text, 'fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text, 'goal'::text, 'agent'::text, 'project'::text, 'person'::text, 'organization'::text]))),
    CONSTRAINT knowledge_relationships_predicate_check CHECK ((predicate ~ '^[a-z][a-z0-9_]{0,63}$'::text)),
    CONSTRAINT knowledge_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'stale'::text, 'superseded'::text, 'contradicted'::text]))),
    CONSTRAINT knowledge_relationships_subject_type_check CHECK ((subject_type = ANY (ARRAY['source'::text, 'fact'::text, 'observation'::text, 'hypothesis'::text, 'decision'::text, 'commitment'::text, 'preference'::text, 'insight'::text, 'goal'::text, 'agent'::text, 'project'::text, 'person'::text, 'organization'::text])))
);


--
-- Name: knowledge_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_sources (
    id text NOT NULL,
    owner_id text NOT NULL,
    source_type text NOT NULL,
    provider text,
    external_id text,
    reference_uri text,
    author text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    content_hash text,
    snapshot_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_sources_check CHECK (((reference_uri IS NOT NULL) OR (external_id IS NOT NULL) OR (snapshot_ref IS NOT NULL) OR (source_type = 'manual'::text))),
    CONSTRAINT knowledge_sources_source_type_check CHECK ((source_type = ANY (ARRAY['chat'::text, 'email'::text, 'slack'::text, 'telegram'::text, 'calendar'::text, 'file'::text, 'web'::text, 'run'::text, 'manual'::text])))
);


--
-- Name: memory_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_records (
    id text NOT NULL,
    owner_id text NOT NULL,
    scope_type text NOT NULL,
    scope_id text NOT NULL,
    content text NOT NULL,
    provider text DEFAULT 'supermemory'::text NOT NULL,
    provider_id text,
    source_type text DEFAULT 'explicit'::text NOT NULL,
    source_id text,
    confidence numeric(4,3) DEFAULT 1 NOT NULL,
    permanent boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_confirmed_at timestamp with time zone,
    CONSTRAINT memory_records_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT memory_records_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000))),
    CONSTRAINT memory_records_scope_type_check CHECK ((scope_type = ANY (ARRAY['owner'::text, 'agent'::text, 'goal'::text, 'project'::text, 'task'::text]))),
    CONSTRAINT memory_records_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: memory_scope_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_scope_migrations (
    owner_id text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_activity (
    id text NOT NULL,
    owner_id text NOT NULL,
    request_id text,
    kind text NOT NULL,
    metadata jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_artifacts (
    id text NOT NULL,
    owner_id text NOT NULL,
    request_id text,
    content_encrypted text NOT NULL,
    metadata jsonb NOT NULL,
    audience text NOT NULL,
    audience_public_key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_connections (
    owner_id text NOT NULL,
    local_agent_id text NOT NULL,
    relay_owner_id text NOT NULL,
    relay_agent_id text NOT NULL,
    address text NOT NULL,
    issuer text NOT NULL,
    signing_key_id text NOT NULL,
    signing_public_key text NOT NULL,
    agent_credential_encrypted text NOT NULL,
    owner_session_encrypted text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    local_work_policy jsonb DEFAULT '{"analysis": "approval", "research": "approval", "summarization": "approval", "artifact_generation": "approval"}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text])))
);


--
-- Name: myeve_relay_external_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_external_context (
    owner_id text NOT NULL,
    request_id text NOT NULL,
    source_owner_id text NOT NULL,
    source_agent_id text NOT NULL,
    publication_id text,
    publication_version integer,
    context_encrypted text NOT NULL,
    retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: myeve_relay_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_grants (
    id text NOT NULL,
    owner_id text NOT NULL,
    document jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: myeve_relay_peers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_peers (
    owner_id text NOT NULL,
    address text NOT NULL,
    artifact_origin text NOT NULL,
    artifact_public_key text NOT NULL
);


--
-- Name: myeve_relay_projection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_projection (
    owner_id text NOT NULL,
    publication_id text NOT NULL,
    reference text NOT NULL,
    revision text NOT NULL,
    record jsonb NOT NULL
);


--
-- Name: myeve_relay_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_publications (
    id text NOT NULL,
    owner_id text NOT NULL,
    relay_view_id text,
    version integer DEFAULT 0 NOT NULL,
    name text NOT NULL,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    audience jsonb DEFAULT '[]'::jsonb NOT NULL,
    preview_hash text NOT NULL,
    preview_expires_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    document jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_publications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'revoked'::text, 'sync_required'::text]))),
    CONSTRAINT myeve_relay_publications_visibility_check CHECK ((visibility = ANY (ARRAY['PRIVATE'::text, 'SHARED'::text, 'UNLISTED'::text, 'PUBLIC'::text])))
);


--
-- Name: myeve_relay_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_receipts (
    id text NOT NULL,
    owner_id text NOT NULL,
    relay_account_id text NOT NULL,
    sequence bigint NOT NULL,
    record jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: myeve_relay_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.myeve_relay_requests (
    owner_id text NOT NULL,
    request_id text NOT NULL,
    direction text NOT NULL,
    capability text NOT NULL,
    conversation_id text,
    sender_owner_id text NOT NULL,
    sender_agent_id text NOT NULL,
    envelope_hash text NOT NULL,
    envelope_encrypted text,
    result_encrypted text,
    state text DEFAULT 'incoming'::text NOT NULL,
    local_run_id text,
    local_decision text,
    relay_acknowledged boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT myeve_relay_requests_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text]))),
    CONSTRAINT myeve_relay_requests_state_check CHECK ((state = ANY (ARRAY['incoming'::text, 'processing'::text, 'needs_approval'::text, 'accepted'::text, 'completed'::text, 'denied'::text, 'expired'::text, 'recovery_required'::text])))
);


--
-- Name: outcome_evidence_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outcome_evidence_links (
    outcome_id text NOT NULL,
    evidence_type text NOT NULL,
    evidence_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outcome_evidence_links_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['event'::text, 'task_artifact'::text])))
);


--
-- Name: outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outcomes (
    id text NOT NULL,
    owner_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    run_id text,
    status text DEFAULT 'unknown'::text NOT NULL,
    owner_feedback text DEFAULT 'unknown'::text NOT NULL,
    summary text NOT NULL,
    rationale jsonb DEFAULT '[]'::jsonb NOT NULL,
    idempotency_key text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outcomes_owner_feedback_check CHECK ((owner_feedback = ANY (ARRAY['helpful'::text, 'neutral'::text, 'unhelpful'::text, 'unknown'::text]))),
    CONSTRAINT outcomes_status_check CHECK ((status = ANY (ARRAY['successful'::text, 'partially_successful'::text, 'blocked'::text, 'failed'::text, 'abandoned'::text, 'ineffective'::text, 'unknown'::text]))),
    CONSTRAINT outcomes_summary_check CHECK (((char_length(summary) >= 1) AND (char_length(summary) <= 1000)))
);


--
-- Name: owner_data_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_data_operations (
    id text NOT NULL,
    owner_id text NOT NULL,
    operation_type text NOT NULL,
    status text NOT NULL,
    archive_version integer,
    record_count integer,
    domain_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    checksum text,
    error_summary text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT owner_data_operations_operation_type_check CHECK ((operation_type = ANY (ARRAY['export_started'::text, 'export_completed'::text, 'export_failed'::text, 'backup_verified'::text, 'restore_planned'::text, 'restore_started'::text, 'restore_completed'::text, 'restore_failed'::text, 'restore_verified'::text, 'memory_corrected'::text, 'memory_deleted'::text, 'memory_forgotten'::text, 'knowledge_corrected'::text, 'knowledge_deleted'::text, 'preference_corrected'::text, 'contradiction_resolved'::text, 'connector_disconnected'::text, 'connector_revoked'::text, 'deletion_started'::text, 'deletion_completed'::text, 'deletion_failed'::text]))),
    CONSTRAINT owner_data_operations_record_count_check CHECK (((record_count IS NULL) OR (record_count >= 0))),
    CONSTRAINT owner_data_operations_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'partially_completed'::text, 'failed'::text])))
);


--
-- Name: persistent_browser_profile_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persistent_browser_profile_grants (
    id text NOT NULL,
    owner_id text NOT NULL,
    profile_id text NOT NULL,
    agent_id text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: persistent_browser_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persistent_browser_profiles (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    provider text DEFAULT 'orgo'::text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone,
    last_owner_takeover_at timestamp with time zone,
    last_authenticated_at timestamp with time zone,
    failure_summary text,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT persistent_browser_profiles_check CHECK (((status = 'revoked'::text) = (revoked_at IS NOT NULL))),
    CONSTRAINT persistent_browser_profiles_generation_check CHECK ((generation > 0)),
    CONSTRAINT persistent_browser_profiles_provider_check CHECK ((provider = 'orgo'::text)),
    CONSTRAINT persistent_browser_profiles_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'takeover_required'::text, 'reconnect_required'::text, 'revoked'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    endpoint text NOT NULL,
    subscription jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id text
);


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id bigint NOT NULL,
    merchant text NOT NULL,
    total_cents bigint NOT NULL,
    currency text NOT NULL,
    category text NOT NULL,
    purchased_at date NOT NULL,
    items jsonb,
    notes text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receipts_id_seq OWNED BY public.receipts.id;


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id integer NOT NULL,
    prompt text NOT NULL,
    cron text,
    timezone text NOT NULL,
    next_fire_at timestamp with time zone NOT NULL,
    chat_id text,
    status text DEFAULT 'active'::text NOT NULL,
    claimed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fired_at timestamp with time zone,
    routine_name text,
    approval_boundary text,
    source_outcome_id text,
    owner_id text,
    configuration_version integer DEFAULT 1 NOT NULL,
    reviewed_version integer,
    reviewed_at timestamp with time zone,
    execution_routine_id text,
    CONSTRAINT reminders_configuration_version_check CHECK ((configuration_version > 0))
);


--
-- Name: reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reminders_id_seq OWNED BY public.reminders.id;


--
-- Name: review_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_checkpoints (
    owner_id text NOT NULL,
    review_kind text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    last_generated_at timestamp with time zone NOT NULL,
    last_event_at timestamp with time zone,
    last_event_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id text NOT NULL,
    local_period_key text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    review_snapshot jsonb,
    CONSTRAINT review_checkpoints_review_kind_check CHECK ((review_kind = ANY (ARRAY['daily'::text, 'weekly'::text])))
);


--
-- Name: review_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_deliveries (
    id text NOT NULL,
    owner_id text NOT NULL,
    review_kind text,
    checkpoint_id text,
    local_period_key text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    attempted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    requested_channel text NOT NULL,
    channel text NOT NULL,
    delivery_classification text DEFAULT 'digest'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    deduplication_key text NOT NULL,
    deduplication_hits integer DEFAULT 0 NOT NULL,
    failure_category text,
    failure_code text,
    failure_summary text,
    next_attempt_at timestamp with time zone,
    claimed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_id text,
    run_id text,
    result_reference text,
    claim_version bigint DEFAULT 0 NOT NULL,
    result_unknown boolean DEFAULT false NOT NULL,
    CONSTRAINT review_deliveries_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT review_deliveries_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_deliveries_deduplication_hits_check CHECK ((deduplication_hits >= 0)),
    CONSTRAINT review_deliveries_delivery_classification_check CHECK ((delivery_classification = ANY (ARRAY['silent'::text, 'activity'::text, 'digest'::text, 'push'::text, 'urgent'::text]))),
    CONSTRAINT review_deliveries_failure_category_check CHECK ((failure_category = ANY (ARRAY['transient'::text, 'configuration'::text, 'authorization'::text, 'provider'::text, 'invalid_destination'::text, 'unknown'::text]))),
    CONSTRAINT review_deliveries_requested_channel_check CHECK ((requested_channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_deliveries_review_kind_check CHECK ((review_kind = ANY (ARRAY['daily'::text, 'weekly'::text]))),
    CONSTRAINT review_deliveries_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'deferred'::text, 'delivering'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: review_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_delivery_attempts (
    id bigint NOT NULL,
    delivery_id text NOT NULL,
    attempt_number integer NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    failure_category text,
    failure_code text,
    failure_summary text,
    CONSTRAINT review_delivery_attempts_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT review_delivery_attempts_failure_category_check CHECK ((failure_category = ANY (ARRAY['transient'::text, 'configuration'::text, 'authorization'::text, 'provider'::text, 'invalid_destination'::text, 'unknown'::text]))),
    CONSTRAINT review_delivery_attempts_status_check CHECK ((status = ANY (ARRAY['delivering'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: review_delivery_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_delivery_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_delivery_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_delivery_attempts_id_seq OWNED BY public.review_delivery_attempts.id;


--
-- Name: review_delivery_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_delivery_preferences (
    owner_id text NOT NULL,
    owner_timezone text DEFAULT 'UTC'::text NOT NULL,
    daily_brief_enabled boolean DEFAULT false NOT NULL,
    daily_brief_time time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    weekly_review_enabled boolean DEFAULT false NOT NULL,
    weekly_review_day smallint DEFAULT 0 NOT NULL,
    weekly_review_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    quiet_hours_enabled boolean DEFAULT false NOT NULL,
    quiet_hours_start time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    quiet_hours_end time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    preferred_delivery_channel text DEFAULT 'in_app'::text NOT NULL,
    max_proactive_pushes_per_day smallint DEFAULT 2 NOT NULL,
    daily_next_at timestamp with time zone,
    weekly_next_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_delivery_preferences_max_proactive_pushes_per_day_check CHECK (((max_proactive_pushes_per_day >= 0) AND (max_proactive_pushes_per_day <= 20))),
    CONSTRAINT review_delivery_preferences_preferred_delivery_channel_check CHECK ((preferred_delivery_channel = ANY (ARRAY['in_app'::text, 'push'::text, 'telegram'::text]))),
    CONSTRAINT review_delivery_preferences_weekly_review_day_check CHECK (((weekly_review_day >= 0) AND (weekly_review_day <= 6)))
);


--
-- Name: routine_pending_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_pending_sends (
    owner_id text NOT NULL,
    run_id text NOT NULL,
    action_id text NOT NULL,
    request jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: run_context_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_context_entries (
    id text NOT NULL,
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    task_run_id text,
    goal_id text,
    goal_task_id text,
    content text NOT NULL,
    source_type text DEFAULT 'checkpoint'::text NOT NULL,
    source_id text,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT run_context_entries_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 12000))),
    CONSTRAINT run_context_entries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'promoted'::text])))
);


--
-- Name: skill_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_assignments (
    owner_id text NOT NULL,
    agent_id text NOT NULL,
    skill_name text NOT NULL,
    enabled boolean NOT NULL,
    assigned_by text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skill_assignments_agent_id_check CHECK ((agent_id = ANY (ARRAY['functional-state'::text, 'ux-accessibility'::text, 'trust-resilience'::text]))),
    CONSTRAINT skill_assignments_assigned_by_check CHECK ((assigned_by = ANY (ARRAY['owner'::text, 'agent'::text, 'system'::text])))
);


--
-- Name: skill_eval_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_eval_results (
    run_id text NOT NULL,
    skill_name text NOT NULL,
    eval_id text NOT NULL,
    verdict text NOT NULL,
    assertions jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    content_hash text,
    duration_ms integer,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    CONSTRAINT skill_eval_results_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_eval_results_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT skill_eval_results_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT skill_eval_results_output_tokens_check CHECK ((output_tokens >= 0)),
    CONSTRAINT skill_eval_results_verdict_check CHECK ((verdict = ANY (ARRAY['passed'::text, 'failed'::text, 'scored'::text, 'skipped'::text])))
);


--
-- Name: skill_eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_eval_runs (
    id text NOT NULL,
    owner_id text NOT NULL,
    target text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    passed integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    scored integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    errored integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    mode text DEFAULT 'manual'::text NOT NULL,
    requested_count integer DEFAULT 0 NOT NULL,
    completed_count integer DEFAULT 0 NOT NULL,
    requested_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    error text,
    CONSTRAINT skill_eval_runs_completed_count_check CHECK ((completed_count >= 0)),
    CONSTRAINT skill_eval_runs_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_eval_runs_errored_check CHECK ((errored >= 0)),
    CONSTRAINT skill_eval_runs_failed_check CHECK ((failed >= 0)),
    CONSTRAINT skill_eval_runs_mode_check CHECK ((mode = ANY (ARRAY['manual'::text, 'changed'::text, 'ci'::text]))),
    CONSTRAINT skill_eval_runs_passed_check CHECK ((passed >= 0)),
    CONSTRAINT skill_eval_runs_requested_count_check CHECK ((requested_count >= 0)),
    CONSTRAINT skill_eval_runs_scored_check CHECK ((scored >= 0)),
    CONSTRAINT skill_eval_runs_skipped_check CHECK ((skipped >= 0)),
    CONSTRAINT skill_eval_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: skill_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_usage_events (
    id bigint NOT NULL,
    owner_id text NOT NULL,
    skill_name text NOT NULL,
    agent_id text NOT NULL,
    session_id text NOT NULL,
    turn_id text NOT NULL,
    task_run_id text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    loaded_step_index integer DEFAULT 0 NOT NULL,
    last_accounted_step integer DEFAULT 0 NOT NULL,
    outcome text DEFAULT 'loaded'::text NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cache_read_tokens bigint DEFAULT 0 NOT NULL,
    cache_write_tokens bigint DEFAULT 0 NOT NULL,
    cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    CONSTRAINT skill_usage_events_cache_read_tokens_check CHECK ((cache_read_tokens >= 0)),
    CONSTRAINT skill_usage_events_cache_write_tokens_check CHECK ((cache_write_tokens >= 0)),
    CONSTRAINT skill_usage_events_cost_usd_check CHECK ((cost_usd >= (0)::numeric)),
    CONSTRAINT skill_usage_events_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT skill_usage_events_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT skill_usage_events_outcome_check CHECK ((outcome = ANY (ARRAY['loaded'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT skill_usage_events_output_tokens_check CHECK ((output_tokens >= 0))
);


--
-- Name: skill_usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skill_usage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skill_usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skill_usage_events_id_seq OWNED BY public.skill_usage_events.id;


--
-- Name: sofie_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sofie_schema_migrations (
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_acceptance_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_acceptance_checks (
    id text NOT NULL,
    task_id text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    specialist_role text NOT NULL,
    environment text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result_summary text,
    checked_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_acceptance_checks_environment_check CHECK ((environment = ANY (ARRAY['local'::text, 'preview'::text, 'both'::text]))),
    CONSTRAINT task_acceptance_checks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: task_approval_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_approval_decisions (
    id text NOT NULL,
    task_id text NOT NULL,
    requested_by text NOT NULL,
    prompt text NOT NULL,
    decision text,
    decided_by text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    owner_id text NOT NULL,
    goal_id text,
    goal_task_id text,
    agent_id text,
    role_id text,
    capability_id text,
    provider text,
    resource text,
    action text NOT NULL,
    action_class text NOT NULL,
    action_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    binding_hash text NOT NULL,
    risk text NOT NULL,
    effects jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_cost_usd numeric(10,4),
    expires_at timestamp with time zone NOT NULL,
    status text NOT NULL,
    decision_reason text,
    CONSTRAINT task_approval_action_class_check CHECK ((action_class = ANY (ARRAY['read'::text, 'write'::text, 'create'::text, 'update'::text, 'delete'::text, 'send'::text, 'publish'::text, 'spend'::text, 'deploy'::text, 'execute'::text, 'transfer'::text]))),
    CONSTRAINT task_approval_decisions_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'denied'::text]))),
    CONSTRAINT task_approval_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT task_approval_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text, 'invalidated'::text])))
);


--
-- Name: task_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_artifacts (
    id text NOT NULL,
    task_id text NOT NULL,
    check_id text,
    specialist_role text,
    kind text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    storage_key text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    redacted boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_artifacts_kind_check CHECK ((kind = ANY (ARRAY['screenshot'::text, 'report'::text, 'log'::text, 'json'::text]))),
    CONSTRAINT task_artifacts_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: task_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_milestones (
    id bigint NOT NULL,
    task_id text NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_milestones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_milestones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_milestones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_milestones_id_seq OWNED BY public.task_milestones.id;


--
-- Name: task_run_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_run_sessions (
    task_id text NOT NULL,
    session_id text NOT NULL,
    role text NOT NULL,
    call_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_runs (
    id text NOT NULL,
    owner_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    thread_id text,
    status text NOT NULL,
    status_reason text,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_duration_seconds integer NOT NULL,
    max_specialists integer NOT NULL,
    max_model_steps integer NOT NULL,
    max_retries_per_specialist integer NOT NULL,
    max_estimated_cost_usd numeric(10,4) NOT NULL,
    model_steps integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    deadline_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    goal_id text,
    goal_task_id text,
    agent_id text,
    objective text,
    expected_output text,
    parent_task_id text,
    source_task_id text,
    role_id text,
    result_summary text,
    review_status text DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT task_runs_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
    CONSTRAINT task_runs_kind_check CHECK ((kind = ANY (ARRAY['product_qa'::text, 'delegated_work'::text]))),
    CONSTRAINT task_runs_max_duration_seconds_check CHECK ((max_duration_seconds > 0)),
    CONSTRAINT task_runs_max_estimated_cost_usd_check CHECK ((max_estimated_cost_usd > (0)::numeric)),
    CONSTRAINT task_runs_max_model_steps_check CHECK ((max_model_steps > 0)),
    CONSTRAINT task_runs_max_retries_per_specialist_check CHECK ((max_retries_per_specialist >= 0)),
    CONSTRAINT task_runs_max_specialists_check CHECK ((max_specialists >= 0)),
    CONSTRAINT task_runs_model_steps_check CHECK ((model_steps >= 0)),
    CONSTRAINT task_runs_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'accepted'::text, 'revision_requested'::text, 'superseded'::text]))),
    CONSTRAINT task_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'awaiting_approval'::text, 'waiting_for_owner'::text, 'paused'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: task_specialists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_specialists (
    task_id text NOT NULL,
    role text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    active_session_id text,
    summary text,
    error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_specialists_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT task_specialists_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: task_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_transitions (
    id bigint NOT NULL,
    task_id text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_transitions_id_seq OWNED BY public.task_transitions.id;


--
-- Name: thread_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread_summaries (
    id text NOT NULL,
    owner_id text NOT NULL,
    thread_id text NOT NULL,
    goal_id text,
    purpose text DEFAULT ''::text NOT NULL,
    important_facts jsonb DEFAULT '[]'::jsonb NOT NULL,
    decisions jsonb DEFAULT '[]'::jsonb NOT NULL,
    open_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    commitments jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thread_summaries_source_message_count_check CHECK ((source_message_count >= 0)),
    CONSTRAINT thread_summaries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])))
);


--
-- Name: web_chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_chat_threads (
    id text NOT NULL,
    title text NOT NULL,
    updated_at bigint NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    renamed boolean DEFAULT false NOT NULL,
    origin text DEFAULT 'web'::text NOT NULL,
    chat jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_id text NOT NULL,
    agent_id text,
    role_id text,
    CONSTRAINT web_chat_threads_one_executor CHECK (((agent_id IS NULL) OR (role_id IS NULL)))
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id text NOT NULL,
    secret text NOT NULL,
    name text NOT NULL,
    prompt text NOT NULL,
    chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fired_at timestamp with time zone,
    fire_count integer DEFAULT 0 NOT NULL
);


--
-- Name: action_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts ALTER COLUMN id SET DEFAULT nextval('public.action_receipts_id_seq'::regclass);


--
-- Name: agentphone_usage_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_usage_event ALTER COLUMN id SET DEFAULT nextval('public.agentphone_usage_event_id_seq'::regclass);


--
-- Name: automation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs ALTER COLUMN id SET DEFAULT nextval('public.automation_runs_id_seq'::regclass);


--
-- Name: receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts ALTER COLUMN id SET DEFAULT nextval('public.receipts_id_seq'::regclass);


--
-- Name: reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders ALTER COLUMN id SET DEFAULT nextval('public.reminders_id_seq'::regclass);


--
-- Name: review_delivery_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts ALTER COLUMN id SET DEFAULT nextval('public.review_delivery_attempts_id_seq'::regclass);


--
-- Name: skill_usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events ALTER COLUMN id SET DEFAULT nextval('public.skill_usage_events_id_seq'::regclass);


--
-- Name: task_milestones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones ALTER COLUMN id SET DEFAULT nextval('public.task_milestones_id_seq'::regclass);


--
-- Name: task_transitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions ALTER COLUMN id SET DEFAULT nextval('public.task_transitions_id_seq'::regclass);


--
-- Name: action_receipts action_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts
    ADD CONSTRAINT action_receipts_pkey PRIMARY KEY (id);


--
-- Name: action_requests action_requests_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: action_requests action_requests_owner_id_run_id_action_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_run_id_action_key_key UNIQUE (owner_id, run_id, action_key);


--
-- Name: action_requests action_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_pkey PRIMARY KEY (id);


--
-- Name: agent_audit_events agent_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_events
    ADD CONSTRAINT agent_audit_events_pkey PRIMARY KEY (id);


--
-- Name: agent_capabilities agent_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_pkey PRIMARY KEY (agent_id, capability_id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agentphone_call agentphone_call_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_call
    ADD CONSTRAINT agentphone_call_pkey PRIMARY KEY (call_id);


--
-- Name: agentphone_config agentphone_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_config
    ADD CONSTRAINT agentphone_config_pkey PRIMARY KEY (id);


--
-- Name: agentphone_contact_policy agentphone_contact_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_contact_policy
    ADD CONSTRAINT agentphone_contact_policy_pkey PRIMARY KEY (phone_number);


--
-- Name: agentphone_inbound agentphone_inbound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_inbound
    ADD CONSTRAINT agentphone_inbound_pkey PRIMARY KEY (message_id);


--
-- Name: agentphone_usage_event agentphone_usage_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agentphone_usage_event
    ADD CONSTRAINT agentphone_usage_event_pkey PRIMARY KEY (id);


--
-- Name: agents agents_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: agents agents_owner_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_owner_id_slug_key UNIQUE (owner_id, slug);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: browser_sessions browser_sessions_computer_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_computer_session_id_key UNIQUE (computer_session_id);


--
-- Name: browser_sessions browser_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_pkey PRIMARY KEY (id);


--
-- Name: chat_files chat_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_files
    ADD CONSTRAINT chat_files_pkey PRIMARY KEY (id);


--
-- Name: computer_actions computer_actions_computer_session_id_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_computer_session_id_call_id_key UNIQUE (computer_session_id, call_id);


--
-- Name: computer_actions computer_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_pkey PRIMARY KEY (id);


--
-- Name: computer_artifacts computer_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_pkey PRIMARY KEY (id);


--
-- Name: computer_artifacts computer_artifacts_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_storage_key_key UNIQUE (storage_key);


--
-- Name: computer_control_leases computer_control_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_pkey PRIMARY KEY (computer_session_id);


--
-- Name: computer_control_receipts computer_control_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_pkey PRIMARY KEY (id);


--
-- Name: computer_sessions computer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_pkey PRIMARY KEY (id);


--
-- Name: context_assemblies context_assemblies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_pkey PRIMARY KEY (id);


--
-- Name: eve_events eve_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_pkey PRIMARY KEY (id);


--
-- Name: execution_attempts execution_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_attempts
    ADD CONSTRAINT execution_attempts_pkey PRIMARY KEY (owner_id, occurrence_id, attempt_number);


--
-- Name: execution_occurrences execution_occurrences_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: execution_occurrences execution_occurrences_owner_id_routine_id_occurrence_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_routine_id_occurrence_key_key UNIQUE (owner_id, routine_id, occurrence_key);


--
-- Name: execution_occurrences execution_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_pkey PRIMARY KEY (id);


--
-- Name: execution_occurrences execution_occurrences_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_run_id_key UNIQUE (run_id);


--
-- Name: execution_routine_versions execution_routine_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routine_versions
    ADD CONSTRAINT execution_routine_versions_pkey PRIMARY KEY (owner_id, routine_id, version);


--
-- Name: execution_routines execution_routines_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: execution_routines execution_routines_owner_id_source_kind_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_source_kind_source_id_key UNIQUE (owner_id, source_kind, source_id);


--
-- Name: execution_routines execution_routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_pkey PRIMARY KEY (id);


--
-- Name: goal_milestones goal_milestones_goal_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_goal_id_id_key UNIQUE (goal_id, id);


--
-- Name: goal_milestones goal_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_pkey PRIMARY KEY (id);


--
-- Name: goal_plans goal_plans_goal_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_goal_id_version_key UNIQUE (goal_id, version);


--
-- Name: goal_plans goal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_pkey PRIMARY KEY (id);


--
-- Name: goal_task_dependencies goal_task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_pkey PRIMARY KEY (task_id, depends_on_task_id);


--
-- Name: goal_tasks goal_tasks_goal_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_goal_id_id_key UNIQUE (goal_id, id);


--
-- Name: goal_tasks goal_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_pkey PRIMARY KEY (id);


--
-- Name: goal_thread_links goal_thread_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_thread_links
    ADD CONSTRAINT goal_thread_links_pkey PRIMARY KEY (goal_id, thread_id);


--
-- Name: goals goals_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_knowledge_id_source_id__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_knowledge_id_source_id__key UNIQUE (owner_id, knowledge_id, source_id, relation);


--
-- Name: knowledge_provenance_links knowledge_provenance_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_pkey PRIMARY KEY (id);


--
-- Name: knowledge_records knowledge_records_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: knowledge_records knowledge_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_pkey PRIMARY KEY (id);


--
-- Name: knowledge_relationships knowledge_relationships_owner_id_subject_type_subject_id_pr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_relationships
    ADD CONSTRAINT knowledge_relationships_owner_id_subject_type_subject_id_pr_key UNIQUE (owner_id, subject_type, subject_id, predicate, object_type, object_id);


--
-- Name: knowledge_relationships knowledge_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_relationships
    ADD CONSTRAINT knowledge_relationships_pkey PRIMARY KEY (id);


--
-- Name: knowledge_sources knowledge_sources_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: knowledge_sources knowledge_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_sources
    ADD CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id);


--
-- Name: memory_records memory_records_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_records
    ADD CONSTRAINT memory_records_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: memory_records memory_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_records
    ADD CONSTRAINT memory_records_pkey PRIMARY KEY (id);


--
-- Name: memory_scope_migrations memory_scope_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_scope_migrations
    ADD CONSTRAINT memory_scope_migrations_pkey PRIMARY KEY (owner_id);


--
-- Name: myeve_relay_activity myeve_relay_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_activity
    ADD CONSTRAINT myeve_relay_activity_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_artifacts myeve_relay_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_artifacts
    ADD CONSTRAINT myeve_relay_artifacts_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_connections myeve_relay_connections_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_address_key UNIQUE (address);


--
-- Name: myeve_relay_connections myeve_relay_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_pkey PRIMARY KEY (owner_id);


--
-- Name: myeve_relay_external_context myeve_relay_external_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_external_context
    ADD CONSTRAINT myeve_relay_external_context_pkey PRIMARY KEY (owner_id, request_id);


--
-- Name: myeve_relay_grants myeve_relay_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_grants
    ADD CONSTRAINT myeve_relay_grants_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_peers myeve_relay_peers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_peers
    ADD CONSTRAINT myeve_relay_peers_pkey PRIMARY KEY (owner_id, address);


--
-- Name: myeve_relay_projection myeve_relay_projection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_projection
    ADD CONSTRAINT myeve_relay_projection_pkey PRIMARY KEY (publication_id, reference);


--
-- Name: myeve_relay_publications myeve_relay_publications_owner_id_relay_view_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_owner_id_relay_view_id_key UNIQUE (owner_id, relay_view_id);


--
-- Name: myeve_relay_publications myeve_relay_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_receipts myeve_relay_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_receipts
    ADD CONSTRAINT myeve_relay_receipts_pkey PRIMARY KEY (id);


--
-- Name: myeve_relay_receipts myeve_relay_receipts_relay_account_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_receipts
    ADD CONSTRAINT myeve_relay_receipts_relay_account_id_sequence_key UNIQUE (relay_account_id, sequence);


--
-- Name: myeve_relay_requests myeve_relay_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_pkey PRIMARY KEY (owner_id, request_id);


--
-- Name: outcome_evidence_links outcome_evidence_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcome_evidence_links
    ADD CONSTRAINT outcome_evidence_links_pkey PRIMARY KEY (outcome_id, evidence_type, evidence_id);


--
-- Name: outcomes outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_pkey PRIMARY KEY (id);


--
-- Name: owner_data_operations owner_data_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_data_operations
    ADD CONSTRAINT owner_data_operations_pkey PRIMARY KEY (id);


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_pkey PRIMARY KEY (id);


--
-- Name: persistent_browser_profiles persistent_browser_profiles_owner_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_owner_id_agent_id_key UNIQUE (owner_id, agent_id);


--
-- Name: persistent_browser_profiles persistent_browser_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (endpoint);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: review_checkpoints review_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_checkpoints
    ADD CONSTRAINT review_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: review_deliveries review_deliveries_deduplication_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_deduplication_key_key UNIQUE (deduplication_key);


--
-- Name: review_deliveries review_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_pkey PRIMARY KEY (id);


--
-- Name: review_delivery_attempts review_delivery_attempts_delivery_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_delivery_id_attempt_number_key UNIQUE (delivery_id, attempt_number);


--
-- Name: review_delivery_attempts review_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: review_delivery_preferences review_delivery_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_preferences
    ADD CONSTRAINT review_delivery_preferences_pkey PRIMARY KEY (owner_id);


--
-- Name: routine_pending_sends routine_pending_sends_action_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_action_id_key UNIQUE (action_id);


--
-- Name: routine_pending_sends routine_pending_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_pkey PRIMARY KEY (owner_id, run_id);


--
-- Name: run_context_entries run_context_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_pkey PRIMARY KEY (id);


--
-- Name: skill_assignments skill_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_assignments
    ADD CONSTRAINT skill_assignments_pkey PRIMARY KEY (owner_id, agent_id, skill_name);


--
-- Name: skill_eval_results skill_eval_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_results
    ADD CONSTRAINT skill_eval_results_pkey PRIMARY KEY (run_id, skill_name);


--
-- Name: skill_eval_runs skill_eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_runs
    ADD CONSTRAINT skill_eval_runs_pkey PRIMARY KEY (id);


--
-- Name: skill_usage_events skill_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_pkey PRIMARY KEY (id);


--
-- Name: skill_usage_events skill_usage_events_session_id_turn_id_skill_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_session_id_turn_id_skill_name_key UNIQUE (session_id, turn_id, skill_name);


--
-- Name: sofie_schema_migrations sofie_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sofie_schema_migrations
    ADD CONSTRAINT sofie_schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: task_acceptance_checks task_acceptance_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_pkey PRIMARY KEY (id);


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_slug_key UNIQUE (task_id, slug);


--
-- Name: task_approval_decisions task_approval_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_pkey PRIMARY KEY (id);


--
-- Name: task_artifacts task_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_pkey PRIMARY KEY (id);


--
-- Name: task_artifacts task_artifacts_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_storage_key_key UNIQUE (storage_key);


--
-- Name: task_milestones task_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones
    ADD CONSTRAINT task_milestones_pkey PRIMARY KEY (id);


--
-- Name: task_run_sessions task_run_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_run_sessions
    ADD CONSTRAINT task_run_sessions_pkey PRIMARY KEY (task_id, session_id);


--
-- Name: task_run_sessions task_run_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_run_sessions
    ADD CONSTRAINT task_run_sessions_session_id_key UNIQUE (session_id);


--
-- Name: task_runs task_runs_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: task_runs task_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_pkey PRIMARY KEY (id);


--
-- Name: task_specialists task_specialists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_specialists
    ADD CONSTRAINT task_specialists_pkey PRIMARY KEY (task_id, role);


--
-- Name: task_transitions task_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions
    ADD CONSTRAINT task_transitions_pkey PRIMARY KEY (id);


--
-- Name: thread_summaries thread_summaries_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: thread_summaries thread_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_pkey PRIMARY KEY (id);


--
-- Name: web_chat_threads web_chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_chat_threads
    ADD CONSTRAINT web_chat_threads_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: action_requests_live_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX action_requests_live_binding ON public.action_requests USING btree (owner_id, run_id, parameter_hash) WHERE (status = ANY (ARRAY['planned'::text, 'awaiting_approval'::text, 'authorized'::text, 'executing'::text, 'verifying'::text, 'result_unknown'::text, 'recovering'::text, 'needs_you'::text, 'retryable'::text]));


--
-- Name: action_requests_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_requests_run ON public.action_requests USING btree (owner_id, run_id, created_at);


--
-- Name: agent_audit_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_audit_owner_recent ON public.agent_audit_events USING btree (owner_id, created_at DESC, id DESC);


--
-- Name: agent_capabilities_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_capabilities_owner_agent ON public.agent_capabilities USING btree (owner_id, agent_id, capability_id);


--
-- Name: agent_runs_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_owner_agent ON public.agent_runs USING btree (owner_id, agent_id, updated_at DESC);


--
-- Name: agent_runs_owner_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_owner_role ON public.agent_runs USING btree (owner_id, role_id, updated_at DESC) WHERE (role_id IS NOT NULL);


--
-- Name: agent_runs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_session ON public.agent_runs USING btree (session_id, updated_at DESC);


--
-- Name: agentphone_usage_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agentphone_usage_event_created ON public.agentphone_usage_event USING btree (created_at DESC);


--
-- Name: agents_one_primary_per_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agents_one_primary_per_owner ON public.agents USING btree (owner_id) WHERE is_primary;


--
-- Name: agents_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_owner_status ON public.agents USING btree (owner_id, status, updated_at DESC);


--
-- Name: automation_runs_by_automation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_by_automation ON public.automation_runs USING btree (kind, automation_id, fired_at DESC);


--
-- Name: chat_files_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_files_owner_created_idx ON public.chat_files USING btree (owner_id, created_at DESC);


--
-- Name: chat_files_owner_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_files_owner_thread_idx ON public.chat_files USING btree (owner_id, thread_id, created_at DESC);


--
-- Name: computer_actions_session_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_actions_session_timeline ON public.computer_actions USING btree (computer_session_id, started_at, id);


--
-- Name: computer_artifacts_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_artifacts_session ON public.computer_artifacts USING btree (computer_session_id, created_at, id);


--
-- Name: computer_control_receipts_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_control_receipts_timeline ON public.computer_control_receipts USING btree (owner_id, computer_session_id, created_at DESC, id DESC);


--
-- Name: computer_sessions_agent_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_agent_recent ON public.computer_sessions USING btree (owner_id, agent_id, last_activity_at DESC, id DESC);


--
-- Name: computer_sessions_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_expiry ON public.computer_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text]));


--
-- Name: computer_sessions_one_active_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX computer_sessions_one_active_runtime ON public.computer_sessions USING btree (runtime_session_id) WHERE (status = ANY (ARRAY['provisioning'::text, 'ready'::text, 'running'::text, 'paused'::text]));


--
-- Name: computer_sessions_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX computer_sessions_owner_recent ON public.computer_sessions USING btree (owner_id, last_activity_at DESC, id DESC);


--
-- Name: context_assemblies_run_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX context_assemblies_run_recent ON public.context_assemblies USING btree (owner_id, agent_id, session_id, created_at DESC);


--
-- Name: delivery_occurrence_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX delivery_occurrence_channel ON public.review_deliveries USING btree (owner_id, occurrence_id, requested_channel) WHERE (occurrence_id IS NOT NULL);


--
-- Name: eve_events_delivery_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_delivery_queue ON public.eve_events USING btree (owner_id, delivery_classification, occurred_at DESC) WHERE (delivery_classification = ANY (ARRAY['digest'::text, 'push'::text, 'urgent'::text]));


--
-- Name: eve_events_goal_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_goal_timeline ON public.eve_events USING btree (goal_id, occurred_at DESC, id DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: eve_events_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eve_events_owner_idempotency ON public.eve_events USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: eve_events_owner_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eve_events_owner_timeline ON public.eve_events USING btree (owner_id, occurred_at DESC, id DESC);


--
-- Name: execution_occurrence_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX execution_occurrence_runtime ON public.execution_occurrences USING btree (runtime_session_id) WHERE (runtime_session_id IS NOT NULL);


--
-- Name: execution_occurrences_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX execution_occurrences_due ON public.execution_occurrences USING btree (next_attempt_at, scheduled_for) WHERE (status = ANY (ARRAY['pending'::text, 'retrying'::text]));


--
-- Name: goal_milestones_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_milestones_order ON public.goal_milestones USING btree (goal_id, "position", created_at, id);


--
-- Name: goal_plans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_plans_active ON public.goal_plans USING btree (goal_id, version DESC) WHERE (status = 'active'::text);


--
-- Name: goal_task_dependencies_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_task_dependencies_reverse ON public.goal_task_dependencies USING btree (depends_on_task_id, task_id);


--
-- Name: goal_tasks_by_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_tasks_by_goal ON public.goal_tasks USING btree (goal_id, "position", created_at, id);


--
-- Name: goal_tasks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_tasks_due ON public.goal_tasks USING btree (goal_id, status, due_at) WHERE (status <> ALL (ARRAY['completed'::text, 'cancelled'::text]));


--
-- Name: goal_threads_by_owner_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_threads_by_owner_thread ON public.goal_thread_links USING btree (owner_id, thread_id, created_at DESC);


--
-- Name: goals_owner_focus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_owner_focus ON public.goals USING btree (owner_id, priority, target_date, updated_at DESC) WHERE (status = ANY (ARRAY['active'::text, 'blocked'::text, 'waiting'::text]));


--
-- Name: goals_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goals_owner_idempotency ON public.goals USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: goals_owner_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_owner_status_updated ON public.goals USING btree (owner_id, status, updated_at DESC, id DESC);


--
-- Name: knowledge_provenance_owner_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_provenance_owner_claim ON public.knowledge_provenance_links USING btree (owner_id, knowledge_id, created_at DESC);


--
-- Name: knowledge_records_one_successor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_records_one_successor ON public.knowledge_records USING btree (owner_id, supersedes_id) WHERE (supersedes_id IS NOT NULL);


--
-- Name: knowledge_records_owner_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_goal ON public.knowledge_records USING btree (owner_id, goal_id, updated_at DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: knowledge_records_owner_kind_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_kind_status ON public.knowledge_records USING btree (owner_id, kind, status, updated_at DESC, id DESC);


--
-- Name: knowledge_records_owner_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_records_owner_search ON public.knowledge_records USING gin (to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || statement)));


--
-- Name: knowledge_relationships_owner_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_relationships_owner_object ON public.knowledge_relationships USING btree (owner_id, object_type, object_id, status, updated_at DESC);


--
-- Name: knowledge_relationships_owner_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_relationships_owner_subject ON public.knowledge_relationships USING btree (owner_id, subject_type, subject_id, status, updated_at DESC);


--
-- Name: knowledge_sources_owner_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_sources_owner_external ON public.knowledge_sources USING btree (owner_id, provider, external_id) WHERE ((provider IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: knowledge_sources_owner_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_sources_owner_recent ON public.knowledge_sources USING btree (owner_id, captured_at DESC, id DESC);


--
-- Name: memory_records_owner_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memory_records_owner_provider_id ON public.memory_records USING btree (owner_id, provider, provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: memory_records_scope_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_records_scope_active ON public.memory_records USING btree (owner_id, scope_type, scope_id, updated_at DESC) WHERE (status = 'active'::text);


--
-- Name: myeve_relay_activity_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX myeve_relay_activity_owner ON public.myeve_relay_activity USING btree (owner_id, created_at);


--
-- Name: myeve_relay_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX myeve_relay_inbox ON public.myeve_relay_requests USING btree (owner_id, state, created_at);


--
-- Name: outcome_evidence_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcome_evidence_reverse ON public.outcome_evidence_links USING btree (evidence_type, evidence_id, outcome_id);


--
-- Name: outcomes_goal_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcomes_goal_timeline ON public.outcomes USING btree (goal_id, occurred_at DESC, id DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: outcomes_owner_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outcomes_owner_idempotency ON public.outcomes USING btree (owner_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: outcomes_owner_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outcomes_owner_timeline ON public.outcomes USING btree (owner_id, occurred_at DESC, id DESC);


--
-- Name: owner_data_operations_owner_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_data_operations_owner_history ON public.owner_data_operations USING btree (owner_id, created_at DESC, id DESC);


--
-- Name: persistent_browser_profile_grants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX persistent_browser_profile_grants_active ON public.persistent_browser_profile_grants USING btree (profile_id, agent_id) WHERE (revoked_at IS NULL);


--
-- Name: persistent_browser_profile_grants_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX persistent_browser_profile_grants_agent ON public.persistent_browser_profile_grants USING btree (owner_id, agent_id) WHERE (revoked_at IS NULL);


--
-- Name: persistent_browser_profiles_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX persistent_browser_profiles_owner ON public.persistent_browser_profiles USING btree (owner_id, updated_at DESC);


--
-- Name: push_subscriptions_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_owner ON public.push_subscriptions USING btree (owner_id, created_at DESC);


--
-- Name: receipts_by_purchase_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_by_purchase_date ON public.receipts USING btree (purchased_at DESC, id DESC);


--
-- Name: reminders_owner_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_owner_review ON public.reminders USING btree (owner_id, status, reviewed_version);


--
-- Name: review_checkpoints_owner_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_checkpoints_owner_latest ON public.review_checkpoints USING btree (owner_id, review_kind, last_generated_at DESC);


--
-- Name: review_checkpoints_owner_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX review_checkpoints_owner_period ON public.review_checkpoints USING btree (owner_id, review_kind, local_period_key) WHERE (local_period_key IS NOT NULL);


--
-- Name: review_deliveries_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_deliveries_due ON public.review_deliveries USING btree (next_attempt_at, scheduled_for) WHERE (status = ANY (ARRAY['scheduled'::text, 'deferred'::text, 'failed'::text]));


--
-- Name: review_deliveries_owner_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_deliveries_owner_history ON public.review_deliveries USING btree (owner_id, scheduled_for DESC, id DESC);


--
-- Name: review_delivery_preferences_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_delivery_preferences_due ON public.review_delivery_preferences USING btree (daily_next_at, weekly_next_at) WHERE (daily_brief_enabled OR weekly_review_enabled);


--
-- Name: run_context_entries_execution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX run_context_entries_execution ON public.run_context_entries USING btree (owner_id, agent_id, task_run_id, updated_at DESC) WHERE (status = 'active'::text);


--
-- Name: skill_assignments_by_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_assignments_by_owner_agent ON public.skill_assignments USING btree (owner_id, agent_id, enabled, skill_name);


--
-- Name: skill_eval_results_by_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_results_by_skill ON public.skill_eval_results USING btree (skill_name, completed_at DESC, run_id DESC);


--
-- Name: skill_eval_results_by_skill_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_results_by_skill_hash ON public.skill_eval_results USING btree (skill_name, content_hash, completed_at DESC);


--
-- Name: skill_eval_runs_by_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_eval_runs_by_owner ON public.skill_eval_runs USING btree (owner_id, started_at DESC);


--
-- Name: skill_usage_by_owner_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usage_by_owner_skill ON public.skill_usage_events USING btree (owner_id, skill_name, occurred_at DESC);


--
-- Name: skill_usage_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_usage_by_task ON public.skill_usage_events USING btree (owner_id, task_run_id, occurred_at DESC) WHERE (task_run_id IS NOT NULL);


--
-- Name: task_approval_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_approval_owner_status ON public.task_approval_decisions USING btree (owner_id, status, requested_at DESC, id DESC);


--
-- Name: task_milestones_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_milestones_by_task ON public.task_milestones USING btree (task_id, created_at, id);


--
-- Name: task_runs_by_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_goal ON public.task_runs USING btree (owner_id, goal_id, updated_at DESC) WHERE (goal_id IS NOT NULL);


--
-- Name: task_runs_by_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_owner ON public.task_runs USING btree (owner_id, updated_at DESC, id DESC);


--
-- Name: task_runs_by_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_by_thread ON public.task_runs USING btree (owner_id, thread_id, updated_at DESC) WHERE (thread_id IS NOT NULL);


--
-- Name: task_runs_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_owner_agent ON public.task_runs USING btree (owner_id, agent_id, updated_at DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: task_runs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_runs_parent ON public.task_runs USING btree (owner_id, parent_task_id, created_at) WHERE (parent_task_id IS NOT NULL);


--
-- Name: task_transitions_by_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_transitions_by_task ON public.task_transitions USING btree (task_id, created_at, id);


--
-- Name: thread_summaries_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX thread_summaries_one_active ON public.thread_summaries USING btree (owner_id, thread_id) WHERE (status = 'active'::text);


--
-- Name: web_chat_threads_owner_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_threads_owner_agent ON public.web_chat_threads USING btree (owner_id, agent_id, updated_at DESC);


--
-- Name: web_chat_threads_owner_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_threads_owner_role ON public.web_chat_threads USING btree (owner_id, role_id, updated_at DESC) WHERE (role_id IS NOT NULL);


--
-- Name: execution_routines execution_routines_revoke_changed_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER execution_routines_revoke_changed_authority BEFORE UPDATE ON public.execution_routines FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_routine_authority();


--
-- Name: reminders reminders_invalidate_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reminders_invalidate_authority BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.invalidate_reminder_authority();


--
-- Name: action_receipts action_receipts_owner_id_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_receipts
    ADD CONSTRAINT action_receipts_owner_id_action_id_fkey FOREIGN KEY (owner_id, action_id) REFERENCES public.action_requests(owner_id, id);


--
-- Name: action_requests action_requests_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.task_approval_decisions(id);


--
-- Name: action_requests action_requests_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id);


--
-- Name: action_requests action_requests_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: action_requests action_requests_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_requests
    ADD CONSTRAINT action_requests_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id);


--
-- Name: agent_audit_events agent_audit_events_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_events
    ADD CONSTRAINT agent_audit_events_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: agent_capabilities agent_capabilities_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: browser_sessions browser_sessions_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_sessions
    ADD CONSTRAINT browser_sessions_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_actions computer_actions_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_actions computer_actions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_actions
    ADD CONSTRAINT computer_actions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_artifacts computer_artifacts_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.computer_actions(id) ON DELETE SET NULL;


--
-- Name: computer_artifacts computer_artifacts_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_artifacts computer_artifacts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_artifacts
    ADD CONSTRAINT computer_artifacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_control_leases computer_control_leases_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_control_leases computer_control_leases_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: computer_control_leases computer_control_leases_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_leases
    ADD CONSTRAINT computer_control_leases_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_control_receipts computer_control_receipts_computer_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_computer_session_id_fkey FOREIGN KEY (computer_session_id) REFERENCES public.computer_sessions(id) ON DELETE CASCADE;


--
-- Name: computer_control_receipts computer_control_receipts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_control_receipts
    ADD CONSTRAINT computer_control_receipts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: computer_sessions computer_sessions_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: computer_sessions computer_sessions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.computer_sessions
    ADD CONSTRAINT computer_sessions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: context_assemblies context_assemblies_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: context_assemblies context_assemblies_thread_summary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_assemblies
    ADD CONSTRAINT context_assemblies_thread_summary_id_fkey FOREIGN KEY (thread_summary_id) REFERENCES public.thread_summaries(id) ON DELETE SET NULL;


--
-- Name: eve_events eve_events_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: eve_events eve_events_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eve_events
    ADD CONSTRAINT eve_events_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: execution_attempts execution_attempts_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_attempts
    ADD CONSTRAINT execution_attempts_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: execution_occurrences execution_occurrences_owner_id_routine_id_routine_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_routine_id_routine_version_fkey FOREIGN KEY (owner_id, routine_id, routine_version) REFERENCES public.execution_routine_versions(owner_id, routine_id, version);


--
-- Name: execution_occurrences execution_occurrences_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_occurrences
    ADD CONSTRAINT execution_occurrences_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: execution_routine_versions execution_routine_versions_owner_id_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routine_versions
    ADD CONSTRAINT execution_routine_versions_owner_id_routine_id_fkey FOREIGN KEY (owner_id, routine_id) REFERENCES public.execution_routines(owner_id, id);


--
-- Name: execution_routines execution_routines_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_routines
    ADD CONSTRAINT execution_routines_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id);


--
-- Name: goal_milestones goal_milestones_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_milestones
    ADD CONSTRAINT goal_milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_plans goal_plans_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_plans
    ADD CONSTRAINT goal_plans_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_task_dependencies goal_task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.goal_tasks(id) ON DELETE CASCADE;


--
-- Name: goal_task_dependencies goal_task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_task_dependencies
    ADD CONSTRAINT goal_task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.goal_tasks(id) ON DELETE CASCADE;


--
-- Name: goal_tasks goal_tasks_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_tasks goal_tasks_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.goal_milestones(id) ON DELETE SET NULL;


--
-- Name: goal_tasks goal_tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_tasks
    ADD CONSTRAINT goal_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: goal_thread_links goal_thread_links_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_thread_links
    ADD CONSTRAINT goal_thread_links_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_knowledge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_knowledge_id_fkey FOREIGN KEY (owner_id, knowledge_id) REFERENCES public.knowledge_records(owner_id, id) ON DELETE CASCADE;


--
-- Name: knowledge_provenance_links knowledge_provenance_links_owner_id_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_provenance_links
    ADD CONSTRAINT knowledge_provenance_links_owner_id_source_id_fkey FOREIGN KEY (owner_id, source_id) REFERENCES public.knowledge_sources(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_created_by_id_fkey FOREIGN KEY (owner_id, created_by_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id) ON DELETE RESTRICT;


--
-- Name: knowledge_records knowledge_records_owner_id_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_records
    ADD CONSTRAINT knowledge_records_owner_id_supersedes_id_fkey FOREIGN KEY (owner_id, supersedes_id) REFERENCES public.knowledge_records(owner_id, id) ON DELETE RESTRICT;


--
-- Name: myeve_relay_connections myeve_relay_connections_local_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_connections
    ADD CONSTRAINT myeve_relay_connections_local_agent_id_fkey FOREIGN KEY (local_agent_id) REFERENCES public.agents(id);


--
-- Name: myeve_relay_projection myeve_relay_projection_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_projection
    ADD CONSTRAINT myeve_relay_projection_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.myeve_relay_publications(id);


--
-- Name: myeve_relay_publications myeve_relay_publications_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_publications
    ADD CONSTRAINT myeve_relay_publications_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.myeve_relay_connections(owner_id);


--
-- Name: myeve_relay_requests myeve_relay_requests_local_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_local_run_id_fkey FOREIGN KEY (local_run_id) REFERENCES public.task_runs(id);


--
-- Name: myeve_relay_requests myeve_relay_requests_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.myeve_relay_requests
    ADD CONSTRAINT myeve_relay_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.myeve_relay_connections(owner_id);


--
-- Name: outcome_evidence_links outcome_evidence_links_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcome_evidence_links
    ADD CONSTRAINT outcome_evidence_links_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES public.outcomes(id) ON DELETE CASCADE;


--
-- Name: outcomes outcomes_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: outcomes outcomes_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: outcomes outcomes_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outcomes
    ADD CONSTRAINT outcomes_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: persistent_browser_profile_grants persistent_browser_profile_grants_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profile_grants
    ADD CONSTRAINT persistent_browser_profile_grants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.persistent_browser_profiles(id) ON DELETE CASCADE;


--
-- Name: persistent_browser_profiles persistent_browser_profiles_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persistent_browser_profiles
    ADD CONSTRAINT persistent_browser_profiles_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: reminders reminders_execution_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_execution_routine_id_fkey FOREIGN KEY (execution_routine_id) REFERENCES public.execution_routines(id);


--
-- Name: reminders reminders_source_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_source_outcome_id_fkey FOREIGN KEY (source_outcome_id) REFERENCES public.outcomes(id) ON DELETE SET NULL;


--
-- Name: review_deliveries review_deliveries_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.review_checkpoints(id) ON DELETE SET NULL;


--
-- Name: review_deliveries review_deliveries_owner_id_occurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_owner_id_occurrence_id_fkey FOREIGN KEY (owner_id, occurrence_id) REFERENCES public.execution_occurrences(owner_id, id);


--
-- Name: review_deliveries review_deliveries_owner_id_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_deliveries
    ADD CONSTRAINT review_deliveries_owner_id_run_id_fkey FOREIGN KEY (owner_id, run_id) REFERENCES public.task_runs(owner_id, id);


--
-- Name: review_delivery_attempts review_delivery_attempts_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_delivery_attempts
    ADD CONSTRAINT review_delivery_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.review_deliveries(id) ON DELETE CASCADE;


--
-- Name: routine_pending_sends routine_pending_sends_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.action_requests(id) ON DELETE CASCADE;


--
-- Name: routine_pending_sends routine_pending_sends_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_pending_sends
    ADD CONSTRAINT routine_pending_sends_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_agent_id_fkey FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_goal_id_fkey FOREIGN KEY (owner_id, goal_id) REFERENCES public.goals(owner_id, id) ON DELETE CASCADE;


--
-- Name: run_context_entries run_context_entries_owner_id_task_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_context_entries
    ADD CONSTRAINT run_context_entries_owner_id_task_run_id_fkey FOREIGN KEY (owner_id, task_run_id) REFERENCES public.task_runs(owner_id, id) ON DELETE CASCADE;


--
-- Name: skill_eval_results skill_eval_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_eval_results
    ADD CONSTRAINT skill_eval_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.skill_eval_runs(id) ON DELETE CASCADE;


--
-- Name: skill_usage_events skill_usage_events_task_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_task_run_id_fkey FOREIGN KEY (task_run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_acceptance_checks task_acceptance_checks_task_id_specialist_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_acceptance_checks
    ADD CONSTRAINT task_acceptance_checks_task_id_specialist_role_fkey FOREIGN KEY (task_id, specialist_role) REFERENCES public.task_specialists(task_id, role);


--
-- Name: task_approval_decisions task_approval_decisions_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: task_approval_decisions task_approval_decisions_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: task_approval_decisions task_approval_decisions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approval_decisions
    ADD CONSTRAINT task_approval_decisions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_artifacts task_artifacts_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.task_acceptance_checks(id) ON DELETE SET NULL;


--
-- Name: task_artifacts task_artifacts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_artifacts task_artifacts_task_id_specialist_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_artifacts
    ADD CONSTRAINT task_artifacts_task_id_specialist_role_fkey FOREIGN KEY (task_id, specialist_role) REFERENCES public.task_specialists(task_id, role);


--
-- Name: task_milestones task_milestones_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_milestones
    ADD CONSTRAINT task_milestones_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_run_sessions task_run_sessions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_run_sessions
    ADD CONSTRAINT task_run_sessions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_runs task_runs_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_goal_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES public.goal_tasks(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_owner_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_owner_agent_fk FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- Name: task_runs task_runs_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_source_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_specialists task_specialists_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_specialists
    ADD CONSTRAINT task_specialists_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: task_transitions task_transitions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_transitions
    ADD CONSTRAINT task_transitions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: thread_summaries thread_summaries_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_summaries
    ADD CONSTRAINT thread_summaries_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;


--
-- Name: web_chat_threads web_chat_threads_owner_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_chat_threads
    ADD CONSTRAINT web_chat_threads_owner_agent_fk FOREIGN KEY (owner_id, agent_id) REFERENCES public.agents(owner_id, id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--
