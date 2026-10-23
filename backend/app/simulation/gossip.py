from app.models.domain import MemberStatus, MembershipEntry


def apply_update(
    current: MembershipEntry | None,
    node_id: str,
    new_status: MemberStatus,
    incarnation: int,
) -> MembershipEntry | None:
    """SWIM incarnation precedence from Das, Gupta, Motivala.

    Confirm overrides Alive/Suspect at any incarnation.
    Alive(i) overrides Suspect(j<=i) and Alive(j<i).
    Suspect(i) overrides Suspect(j<i) and Alive(j<i).
    """
    if current is None:
        return MembershipEntry(node_id=node_id, status=new_status, incarnation=incarnation)

    if new_status is MemberStatus.FAILED:
        if current.status is MemberStatus.FAILED:
            return None
        return MembershipEntry(node_id=node_id, status=MemberStatus.FAILED, incarnation=incarnation)

    if current.status is MemberStatus.FAILED:
        return None

    if new_status is MemberStatus.ALIVE:
        if incarnation < current.incarnation:
            return None
        if incarnation == current.incarnation and current.status is MemberStatus.ALIVE:
            return None
        return MembershipEntry(node_id=node_id, status=MemberStatus.ALIVE, incarnation=incarnation)

    if incarnation < current.incarnation:
        return None
    if incarnation == current.incarnation and current.status is not MemberStatus.ALIVE:
        return None
    return MembershipEntry(node_id=node_id, status=MemberStatus.SUSPECTED, incarnation=incarnation)


def gossip_kind(status: MemberStatus) -> str:
    if status is MemberStatus.FAILED:
        return "confirm"
    if status is MemberStatus.SUSPECTED:
        return "suspect"
    return "alive"


def status_from_kind(kind: str) -> MemberStatus:
    if kind == "confirm":
        return MemberStatus.FAILED
    if kind == "suspect":
        return MemberStatus.SUSPECTED
    return MemberStatus.ALIVE
