import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/simulation/{session_id}")
async def simulation_events(websocket: WebSocket, session_id: str) -> None:
    settings = websocket.app.state.settings
    origin = websocket.headers.get("origin")
    await websocket.accept()

    if origin and origin not in settings.cors_origin_list:
        await websocket.send_json(
            {
                "type": "error",
                "code": "origin_not_allowed",
                "detail": f"Origin '{origin}' is not allowed to subscribe to simulation events.",
            }
        )
        await websocket.close(code=4403, reason="Origin not allowed")
        return

    manager = websocket.app.state.sessions
    session = manager.get_or_none(session_id)
    if session is None:
        await websocket.send_json(
            {
                "type": "error",
                "code": "session_not_found",
                "detail": (
                    f"No simulation session '{session_id}'. "
                    "Sessions are stored in memory and are lost when the backend restarts."
                ),
            }
        )
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.send_json(
        {
            "type": "init",
            "session_id": session.session_id,
            "snapshot": session.snapshot().model_dump(mode="json"),
            "events": [event.model_dump(mode="json") for event in session.events],
        }
    )

    queue = manager.subscribe(session_id)

    async def forward_live_events() -> None:
        while True:
            message = await queue.get()
            await websocket.send_json(message)

    sender = asyncio.create_task(forward_live_events())
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, ConnectionResetError):
        return
    finally:
        sender.cancel()
        manager.unsubscribe(session_id, queue)
