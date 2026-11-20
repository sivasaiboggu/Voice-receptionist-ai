"""Knowledge base / RAG for the demo business.

Seeded with a realistic demo clinic. Every answer cites its source
document — the agent never invents prices, hours or services.
Free: keyword retrieval over local documents; no paid embedding API.
A Gemini polish step is optional and never adds facts.
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


STOPWORDS = {
    "how", "what", "when", "where", "why", "who", "does", "have", "there",
    "their", "about", "your", "you", "can", "are", "for", "with", "and",
    "the", "that", "this", "from", "into", "need", "like", "want", "open",
    "much", "many", "tell", "please",
}


def _words(query):
    return [w for w in re.findall(r"[a-z]+", query.lower()) if len(w) > 2 and w not in STOPWORDS]


def _score(query, text):
    words = _words(query)
    hay = text.lower()
    return sum(1 for w in words if w in hay)


def retrieve(query, top_k=2):
    """Return the best-matching KB documents with a citation."""
    scored = sorted(
        (( _score(query, doc), name, doc) for name, doc in DOCUMENTS.items()),
        reverse=True,
    )
    return [
        {"source": name, "text": doc, "score": s}
        for s, name, doc in scored[:top_k] if s > 0
    ]


def answer(query):
    """Answer a FAQ from the KB only; say so clearly when it is not in the KB.

    Scores every KB line individually and returns the best-matching line,
    so a price question gets the price line, not a neighbouring line.
    """
    words = _words(query)
    q = query.lower()
    if any(w in q for w in ("open", "hours", "timing", "close", "when do you", "what time")):
        return {
            "answer": "Monday to Saturday: 9:00 AM to 8:00 PM. Sunday: 10:00 AM to 2:00 PM, emergencies only.",
            "sources": ["hours.md"],
            "in_kb": True,
        }
    if not words:
        return {
            "answer": "I don't have that information in our clinic guide — I can take a message and the clinic will call you back.",
            "sources": [],
            "in_kb": False,
        }
    best = None  # (score, source, line)
    for name, doc in DOCUMENTS.items():
        for raw in doc.splitlines():
            line = raw.strip("- ").strip()
            if not line or line.startswith("#") or line.startswith("Source:"):
                continue
            score = sum(1 for w in words if w in line.lower())
            if best is None or score > best[0]:
                best = (score, name, line)
    if best is None or best[0] == 0:
        return {
            "answer": "I don't have that information in our clinic guide — I can take a message and the clinic will call you back.",
            "sources": [],
            "in_kb": False,
        }
    hits = retrieve(query)
    return {"answer": best[2], "sources": [best[1]] + [h["source"] for h in hits if h["source"] != best[1]], "in_kb": True}
