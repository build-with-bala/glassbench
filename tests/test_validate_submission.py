"""Tests for ``scripts/validate_submission.py`` — the submission-contract validator.

The validator is what CI runs on a pull request, and what the site's in-browser checker
is a port of. These tests cover:

* every shipped submission is valid, and the EXAMPLE template is (deliberately) not;
* each contract rule in CONTRIBUTING.md ("What makes a submission valid") is enforced;
* malformed input is *reported*, never a crash (ids that are not strings, integers too
  large for a float);
* the parity fixture the site's unit tests consume is current.
"""

from __future__ import annotations

import json
import os
import sys

import pytest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS = os.path.join(_REPO_ROOT, "scripts")
for _p in (_REPO_ROOT, _SCRIPTS):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import gen_leaderboard  # noqa: E402
import gen_validator_fixtures  # noqa: E402
import validate_submission as validator  # noqa: E402


@pytest.fixture(scope="module")
def gold():
    return validator.load_gold(validator.DEFAULT_DATA)


@pytest.fixture(scope="module")
def ids(gold):
    return gen_validator_fixtures._pick_ids(gold)


def _validate(tmp_path, gold, payload, raw: str | None = None):
    path = tmp_path / "predictions.json"
    path.write_text(raw if raw is not None else json.dumps(payload), encoding="utf-8")
    return validator.validate(str(path), gold)


def test_every_shipped_submission_is_valid(gold):
    for name in gen_leaderboard.discover_submissions():
        path = os.path.join(gen_leaderboard.SUBMISSIONS_DIR, name, "predictions.json")
        errors, _warnings = validator.validate(path, gold)
        assert errors == [], (name, errors[:3])
        assert validator.main([path, "--quiet"]) == 0


def test_every_shipped_submission_has_a_system_md():
    """CONTRIBUTING.md: a submission without system.md is rejected."""
    for name in gen_leaderboard.discover_submissions():
        path = os.path.join(gen_leaderboard.SUBMISSIONS_DIR, name, "system.md")
        assert os.path.getsize(path) > 0, name


def test_example_template_is_not_a_scoreable_submission(gold):
    path = os.path.join(gen_leaderboard.SUBMISSIONS_DIR, "EXAMPLE", "predictions.json")
    errors, _ = validator.validate(path, gold)
    assert len(errors) == 4 and all("not present in the scored data version" in e for e in errors)
    assert validator.main([path, "--quiet"]) == 1


def test_contract_rules(tmp_path, gold, ids):
    a, c = ids["a1"], ids["c1"]

    def errors_of(payload, raw=None):
        return _validate(tmp_path, gold, payload, raw)[0]

    assert errors_of([{"id": a, "answer": "x", "confidence": 0.9}, {"id": c, "abstain": True}]) == []
    # duplicate ids
    assert any("duplicate id" in e for e in errors_of([{"id": c, "abstain": True}] * 2))
    # ids not present in the scored data version
    assert any("not present" in e for e in errors_of([{"id": "ghost", "abstain": True}]))
    # confidence outside [0, 1], or not a number
    for bad in (1.5, -0.1, 91):
        assert any("outside [0,1]" in e for e in errors_of([{"id": a, "answer": "x", "confidence": bad}]))
    for bad in ("0.9", True, None):
        assert any("must be a number" in e for e in errors_of([{"id": a, "answer": "x", "confidence": bad}]))
    # not a JSON array of the two allowed shapes
    assert any("JSON array" in e for e in errors_of({"id": a}))
    assert any("not valid JSON" in e for e in errors_of(None, raw="[{"))
    assert any("empty" in e for e in errors_of([]))
    assert any("must be a JSON object" in e for e in errors_of(["abstain"]))
    assert any("missing required 'id'" in e for e in errors_of([{"abstain": True}]))
    assert any("literal true" in e for e in errors_of([{"id": c, "abstain": "yes"}]))
    assert any("missing 'confidence'" in e for e in errors_of([{"id": a, "answer": "x"}]))
    # gold leakage
    assert any("gold leakage" in e for e in errors_of([{"id": c, "abstain": True, "split": "contradiction"}]))


def test_omitting_items_is_a_warning_not_an_error(tmp_path, gold, ids):
    errors, warnings = _validate(tmp_path, gold, [{"id": ids["c1"], "abstain": True}])
    assert errors == []
    assert any("95 of 96 data ids are not listed" in w for w in warnings)


def test_malformed_ids_are_reported_not_a_crash(tmp_path, gold, ids):
    """A list or object id is unhashable; it must come back as an error, not a TypeError."""
    payload = [
        {"id": [ids["a1"]], "abstain": True},
        {"id": {"v": 1}, "abstain": True},
        {"id": 12, "abstain": True},
        {"id": None, "abstain": True},
    ]
    errors, warnings = _validate(tmp_path, gold, payload)
    assert len(errors) == 4 and all("'id' must be a string" in e for e in errors)
    assert any("96 of 96" in w for w in warnings)


def test_oversized_integer_confidence_is_reported_not_a_crash(tmp_path, gold, ids):
    raw = '[{"id": "%s", "answer": "x", "confidence": 1%s}]' % (ids["a1"], "0" * 400)
    errors, _ = _validate(tmp_path, gold, None, raw=raw)
    assert len(errors) == 1 and "outside [0,1]" in errors[0]


def test_parity_fixture_is_current():
    """web/test/fixtures/validator-parity.json is what the validator says today."""
    assert gen_validator_fixtures.main(["--check"]) == 0


def test_parity_fixture_covers_every_message_kind(gold):
    seen = set()
    for case in gen_validator_fixtures.build_cases(gold):
        verdict = gen_validator_fixtures.run_validator(case["text"], gold)
        seen.update(i["code"] for i in verdict["errors"] + verdict["warnings"])
    assert seen == {code for code, _ in gen_validator_fixtures._KINDS}
