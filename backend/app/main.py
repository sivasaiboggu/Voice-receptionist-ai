"""CLI: run a simulated call, book, or show analytics. No keys needed."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app import agent as va
from backend.app import booking


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "demo":
        result = va.run_demo_call()
        print("=== Voice Receptionist — demo call ===")
        for r in result["replies"]:
            print(" ", r)
        print(f"\nOutcome: {result['outcome']} | Escalated: {result['escalated']}")
        print(f"Sentiment: {result['sentiment']} | Urgency: {result['urgency']}")
        print(f"Summary: {result['summary']}")
        if result.get("follow_up_sms"):
            print(f"SMS draft: {result['follow_up_sms']}")
    elif cmd == "slots":
        print("Available slots:")
        for s in booking.available_slots(limit=10):
            print(" ", s)
    elif cmd == "appointments":
        for a in booking.list_appointments():
            print(a)
    else:
        print("Usage: python -m backend.app.main [demo|slots|appointments]")


if __name__ == "__main__":
    main()
