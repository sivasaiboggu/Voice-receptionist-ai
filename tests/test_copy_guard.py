"""Copy guard: user-facing text must stay plain, human and honest.

Fails the build on emoji, banned marketing words, or decorative
symbols in the code and docs a user can read (backend replies, the
dashboard, the knowledge base, prompts, README). The middle dot (·),
ellipsis (…) and em dash (—) are legitimate punctuation and are not
banned; neither is the arrow (→) used in the README's flow diagrams.
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ROOT = os.path.join(os.path.dirname(__file__), "..")

# Banned marketing words from the premium standard — plain human copy only.
BANNED_WORDS = [
    "seamless", "supercharge", "elevate", "unlock", "revolution",
    "game-changer", "game changer", "AI-powered", "AI powered",
    "cutting-edge", "cutting edge", "next-gen", "next gen",
    "world-class", "world class", "superpower",
]

# Emoji ranges (misc symbols/pictographs, emoticons, transport, flags,
# dingbats, supplemental symbols) plus decorative dingbats that creep
# into UI copy (stars, check marks, arrows-as-bullets, shapes).
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F"
    "\u2B50\u2605\u2606\u2726\u2727\u2729\u272A\u2714\u2713\u2717\u2718"
    "\u27A4\u25B6\u25BA\u25C6\u25C7\u25A0\u25A1\u2665\u2661]"
)


def _scanned_files():
    for base in ("backend/app", "frontend/src", "docs/kb", "prompts"):
        for dirpath, _dirs, files in os.walk(os.path.join(ROOT, base)):
            for name in files:
                if name.endswith((".py", ".tsx", ".ts", ".md")):
                    yield os.path.join(dirpath, name)
    yield os.path.join(ROOT, "README.md")


def test_no_emoji_or_decorative_symbols():
    hits = []
    for path in _scanned_files():
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if EMOJI_RE.search(line):
                    hits.append(f"{os.path.relpath(path, ROOT)}:{lineno}: {line.strip()[:100]}")
    assert not hits, "emoji / decorative symbols in user-facing text:\n" + "\n".join(hits)


def test_no_banned_marketing_words():
    hits = []
    word_res = [
        (w, re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE))
        for w in BANNED_WORDS
    ]
    for path in _scanned_files():
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for word, rx in word_res:
            if rx.search(text):
                hits.append(f"{os.path.relpath(path, ROOT)}: {word!r}")
    assert not hits, "banned marketing words in user-facing text:\n" + "\n".join(hits)


# --- Playbook slop checklist, enforced by the build -------------------
# Frosted surfaces, staggered entrances and breathing dots are not a
# matter of taste: the playbook fails the build on them. The typing
# indicator's `animationDelay` is deliberately NOT matched here — it is
# a state-change indicator (the agent is typing), not an entrance.

def _ui_files():
    for dirpath, _dirs, files in os.walk(os.path.join(ROOT, "frontend", "src")):
        for name in files:
            if name.endswith((".tsx", ".ts", ".css")):
                yield os.path.join(dirpath, name)


def test_no_frosted_surfaces():
    """No backdrop-blur anywhere in the UI: sidebar, topbar, mobile nav
    and toasts are solid surfaces."""
    hits = []
    for path in _ui_files():
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if "backdrop-blur" in line:
                    hits.append(f"{os.path.relpath(path, ROOT)}:{lineno}")
    assert not hits, "frosted (backdrop-blur) surfaces:\n" + "\n".join(hits)


_STAGGER_RES = [
    re.compile(r"\bdelay\s*:"),   # framer-motion transition={{ ..., delay: ... }}
    re.compile(r"\bdelay\s*=\s*\{"),  # delay={...} prop
    re.compile(r"stagger", re.IGNORECASE),  # staggerChildren / stagger(...)
]


def test_no_staggered_entrances():
    """No per-item entrance delays: stat cards, call rows and appointment
    cards render at once instead of staggering in."""
    hits = []
    for path in _ui_files():
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                for rx in _STAGGER_RES:
                    if rx.search(line):
                        hits.append(f"{os.path.relpath(path, ROOT)}:{lineno}: {line.strip()[:90]}")
                        break
    assert not hits, "staggered-entrance patterns:\n" + "\n".join(hits)


def test_no_breathing_dots():
    """No animate-ping / breathing dots: the live indicator is a solid
    dot plus the running call timer, which is what shows liveness."""
    hits = []
    for path in _ui_files():
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                if "animate-ping" in line:
                    hits.append(f"{os.path.relpath(path, ROOT)}:{lineno}")
    assert not hits, "breathing (animate-ping) dots:\n" + "\n".join(hits)
