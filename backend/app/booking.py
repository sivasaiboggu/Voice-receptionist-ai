"""Appointment booking: slot generation, double-booking prevention, confirmations.

Safety guarantees:
- Booking is atomic: the overlap check and the slot claim run under
  the booking lock (``acquire_booking_lock`` — BEGIN IMMEDIATE on
  SQLite, a transaction advisory lock on Postgres), so two concurrent
  requests can never book the same slot *or* overlapping slots. The
  appointments.slot UNIQUE constraint is a second line of defence
  and IntegrityError is handled, not raised.
- Past slots are never offered or bookable.
- Patient name, phone, service and slot format are validated before any write.
- Service names are matched case-insensitively ("teeth cleaning" works).
- Timezone-aware: slot strings in the DB are clinic-local times
  ("YYYY-MM-DD HH:MM" in CLINIC_TZ, default Asia/Kolkata). "Past" is
  judged against the clinic clock, not the server clock — a server on
  UTC used to offer slots that had already passed in India, and to
  skip the first clinic day when it was already tomorrow in IST.
  created_at stamps are UTC so they are unambiguous anywhere.
- Service durations are real: a 45-minute cleaning occupies the slot
  it starts in AND the next half-hour slot, and a 60-minute root canal
  occupies two. Offering or booking the overlapping slot used to
  double-book the dentist's time, because only the starting slot was
  marked unavailable. A booking is also refused when the service would
  run past lunch or closing time (a 13:00 root canal ends at 14:00,
  inside the 13:30-14:30 lunch break).
"""
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .db import acquire_booking_lock, db, init_db

def _resolve_clinic_tz():
    """Clinic timezone from CLINIC_TZ (IANA name, default Asia/Kolkata).

    An unknown name falls back to UTC with a stderr warning instead of
    crashing the server at import.
    """
    name = (os.environ.get("CLINIC_TZ") or "Asia/Kolkata").strip() or "Asia/Kolkata"
    try:
        return ZoneInfo(name), name
    except Exception:
        print(f"[booking] WARNING: unknown CLINIC_TZ {name!r}; falling back to UTC", file=sys.stderr)
        return ZoneInfo("UTC"), "UTC"


CLINIC_TZ, CLINIC_TZ_NAME = _resolve_clinic_tz()


def clinic_tz_name():
    """IANA name of the clinic timezone, e.g. 'Asia/Kolkata'."""
    return CLINIC_TZ_NAME


def now_clinic():
    """Aware 'now' in the clinic timezone — the clock slots are judged by."""
    return datetime.now(CLINIC_TZ)


def now_utc():
    """Aware 'now' in UTC — used for created_at stamps."""
    return datetime.now(timezone.utc)


SERVICES = {
    "General checkup": {"price": 500, "minutes": 30},
    "Teeth cleaning": {"price": 1500, "minutes": 45},
    "Root canal treatment": {"price": 6000, "minutes": 60},
    "Tooth extraction": {"price": 1200, "minutes": 30},
    "Braces consultation": {"price": 800, "minutes": 30},
}

OPEN_HOURS = [(9, 13.5), (14.5, 20)]  # 9:00-13:30, 14:30-20:00 — lunch 13:30-14:30
# matches the knowledge base (docs/kb/hours.md). The old (9, 13), (14, 20)
# offered 14:00 and 14:30 appointments while the agent told callers the
# clinic was closed for lunch until 14:30.

_SLOT_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")
# Loose phone check: optional +, digits/spaces/hyphens, 7-15 digits. Demo
# numbers such as +91 00000 00000 pass; garbage such as "abc" does not.
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-]{6,18}$")


def normalise_service(service):
    """Case-insensitive service lookup; returns the canonical name or None."""
    if not service or not isinstance(service, str):
        return None
    key = service.strip().lower()
    for name in SERVICES:
        if name.lower() == key:
            return name
    return None


def parse_slot(slot):
    """Parse 'YYYY-MM-DD HH:MM' strictly; returns an aware datetime in
    the clinic timezone, or None. Slot strings are always clinic-local."""
    if not slot or not isinstance(slot, str) or not _SLOT_RE.match(slot.strip()):
        return None
    try:
        return datetime.strptime(slot.strip(), "%Y-%m-%d %H:%M").replace(tzinfo=CLINIC_TZ)
    except ValueError:
        return None


def _day_windows(day):
    """Open windows for one clinic-local date as (start, end) aware
    datetimes. Sunday is 10:00-14:00; every other day is 9:00-13:30
    and 14:30-20:00 (lunch 13:30-14:30)."""
    hours = [(10, 14)] if day.weekday() == 6 else OPEN_HOURS
    base = datetime(day.year, day.month, day.day, tzinfo=CLINIC_TZ)
    return [
        (base + timedelta(hours=h0), base + timedelta(hours=h1))
        for h0, h1 in hours
    ]


def _window_containing(slot_dt):
    """The open window a slot starts in, or None when the slot starts
    outside opening hours (e.g. during lunch)."""
    for start, end in _day_windows(slot_dt.date()):
        if start <= slot_dt < end:
            return start, end
    return None


def _overrun_reason(slot_dt, minutes):
    """Why a service starting at `slot_dt` does not fit, or None.

    A service must finish inside the window it starts in — it may not
    run into lunch or past closing time."""
    window = _window_containing(slot_dt)
    if window is None:
        return "outside our opening hours"
    _, end = window
    if slot_dt + timedelta(minutes=minutes) > end:
        if end.hour == 13 and end.minute == 30:
            return "it would run into our lunch break (1:30–2:30 PM)"
        return f"it would run past closing time ({end.strftime('%I:%M %p').lstrip('0')})"
    return None


def validate_booking(patient_name, phone, service, slot):
    """Validate a booking request. Returns (canonical_service, slot_dt, error).

    `error` is None when the request is valid; otherwise a human-readable
    message explaining what is wrong.
    """
    if not patient_name or not str(patient_name).strip():
        return None, None, "Please give the patient's name so we can book the appointment."
    if len(str(patient_name).strip()) > 100:
        return None, None, "That name looks too long — please give a shorter name."
    if not phone or not _PHONE_RE.match(str(phone).strip()):
        return None, None, "That phone number doesn't look valid — please give a number we can reach you on."
    canonical = normalise_service(service)
    if canonical is None:
        return None, None, f"Sorry, we don't offer '{service}'. Available: {', '.join(SERVICES)}."
    slot_dt = parse_slot(slot)
    if slot_dt is None:
        return None, None, f"That time ({slot}) isn't a valid slot — pick a time from the available list, e.g. YYYY-MM-DD HH:MM."
    if slot_dt < now_clinic():
        return None, None, f"That time ({slot}) is in the past — please pick a future slot."
    if slot_dt.minute not in (0, 30) or slot_dt.second:
        return None, None, f"Appointments start on the hour or half hour — {slot} isn't a valid slot."
    reason = _overrun_reason(slot_dt, SERVICES[canonical]["minutes"])
    if reason is not None and reason != "outside our opening hours":
        return None, None, (
            f"{canonical} takes {SERVICES[canonical]['minutes']} minutes, so {slot} doesn't work — "
            f"{reason}. Please pick an earlier time."
        )
    # A slot outside opening hours (e.g. 21:00, or 13:30 during lunch)
    # passes validation here: book() rejects it via the slot-row lookup
    # ("outside our hours"), which is also where the caller gets the
    # available list. Validation only judges the request itself.
    return canonical, slot_dt, None


def _booked_intervals(conn):
    """(start, end) of every booked appointment, from its service length.

    A cancelled appointment holds no time; an unknown service is treated
    as 30 minutes rather than crashing the lookup."""
    rows = conn.execute(
        "SELECT slot, service FROM appointments WHERE status='booked'"
    ).fetchall()
    intervals = []
    for r in rows:
        start = parse_slot(r["slot"])
        if start is None:
            continue
        minutes = SERVICES.get(r["service"], {}).get("minutes", 30)
        intervals.append((start, start + timedelta(minutes=minutes)))
    return intervals


def _slot_free(slot_dt, minutes, intervals):
    """True when [slot_dt, slot_dt + minutes) overlaps no booked interval."""
    end = slot_dt + timedelta(minutes=minutes)
    return not any(start < end and finish > slot_dt for start, finish in intervals)


def generate_slots(days=7, start=None):
    """Generate 30-minute slots for the next `days` days (Mon-Sat 9-20, Sun 10-14).

    `start` is the first clinic-local date (a date, or a datetime which is
    converted to the clinic timezone first); it defaults to today in the
    clinic timezone, not the server's local date.
    """
    if start is None:
        start = now_clinic().date()
    elif isinstance(start, datetime):
        start = start.astimezone(CLINIC_TZ).date()
    slots = []
    for d in range(days):
        day = start + timedelta(days=d)
        for window_start, window_end in _day_windows(day):
            t = window_start
            while t < window_end:
                slots.append(t.strftime("%Y-%m-%d %H:%M"))
                t += timedelta(minutes=30)
    return slots


def seed_slots():
    init_db()
    with db() as conn:
        for slot in generate_slots():
            conn.execute("INSERT OR IGNORE INTO slots (slot) VALUES (?)", (slot,))


def available_slots(service=None, limit=20):
    """Future, still-free slots only, earliest first. `limit` is clamped.

    `service` finally means something: it used to be accepted and
    ignored. A slot is only offered when the whole service fits in it —
    a 45-minute cleaning starting at 13:00 would run into lunch, and a
    slot starting inside an already-booked appointment (e.g. 10:30 when
    a 10:00 cleaning runs to 10:45) is not free for any service. More
    rows are fetched than `limit` so filtering never shortens the list
    below what the caller asked for while enough slots exist.
    """
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))
    minutes = None
    if service is not None:
        canonical = normalise_service(service)
        if canonical is None:
            return []
        minutes = SERVICES[canonical]["minutes"]
    # Compare against the clinic clock: a slot that already passed in
    # clinic time must not be offered even if it is still "future" on
    # a server running in another timezone (e.g. UTC).
    now = now_clinic().strftime("%Y-%m-%d %H:%M")
    with db() as conn:
        rows = conn.execute(
            "SELECT slot FROM slots WHERE available=1 AND slot > ? ORDER BY slot LIMIT 200",
            (now,),
        ).fetchall()
        intervals = _booked_intervals(conn)
    free = []
    for r in rows:
        slot_dt = parse_slot(r["slot"])
        if slot_dt is None:
            continue
        if minutes is None:
            # No service named: the slot just has to start outside every
            # booked appointment.
            if any(start <= slot_dt < finish for start, finish in intervals):
                continue
        else:
            if not _slot_free(slot_dt, minutes, intervals):
                continue
            if _overrun_reason(slot_dt, minutes) is not None:
                continue
        free.append(r["slot"])
        if len(free) >= limit:
            break
    return free


def slot_conflict(slot, service):
    """Why `slot` cannot be booked for `service`, or None when it can.

    Checks the slot row (exists, still free) and whether the service's
    full length overlaps an already-booked appointment. Pure validation
    (format, past, lunch/closing overrun) lives in validate_booking and
    is not repeated here — callers that need both run both.
    """
    slot_dt = parse_slot(slot)
    if slot_dt is None:
        return None
    minutes = SERVICES[service]["minutes"]
    with db() as conn:
        row = conn.execute("SELECT available FROM slots WHERE slot=?", (slot.strip(),)).fetchone()
        if row is None:
            return f"That time ({slot.strip()}) is outside our opening hours — pick a slot from the available list."
        if row["available"] == 0:
            return f"Sorry, {slot.strip()} is already booked. Please pick another time."
        if not _slot_free(slot_dt, minutes, _booked_intervals(conn)):
            return (
                f"Sorry, {slot.strip()} overlaps with an appointment already booked — "
                f"a {service} takes {minutes} minutes. Please pick another time."
            )
    return None


def slot_start_blocked(slot):
    """True when `slot` starts inside an already-booked appointment.

    The slot row itself is still marked available — only a booking's
    starting slot is ever flipped — so a 10:30 request during a
    10:00-10:45 cleaning looks free to a row check. The agent used to
    promise it ("10:30 is available") and only fail later, once the
    caller named a service. Every service is at least 30 minutes, so
    a covered start fits nothing.
    """
    slot_dt = parse_slot(slot)
    if slot_dt is None:
        return False
    with db() as conn:
        return any(
            start <= slot_dt < finish for start, finish in _booked_intervals(conn)
        )


def book(patient_name, phone, service, slot):
    """Book a slot. Returns (ok, message). Double-booking is rejected atomically."""
    canonical, slot_dt, error = validate_booking(patient_name, phone, service, slot)
    if error:
        return False, error
    slot = slot.strip()
    patient_name = str(patient_name).strip()
    phone = str(phone).strip()
    minutes = SERVICES[canonical]["minutes"]
    with db() as conn:
        # Serialise the overlap check + claim: without this, two
        # requests for overlapping-but-different slots arriving in the
        # same instant could both pass the check below (see
        # acquire_booking_lock). The atomic claim that follows only
        # protects the same slot, not the overlap.
        acquire_booking_lock(conn)
        row = conn.execute("SELECT available FROM slots WHERE slot=?", (slot,)).fetchone()
        if row is None:
            return False, f"That time ({slot}) is outside our hours — pick a slot from the available list."
        # A longer service occupies the slot after its start too: refuse
        # before claiming, so a 10:30 booking can never land inside a
        # 10:00 cleaning that runs to 10:45.
        if not _slot_free(slot_dt, minutes, _booked_intervals(conn)):
            return False, (
                f"Sorry, {slot} overlaps with an appointment already booked — "
                f"a {canonical} takes {minutes} minutes. Please pick another time."
            )
        # Atomic claim: only one writer can flip available 1 -> 0.
        cur = conn.execute(
            "UPDATE slots SET available=0 WHERE slot=? AND available=1", (slot,)
        )
        if cur.rowcount == 0:
            return False, f"Sorry, {slot} is already booked. Please pick another time."
        try:
            # A cancelled appointment still holds the UNIQUE(slot) row: reuse
            # it for the new booking instead of failing on the constraint.
            cur = conn.execute(
                "UPDATE appointments SET patient_name=?, phone=?, service=?, "
                "created_at=?, status='booked', confirmation_sent=0 "
                "WHERE slot=? AND status='cancelled'",
                (patient_name, phone, canonical, now_utc().isoformat(), slot),
            )
            if cur.rowcount == 0:
                conn.execute(
                    "INSERT INTO appointments (patient_name, phone, service, slot, created_at) VALUES (?,?,?,?,?)",
                    (patient_name, phone, canonical, slot, now_utc().isoformat()),
                )
        except Exception:
            # UNIQUE(slot) second line of defence: release the slot again.
            conn.execute("UPDATE slots SET available=1 WHERE slot=?", (slot,))
            return False, f"Sorry, {slot} is already booked. Please pick another time."
    return True, (
        f"Booked: {canonical} for {patient_name} on {slot} "
        f"(Rs {SERVICES[canonical]['price']}). A confirmation will be sent to {phone}."
    )


def list_appointments():
    with db() as conn:
        rows = conn.execute("SELECT * FROM appointments ORDER BY slot").fetchall()
    return [dict(r) for r in rows]


def cancel(slot, patient_name=None):
    """Cancel the booked appointment on `slot`.

    If `patient_name` is given it must match, so one caller cannot cancel
    someone else's appointment by guessing a time. Returns (ok, message).
    """
    slot_dt = parse_slot(slot)
    if slot_dt is None:
        return False, f"That time ({slot}) isn't a valid slot — please give the date and time of the appointment, e.g. YYYY-MM-DD HH:MM."
    slot = slot.strip()
    with db() as conn:
        # Same lock as book(): a cancel racing a booking on the same
        # slot could otherwise cancel the appointment that was just
        # made (its UPDATE matches any booked row on the slot).
        acquire_booking_lock(conn)
        if patient_name:
            cur = conn.execute(
                "UPDATE appointments SET status='cancelled' "
                "WHERE slot=? AND status='booked' AND lower(patient_name)=lower(?)",
                (slot, str(patient_name).strip()),
            )
        else:
            cur = conn.execute(
                "UPDATE appointments SET status='cancelled' WHERE slot=? AND status='booked'",
                (slot,),
            )
        if cur.rowcount:
            conn.execute("UPDATE slots SET available=1 WHERE slot=?", (slot,))
            return True, f"Cancelled the appointment on {slot}."
    if patient_name:
        return False, f"No booked appointment found on {slot} under that name."
    return False, f"No booked appointment found on {slot}."
