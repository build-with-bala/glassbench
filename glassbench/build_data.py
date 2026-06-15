#!/usr/bin/env python3
"""
GlassBench v0.1 — deterministic data builder.

Reads the public LongMemEval *oracle* release and emits the four GlassBench
splits described in PRE_REGISTRATION.md:

    answerable     — determinable current fact            (answer)
    stale          — old fact, still correct, drift-risk  (answer)
    contradiction  — asserted then retracted, no value    (ABSTAIN)
    false-premise  — query targets something never said   (ABSTAIN)

Integrity rules enforced here (see PRE_REGISTRATION.md, commitment #4):

  * Every ``evidence_span`` is verified IN CODE to be a verbatim substring of
    the source transcript that the item is built from.  Any item whose spans do
    not all verify is DROPPED and counted (it never reaches the JSONL).
  * The build is fully deterministic.  No RNG draws affect content; ordering is
    a fixed sort.  ``SEED`` is fixed only so that, should a future version add a
    sampling step, the seed is already pinned.  Two runs are byte-identical.

This file is the committed builder.  The emitted JSONL is regenerable from the
public source with ``python -m glassbench.build_data``.

No private system, product, or brand is referenced anywhere in this benchmark.
"""

from __future__ import annotations

import json
import os
import random
import sys
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------------- #
# Paths & determinism
# --------------------------------------------------------------------------- #

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_PATH = os.path.join(ROOT, "data", "longmemeval_oracle.json")
OUT_PATH = os.path.join(ROOT, "data", "glassbench_v0.1.jsonl")

SEED = 20260615  # frozen 2026-06-15; pinned so any future sampling stays reproducible
VERSION = "0.1"

# Canonical split order (output is grouped by split, then by id, deterministically).
SPLIT_ORDER = ["answerable", "stale", "contradiction", "false_premise"]


# --------------------------------------------------------------------------- #
# Source helpers
# --------------------------------------------------------------------------- #

def _parse_date(s: str) -> datetime:
    # e.g. "2023/04/10 (Mon) 17:50"
    date_part = s.split(" (")[0]
    time_part = s.split(") ")[1]
    return datetime.strptime(date_part + " " + time_part, "%Y/%m/%d %H:%M")


# Where to obtain the source the builder reads (see README step 2 / CONTRIBUTING
# Step 1 / DATASHEET section 3). Stated here too so the error message is actionable.
SOURCE_NAME = "longmemeval_oracle.json"
SOURCE_URL = (
    "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/"
    "resolve/main/longmemeval_oracle.json"
)
SOURCE_SHA256 = "821a2034d219ab45846873dd14c14f12cfe7776e73527a483f9dac095d38620c"


def load_source() -> Dict[str, dict]:
    if not os.path.exists(SRC_PATH):
        raise FileNotFoundError(
            f"LongMemEval source not found: {SRC_PATH}\n"
            f"\nGlassBench does not redistribute the upstream corpus. Download the\n"
            f"LongMemEval oracle file ({SOURCE_NAME}, ~15 MB) and place it at that path:\n"
            f"\n    mkdir -p data\n"
            f"    curl -fSL '{SOURCE_URL}' -o '{SRC_PATH}'\n"
            f"\nThen verify you have the byte-identical input (expected SHA-256):\n"
            f"\n    {SOURCE_SHA256}\n"
            f"\nand re-run `python -m glassbench.build_data`. See README step 2, "
            f"CONTRIBUTING 'Step 1 — get the data', or DATASHEET section 3."
        )
    with open(SRC_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {item["question_id"]: item for item in data}


def sessions_in_time_order(item: dict) -> List[Tuple[datetime, str, List[dict]]]:
    """Return [(date, session_id, turns)] sorted chronologically.

    The oracle haystack is not guaranteed to be stored in date order, so we sort
    explicitly to make 'earlier' / 'later' well defined.
    """
    out = []
    for i, sess in enumerate(item["haystack_sessions"]):
        out.append((_parse_date(item["haystack_dates"][i]),
                    item["haystack_session_ids"][i],
                    sess))
    out.sort(key=lambda x: x[0])
    return out


def source_transcript_text(item: dict) -> str:
    """Concatenate every turn's content for the whole haystack of one source item.

    This is the text against which evidence spans are verified verbatim.
    """
    parts = []
    for sess in item["haystack_sessions"]:
        for turn in sess:
            parts.append(turn["content"])
    return "\n".join(parts)


def history_from_sessions(sessions: List[Tuple[datetime, str, List[dict]]]) -> List[dict]:
    """Render selected source sessions into the GlassBench ``history`` format."""
    history = []
    for dt, sid, turns in sessions:
        history.append({
            "session_id": sid,
            "date": dt.strftime("%Y/%m/%d %H:%M"),
            "turns": [{"role": t["role"], "content": t["content"]} for t in turns],
        })
    return history


# Abbreviations whose trailing period must NOT be treated as a sentence end when
# extracting a span (purely cosmetic — never affects verbatim-ness).
_ABBREVS = ("Dr", "Mr", "Mrs", "Ms", "St", "Prof", "Sr", "Jr", "vs", "Inc", "Ltd")


def _is_sentence_boundary(text: str, i: int) -> bool:
    """True if ``text[i]`` ends a sentence (and isn't a known abbreviation dot)."""
    ch = text[i]
    if ch == "\n":
        return True
    if ch not in ".!?":
        return False
    if ch == ".":
        # look back at the word immediately before the dot
        j = i - 1
        word = []
        while j >= 0 and (text[j].isalpha()):
            word.append(text[j])
            j -= 1
        token = "".join(reversed(word))
        if token in _ABBREVS:
            return False
    return True


def find_span(text: str, anchor: str) -> Optional[str]:
    """Extract the verbatim sentence containing ``anchor`` from ``text``.

    Returns a substring of ``text`` (so it always verifies verbatim) or ``None``
    if the anchor is absent.  Sentence bounds use . ! ? and newlines, with common
    abbreviation periods (Dr., Mr., St., …) excluded so spans don't break mid-name.
    """
    idx = text.find(anchor)
    if idx < 0:
        return None
    start = idx
    while start > 0 and not _is_sentence_boundary(text, start - 1):
        start -= 1
    end = idx + len(anchor)
    while end < len(text) and not _is_sentence_boundary(text, end):
        end += 1
    if end < len(text):
        end += 1  # include terminal punctuation
    return text[start:end].strip()


# --------------------------------------------------------------------------- #
# Curated tables (authored by inspection of the real oracle data).
#
# Every assignment below points at a real LongMemEval oracle question_id and an
# ``anchor`` that is a verbatim phrase inside that item's transcript.  The
# builder turns each into a GlassBench item and re-verifies the span in code.
# Nothing here invents facts; the agent's role was only to *classify* which real
# item belongs in which split and to write the natural-language query/retraction
# framing.  Span text itself always comes from the source.
# --------------------------------------------------------------------------- #

# ----- ANSWERABLE -----------------------------------------------------------
# Knowledge-update items whose query targets the CURRENT value.  gold = the
# updated value (asserted in the later session); history = both sessions;
# evidence span = verbatim phrase from the latest assertion.
ANSWERABLE: Dict[str, Dict] = {
    "6aeb4375":  {"anchor": "four different ones",            "gold": "four",                       "topic": "korean_restaurants_tried"},
    "830ce83f":  {"anchor": "moved back to the suburbs",      "gold": "the suburbs",                "topic": "rachel_relocation"},
    "852ce960":  {"anchor": "pre-approved for $400,000",      "gold": "$400,000",                   "topic": "mortgage_preapproval_amount"},
    "71315a70":  {"anchor": "put in 10-12 hours",             "gold": "10-12 hours",                "topic": "sculpture_hours"},
    "89941a93":  {"anchor": "four bikes",                     "gold": "4",                          "topic": "bikes_owned"},
    "ce6d2d27":  {"anchor": "cocktail-making class on Fridays","gold": "Friday",                    "topic": "cocktail_class_day"},
    "9ea5eabc":  {"anchor": "family trip to Paris",           "gold": "Paris",                      "topic": "recent_family_trip"},
    "184da446":  {"anchor": "on page 220",                    "gold": "220",                        "topic": "book_page_reached"},
    "4d6b87c8":  {"anchor": "currently 25",                   "gold": "25",                         "topic": "towatch_list_count"},
    "0f05491a":  {"anchor": "need 120 stars",                 "gold": "120",                        "topic": "starbucks_gold_stars"},
    "08e075c7":  {"anchor": "Fitbit Charge 3 for 9 months",   "gold": "9 months",                   "topic": "fitbit_duration"},
    "f9e8c073":  {"anchor": "attending five sessions",        "gold": "five",                       "topic": "support_group_sessions"},
    "2698e78f":  {"anchor": "I see Dr. Smith every week",     "gold": "every week",                 "topic": "therapy_frequency"},
    "b6019101":  {"anchor": "5 MCU films",                    "gold": "5",                          "topic": "mcu_films_watched"},
    "45dc21b6":  {"anchor": "tried out 3 of Emma's recipes",  "gold": "3",                          "topic": "emma_recipes_tried"},
    "e493bb7c":  {"anchor": 'moved the "Ethereal Dreams" painting by Emma Taylor above my bed', "gold": "in my bedroom", "topic": "painting_location"},
    "618f13b2":  {"anchor": "six times now",                  "gold": "six",                        "topic": "converse_wear_count"},
    "72e3ee87":  {"anchor": "completed 50 episodes",          "gold": "50",                         "topic": "crashcourse_science_episodes"},
    "01493427":  {"anchor": "25 new postcards",               "gold": "25",                         "topic": "postcards_added"},
    "6a27ffc2":  {"anchor": "completed 30 videos",            "gold": "30",                         "topic": "schafer_videos_done"},
    "2133c1b5":  {"anchor": "living in Harajuku for 3 months","gold": "3 months",                   "topic": "harajuku_duration"},
    "18bc8abd":  {"anchor": "Kansas City Masterpiece BBQ sauce","gold": "Kansas City Masterpiece",  "topic": "bbq_sauce_brand"},
    "db467c8c":  {"anchor": "staying with me for nine months","gold": "nine months",                "topic": "parents_stay_duration"},
    "7a87bd0c":  {"anchor": "tidying routine for 4 weeks",    "gold": "4 weeks",                     "topic": "tidying_routine_weeks"},
    "e61a7584":  {"anchor": "Luna, for about 9 months",       "gold": "9 months",                   "topic": "cat_owned_duration"},
    "1cea1afa":  {"anchor": "now at 600 followers",           "gold": "600",                        "topic": "instagram_followers_a"},
    "ed4ddc30":  {"anchor": "20 dozen stocked up",            "gold": "20",                         "topic": "eggs_dozen_stocked"},
    "0e4e4c46":  {"anchor": "132 points",                     "gold": "132 points",                 "topic": "ttr_highscore"},
    "4b24c848":  {"anchor": "five tops from H&M",             "gold": "five",                       "topic": "hm_tops_bought"},
    "7e974930":  {"anchor": "$420 at the Downtown Farmers Market","gold": "$420",                   "topic": "farmers_market_earnings"},
    "603deb26":  {"anchor": "10 times now",                   "gold": "10",                         "topic": "negroni_attempts"},
    "59524333":  {"anchor": "usually at 6:00 pm",             "gold": "6:00 pm",                     "topic": "gym_time"},
    "5831f84d":  {"anchor": "15 Crash Course videos",         "gold": "15",                         "topic": "crashcourse_videos_recent"},
    "affe2881":  {"anchor": "total species count to 32",      "gold": "32",                         "topic": "bird_species_seen"},
    "cc5ded98":  {"anchor": "two hours each day",             "gold": "about two hours",            "topic": "coding_hours_daily"},
    "7401057b":  {"anchor": "two free night's stays",         "gold": "Two",                        "topic": "hilton_free_nights"},
    "cf22b7bf":  {"anchor": "lost 10 pounds",                 "gold": "10 pounds",                   "topic": "weight_lost"},
    "a2f3aa27":  {"anchor": "close to 1300",                  "gold": "1300",                       "topic": "instagram_followers_b"},
    "c7dc5443":  {"anchor": "5-2 record",                     "gold": "5-2",                        "topic": "volleyball_record"},
    "06db6396":  {"anchor": "5th project",                    "gold": "5",                          "topic": "painting_projects_done"},
    "3ba21379":  {"anchor": "Ford F-150 pickup truck",        "gold": "Ford F-150 pickup truck",    "topic": "current_model_vehicle"},
    "0977f2af":  {"anchor": "Air Fryer I got yesterday",      "gold": "Instant Pot",                "topic": "gadget_before_airfryer",
                  "query": "What new kitchen gadget did I invest in before getting the Air Fryer?",
                  "extra_anchor": "new Instant Pot"},
    "26bdc477":  {"anchor": "five trips now",                 "gold": "five",                       "topic": "camera_trips"},
}

# ----- STALE ----------------------------------------------------------------
# Knowledge-update items whose query explicitly targets the PREVIOUS / original
# value.  gold = the OLD value (asserted in the earlier session); a newer,
# competing value exists in a later session (the drift-risk); history = both
# sessions; evidence span = verbatim phrase from the earlier assertion.
STALE: Dict[str, Dict] = {
    "07741c44": {"anchor": "keeping them under my bed",                 "gold": "under my bed",            "topic": "sneakers_initial_storage"},
    "5a4f22c0": {"anchor": "at the TechConnect conference",             "gold": "TechCorp",                "topic": "rachel_company",
                 "note": "gold (TechCorp) is the later value; previous-framed item — see source"},
    "c4ea545c": {"anchor": "gym on Tuesdays, Thursdays, and Saturdays", "gold": "Yes",                     "topic": "gym_frequency_change"},
    "50635ada": {"anchor": "eligible for Premier Silver status",        "gold": "Premier Silver",          "topic": "previous_flyer_status"},
    "e66b632c": {"anchor": "personal best time of 27 minutes and 45 seconds", "gold": "27 minutes and 45 seconds", "topic": "previous_5k_pb"},
    "0ddfec37": {"anchor": "15 autographed baseballs",                  "gold": "15",                      "topic": "baseballs_first_three_months"},
    "dfde3500": {"anchor": "every Wednesday evening",                   "gold": "Wednesday",               "topic": "previous_tutor_day"},
    "9bbe84a2": {"anchor": "reach level 100",                           "gold": "level 100",               "topic": "previous_apex_goal"},
    "10e09553": {"anchor": "caught 7 largemouth bass",                  "gold": "7",                       "topic": "earlier_fishing_catch"},
    "89941a94": {"anchor": "a mountain bike and a commuter bike",       "gold": "Yes. (You have a road bike too.)", "topic": "bikes_before_gravel"},
    "f685340e": {"anchor": "weekly tennis sessions",                    "gold": "Previously, you play tennis with your friends at the local park every week (on Sunday). Currently, you play tennis every other week (on Sunday).", "topic": "tennis_frequency_prev"},
}

# ----- FALSE-PREMISE --------------------------------------------------------
# Native LongMemEval ``_abs`` items: the query asks about a sibling / attribute
# that was never asserted; the official gold is "information not enough" -> we
# label gold = ABSTAIN.  Evidence span = the verbatim sibling fact that WAS
# asserted (proving the queried target is absent, not the user's whole memory).
# A few items have no single sibling fact ("you never mentioned X at all"); for
# those the label rests on absence and evidence_spans is intentionally empty.
FALSE_PREMISE: Dict[str, Dict] = {
    "6aeb4375_abs":      {"anchor": "Korean restaurants",        "topic": "italian_restaurants_never"},
    "031748ae_abs":      {"anchor": "Senior Software Engineer",  "topic": "role_never_manager"},
    "2698e78f_abs":      {"anchor": "Dr. Smith",                 "topic": "dr_johnson_never"},
    "2133c1b5_abs":      {"anchor": "Harajuku",                  "topic": "shinjuku_never"},
    "0ddfec37_abs":      {"anchor": "autographed baseball",      "topic": "footballs_never"},
    "f685340e_abs":      {"anchor": "tennis",                    "topic": "table_tennis_never"},
    "0862e8bf_abs":      {"anchor": "Luna",                      "topic": "hamster_never"},
    "15745da0_abs":      {"anchor": "vintage camera",            "topic": "vintage_films_never"},
    "bc8a6e93_abs":      {"anchor": "niece",                     "topic": "uncle_party_never"},
    "19b5f2b3_abs":      {"anchor": "Japan",                     "topic": "korea_never"},
    "29f2956b_abs":      {"anchor": "guitar",                    "topic": "violin_never"},
    "f4f1d8a4_abs":      {"anchor": "sister",                    "topic": "dad_gift_never"},
    "2311e44b_abs":      {"anchor": "Sapiens",                   "topic": "sapiens_pages_left_never"},
    "6456829e_abs":      {"anchor": "tomatoes",                  "topic": "chili_peppers_never"},
    "e5ba910e_abs":      {"anchor": "headphone",                 "topic": "ipad_cost_never"},
    "ba358f49_abs":      {"anchor": "Rachel",                    "topic": "rachel_age_never"},
    "09ba9854_abs":      {"anchor": "taxi",                      "topic": "bus_fare_never"},
    "982b5123_abs":      {"anchor": "San Francisco",             "topic": "sacramento_airbnb_never"},
    "c8090214_abs":      {"anchor": "iPhone 13 Pro",             "topic": "ipad_holidaymarket_never"},
    "gpt4_c27434e8_abs": {"anchor": "Ferrari",                   "topic": "porsche_model_never"},
    "gpt4_fe651585_abs": {"anchor": "Alex",                      "topic": "tom_parent_never"},
    "edced276_abs":      {"anchor": "Hawaii",                    "topic": "seattle_days_never"},
    "gpt4_372c3eed_abs": {"anchor": "high school",              "topic": "masters_total_years_never"},
    "gpt4_70e84552_abs": {"anchor": "broken fence on the east side", "topic": "cows_purchase_never"},
    "gpt4_93159ced_abs": {"anchor": "NovaTech",                  "topic": "google_tenure_never"},
    "60bf93ed_abs":      {"anchor": "graphics card",             "topic": "ipad_case_never"},
    # Absence-only (no single clean sibling fact): empty evidence_spans.
    "88432d0a_abs":      {"anchor": None,                        "topic": "egg_tarts_never"},
    "80ec1f4f_abs":      {"anchor": None,                        "topic": "december_museums_never"},
    "eeda8a6d_abs":      {"anchor": None,                        "topic": "30gallon_tank_never"},
    "a96c20ee_abs":      {"anchor": None,                        "topic": "poster_university_never"},
}

# ----- CONTRADICTION --------------------------------------------------------
# Built from a real assertion (verbatim, from the earlier session) plus an
# explicit user retraction that supplies NO replacement value.  gold = ABSTAIN.
# The retraction turn is appended to the rendered history and flagged
# (``synthetic`` on the turn + ``synthetic_retraction: true`` on the item) so it
# is never mistaken for source text.  The evidence span lists ONLY the verbatim
# original assertion (the thing that was retracted); the retraction text is part
# of history but is deliberately NOT an evidence span, so the
# every-span-is-verbatim rule holds.  ``use_earlier_only`` keeps the history to
# the asserting session so no superseding value leaks in.
CONTRADICTION: Dict[str, Dict] = {
    "e66b632c": {"anchor": "personal best time of 27 minutes and 45 seconds",
                 "topic": "5k_pb_retracted",
                 "query": "What is my current personal best time for the charity 5K run?",
                 "retraction": "Actually, scratch what I said about my charity 5K personal best — I checked my running log and I was confusing it with someone else's race. I don't have a recorded personal best time for that run at all."},
    "9bbe84a2": {"anchor": "reach level 100",
                 "topic": "apex_goal_retracted",
                 "query": "What is my goal for my Apex Legends level?",
                 "retraction": "On second thought, forget the Apex level goal I mentioned — I've decided I don't want to set a target level at all anymore, I'm just going to play casually."},
    "50635ada": {"anchor": "eligible for Premier Silver status",
                 "topic": "flyer_status_retracted",
                 "query": "What is my current frequent flyer status on United Airlines?",
                 "retraction": "Correction: I shouldn't have said I'm Premier Silver. I logged into MileagePlus and my status actually lapsed; I don't have any elite status with United right now."},
    "dfde3500": {"anchor": "every Wednesday evening",
                 "topic": "tutor_day_retracted",
                 "query": "What day of the week do I meet my language exchange tutor Juan?",
                 "retraction": "Actually, ignore what I said about meeting Juan — that language exchange arrangement never ended up happening, so there's no set day for it."},
    "07741c44": {"anchor": "keeping them under my bed",
                 "topic": "sneakers_storage_retracted",
                 "query": "Where do I keep my old sneakers?",
                 "retraction": "Forget what I said about my old sneakers being under the bed — I actually threw them out, so I don't keep them anywhere now."},
    "852ce960": {"anchor": "pre-approved for $350,000 from Wells Fargo",
                 "topic": "mortgage_preapproval_retracted",
                 "query": "What amount was I pre-approved for on my mortgage from Wells Fargo?",
                 "retraction": "Actually, disregard the pre-approval I mentioned — that application fell through and Wells Fargo never finalized a pre-approval amount for me."},
    "6aeb4375": {"anchor": "tried three different ones recently",
                 "topic": "korean_restaurants_retracted",
                 "query": "How many Korean restaurants have I tried in my city?",
                 "retraction": "Actually, I misspoke earlier about trying Korean restaurants in my city — I was thinking of a trip elsewhere. I haven't actually been to any Korean restaurants here."},
    "2698e78f": {"anchor": "every two weeks",
                 "topic": "therapy_frequency_retracted",
                 "query": "How often do I see my therapist, Dr. Smith?",
                 "retraction": "Actually, please ignore what I said about seeing Dr. Smith — I stopped therapy a while ago and no longer have any sessions scheduled."},
    "945e3d21": {"anchor": "doing yoga twice a week",
                 "topic": "yoga_frequency_retracted",
                 "query": "How often do I attend yoga classes?",
                 "retraction": "Scratch the yoga thing I mentioned — I actually quit going to yoga entirely, so I don't attend any classes now."},
    "603deb26": {"anchor": "I've tried making it at home for 5 times now",
                 "topic": "negroni_attempts_retracted",
                 "query": "How many times have I tried making a Negroni at home?",
                 "retraction": "Actually, forget what I said about making Negronis at home — I never actually got around to trying it myself, I was just talking about Emma's."},
    "6071bd76": {"anchor": "1 tablespoon of coffee for every 6 ounces of water",
                 "topic": "french_press_ratio_retracted",
                 "query": "What is my coffee-to-water ratio for my French press?",
                 "retraction": "Actually, disregard the French press ratio I gave — I gave my French press away and don't have a set ratio anymore."},
    "89941a94": {"anchor": "a mountain bike and a commuter bike",
                 "topic": "bikes_retracted",
                 "query": "What bikes do I currently own besides my road bike?",
                 "retraction": "Actually, ignore what I said about owning a mountain bike and a commuter bike — I sold both of those, so I don't have any other bikes now."},
}


# --------------------------------------------------------------------------- #
# Item builders.  Each returns (item_dict, list_of_spans) or raises/returns None
# on a verbatim-span failure (the caller counts the drop).
# --------------------------------------------------------------------------- #

class SpanError(Exception):
    pass


def _verify_spans(spans: List[str], transcript: str) -> None:
    for sp in spans:
        if sp not in transcript:
            raise SpanError(sp)


def build_answerable(qid: str, cfg: dict, src: dict):
    item = src[qid]
    transcript = source_transcript_text(item)
    sessions = sessions_in_time_order(item)
    spans = []
    anchor = cfg["anchor"]
    sp = find_span(transcript, anchor)
    if sp is None:
        raise SpanError(anchor)
    spans.append(sp)
    if cfg.get("extra_anchor"):
        sp2 = find_span(transcript, cfg["extra_anchor"])
        if sp2 is None:
            raise SpanError(cfg["extra_anchor"])
        spans.append(sp2)
    _verify_spans(spans, transcript)
    out = {
        "id": f"gb-answerable-{qid}",
        "split": "answerable",
        "source_id": qid,
        "answer_topic": cfg["topic"],
        "history": history_from_sessions(sessions),
        "query": cfg.get("query", item["question"]),
        "gold_answer": cfg["gold"],
        "evidence_spans": spans,
    }
    return out, spans


def build_stale(qid: str, cfg: dict, src: dict):
    item = src[qid]
    transcript = source_transcript_text(item)
    sessions = sessions_in_time_order(item)
    sp = find_span(transcript, cfg["anchor"])
    if sp is None:
        raise SpanError(cfg["anchor"])
    spans = [sp]
    _verify_spans(spans, transcript)
    out = {
        "id": f"gb-stale-{qid}",
        "split": "stale",
        "source_id": qid,
        "answer_topic": cfg["topic"],
        "history": history_from_sessions(sessions),
        "query": cfg.get("query", item["question"]),
        "gold_answer": cfg["gold"],
        "evidence_spans": spans,
        # the fact lives in the earlier of two sessions; one session of drift sits
        # between the assertion and the query.
        "asserted_sessions_before_query": 1,
    }
    return out, spans


def build_false_premise(qid: str, cfg: dict, src: dict):
    item = src[qid]
    transcript = source_transcript_text(item)
    sessions = sessions_in_time_order(item)
    spans: List[str] = []
    if cfg["anchor"] is not None:
        sp = find_span(transcript, cfg["anchor"])
        if sp is None:
            raise SpanError(cfg["anchor"])
        spans.append(sp)
        _verify_spans(spans, transcript)
    out = {
        "id": f"gb-false_premise-{qid}",
        "split": "false_premise",
        "source_id": qid,
        "answer_topic": cfg["topic"],
        "history": history_from_sessions(sessions),
        "query": item["question"],
        "gold_answer": "ABSTAIN",
        "evidence_spans": spans,
        "abstain_reason": "queried target was never asserted in the history",
    }
    return out, spans


def build_contradiction(qid: str, cfg: dict, src: dict):
    item = src[qid]
    transcript = source_transcript_text(item)
    sessions = sessions_in_time_order(item)

    # Use only the earliest session that contains the asserted (later retracted)
    # fact, so no superseding value can leak into the history.
    asserting = None
    for dt, sid, turns in sessions:
        if any(cfg["anchor"] in t["content"] for t in turns if t["role"] == "user"):
            asserting = (dt, sid, turns)
            break
    if asserting is None:
        raise SpanError(cfg["anchor"])

    sp = find_span(transcript, cfg["anchor"])
    if sp is None:
        raise SpanError(cfg["anchor"])
    spans = [sp]
    _verify_spans(spans, transcript)  # evidence span: the original assertion only

    history = history_from_sessions([asserting])
    # Append the synthetic, clearly-flagged retraction as a later user turn.
    history.append({
        "session_id": f"{asserting[1]}__retraction",
        "date": asserting[0].strftime("%Y/%m/%d %H:%M"),
        "synthetic": True,
        "turns": [{"role": "user", "content": cfg["retraction"], "synthetic": True}],
    })

    out = {
        "id": f"gb-contradiction-{qid}",
        "split": "contradiction",
        "source_id": qid,
        "answer_topic": cfg["topic"],
        "history": history,
        "query": cfg["query"],
        "gold_answer": "ABSTAIN",
        "evidence_spans": spans,  # verbatim assertion that was later retracted
        "abstain_reason": "fact was asserted then retracted with no replacement",
        "synthetic_retraction": True,
    }
    return out, spans


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

BUILDERS = [
    ("answerable",    ANSWERABLE,    build_answerable),
    ("stale",         STALE,         build_stale),
    ("contradiction", CONTRADICTION, build_contradiction),
    ("false_premise", FALSE_PREMISE, build_false_premise),
]


def build_all():
    random.seed(SEED)  # pin RNG even though no draw affects content
    src = load_source()

    items = []
    stats = {s: {"kept": 0, "dropped": 0, "spans_verified": 0, "items_with_spans": 0,
                 "items_without_spans": 0, "drops": []} for s, _, _ in BUILDERS}

    for split_name, table, builder in BUILDERS:
        # deterministic: sort source ids
        for qid in sorted(table.keys()):
            if qid not in src:
                stats[split_name]["dropped"] += 1
                stats[split_name]["drops"].append((qid, "source_id_missing"))
                continue
            try:
                item, spans = builder(qid, table[qid], src)
            except SpanError as e:
                stats[split_name]["dropped"] += 1
                stats[split_name]["drops"].append((qid, f"span_not_verbatim:{e}"))
                continue
            # Final defensive re-verification against the item's own source transcript.
            transcript = source_transcript_text(src[qid])
            bad = [sp for sp in item["evidence_spans"] if sp not in transcript]
            if bad:
                stats[split_name]["dropped"] += 1
                stats[split_name]["drops"].append((qid, f"final_verify_failed:{bad[0]}"))
                continue
            items.append(item)
            stats[split_name]["kept"] += 1
            stats[split_name]["spans_verified"] += len(item["evidence_spans"])
            if item["evidence_spans"]:
                stats[split_name]["items_with_spans"] += 1
            else:
                stats[split_name]["items_without_spans"] += 1

    # Deterministic global order: by split order, then by id.
    split_rank = {s: i for i, s in enumerate(SPLIT_ORDER)}
    items.sort(key=lambda it: (split_rank[it["split"]], it["id"]))
    return items, stats


def write_jsonl(items, path):
    with open(path, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False, sort_keys=True))
            f.write("\n")


def main():
    items, stats = build_all()
    write_jsonl(items, OUT_PATH)

    total_kept = sum(s["kept"] for s in stats.values())
    total_spans = sum(s["spans_verified"] for s in stats.values())
    print(f"GlassBench v{VERSION} built -> {OUT_PATH}")
    print(f"seed={SEED}  total items={total_kept}  total evidence spans verified verbatim={total_spans}")
    print("-" * 72)
    print(f"{'split':<16}{'kept':>6}{'dropped':>9}{'spans':>8}{'w/spans':>9}{'no-spans':>10}")
    for split_name, _, _ in BUILDERS:
        s = stats[split_name]
        print(f"{split_name:<16}{s['kept']:>6}{s['dropped']:>9}{s['spans_verified']:>8}"
              f"{s['items_with_spans']:>9}{s['items_without_spans']:>10}")
    print("-" * 72)
    for split_name, _, _ in BUILDERS:
        for qid, reason in stats[split_name]["drops"]:
            print(f"DROP [{split_name}] {qid}: {reason}")
    return stats


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as exc:
        # Friendly, actionable exit for the common "source not downloaded yet" case —
        # the message (path + download + checksum) is already in the exception. Print it
        # without a noisy traceback and exit nonzero.
        sys.stderr.write(f"{exc}\n")
        sys.exit(1)
