from datetime import datetime, timedelta
from statistics import mean
from typing import List, Optional

def _parse_dt(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s))
    except Exception:
        return None

def _format_date(s) -> str:
    dt = _parse_dt(s)
    return dt.strftime("%d.%m.%Y") if dt else ""

def _format_short(s) -> str:
    dt = _parse_dt(s)
    return dt.strftime("%d.%m %H:%M") if dt else ""

def _find_snapshot_at_or_before(snaps, dt) -> Optional[dict]:
    best = None
    for s in snaps:
        s_dt = _parse_dt(s["timestamp"])
        if s_dt and s_dt <= dt:
            best = s
        else:
            break
    return best

def _post_preview(p, max_len: int = 120) -> str:
    text = (p["text"] or "").strip()
    if text:
        return text.replace("\n", " ")[:max_len]
    mt = p["media_type"]
    if mt:
        return f"[{mt.capitalize()}]"
    return "[Post]"

def _series_raw(snaps) -> list:
    parsed = []
    for s in snaps:
        dt = _parse_dt(s["timestamp"])
        if not dt:
            continue
        parsed.append((dt, s["subscribers"]))

    if not parsed:
        return []

    span_sec = (parsed[-1][0] - parsed[0][0]).total_seconds()
    use_seconds = span_sec < 300

    result = []
    for dt, subs in parsed:
        label = dt.strftime("%d.%m %H:%M:%S") if use_seconds \
                else dt.strftime("%d.%m %H:%M")
        result.append({
            "date": dt.isoformat(),
            "subscribers": subs,
            "label": label,
        })
    return result

def _series_hourly(snaps) -> list:
    by_hour = {}
    for s in snaps:
        dt = _parse_dt(s["timestamp"])
        if not dt:
            continue
        key = dt.strftime("%Y-%m-%d %H")
        by_hour[key] = s["subscribers"]

    if not snaps:
        return []
    first_dt = _parse_dt(snaps[0]["timestamp"])
    last_dt = _parse_dt(snaps[-1]["timestamp"])
    if not first_dt or not last_dt:
        return []

    result = []
    last_val = None
    cursor = first_dt.replace(minute=0, second=0, microsecond=0)
    while cursor <= last_dt:
        key = cursor.strftime("%Y-%m-%d %H")
        if key in by_hour:
            last_val = by_hour[key]
        if last_val is not None:
            result.append({
                "date": cursor.isoformat(),
                "subscribers": last_val,
                "label": cursor.strftime("%d.%m %H:%M"),
            })
        cursor += timedelta(hours=1)
    return result

def _series_daily(snaps, days: int) -> list:
    by_day = {}
    for s in snaps:
        dt = _parse_dt(s["timestamp"])
        if not dt:
            continue
        key = dt.strftime("%Y-%m-%d")
        by_day[key] = s["subscribers"]

    if not snaps:
        return []
    first_dt = _parse_dt(snaps[0]["timestamp"])
    last_dt = _parse_dt(snaps[-1]["timestamp"])
    if not first_dt or not last_dt:
        return []

    if days and days > 0:
        cursor = (datetime.utcnow() - timedelta(days=days)).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
    else:
        cursor = first_dt.replace(hour=0, minute=0, second=0, microsecond=0)

    end = last_dt

    result = []
    last_val = None
    while cursor <= end:
        key = cursor.strftime("%Y-%m-%d")
        if key in by_day:
            last_val = by_day[key]
        if last_val is not None:
            result.append({
                "date": cursor.isoformat(),
                "subscribers": last_val,
                "label": cursor.strftime("%d.%m"),
            })
        cursor += timedelta(days=1)
    return result

def _build_growth_series(snaps, days: int) -> list:
    if not snaps:
        return []

    first_dt = _parse_dt(snaps[0]["timestamp"])
    last_dt = _parse_dt(snaps[-1]["timestamp"])
    if not first_dt or not last_dt:
        return []

    span_hours = (last_dt - first_dt).total_seconds() / 3600

    if len(snaps) <= 20 or span_hours < 6:
        return _series_raw(snaps)
    if span_hours < 24 * 7:
        return _series_hourly(snaps)
    return _series_daily(snaps, days)

def _build_heatmap(posts) -> dict:
    buckets = {}
    for p in posts:
        dt = _parse_dt(p["date"])
        if not dt:
            continue
        key = (dt.weekday(), dt.hour)
        buckets.setdefault(key, []).append(p["views"])

    matrix = [[0] * 24 for _ in range(7)]
    for (wd, hr), views in buckets.items():
        matrix[wd][hr] = round(mean(views), 1)

    best = {"weekday": 0, "hour": 0, "avg": 0}
    for wd in range(7):
        for hr in range(24):
            if matrix[wd][hr] > best["avg"]:
                best = {"weekday": wd, "hour": hr, "avg": matrix[wd][hr]}
    return {"matrix": matrix, "best": best}

def _build_content_mix(posts, subscribers: int = 0) -> list:
    groups = {}
    for p in posts:
        t = p["media_type"] or "text"
        g = groups.setdefault(t, {"views": [], "count": 0})
        g["views"].append(p["views"])
        g["count"] += 1

    result = []
    for t, data in groups.items():
        avg = round(mean(data["views"]), 1) if data["views"] else 0
        er = round(avg / subscribers * 100, 2) if subscribers else 0
        result.append({
            "type": t,
            "count": data["count"],
            "avg_views": avg,
            "er": er,
        })
    result.sort(key=lambda x: x["count"], reverse=True)
    return result

def compute_dashboard(db, channel_id: int, days: int = 30) -> dict:
    channel = db.get_channel(channel_id)
    if not channel:
        return {}

    now = datetime.utcnow()

    posts_period = db.posts_since(channel_id, days)
    snaps_period = db.snapshots_since(channel_id, days)

    if days and days > 0:
        snaps_wide = db.snapshots_since(channel_id, max(days * 2, 90))
        cutoff = now - timedelta(days=days)
    else:
        snaps_wide = snaps_period
        cutoff = None

    latest_snap = snaps_period[-1] if snaps_period else None
    subscribers_now = latest_snap["subscribers"] if latest_snap else 0

    change_period = None
    if snaps_wide:
        if cutoff:
            start_snap = _find_snapshot_at_or_before(snaps_wide, cutoff)
            if start_snap:
                change_period = subscribers_now - start_snap["subscribers"]
        if change_period is None and len(snaps_wide) >= 2:
            change_period = subscribers_now - snaps_wide[0]["subscribers"]

    avg_views = round(mean([p["views"] for p in posts_period]), 1) \
        if posts_period else 0.0
    er = round(avg_views / subscribers_now * 100, 2) if subscribers_now else 0.0

    growth_series = _build_growth_series(snaps_period, days=days)

    recent = posts_period[-20:] if len(posts_period) > 20 else posts_period
    recent_views = [
        {
            "id": p["tg_msg_id"],
            "date": _format_short(p["date"]),
            "views": p["views"],
            "text": (p["text"] or "").replace("\n", " ")[:80],
        }
        for p in recent
    ]

    top10 = sorted(posts_period, key=lambda p: p["views"], reverse=True)[:10]
    top_posts = [
        {
            "id": p["tg_msg_id"],
            "date": _format_date(p["date"]),
            "views": p["views"],
            "reactions": p["reactions"],
            "forwards": p["forwards"],
            "text": _post_preview(p, max_len=120),
        }
        for p in top10
    ]

    heatmap = _build_heatmap(posts_period)
    content_mix = _build_content_mix(posts_period,
                                      subscribers=subscribers_now)

    return {
        "channel": {
            "id": channel_id,
            "tg_id": channel["tg_id"],
            "title": channel["title"],
            "username": channel["username"] or "",
        },
        "period_days": days,
        "stats": {
            "subscribers": subscribers_now,
            "change_period": change_period,
            "avg_views": avg_views,
            "er": er,
            "posts_count": len(posts_period),
            "snapshots_count": len(snaps_period),
        },
        "growth_series": growth_series,
        "recent_views": recent_views,
        "heatmap": heatmap,
        "top_posts": top_posts,
        "content_mix": content_mix,
    }

def compare_channels(db, channel_ids: list, days: int = 30) -> dict:
    channels_data = []
    for cid in channel_ids:
        d = compute_dashboard(db, cid, days)
        if not d:
            continue
        channels_data.append({
            "id": cid,
            "channel": d["channel"],
            "stats": d["stats"],
            "growth_series": d["growth_series"],
        })
    return {
        "channels": channels_data,
        "period_days": days,
    }
