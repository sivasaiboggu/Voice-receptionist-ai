"""Appointment booking: slot generation, double-booking prevention, confirmations."""
import os
from datetime import datetime, timedelta

from .db import db, init_db

SERVICES = {
    "General checkup": {"price": 500, "minutes": 30},
    "Teeth cleaning": {"price": 1500, "minutes": 45},
    "Root canal treatment": {"price": 6000, "minutes": 60},
    "Tooth extraction": {"price": 1200, "minutes": 30},
    "Braces consultation": {"price": 800, "minutes": 30},
}

OPEN_HOURS = [(9, 13), (14, 20)]  # 9-13, 14-20 (lunch 13:30-14:30 simplified to 13-14)


def generate_slots(days=7, start=None):
    """Generate 30-minute slots for the next `days` days (Mon-Sat 9-20, Sun 10-14)."""
    start = start or datetime.now().date()
    slots = []
    for d in range(days):
        day = start + timedelta(days=d)
        hours = [(10, 14)] if day.weekday() == 6 else OPEN_HOURS
        for h0, h1 in hours:
            t = datetime(day.year, day.month, day.day, h0)
            end = datetime(day.year, day.month, day.day, h1)
            while t < end:
                slots.append(t.strftime("%Y-%m-%d %H:%M"))
                t += timedelta(minutes=30)
    return slots


def seed_slots():
    init_db()
    with db() as conn:
        for slot in generate_slots():
            conn.execute("INSERT OR IGNORE INTO slots (slot) VALUES (?)", (slot,))


def available_slots(service=None, limit=20):
    with db() as conn:
        rows = conn.execute(
            "SELECT slot FROM slots WHERE available=1 ORDER BY slot LIMIT ?", (limit,)
        ).fetchall()
    return [r["slot"] for r in rows]


def book(patient_name, phone, service, slot):
    """Book a slot. Returns (ok, message). Double-booking is rejected atomically."""
    if service not in SERVICES:
        return False, f"Sorry, we don't offer '{service}'. Available: {', '.join(SERVICES)}."
    with db() as conn:
        row = conn.execute("SELECT available FROM slots WHERE slot=?", (slot,)).fetchone()
        if row is None:
            return False, f"That time ({slot}) is outside our hours — pick a slot from the available list."
        if row["available"] == 0:
            return False, f"Sorry, {slot} is already booked. Please pick another time."
        conn.execute("UPDATE slots SET available=0 WHERE slot=?", (slot,))
        conn.execute(
            "INSERT INTO appointments (patient_name, phone, service, slot, created_at) VALUES (?,?,?,?,?)",
            (patient_name, phone, service, slot, datetime.now().isoformat()),
        )
    return True, (
        f"Booked: {service} for {patient_name} on {slot} "
        f"(Rs {SERVICES[service]['price']}). A confirmation will be sent to {phone}."
    )


def list_appointments():
    with db() as conn:
        rows = conn.execute("SELECT * FROM appointments ORDER BY slot").fetchall()
    return [dict(r) for r in rows]


def cancel(slot):
    with db() as conn:
        cur = conn.execute("UPDATE appointments SET status='cancelled' WHERE slot=? AND status='booked'", (slot,))
        if cur.rowcount:
            conn.execute("UPDATE slots SET available=1 WHERE slot=?", (slot,))
            return True, f"Cancelled the appointment on {slot}."
    return False, f"No booked appointment found on {slot}."
