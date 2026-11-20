"""Knowledge base / RAG for the demo business.

Seeded with a realistic demo clinic. Every answer cites its source
document — the agent never invents prices, hours or services.
Free: keyword retrieval over local documents; no paid embedding API.
A Gemini polish step is optional and never adds facts.

Single source of truth: documents are loaded from ``docs/kb/*.md`` at
import time, with the embedded copies below as a fallback if the files
are missing (e.g. a packaged install). Editing a ``docs/kb`` file is
enough to change what the agent says — no code change needed.
"""
import os
import re

KB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "kb")

DOCUMENTS = {
    "services.md": """# Services — Sunrise Dental Clinic
- General checkup: Rs 500, 30 minutes. Includes cleaning advice and X-ray if needed.
- Teeth cleaning: Rs 1,500, 45 minutes.
- Root canal treatment: Rs 6,000, 60 minutes, 2 visits.
- Tooth extraction: Rs 1,200, 30 minutes.
- Braces consultation: Rs 800, 30 minutes.
Source: services.md""",
    "hours.md": """# Opening hours — Sunrise Dental Clinic
- Monday to Saturday: 9:00 AM to 8:00 PM.
- Sunday: 10:00 AM to 2:00 PM, emergencies only.
- Lunch break: 1:30 PM to 2:30 PM, no appointments.
- Address: 2nd Floor, MG Road, Vijayawada, Andhra Pradesh.
Source: hours.md""",
    "faqs.md": """# FAQs — Sunrise Dental Clinic
- Do I need an appointment? Walk-ins are welcome, but appointments get priority.
- Do you accept insurance? Yes — most major insurers; bring your card.
- Is parking available? Yes, free parking in the basement.
- What if I am in pain? Tell the receptionist — urgent cases are seen the same day.
- Do you treat children? Yes, from age 3 onwards.
Source: faqs.md""",
    "pricing.md": """# Pricing — Sunrise Dental Clinic
- Consultation: Rs 500. Cleaning: Rs 1,500. Filling: Rs 1,800.
- Root canal: Rs 6,000. Extraction: Rs 1,200. Braces: from Rs 25,000.
- Payment: UPI, card and cash accepted.
Source: pricing.md""",
}


def _load_documents():
    """Load docs/kb/*.md; fall back to the embedded copies if unreadable."""
    docs = {}
    try:
        for name in sorted(os.listdir(KB_DIR)):
            if name.endswith(".md"):
                with open(os.path.join(KB_DIR, name), encoding="utf-8") as f:
                    docs[name] = f.read()
    except OSError:
        pass
    return docs or dict(DOCUMENTS)


DOCUMENTS = _load_documents()

STOPWORDS = {
    "how", "what", "when", "where", "why", "who", "does", "have", "there",
    "their", "about", "your", "you", "can", "are", "for", "with", "and",
    "the", "that", "this", "from", "into", "need", "like", "want", "open",
    "much", "many", "tell", "please",
}

# Topic routing: a query about opening times must not be answered with a
# treatment line, and vice versa ("when do you do root canals?" is not an
# hours question). Word-boundary matching only — "when" alone is not an
# hours signal, and "open" is only an hours signal, never a treatment one.
TOPIC_KEYWORDS = {
    "hours.md": ["hours", "timing", "timings", "close", "closed", "closing", "opening", "open"],
    "pricing.md": ["price", "prices", "cost", "costs", "fee", "fees", "charge", "charges", "how much", "rs", "rupees"],
    "services.md": ["service", "services", "treatment", "treatments", "offer", "offers", "provide"],
}


def _has_word(text, word):
    return re.search(r"\b" + re.escape(word) + r"\b", text) is not None


def _words(query):
    return [w for w in re.findall(r"[a-z]+", query.lower()) if len(w) > 2 and w not in STOPWORDS]


def _stem(word):
    """Light stemming so 'accept' matches 'accepted' and 'cleaning'
    matches 'clean' — but 'pain' still does not match 'painting'."""
    w = word.lower()
    if len(w) > 5 and w.endswith("ing"):
        w = w[:-3]
    elif len(w) > 4 and w.endswith("ed"):
        w = w[:-2]
    elif len(w) > 4 and w.endswith("es"):
        w = w[:-2]
    elif len(w) > 3 and w.endswith("s"):
        w = w[:-1]
    return w


def _line_score(words, line):
    """Whole-word matches only, stem-compared: 'pain' must not match
    'painting', but 'accept' matches 'accepted'."""
    tokens = [_stem(w) for w in re.findall(r"[a-z]+", line.lower())]
    return sum(1 for w in words if _stem(w) in tokens)


def _topic_boost(query, doc_name):
    q = query.lower()
    return 1 if any(_has_word(q, kw) for kw in TOPIC_KEYWORDS.get(doc_name, [])) else 0


def _kb_lines(doc):
    """Answerable lines of a KB document (titles and Source: lines excluded)."""
    lines = []
    for raw in doc.splitlines():
        line = raw.strip("- ").strip()
        if not line or line.startswith("#") or line.lower().startswith("source:"):
            continue
        lines.append(line)
    return lines


def retrieve(query, top_k=2):
    """Return the best-matching KB documents with a citation."""
    words = _words(query)
    scored = []
    for name, doc in DOCUMENTS.items():
        tokens = {_stem(w) for w in re.findall(r"[a-z]+", doc.lower())}
        score = sum(1 for w in words if _stem(w) in tokens) + _topic_boost(query, name)
        scored.append((score, name, doc))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [
        {"source": name, "text": doc, "score": s}
        for s, name, doc in scored[:top_k] if s > 0
    ]


def answer(query):
    """Answer a FAQ from the KB only; say so clearly when it is not in the KB.

    Scores every KB line individually (whole-word matches, plus a small
    boost for the line's topic document) and returns the best-matching
    line, so a price question gets the price line, not a neighbouring one.
    A question with no real match gets an honest 'I don't have that'
    instead of the closest vaguely-related line.
    """
    if not query or not str(query).strip():
        return {
            "answer": "I don't have that information in our clinic guide — I can take a message and the clinic will call you back.",
            "sources": [],
            "in_kb": False,
        }
    words = _words(query)
    if not words and not any(_has_word(query.lower(), kw) for kws in TOPIC_KEYWORDS.values() for kw in kws):
        return {
            "answer": "I don't have that information in our clinic guide — I can take a message and the clinic will call you back.",
            "sources": [],
            "in_kb": False,
        }
    best = None  # (score, source, line)
    for name, doc in DOCUMENTS.items():
        boost = _topic_boost(query, name)
        for line in _kb_lines(doc):
            score = _line_score(words, line) + boost
            if best is None or score > best[0]:
                best = (score, name, line)
    if best is None or best[0] == 0:
        return {
            "answer": "I don't have that information in our clinic guide — I can take a message and the clinic will call you back.",
            "sources": [],
            "in_kb": False,
        }
    hits = retrieve(query)
    sources = [best[1]] + [h["source"] for h in hits if h["source"] != best[1]]
    return {"answer": best[2], "sources": sources, "in_kb": True}
