from fastapi.testclient import TestClient


def test_current_simulation_empty_without_session(client: TestClient) -> None:
    response = client.get("/api/v1/simulation/current")
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] is None
    assert body["snapshot"] is None
    assert body["events"] == []
    assert "No active simulation session" in body["message"]


def test_unknown_scenario_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/simulation/scenarios/not-a-real-scenario/start")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "unknown_scenario"
    assert "successful_probe" in body["known_scenarios"]


def test_successful_probe_creates_session_and_snapshot(client: TestClient) -> None:
    response = client.post("/api/v1/simulation/scenarios/successful_probe/start")
    assert response.status_code == 200
    body = response.json()
    session_id = body["session_id"]
    snapshot = body["snapshot"]
    events = body["events"]

    assert session_id
    assert snapshot["session_id"] == session_id
    assert snapshot["demo_cluster"] is True
    assert snapshot["status"] == "completed"
    assert snapshot["limitations"] == []
    assert snapshot["metrics"]["total_members"] == 6
    assert snapshot["metrics"]["alive_members"] == 6
    assert snapshot["metrics"]["suspected_members"] == 0
    assert snapshot["metrics"]["failed_members"] == 0
    assert snapshot["metrics"]["protocol_messages"] == 2
    assert snapshot["metrics"]["membership_convergence"] is None

    types = [event["event_type"] for event in events]
    assert types.index("ping") < types.index("ack")
    ping = next(event for event in events if event["event_type"] == "ping")
    ack = next(event for event in events if event["event_type"] == "ack")
    assert ping["source_node"] == "n0"
    assert ping["target_node"] == "n1"
    assert ack["source_node"] == "n1"
    assert ack["target_node"] == "n0"
    assert ack["outcome"] == "success"

    current = client.get("/api/v1/simulation/current")
    assert current.status_code == 200
    assert current.json()["session_id"] == session_id

    snapshot_response = client.get(f"/api/v1/simulation/{session_id}/snapshot")
    assert snapshot_response.status_code == 200
    fetched = snapshot_response.json()["snapshot"]
    assert fetched["metrics"] == snapshot["metrics"]
    assert fetched["session_id"] == session_id

    events_response = client.get(f"/api/v1/simulation/{session_id}/events")
    assert events_response.status_code == 200
    assert events_response.json()["session_id"] == session_id
    assert [event["event_id"] for event in events_response.json()["events"]] == [
        event["event_id"] for event in events
    ]


def test_crash_event_sequence_includes_ground_truth_then_local_failure(client: TestClient) -> None:
    response = client.post("/api/v1/simulation/scenarios/crash_and_convergence/start")
    events = response.json()["events"]
    types = [event["event_type"] for event in events]
    assert types.index("node_crashed") < types.index("ping")
    assert types.index("ping") < types.index("timeout")
    assert types.index("timeout") < types.index("suspected")
    assert types.index("suspected") < types.index("failed")
    assert "ack" not in types
    failed = next(event for event in events if event["event_type"] == "failed")
    assert failed["membership_update"]["observer_id"] == "n0"
    assert failed["membership_update"]["node_id"] == "n4"


def test_starting_another_scenario_replaces_current_session(client: TestClient) -> None:
    first = client.post("/api/v1/simulation/scenarios/crash_and_convergence/start")
    second = client.post("/api/v1/simulation/scenarios/successful_probe/start")
    assert first.status_code == 200
    assert second.status_code == 200

    first_id = first.json()["session_id"]
    second_id = second.json()["session_id"]
    assert first_id != second_id
    assert second.json()["snapshot"]["scenario_id"] == "successful_probe"
    assert second.json()["snapshot"]["metrics"]["failed_members"] == 0

    current = client.get("/api/v1/simulation/current")
    assert current.json()["session_id"] == second_id
    assert current.json()["snapshot"]["scenario_id"] == "successful_probe"
    assert current.json()["snapshot"]["session_id"] == second_id

    previous = client.get(f"/api/v1/simulation/{first_id}/snapshot")
    assert previous.status_code == 200
    assert previous.json()["snapshot"]["scenario_id"] == "crash_and_convergence"


def test_missing_session_snapshot_and_events(client: TestClient) -> None:
    snapshot = client.get("/api/v1/simulation/missing-session/snapshot")
    events = client.get("/api/v1/simulation/missing-session/events")
    assert snapshot.status_code == 404
    assert events.status_code == 404
    assert snapshot.json()["code"] == "session_not_found"
    assert events.json()["code"] == "session_not_found"


def test_suspicion_recovery_is_limited_but_not_faked(client: TestClient) -> None:
    response = client.post("/api/v1/simulation/scenarios/suspicion_recovery/start")
    assert response.status_code == 200
    body = response.json()
    snapshot = body["snapshot"]
    types = [event["event_type"] for event in body["events"]]

    assert snapshot["status"] == "completed_with_limitations"
    assert snapshot["limitations"]
    assert "timeout" in types
    assert "suspected" in types
    assert "ack" in types
    assert "recovered" in types
    assert types.index("timeout") < types.index("ack")
    assert snapshot["metrics"]["alive_members"] == 6
    assert snapshot["metrics"]["suspected_members"] == 0
    n2 = next(node for node in snapshot["nodes"] if node["node_id"] == "n2")
    assert n2["display_status"] == "alive"
    assert n2["process_state"] == "running"


def test_crash_scenario_updates_only_observer_view(client: TestClient) -> None:
    response = client.post("/api/v1/simulation/scenarios/crash_and_convergence/start")
    assert response.status_code == 200
    snapshot = response.json()["snapshot"]
    events = response.json()["events"]

    assert snapshot["status"] == "completed_with_limitations"
    assert snapshot["metrics"]["membership_convergence"] is None
    assert snapshot["metrics"]["failed_members"] == 1
    assert snapshot["metrics"]["alive_members"] == 5
    assert snapshot["metrics"]["total_members"] == 6
    n4 = next(node for node in snapshot["nodes"] if node["node_id"] == "n4")
    assert n4["process_state"] == "crashed"
    assert n4["display_status"] == "failed"

    observer = next(node for node in snapshot["nodes"] if node["node_id"] == "n0")
    other = next(node for node in snapshot["nodes"] if node["node_id"] == "n1")
    assert next(entry for entry in observer["local_view"] if entry["node_id"] == "n4")["status"] == "failed"
    assert next(entry for entry in other["local_view"] if entry["node_id"] == "n4")["status"] == "alive"
    assert not any(event["event_type"] == "scenario_completed" and "gossip" in event["detail"].lower() for event in events)
