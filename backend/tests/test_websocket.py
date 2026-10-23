from fastapi.testclient import TestClient


def test_websocket_unknown_session_sends_error(client: TestClient) -> None:
    with client.websocket_connect("/ws/simulation/missing-session") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "error"
        assert message["code"] == "session_not_found"
        assert message["detail"]


def test_websocket_follows_the_latest_started_session(client: TestClient) -> None:
    first = client.post("/api/v1/simulation/scenarios/crash_and_convergence/start")
    second = client.post("/api/v1/simulation/scenarios/successful_probe/start")
    first_id = first.json()["session_id"]
    second_id = second.json()["session_id"]

    with client.websocket_connect(f"/ws/simulation/{second_id}") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "init"
        assert message["session_id"] == second_id
        assert message["snapshot"]["scenario_id"] == "successful_probe"
        assert message["snapshot"]["metrics"]["failed_members"] == 0

    with client.websocket_connect(f"/ws/simulation/{first_id}") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "init"
        assert message["session_id"] == first_id
        assert message["snapshot"]["scenario_id"] == "crash_and_convergence"


def test_websocket_init_includes_snapshot_and_events(client: TestClient) -> None:
    started = client.post("/api/v1/simulation/scenarios/successful_probe/start")
    session_id = started.json()["session_id"]
    with client.websocket_connect(f"/ws/simulation/{session_id}") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "init"
        assert message["session_id"] == session_id
        assert message["snapshot"]["session_id"] == session_id
        assert message["snapshot"]["metrics"]["protocol_messages"] == 2
        assert any(event["event_type"] == "ping" for event in message["events"])
        assert any(event["event_type"] == "ack" for event in message["events"])
