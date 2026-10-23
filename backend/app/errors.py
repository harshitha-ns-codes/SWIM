from typing import Any


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        error: str,
        detail: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.error = error
        self.detail = detail
        self.extra = extra or {}


class UnknownScenarioError(ApiError):
    def __init__(self, scenario_id: str, known: list[str]) -> None:
        super().__init__(
            status_code=404,
            code="unknown_scenario",
            error="Unknown scenario",
            detail=f"No scenario named '{scenario_id}'.",
            extra={"known_scenarios": known},
        )
        self.scenario_id = scenario_id


class SessionNotFoundError(ApiError):
    def __init__(self, session_id: str) -> None:
        super().__init__(
            status_code=404,
            code="session_not_found",
            error="Session not found",
            detail=(
                f"No simulation session '{session_id}'. "
                "Sessions are stored in memory and are lost when the backend restarts."
            ),
        )
        self.session_id = session_id


class InvalidLiveActionError(ApiError):
    def __init__(self, detail: str, code: str = "invalid_live_action") -> None:
        super().__init__(
            status_code=400,
            code=code,
            error="Invalid live action",
            detail=detail,
        )
