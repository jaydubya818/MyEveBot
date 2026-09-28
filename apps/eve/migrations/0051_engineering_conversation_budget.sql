-- Additional whole-conversation spending fence; never grants route/writer authority.
-- Existing native runtime/session ledger and effect guards remain unchanged.
CREATE TABLE engineering_conversation_budget (
 scope_id text NOT NULL, scope_kind text NOT NULL CHECK(scope_kind='personal'), work_id uuid NOT NULL,
 binding_hash text NOT NULL CHECK(binding_hash ~ '^[a-f0-9]{64}$'),
 ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd>0), deadline timestamptz NOT NULL,
 max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 30),
 spent_microusd bigint NOT NULL DEFAULT 0 CHECK(spent_microusd>=0),
 reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0),
 calls_started integer NOT NULL DEFAULT 0 CHECK(calls_started>=0),
 inflight boolean NOT NULL DEFAULT false, usage_unknown boolean NOT NULL DEFAULT false,
 PRIMARY KEY(scope_id,scope_kind,work_id),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_work(scope_id,scope_kind,id)
);
-- statement-breakpoint
CREATE TABLE engineering_conversation_calls (
 scope_id text NOT NULL, scope_kind text NOT NULL, work_id uuid NOT NULL,
 step_key text NOT NULL, session_id text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), model_id text NOT NULL,
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0), spent_microusd bigint CHECK(spent_microusd>=0),
 status text NOT NULL CHECK(status IN ('INFLIGHT','COMPLETED','UNKNOWN')), result jsonb,
 PRIMARY KEY(scope_id,scope_kind,work_id,step_key),
 FOREIGN KEY(scope_id,scope_kind,work_id) REFERENCES engineering_conversation_budget(scope_id,scope_kind,work_id),
 CHECK(status<>'COMPLETED' OR (result IS NOT NULL AND spent_microusd IS NOT NULL))
);
