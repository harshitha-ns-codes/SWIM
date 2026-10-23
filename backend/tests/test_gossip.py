from app.models.domain import MemberStatus, MembershipEntry
from app.simulation.gossip import apply_update


def test_confirm_overrides_suspect_and_alive() -> None:
    suspected = MembershipEntry(node_id="n7", status=MemberStatus.SUSPECTED, incarnation=2)
    failed = apply_update(suspected, "n7", MemberStatus.FAILED, 0)
    assert failed is not None
    assert failed.status is MemberStatus.FAILED


def test_alive_with_higher_incarnation_clears_suspect() -> None:
    suspected = MembershipEntry(node_id="n7", status=MemberStatus.SUSPECTED, incarnation=1)
    alive = apply_update(suspected, "n7", MemberStatus.ALIVE, 2)
    assert alive is not None
    assert alive.status is MemberStatus.ALIVE
    assert alive.incarnation == 2


def test_older_alive_does_not_override_newer_suspect() -> None:
    suspected = MembershipEntry(node_id="n7", status=MemberStatus.SUSPECTED, incarnation=2)
    assert apply_update(suspected, "n7", MemberStatus.ALIVE, 1) is None


def test_suspect_overrides_alive_at_the_same_incarnation() -> None:
    alive = MembershipEntry(node_id="n7", status=MemberStatus.ALIVE, incarnation=0)
    updated = apply_update(alive, "n7", MemberStatus.SUSPECTED, 0)
    assert updated is not None
    assert updated.status is MemberStatus.SUSPECTED
