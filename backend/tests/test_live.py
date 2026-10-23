from fastapi.testclient import TestClient


def _start_live(client: TestClient, **overrides: object) -> dict:
    payload = {
        "member_count": 8,
        "k_helpers": 3,
        "enable_udp": False,
        "animation_ms": 0,
        **overrides,
    }
    response = client.post("/api/v1/live/start", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_live_probe_alive_returns_ack(client: TestClient) -> None:
    body = _start_live(client)
    session_id = body["session_id"]
    snapshot = body["snapshot"]
    assert snapshot["scenario_id"] == "live"
    assert snapshot["metrics"]["total_members"] == 8
    assert snapshot["capabilities"]["indirect_ping_req"] is True
    assert snapshot["capabilities"]["gossip_dissemination"] is True

    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={"source_id": "n0", "target_id": "n7"},
    )
    assert probe.status_code == 200, probe.text
    events = probe.json()["events"]
    types = [event["event_type"] for event in events]
    assert "ping" in types
    assert "ack" in types
    assert types.index("ping") < types.index("ack")
    assert "ping_req" not in types
    assert "suspected" not in types
    n7 = next(node for node in probe.json()["snapshot"]["nodes"] if node["node_id"] == "n7")
    observer = next(node for node in probe.json()["snapshot"]["nodes"] if node["node_id"] == "n0")
    assert n7["display_status"] == "alive"
    assert next(entry for entry in observer["local_view"] if entry["node_id"] == "n7")["status"] == "alive"


def test_live_crash_uses_helpers_then_suspects_fails_and_gossips(client: TestClient) -> None:
    body = _start_live(client)
    session_id = body["session_id"]
    crash = client.post(f"/api/v1/live/{session_id}/crash", json={"node_id": "n7"})
    assert crash.status_code == 200
    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={"source_id": "n0", "target_id": "n7"},
    )
    assert probe.status_code == 200, probe.text
    events = probe.json()["events"]
    types = [event["event_type"] for event in events]
    assert types.index("node_crashed") < types.index("ping")
    assert types.index("ping") < types.index("timeout")
    assert types.index("timeout") < types.index("ping_req")
    assert types.index("ping_req") < types.index("helper_ping")
    assert types.index("helper_ping") < types.index("suspected")
    assert types.index("suspected") < types.index("failed")
    assert "piggyback" in types
    assert types.index("suspected") < types.index("piggyback")

    snapshot = probe.json()["snapshot"]
    n7 = next(node for node in snapshot["nodes"] if node["node_id"] == "n7")
    assert n7["process_state"] == "crashed"
    assert n7["display_status"] == "failed"
    assert snapshot["metrics"]["membership_convergence"] is not None
    assert snapshot["metrics"]["membership_convergence"] >= 0.5
    assert snapshot["piggybacked_updates"] > 0
    assert snapshot["extra_broadcast_packets"] == 0
    assert snapshot["latest_update_knowers"]

    for node in snapshot["nodes"]:
        if node["process_state"] == "crashed":
            continue
        entry = next(item for item in node["local_view"] if item["node_id"] == "n7")
        assert entry["status"] in {"suspected", "failed"}


def test_live_does_not_replace_overview_session(client: TestClient) -> None:
    overview = client.post("/api/v1/simulation/scenarios/successful_probe/start")
    assert overview.status_code == 200
    overview_id = overview.json()["session_id"]
    live = _start_live(client)
    current = client.get("/api/v1/simulation/current")
    assert current.json()["session_id"] == overview_id
    assert current.json()["snapshot"]["scenario_id"] == "successful_probe"
    live_current = client.get("/api/v1/live/current")
    assert live_current.json()["session_id"] == live["session_id"]


def test_failure_path_waits_for_chosen_helpers_then_suspects_and_fails(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={
            "source_id": "n0",
            "target_id": "n7",
            "path": "failure",
            "ack_timeout_ms": 80,
            "suspicion_timeout_ms": 80,
        },
    )
    assert probe.status_code == 200, probe.text
    snapshot = probe.json()["snapshot"]
    types = [event["event_type"] for event in probe.json()["events"]]
    assert snapshot["awaiting_helpers"] is True
    assert snapshot["protocol_phase"] == "select_helpers"
    assert "timeout" in types
    assert "suspected" in types
    assert "failed" not in types
    assert "ping_req" not in types
    assert "piggyback" in types
    n7_mid = next(node for node in snapshot["nodes"] if node["node_id"] == "n7")
    assert n7_mid["display_status"] == "suspected"
    assert n7_mid["process_state"] == "running"
    infected = [
        node["node_id"]
        for node in snapshot["nodes"]
        if node["node_id"] != "n7"
        and next(entry["status"] for entry in node["local_view"] if entry["node_id"] == "n7") == "suspected"
    ]
    assert "n0" in infected
    assert len(infected) >= 3

    helpers = client.post(
        f"/api/v1/live/{session_id}/helpers",
        json={"helper_ids": ["n2", "n3", "n4"], "suspicion_timeout_ms": 80},
    )
    assert helpers.status_code == 200, helpers.text
    done = helpers.json()["snapshot"]
    done_types = [event["event_type"] for event in helpers.json()["events"]]
    assert done["awaiting_helpers"] is False
    assert done_types.index("suspected") < done_types.index("ping_req")
    assert done_types.index("ping_req") < done_types.index("failed")
    assert "piggyback" in done_types
    n7 = next(node for node in done["nodes"] if node["node_id"] == "n7")
    assert n7["display_status"] == "failed"
    observer = next(node for node in done["nodes"] if node["node_id"] == "n0")
    assert next(entry for entry in observer["local_view"] if entry["node_id"] == "n7")["status"] == "failed"


def test_healthy_path_acks_without_helpers(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={"source_id": "n0", "target_id": "n1", "path": "healthy", "ack_timeout_ms": 400},
    )
    assert probe.status_code == 200, probe.text
    types = [event["event_type"] for event in probe.json()["events"]]
    assert "ping" in types
    assert "ack" in types
    assert "ping_req" not in types
    assert "suspected" not in types
    assert probe.json()["snapshot"]["awaiting_helpers"] is False


def test_live_rejects_probing_the_same_node(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    response = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={"source_id": "n2", "target_id": "n2"},
    )
    assert response.status_code == 400


def test_run_one_period_every_alive_member_pings(client: TestClient) -> None:
    session_id = _start_live(client, member_count=4)["session_id"]
    period = client.post(f"/api/v1/live/{session_id}/period", json={"probe_mode": "round_robin"})
    assert period.status_code == 200, period.text
    snapshot = period.json()["snapshot"]
    assert snapshot["protocol_period"] == 1
    assert snapshot["probe_mode"] == "round_robin"
    assert snapshot["auto_run"] is False
    pings = [
        event
        for event in period.json()["events"]
        if event["event_type"] == "ping"
        and event["outcome"] == "sent"
        and event["protocol_period"] == 1
    ]
    sources = {event["source_node"] for event in pings}
    assert sources == {"n0", "n1", "n2", "n3"}
    assert all(event["target_node"] not in {event["source_node"]} for event in pings)
    acks = [
        event
        for event in period.json()["events"]
        if event["event_type"] == "ack" and event["protocol_period"] == 1
    ]
    assert len(acks) >= 4
    assert snapshot["next_targets"]


def test_refute_path_suspects_then_alive_overrides(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={
            "source_id": "n0",
            "target_id": "n7",
            "path": "refute",
            "ack_timeout_ms": 80,
            "suspicion_timeout_ms": 80,
        },
    )
    assert probe.status_code == 200, probe.text
    events = probe.json()["events"]
    types = [event["event_type"] for event in events]
    assert types.index("ping") < types.index("suspected")
    assert types.index("suspected") < types.index("recovered")
    assert "failed" not in types
    snapshot = probe.json()["snapshot"]
    n7 = next(node for node in snapshot["nodes"] if node["node_id"] == "n7")
    assert n7["process_state"] == "running"
    assert n7["display_status"] == "alive"
    assert n7["incarnation"] >= 1
    observer = next(node for node in snapshot["nodes"] if node["node_id"] == "n0")
    entry = next(item for item in observer["local_view"] if item["node_id"] == "n7")
    assert entry["status"] == "alive"
    assert entry["incarnation"] >= 1
    recovered = next(event for event in events if event["event_type"] == "recovered")
    assert "Alive" in recovered["detail"] or "alive" in recovered["detail"]


def test_join_contacts_one_member_and_infects(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    joined = client.post(f"/api/v1/live/{session_id}/join", json={"contact_id": "n0"})
    assert joined.status_code == 200, joined.text
    snapshot = joined.json()["snapshot"]
    assert snapshot["metrics"]["total_members"] == 9
    assert any(node["node_id"] == "n8" for node in snapshot["nodes"])
    types = [event["event_type"] for event in joined.json()["events"]]
    assert "node_joined" in types
    assert "piggyback" in types
    contact = next(node for node in snapshot["nodes"] if node["node_id"] == "n0")
    assert any(entry["node_id"] == "n8" and entry["status"] == "alive" for entry in contact["local_view"])
    knowers = [
        node["node_id"]
        for node in snapshot["nodes"]
        if any(entry["node_id"] == "n8" and entry["status"] == "alive" for entry in node["local_view"])
    ]
    assert "n0" in knowers
    assert len(knowers) >= 3


def test_leave_infects_failed_without_waiting_for_ping(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    left = client.post(f"/api/v1/live/{session_id}/leave", json={"node_id": "n3"})
    assert left.status_code == 200, left.text
    snapshot = left.json()["snapshot"]
    types = [event["event_type"] for event in left.json()["events"]]
    assert "node_left" in types
    assert "failed" in types
    assert "piggyback" in types
    n3 = next(node for node in snapshot["nodes"] if node["node_id"] == "n3")
    assert n3["process_state"] == "crashed"
    assert n3["display_status"] == "failed"
    observer = next(node for node in snapshot["nodes"] if node["node_id"] == "n0")
    assert next(entry for entry in observer["local_view"] if entry["node_id"] == "n3")["status"] == "failed"


def test_infection_uses_piggyback_not_broadcast(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    probe = client.post(
        f"/api/v1/live/{session_id}/probe",
        json={
            "source_id": "n0",
            "target_id": "n7",
            "path": "failure",
            "ack_timeout_ms": 80,
            "suspicion_timeout_ms": 80,
        },
    )
    assert probe.status_code == 200, probe.text
    snapshot = probe.json()["snapshot"]
    assert snapshot["extra_broadcast_packets"] == 0
    assert snapshot["piggyback_limit"] >= 3
    infection = [event for event in probe.json()["events"] if event["outcome"] == "infection"]
    sources = {event["source_node"] for event in infection}
    assert len(sources) >= 2
    from_origin = {event["target_node"] for event in infection if event["source_node"] == "n0"}
    assert len(from_origin) < 7


def test_round_robin_completeness_bound_is_two_n(client: TestClient) -> None:
    session_id = _start_live(client)["session_id"]
    crash = client.post(f"/api/v1/live/{session_id}/crash", json={"node_id": "n7"})
    snapshot = crash.json()["snapshot"]
    assert snapshot["completeness_bound_periods"] == 16
    assert "n7" in snapshot["probe_deadlines"]
    assert snapshot["probe_deadlines"]["n7"] <= 16
    assert snapshot["probe_deadline_by"]["n7"] != "n7"


def test_auto_run_toggle_sets_snapshot_flag(client: TestClient) -> None:
    session_id = _start_live(client, member_count=4)["session_id"]
    started = client.post(
        f"/api/v1/live/{session_id}/auto-run",
        json={"enabled": True, "probe_mode": "random"},
    )
    assert started.status_code == 200, started.text
    assert started.json()["snapshot"]["auto_run"] is True
    assert started.json()["snapshot"]["probe_mode"] == "random"
    stopped = client.post(f"/api/v1/live/{session_id}/auto-run", json={"enabled": False})
    assert stopped.status_code == 200
    assert stopped.json()["snapshot"]["auto_run"] is False
