from fastapi.testclient import TestClient


def test_health_reports_live_backend_state(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["api_version"]
    assert body["persistence"] == "in-memory"
    assert "resets" in body["persistence_note"].lower() or "memory" in body["persistence_note"].lower()
    assert body["capabilities"]["direct_ping_ack"] is True
    assert body["capabilities"]["gossip_dissemination"] is False
    assert body["capabilities"]["convergence_metrics"] is False
