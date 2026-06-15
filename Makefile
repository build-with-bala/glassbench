# GlassBench — developer Makefile.
#
# Thin convenience wrapper around the frozen scorer/builder. It changes NOTHING about
# the contract (Glass Score formula, metrics, splits, data file, PRE_REGISTRATION.md):
# every target just invokes the existing package the same way the README/CONTRIBUTING
# document.
#
# PYTHON defaults to the repo's pinned interpreter but can be overridden, e.g.:
#     make score PYTHON=python3
#     make score EXAMPLE=submissions/agent_llm/predictions.json

PYTHON  ?= /Users/root1/Desktop/Personal/2.Code.nosync/eidolon/.venv/bin/python
PIP     := $(PYTHON) -m pip
# Default target for `score`/`validate`. Points at a REAL submission (the genuine
# agent_llm baseline) so a bare `make score` shows a meaningful run rather than the
# EXAMPLE template (whose placeholder ids match nothing and score a confusing 0.0).
# Override per run, e.g. `make score EXAMPLE=submissions/<name>/predictions.json`.
EXAMPLE ?= submissions/agent_llm/predictions.json

.DEFAULT_GOAL := help
.PHONY: help install data score validate leaderboard board score-all test all

help:  ## Show this help.
	@echo "GlassBench make targets:"
	@echo "  install      Install the package (editable) + dev extras into PYTHON's env."
	@echo "  data         Rebuild data/glassbench_v0.1.jsonl from the LongMemEval source."
	@echo "  score        Score one submission (default: $(EXAMPLE))."
	@echo "  validate     Validate a submission's predictions.json against the contract."
	@echo "  leaderboard  Regenerate LEADERBOARD.md from submissions/ (deterministic)."
	@echo "  board        Alias for leaderboard."
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

leaderboard:  ## Regenerate LEADERBOARD.md from submissions/ (deterministic).
	$(PYTHON) scripts/gen_leaderboard.py

board: leaderboard  ## Alias for the leaderboard target.

score-all:  ## Re-score all submissions/*/predictions.json (raw board source data).
	@for f in submissions/*/predictions.json; do \
		echo "=== $$f ==="; \
		$(PYTHON) -m glassbench.score --predictions "$$f" --json-only || exit $$?; \
		echo ""; \
	done

test:  ## Run the test suite.
	$(PYTHON) -m pytest tests/

all: install test score  ## Install, test, then run the example scorer.
