-- Hosted private beta: the capability identity of a hosted installation is its per-person Factory ownerScope
-- ('myeve.hosted:<installation>:<owner>', MyFactory admits only enrollment owner = client ownerScope), while Work, MissionControl
-- enrollments, permits and receipts stay keyed on the plain owner id. The DB-side currentness fence (owner Factory writer guard,
-- missioncontrol_assert_dispatch, alpha admission) passes the Work owner; this resolves it to the hosted scope ONLY when that
-- installation holds capability destination rows for the scope. Every other installation (no such rows) is unchanged.
-- Function body only: no table, column, constraint or row is changed.
CREATE OR REPLACE FUNCTION missioncontrol_capability_snapshot(p_owner text,p_installation text,p_agent text,p_backend text)
 RETURNS TABLE(snapshot_sha256 text,expires_at timestamptz,backend_incarnation text,backend_enrollment_version integer,policy_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r record; v_owner text := p_owner; v_scope text;
BEGIN
 IF p_owner NOT LIKE 'myeve.hosted:%' THEN
  v_scope := 'myeve.hosted:'||p_installation||':'||p_owner;
  PERFORM set_config('myeve.capability_owner',v_scope,true),set_config('myeve.capability_installation',p_installation,true);
  IF EXISTS(SELECT 1 FROM capability_control.policy_destinations WHERE installation_id=p_installation AND owner_id=v_scope AND backend_id=p_backend) THEN
   v_owner := v_scope;
  END IF;
 END IF;
 PERFORM set_config('myeve.capability_owner',v_owner,true),set_config('myeve.capability_installation',p_installation,true);
 PERFORM capability_control.lock_admission_policy(p_installation,v_owner,p_agent);
 SELECT jsonb_build_object('installation',to_jsonb(i),'owner',to_jsonb(s),'binding',to_jsonb(b),
   'evidence',to_jsonb(e),'agent',to_jsonb(a),'destination',to_jsonb(d),'policy',to_jsonb(c)) AS material,
   LEAST(e.expires_at,a.expires_at,CASE WHEN b.status='ACTIVE' THEN b.expires_at ELSE e.expires_at END) AS expires
 INTO r FROM capability_control.installations i
 JOIN capability_control.owner_state s ON s.installation_id=i.id AND s.owner_id=v_owner
 LEFT JOIN capability_control.platform_owner_bindings b ON b.installation_id=i.id AND b.owner_id=v_owner
 JOIN capability_control.evidence e ON e.installation_id=i.id AND e.owner_id=v_owner
 JOIN capability_control.relay_agent_evidence a ON a.installation_id=i.id AND a.owner_id=v_owner AND a.agent_id=p_agent
 JOIN capability_control.policy_destinations d ON d.installation_id=i.id AND d.owner_id=v_owner AND d.backend_id=p_backend
 JOIN capability_control.policy_changes c ON c.installation_id=i.id AND c.owner_id=v_owner AND c.revision=s.revision
 WHERE i.id=p_installation AND i.active AND c.status='ACKNOWLEDGED' AND a.status='ACTIVE'
 FOR SHARE OF d,c;
 IF NOT FOUND OR r.expires<=clock_timestamp() THEN RAISE EXCEPTION 'MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED'; END IF;
 RETURN QUERY SELECT encode(sha256(convert_to(r.material::text,'UTF8')),'hex'),r.expires,
   r.material#>>'{destination,incarnation}',(r.material#>>'{destination,enrollment_version}')::integer,r.material#>>'{policy,policy_id}';
END $$;
-- statement-breakpoint
REVOKE ALL ON FUNCTION missioncontrol_capability_snapshot(text,text,text,text) FROM PUBLIC;
