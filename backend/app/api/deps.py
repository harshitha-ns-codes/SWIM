from fastapi import Request, WebSocket

from app.config import Settings
from app.services.session_manager import SessionManager


def get_sessions(request: Request) -> SessionManager:
    return request.app.state.sessions


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def ws_sessions(websocket: WebSocket) -> SessionManager:
    return websocket.app.state.sessions


def ws_settings(websocket: WebSocket) -> Settings:
    return websocket.app.state.settings
