"""Create synthetic screenshots data in a new local SQLite file."""

import argparse
import os
import sys
from datetime import timedelta, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("database", type=Path)
args = parser.parse_args()
database = args.database.resolve()
if database.exists():
    parser.error("Choose a new database file.")
database.parent.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{database}"
sys.path.insert(0, os.getcwd())

from backend.app import booking
from backend.app.db import db

booking.seed_slots()
now = booking.now_clinic()
today = now.date()
day_after = today + timedelta(days=1)

with db() as conn:
    entries = [
        ('+12025550104', 'Asha asked about a cleaning and booked an appointment.', 'booked', 'positive', 'low', 0,
         'Agent: Thanks for calling Sunrise Dental Clinic. How can I help?\nCaller: I would like a cleaning this week.\nAgent: The first opening is at 14:30. May I have the patient’s name?\nCaller: My name is Asha Rao.\nAgent: Your cleaning is booked.'),
        ('+12025550115', 'Caller asked what a root canal costs.', 'answered', 'neutral', 'low', 0,
         'Agent: How can I help?\nCaller: How much does a root canal cost?\nAgent: A root canal treatment starts at Rs 6,000.'),
        ('+12025550119', 'Caller reported severe pain and was handed off to the clinic.', 'escalated-emergency', 'negative', 'high', 1,
         'Agent: How can I help?\nCaller: I am in severe pain and need to speak to someone.\nAgent: I will connect you to the clinic now.'),
        ('+12025550132', 'Caller left a message about an x-ray.', 'message-taken', 'neutral', 'low', 0,
         'Agent: How can I help?\nCaller: Can I leave a message about my x-ray?\nAgent: I have taken your message. The clinic will call you back.'),
        ('+12025550145', 'Caller checked the clinic’s Sunday hours.', 'answered', 'positive', 'low', 0,
         'Caller: Are you open on Sunday?\nAgent: The clinic is open from 10 AM to 2 PM.'),
    ]
    for i, (caller, summary, outcome, sentiment, urgency, escalated, transcript) in reversed(list(enumerate(entries))):
        at = now - timedelta(seconds=30 + 120 * i, days=0 if i < 3 else 1)
        conn.execute('INSERT INTO calls (caller, started_at, summary, outcome, sentiment, urgency, escalated, transcript) VALUES (?,?,?,?,?,?,?,?)',
                     (caller, at.astimezone(timezone.utc).isoformat(), summary, outcome, sentiment, urgency, escalated, transcript))
    for slot, name, service, phone, status in [
        (f'{today} 10:00', 'Asha Rao', 'Teeth cleaning', '+12025550104', 'booked'),
        (f'{today} 11:30', 'Mira Das', 'General checkup', '+12025550107', 'booked'),
        (f'{today} 13:00', 'Sam Patel', 'Braces consultation', '+12025550111', 'booked'),
        (f'{day_after} 11:00', 'Kiran Shah', 'Root canal treatment', '+12025550113', 'booked'),
        (f'{day_after} 15:30', 'Jaya Sen', 'General checkup', '+12025550118', 'cancelled'),
    ]:
        conn.execute('INSERT INTO appointments (patient_name, phone, service, slot, status, created_at) VALUES (?,?,?,?,?,?)',
                     (name, phone, service, slot, status, now.isoformat()))
        if status == 'booked':
            conn.execute('UPDATE slots SET available=0 WHERE slot=?', (slot,))
    conn.execute('INSERT INTO messages (caller, message, created_at) VALUES (?,?,?)',
                 ('+12025550132', 'Please call back about an x-ray.', now.isoformat()))
