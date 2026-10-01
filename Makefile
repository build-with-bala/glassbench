# GlassBench — developer Makefile.
#
# Thin convenience wrapper around the frozen scorer/builder. It changes NOTHING about
# the contract (Glass Score formula, metrics, splits, data file, PRE_REGISTRATION.md):
# every target just invokes the existing package the same way the README/CONTRIBUTING
# document.
#
# PYTHON defaults to this checkout's own virtualenv (.venv/, if you made one) and
# otherwise to `python3`; it can be overridden, e.g.:
#     make score PYTHON=/path/to/python
#     make score EXAMPLE=submissions/agent_llm/predictions.json

PYTHON  ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
PIP     := $(PYTHON) -m pip
# Default target for `score`/`validate`. Points at a REAL submission (the genuine
# agent_llm baseline) so a bare `make score` shows a meaningful run rather than the
# EXAMPLE template (whose placeholder ids match nothing and score a confusing 0.0).
# Override per run, e.g. `make score EXAMPLE=submissions/<name>/predictions.json`.
EXAMPLE ?= submissions/agent_llm/predictions.json

.DEFAULT_GOAL := help
.PHONY: help install data score validate leaderboard board results fixtures check web-data score-all test all

help:  ## Show this help.
	@echo "GlassBench make targets:"
	@echo "  install      Install the package (editable) + dev extras into PYTHON's env."
	@echo "  data         Rebuild data/glassbench_v0.1.jsonl from the LongMemEval source."
	@echo "  score        Score one submission (default: $(EXAMPLE))."
	@echo "  validate     Validate a submission's predictions.json against the contract."
	@echo "  leaderboard  Regenerate LEADERBOARD.md + results/*.json from submissions/ (deterministic)."
	@echo "  board        Alias for leaderboard."
	@echo "  results      Alias for leaderboard."
	@echo "  fixtures     Regenerate the validator parity fixture for the site's unit tests."
	@echo "  check        Verify every generated artifact is byte-stable (what CI enforces)."
	@echo "  web-data     leaderboard + fixtures, then refresh web/data/ (needs node)."
	@echo "  score-all    Re-score every submissions/*/predictions.json (raw board data)."
	@echo "  test         Run the test suite (pytest)."
	@echo "  all          install -> test -> score."
	@echo ""
	@echo "Override the interpreter with PYTHON=..., the submission with EXAMPLE=..."

install:  ## Editable install of glassbench + dev extras (pytest).
	$(PIP) install -e ".[dev]"

data:  ## Rebuild the benchmark JSONL (writes data/glassbench_v0.1.jsonl).
	$(PYTHON) -m glassbench.build_data

score:  ## Score a single submission's predictions.json.
	$(PYTHON) -m glassbench.score --predictions "$(EXAMPLE)"

validate:  ## Validate a submission's predictions.json against the contract.
	$(PYTHON) scripts/validate_submission.py "$(EXAMPLE)"

# One pipeline, three artifacts, all re-scored from submissions/ by the frozen scorer:
#   LEADERBOARD.md             the human-readable board
#   results/leaderboard.json   the same board as data (read by the site in web/)
#   results/item_results.json  per-item outcomes for every system (read by the site)
leaderboard:  ## Regenerate LEADERBOARD.md + results/*.json from submissions/ (deterministic).
	$(PYTHON) scripts/gen_leaderboard.py
	$(PYTHON) scripts/gen_leaderboard.py --json
	$(PYTHON) scripts/export_results.py

board: leaderboard  ## Alias for the leaderboard target.

results: leaderboard  ## Alias for the leaderboard target.

# The site's in-browser predictions.json checker is a port of validate_submission.py.
# This records what the real validator says about a fixed set of files, for the site's
# unit tests to hold the port to (web/test/fixtures/validator-parity.json).
fixtures:  ## Regenerate the validator parity fixture used by the site's unit tests.
	$(PYTHON) scripts/gen_validator_fixtures.py

check:  ## Verify every generated artifact is byte-stable; writes nothing (what CI enforces).
	$(PYTHON) scripts/gen_leaderboard.py --check
	$(PYTHON) scripts/gen_leaderboard.py --json --check
	$(PYTHON) scripts/export_results.py --check
	$(PYTHON) scripts/gen_validator_fixtures.py --check

web-data: leaderboard fixtures  ## Refresh everything the site is built from (web/data/, fixture).
	cd web && node scripts/sync-data.mjs

score-all:  ## Re-score all submissions/*/predictions.json (raw board source data).
	@for f in submissions/*/predictions.json; do \
		echo "=== $$f ==="; \
		$(PYTHON) -m glassbench.score --predictions "$$f" --json-only || exit $$?; \
		echo ""; \
	done

test:  ## Run the test suite.
	$(PYTHON) -m pytest tests/

all: install test score  ## Install, test, then run the example scorer.
