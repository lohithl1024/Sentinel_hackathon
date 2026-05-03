from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import random
import bcrypt
import jwt
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from sklearn.ensemble import IsolationForest

from ai_proxy import (
    score_response, mask_pii, call_llm, aggregate_risk, risk_level_v2,
)
from ai_routes import register_ai_routes

# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
ACCESS_TTL_MIN = 60 * 24

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="UEBA Login Security API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
log = logging.getLogger("ueba")

# ---------- Role config ----------
Role = Literal["ceo", "security_team", "team_lead", "employee", "customer"]
Shift = Literal["day", "night"]

ROLE_HOURS = {
    ("ceo", "day"): (8, 20),
    ("team_lead", "day"): (8, 19),
    ("employee", "day"): (9, 18),
    ("employee", "night"): (22, 6),
    ("security_team", "day"): None,
    ("security_team", "night"): None,
    ("customer", "day"): None,   # external users — no expected window
    ("customer", "night"): None,
}

def in_role_window(hour: int, role: str, shift: str) -> bool:
    win = ROLE_HOURS.get((role, shift), ROLE_HOURS.get((role, "day")))
    if win is None:
        return True
    lo, hi = win
    if lo <= hi:
        return lo <= hour < hi
    return hour >= lo or hour < hi

# ---------- Password & JWT ----------
def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email,
         "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )

async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def require_security_team(user: dict):
    if user.get("role") != "security_team":
        raise HTTPException(403, "Security team role required")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None
    role: Optional[Role] = "employee"
    shift: Optional[Shift] = "day"

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    ip_address: Optional[str] = None
    geo_location: Optional[str] = None
    device_type: Optional[Literal["mobile", "laptop", "desktop"]] = None
    session_duration: Optional[float] = None
    data_usage: Optional[float] = None
    request_count: Optional[int] = None
    simulate: Optional[List[Literal[
        "night_login", "new_location", "new_device", "brute_force", "high_traffic", "role_mismatch"
    ]]] = None

class SimulateIn(BaseModel):
    email: EmailStr
    scenario: Literal[
        "night_login", "new_location", "new_device", "brute_force",
        "high_traffic", "role_mismatch", "normal"
    ]

class OTPVerifyIn(BaseModel):
    event_id: str
    otp: str

class ApprovalDecisionIn(BaseModel):
    note: Optional[str] = None

# ---------- ML ----------
IF_MODEL: Optional[IsolationForest] = None
IF_SCORE_MIN = -0.25
IF_SCORE_MAX = 0.20

def train_model():
    global IF_MODEL, IF_SCORE_MIN, IF_SCORE_MAX
    rng = np.random.default_rng(42)
    n = 1000
    hour = rng.normal(9.5, 1.2, n).clip(6, 18)
    failed = rng.poisson(0.3, n).clip(0, 2)
    sess = rng.normal(35, 10, n).clip(5, 90)
    usage = rng.normal(120, 30, n).clip(20, 300)
    req = rng.normal(45, 12, n).clip(10, 120)
    X = np.column_stack([hour, failed, sess, usage, req])
    model = IsolationForest(contamination=0.05, n_estimators=150, random_state=42)
    model.fit(X)
    scores = model.score_samples(X)
    IF_MODEL = model
    IF_SCORE_MIN = float(scores.min())
    IF_SCORE_MAX = float(scores.max())
    log.info(f"IsolationForest trained. score range=[{IF_SCORE_MIN:.3f},{IF_SCORE_MAX:.3f}]")

def score_event(features: dict) -> tuple[float, int]:
    x = np.array([[features["login_hour"], features["failed_attempts"],
                   features["session_duration"], features["data_usage"],
                   features["request_count"]]])
    raw = float(IF_MODEL.score_samples(x)[0])
    label = int(IF_MODEL.predict(x)[0])
    denom = (IF_SCORE_MAX - IF_SCORE_MIN) or 1.0
    norm = max(0.0, min(1.0, (raw - IF_SCORE_MIN) / denom))
    return norm, label

# ---------- Features + risk + explanation ----------
def build_features(user: dict, inp: LoginIn, sim_flags: set) -> dict:
    now = datetime.now(timezone.utc)
    hour = now.hour
    device = inp.device_type or user.get("baseline_device", "laptop")
    location = inp.geo_location or user.get("baseline_location", "Bangalore, IN")
    ip = inp.ip_address or "103.22.200." + str(random.randint(10, 250))
    sess = inp.session_duration if inp.session_duration is not None else 30.0
    usage = inp.data_usage if inp.data_usage is not None else 110.0
    req = inp.request_count if inp.request_count is not None else 40

    if "night_login" in sim_flags:
        hour = 3
    if "role_mismatch" in sim_flags:
        hour = 2
    if "new_location" in sim_flags:
        location = "Moscow, RU"
        ip = "185.220.101." + str(random.randint(1, 250))
    if "new_device" in sim_flags:
        device = "desktop" if device != "desktop" else "mobile"
    if "high_traffic" in sim_flags:
        usage = 950.0
        req = 280
        sess = 1.5

    baseline_loc = user.get("baseline_location", "Bangalore, IN")
    baseline_dev = user.get("baseline_device", "laptop")
    role = user.get("role", "employee")
    shift = user.get("shift", "day")
    role_ok = in_role_window(hour, role, shift)

    return {
        "login_hour": hour,
        "ip_address": ip,
        "geo_location": location,
        "device_type": device,
        "session_duration": float(sess),
        "data_usage": float(usage),
        "request_count": int(req),
        "failed_attempts": 0,
        "night_login": 1 if (hour < 6 or hour >= 23) else 0,
        "location_change": 0 if location == baseline_loc else 1,
        "device_change": 0 if device == baseline_dev else 1,
        "is_new_location": 0 if location == baseline_loc else 1,
        "is_new_device": 0 if device == baseline_dev else 1,
        "role": role,
        "shift": shift,
        "role_time_mismatch": 0 if role_ok else 1,
    }

def compute_risk(anomaly_norm: float, f: dict) -> int:
    base = (1 - anomaly_norm) * 50
    risk = (base
            + f["failed_attempts"] * 5
            + f["night_login"] * 15
            + f["location_change"] * 20
            + f["device_change"] * 15
            + f.get("role_time_mismatch", 0) * 25)
    return int(max(0, min(100, round(risk))))

def risk_level(score: int) -> str:
    if score <= 40:
        return "LOW"
    if score <= 70:
        return "MEDIUM"
    return "HIGH"

def explain(f: dict, sim_flags: set) -> List[str]:
    reasons = []
    if f.get("role_time_mismatch"):
        shift = f.get("shift", "day")
        role = f.get("role", "employee")
        reasons.append(f"Login outside expected working hours for {role.replace('_', ' ')} ({shift} shift)")
    if f["night_login"] and not f.get("role_time_mismatch"):
        reasons.append("Login at unusual hour (outside 06:00–23:00)")
    if f["location_change"]:
        reasons.append(f"New geographic location detected: {f['geo_location']}")
    if f["device_change"]:
        reasons.append(f"Unknown device used: {f['device_type']}")
    if f["failed_attempts"] >= 3:
        reasons.append(f"{f['failed_attempts']} failed login attempts")
    if "high_traffic" in sim_flags or f["data_usage"] > 500 or f["request_count"] > 200:
        reasons.append("Abnormal traffic/session pattern")
    if not reasons:
        reasons.append("Behavior consistent with baseline profile")
    return reasons

def decide(score: int) -> str:
    lvl = risk_level(score)
    if lvl == "LOW":
        return "ALLOW"
    if lvl == "MEDIUM":
        return "REQUIRE_OTP"
    return "REQUIRE_APPROVAL"

# ---------- Helpers ----------
async def count_failed_attempts(email: str, window_min: int = 15) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_min)
    return await db.login_attempts.count_documents({
        "email": email, "success": False, "ts": {"$gte": cutoff}
    })

async def record_attempt(email: str, success: bool):
    await db.login_attempts.insert_one({
        "email": email, "success": success, "ts": datetime.now(timezone.utc)
    })

# ---------- Auth Endpoints ----------
@api.post("/auth/register")
async def register(inp: RegisterIn):
    email = inp.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid, "email": email, "name": inp.name or email.split("@")[0],
        "password_hash": hash_pw(inp.password),
        "role": inp.role or "employee",
        "shift": inp.shift or "day",
        "baseline_hour": 9, "baseline_location": "Bangalore, IN",
        "baseline_device": "mobile", "baseline_session": 30.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_token(uid, email)
    return {"token": token, "user": {"id": uid, "email": email, "name": user["name"],
                                     "role": user["role"], "shift": user["shift"]}}

@api.post("/auth/login")
async def login(inp: LoginIn):
    email = inp.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        await record_attempt(email, False)
        raise HTTPException(401, "Invalid credentials")

    sim_flags = set(inp.simulate or [])
    pre_failed = await count_failed_attempts(email)
    if "brute_force" in sim_flags:
        pre_failed = max(pre_failed, 5)

    pw_ok = verify_pw(inp.password, user["password_hash"])
    await record_attempt(email, pw_ok)
    if not pw_ok:
        raise HTTPException(401, "Invalid credentials")

    feats = build_features(user, inp, sim_flags)
    feats["failed_attempts"] = pre_failed
    anomaly_norm, label = score_event(feats)
    score = compute_risk(anomaly_norm, feats)
    if "brute_force" in sim_flags and score < 71:
        score = max(score, 75)
    level = risk_level(score)
    reasons = explain(feats, sim_flags)
    action = decide(score)

    event_id = str(uuid.uuid4())
    event = {
        "event_id": event_id, "user_id": user["id"], "email": email,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "features": feats, "anomaly_score": round(anomaly_norm, 4),
        "anomaly_label": int(label), "risk_score": score, "risk_level": level,
        "explanation": reasons, "action": action,
        "role": feats["role"], "shift": feats["shift"],
        "login_status": "SUCCESS" if action == "ALLOW" else (
            "AWAITING_APPROVAL" if action == "REQUIRE_APPROVAL" else "PENDING_OTP"),
    }
    await db.logs.insert_one(event)

    if level == "HIGH":
        await db.alerts.insert_one({
            "alert_id": str(uuid.uuid4()), "event_id": event_id, "user_id": user["id"],
            "email": email, "reason": reasons, "risk_score": score,
            "role": feats["role"], "timestamp": event["timestamp"],
        })

    response = {
        "event_id": event_id, "user_id": user["id"],
        "login_status": event["login_status"],
        "anomaly_score": event["anomaly_score"],
        "risk_score": score, "risk_level": level,
        "explanation": reasons, "action": action,
        "features": feats,
        "role": feats["role"], "shift": feats["shift"],
    }

    if action == "ALLOW":
        response["token"] = make_token(user["id"], email)
        response["user"] = {"id": user["id"], "email": email, "name": user.get("name"),
                            "role": feats["role"], "shift": feats["shift"]}
    elif action == "REQUIRE_OTP":
        otp = f"{random.randint(100000, 999999)}"
        await db.otp_challenges.insert_one({
            "event_id": event_id, "user_id": user["id"], "email": email,
            "otp": otp, "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
            "used": False,
        })
        response["otp_challenge"] = {"event_id": event_id, "demo_otp": otp}
    else:
        req_id = str(uuid.uuid4())
        await db.approval_requests.insert_one({
            "request_id": req_id, "event_id": event_id,
            "user_id": user["id"], "email": email, "name": user.get("name"),
            "role": feats["role"], "shift": feats["shift"],
            "risk_score": score, "anomaly_score": round(anomaly_norm, 4),
            "reason": reasons, "features": feats,
            "status": "pending", "reviewed_by": None, "review_note": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_at": None,
        })
        response["approval_request"] = {"request_id": req_id, "status": "pending"}
    return response

@api.post("/auth/verify-otp")
async def verify_otp(inp: OTPVerifyIn):
    ch = await db.otp_challenges.find_one({"event_id": inp.event_id, "used": False})
    if not ch:
        raise HTTPException(400, "Invalid or used challenge")
    exp = ch["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "OTP expired")
    if ch["otp"] != inp.otp:
        raise HTTPException(400, "Incorrect OTP")
    await db.otp_challenges.update_one({"event_id": inp.event_id}, {"$set": {"used": True}})
    token = make_token(ch["user_id"], ch["email"])
    user = await db.users.find_one({"id": ch["user_id"]}, {"_id": 0, "password_hash": 0})
    await db.logs.update_one({"event_id": inp.event_id}, {"$set": {"login_status": "SUCCESS_AFTER_OTP"}})
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user.get("name"),
                                     "role": user.get("role"), "shift": user.get("shift")}}

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

# ---------- UEBA Data Endpoints ----------
@api.get("/logs")
async def list_logs(limit: int = 100, user=Depends(current_user)):
    rows = await db.logs.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return rows

@api.get("/logs/all")
async def list_all_logs(limit: int = 200, user=Depends(current_user)):
    rows = await db.logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return rows

@api.get("/alerts")
async def list_alerts(limit: int = 100, user=Depends(current_user)):
    rows = await db.alerts.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return rows

@api.get("/analytics")
async def analytics(user=Depends(current_user)):
    logs = await db.logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(500)
    by_hour = [0] * 24
    risk_trend: List[dict] = []
    device_count = {"mobile": 0, "laptop": 0, "desktop": 0}
    level_count = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    role_count: dict = {}
    for ev in reversed(logs):
        f = ev.get("features", {})
        h = f.get("login_hour", 0)
        if 0 <= h < 24:
            by_hour[h] += 1
        d = f.get("device_type")
        if d in device_count:
            device_count[d] += 1
        lvl = ev.get("risk_level", "LOW")
        if lvl in level_count:
            level_count[lvl] += 1
        r = f.get("role", ev.get("role", "unknown"))
        role_count[r] = role_count.get(r, 0) + 1
        risk_trend.append({"t": ev["timestamp"], "risk": ev["risk_score"]})
    return {
        "total_events": len(logs),
        "login_hour_distribution": by_hour,
        "risk_trend": risk_trend[-30:],
        "device_distribution": device_count,
        "level_distribution": level_count,
        "role_distribution": role_count,
    }

@api.post("/simulate")
async def simulate(inp: SimulateIn, user=Depends(current_user)):
    target = await db.users.find_one({"email": inp.email.lower()})
    if not target:
        raise HTTPException(404, "User not found")
    sim_flags = set() if inp.scenario == "normal" else {inp.scenario}
    pre_failed = 5 if inp.scenario == "brute_force" else 0
    dummy = LoginIn(email=inp.email, password="__sim__")
    feats = build_features(target, dummy, sim_flags)
    feats["failed_attempts"] = pre_failed
    anomaly_norm, label = score_event(feats)
    score = compute_risk(anomaly_norm, feats)
    if inp.scenario == "brute_force" and score < 71:
        score = max(score, 78)
    level = risk_level(score)
    reasons = explain(feats, sim_flags)
    action = decide(score)
    event_id = str(uuid.uuid4())
    event = {
        "event_id": event_id, "user_id": target["id"], "email": target["email"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "features": feats, "anomaly_score": round(anomaly_norm, 4),
        "anomaly_label": int(label), "risk_score": score, "risk_level": level,
        "explanation": reasons, "action": action,
        "role": feats["role"], "shift": feats["shift"],
        "login_status": "SIMULATED" if action != "REQUIRE_APPROVAL" else "AWAITING_APPROVAL_SIM",
        "simulated": True, "scenario": inp.scenario,
    }
    await db.logs.insert_one(event)
    event.pop("_id", None)
    if level == "HIGH":
        await db.alerts.insert_one({
            "alert_id": str(uuid.uuid4()), "event_id": event_id, "user_id": target["id"],
            "email": target["email"], "reason": reasons, "risk_score": score,
            "role": feats["role"], "timestamp": event["timestamp"], "simulated": True,
        })
        await db.approval_requests.insert_one({
            "request_id": str(uuid.uuid4()), "event_id": event_id,
            "user_id": target["id"], "email": target["email"], "name": target.get("name"),
            "role": feats["role"], "shift": feats["shift"],
            "risk_score": score, "anomaly_score": round(anomaly_norm, 4),
            "reason": reasons, "features": feats,
            "status": "pending", "reviewed_by": None, "review_note": None,
            "created_at": event["timestamp"], "reviewed_at": None,
            "simulated": True,
        })
    return event

@api.get("/demo-users")
async def list_demo_users():
    users = await db.users.find({"demo": True}, {"_id": 0, "password_hash": 0}).to_list(10)
    return users

# ---------- Approval Endpoints ----------
@api.get("/approvals/pending")
async def pending_approvals(user=Depends(current_user)):
    require_security_team(user)
    rows = await db.approval_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return rows

@api.get("/approvals/all")
async def all_approvals(user=Depends(current_user)):
    require_security_team(user)
    rows = await db.approval_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows

@api.get("/approvals/status/{request_id}")
async def approval_status(request_id: str):
    r = await db.approval_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found")
    base = {
        "request_id": r["request_id"],
        "status": r["status"],
        "request_kind": r.get("request_kind", "login"),
        "risk_score": r["risk_score"],
        "reason": r["reason"],
        "role": r.get("role"),
        "reviewed_by": r.get("reviewed_by"),
        "reviewed_at": r.get("reviewed_at"),
        "review_note": r.get("review_note"),
    }
    if r.get("request_kind") == "ai_prompt":
        base.update({
            "ai_prompt_redacted": r.get("ai_prompt_redacted"),
            "ai_response_redacted": r.get("ai_response_redacted"),
            "ai_response_pii_count": r.get("ai_response_pii_count"),
            "ai_tokens_used": r.get("ai_tokens_used"),
        })
        return base
    # login flow
    base.update({
        "token": r.get("issued_token"),
        "user": {"id": r["user_id"], "email": r["email"], "name": r.get("name"), "role": r.get("role")}
            if r["status"] == "approved" else None,
    })
    return base

@api.post("/approvals/{request_id}/approve")
async def approve(request_id: str, inp: ApprovalDecisionIn, user=Depends(current_user)):
    require_security_team(user)
    r = await db.approval_requests.find_one({"request_id": request_id})
    if not r:
        raise HTTPException(404, "Request not found")
    if r["status"] != "pending":
        raise HTTPException(400, f"Request already {r['status']}")

    update_payload = {
        "status": "approved",
        "reviewed_by": {"id": user["id"], "email": user["email"], "name": user.get("name")},
        "review_note": inp.note,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }

    if r.get("request_kind") == "ai_prompt":
        # Officer authorized this prompt — run it through the LLM now,
        # apply response filter, store redacted response in the approval doc
        # so the user's awaiting screen can fetch and display it.
        prompt_text = r.get("ai_prompt_clear", "")
        conv = r.get("conversation_id") or f"approved-{request_id}"
        try:
            text, tokens = await call_llm(conv, prompt_text)
        except Exception as e:
            text = f"[AI execution failed after approval: {type(e).__name__}]"
            tokens = 0
        r_risk, r_reasons, r_pii, r_masked = score_response(text)

        # Save a follow-up AI event so it shows up in audit logs
        try:
            await db.ai_events.insert_one({
                "event_id": str(uuid.uuid4()),
                "kind": "ai_chat_post_approval",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": r["user_id"],
                "email": r["email"],
                "name": r.get("name"),
                "role": r.get("role"),
                "conversation_id": conv,
                "prompt_redacted": r.get("ai_prompt_redacted"),
                "response_redacted": r_masked,
                "response_pii_count": r_pii,
                "response_risk": r_risk,
                "response_reasons": r_reasons,
                "tokens_used": tokens,
                "risk_score": aggregate_risk(r["risk_score"], 0, r_risk, 0),
                "risk_level": risk_level_v2(aggregate_risk(r["risk_score"], 0, r_risk, 0)),
                "action": "ALLOWED_AFTER_APPROVAL",
                "explanation": ["Officer approved CRITICAL prompt"] + r_reasons,
                "approval_request_id": request_id,
            })
        except Exception as e:
            log.warning(f"Failed to write post-approval ai_event: {e}")

        update_payload.update({
            "ai_response_redacted": r_masked,
            "ai_response_pii_count": r_pii,
            "ai_response_reasons": r_reasons,
            "ai_tokens_used": tokens,
        })
        # Strip the cleartext prompt now that the request is resolved
        update_payload["ai_prompt_clear"] = None

        await db.approval_requests.update_one({"request_id": request_id}, {"$set": update_payload})
        return {"request_id": request_id, "status": "approved", "kind": "ai_prompt"}

    # Default: login approval (v1 flow)
    token = make_token(r["user_id"], r["email"])
    update_payload["issued_token"] = token
    await db.approval_requests.update_one({"request_id": request_id}, {"$set": update_payload})
    await db.logs.update_one({"event_id": r["event_id"]}, {"$set": {"login_status": "APPROVED"}})
    return {"request_id": request_id, "status": "approved"}

@api.post("/approvals/{request_id}/reject")
async def reject(request_id: str, inp: ApprovalDecisionIn, user=Depends(current_user)):
    require_security_team(user)
    r = await db.approval_requests.find_one({"request_id": request_id})
    if not r:
        raise HTTPException(404, "Request not found")
    if r["status"] != "pending":
        raise HTTPException(400, f"Request already {r['status']}")
    await db.approval_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "rejected",
            "reviewed_by": {"id": user["id"], "email": user["email"], "name": user.get("name")},
            "review_note": inp.note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    await db.logs.update_one({"event_id": r["event_id"]}, {"$set": {"login_status": "REJECTED"}})
    return {"request_id": request_id, "status": "rejected"}

@api.get("/role-config")
async def role_config():
    out = {}
    for (role, shift), win in ROLE_HOURS.items():
        out.setdefault(role, {})[shift] = {"start": None if win is None else win[0],
                                           "end": None if win is None else win[1]}
    return out

# ---------- Continuous Monitoring ----------
RECENT_FILE_POOL = [
    "/home/reports/q4-financials.xlsx",
    "/home/reports/client-pipeline.pdf",
    "/share/legal/contracts-2025.docx",
    "/share/hr/payroll-nov.csv",
    "/dev/src/server.py",
    "/dev/src/auth.tsx",
    "/share/exec/board-minutes.md",
    "/share/security/incident-log.txt",
    "/home/notes/standup.md",
    "/home/downloads/dataset.zip",
    "/share/marketing/campaign-q1.pptx",
    "/share/finance/balance-sheet.xlsx",
]

def _synth_session_for(user: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "user_id": user["id"],
        "email": user["email"],
        "name": user.get("name"),
        "role": user.get("role"),
        "shift": user.get("shift"),
        "session_id": str(uuid.uuid4()),
        "start_time": now - timedelta(minutes=random.randint(3, 120)),
        "location": user.get("baseline_location", "Bangalore, IN"),
        "device": user.get("baseline_device", "laptop"),
        "ip_address": "103.22.200." + str(random.randint(10, 250)),
        "data_mb_base": round(random.uniform(15.0, 90.0), 2),
        "data_mb_per_min": round(random.uniform(0.4, 3.5), 2),
        "file_ops": {
            "reads": random.randint(4, 40),
            "writes": random.randint(0, 18),
            "deletes": random.randint(0, 3),
        },
        "recent_files": random.sample(RECENT_FILE_POOL, k=4),
        "location_history": [
            {"location": user.get("baseline_location", "Bangalore, IN"),
             "t": (now - timedelta(minutes=random.randint(3, 120))).isoformat()},
        ],
        "updated_at": now,
    }

async def ensure_sessions():
    users = await db.users.find({"demo": True}).to_list(20)
    for u in users:
        if not await db.active_sessions.find_one({"user_id": u["id"]}):
            await db.active_sessions.insert_one(_synth_session_for(u))

def _live_view(sess: dict) -> dict:
    start = sess["start_time"]
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    mins = max(0.0, (datetime.now(timezone.utc) - start).total_seconds() / 60.0)
    data_mb = round(sess["data_mb_base"] + sess["data_mb_per_min"] * mins, 1)
    fops = sess["file_ops"]
    total_ops = fops["reads"] + fops["writes"] + fops["deletes"]
    return {
        "user_id": sess["user_id"],
        "email": sess["email"],
        "name": sess.get("name"),
        "role": sess.get("role"),
        "shift": sess.get("shift"),
        "session_id": sess["session_id"],
        "session_duration_min": round(mins, 1),
        "data_accessed_mb": data_mb,
        "file_operations": fops,
        "file_operations_total": total_ops,
        "location": sess["location"],
        "device": sess["device"],
        "ip_address": sess["ip_address"],
        "recent_files": sess["recent_files"],
        "location_history": sess.get("location_history", []),
        "started_at": start.isoformat(),
    }

@api.get("/monitoring/users")
async def monitoring_users(user=Depends(current_user)):
    require_security_team(user)
    await ensure_sessions()
    rows = await db.active_sessions.find({}, {"_id": 0}).to_list(50)
    return [_live_view(r) for r in rows]

@api.get("/monitoring/users/{user_id}")
async def monitoring_user_detail(user_id: str, user=Depends(current_user)):
    require_security_team(user)
    s = await db.active_sessions.find_one({"user_id": user_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    base = _live_view(s)
    logs = await db.logs.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(10)
    base["recent_events"] = logs
    return base

@api.post("/monitoring/refresh")
async def monitoring_refresh(user=Depends(current_user)):
    require_security_team(user)
    sessions = await db.active_sessions.find({}).to_list(50)
    now = datetime.now(timezone.utc)
    possible_locations = ["Bangalore, IN", "Mumbai, IN", "Delhi, IN", "Singapore, SG", "London, UK", "Frankfurt, DE"]
    for s in sessions:
        new_ops = {
            "reads": s["file_ops"]["reads"] + random.randint(0, 4),
            "writes": s["file_ops"]["writes"] + random.randint(0, 2),
            "deletes": s["file_ops"]["deletes"] + (1 if random.random() < 0.15 else 0),
        }
        new_files = random.sample(RECENT_FILE_POOL, k=4)
        update = {
            "file_ops": new_ops,
            "recent_files": new_files,
            "updated_at": now,
        }
        if random.random() < 0.20:
            new_loc = random.choice([l for l in possible_locations if l != s["location"]])
            update["location"] = new_loc
            hist = s.get("location_history", [])
            hist.append({"location": new_loc, "t": now.isoformat()})
            update["location_history"] = hist[-8:]
        await db.active_sessions.update_one({"_id": s["_id"]}, {"$set": update})
    await ensure_sessions()
    rows = await db.active_sessions.find({}, {"_id": 0}).to_list(50)
    return [_live_view(r) for r in rows]

@api.get("/")
async def root():
    return {"service": "UEBA Login Security", "status": "ok"}

# ---------- AI Token Monitoring for Security Team ----------
@api.get("/ai/token-usage")
async def get_token_usage(user=Depends(current_user)):
    """Get token usage stats for all users - security_team only"""
    require_security_team(user)

    now = datetime.now(timezone.utc)
    last_hour_cutoff = (now - timedelta(hours=1)).isoformat()
    last_10min_cutoff = (now - timedelta(minutes=10)).isoformat()

    pipeline = [
        {"$group": {
            "_id": "$user_id",
            "email": {"$first": "$email"},
            "name": {"$first": "$name"},
            "role": {"$first": "$role"},
            "total_tokens": {"$sum": "$tokens_used"},
            "request_count": {"$sum": 1},
            "avg_risk": {"$avg": "$risk_score"},
            "high_risk_count": {"$sum": {"$cond": [{"$gte": ["$risk_score", 61]}, 1, 0]}},
            "blocked_count": {"$sum": {"$cond": ["$blocked_at_input", 1, 0]}},
            "last_activity": {"$max": "$timestamp"}
        }},
        {"$sort": {"total_tokens": -1}}
    ]

    hourly_pipeline = [
        {"$match": {"timestamp": {"$gte": last_hour_cutoff}}},
        {"$group": {
            "_id": "$user_id",
            "tokens_last_hour": {"$sum": "$tokens_used"},
            "req_last_hour": {"$sum": 1},
        }}
    ]

    recent_pipeline = [
        {"$match": {"timestamp": {"$gte": last_10min_cutoff}}},
        {"$group": {
            "_id": "$user_id",
            "tokens_last_10min": {"$sum": "$tokens_used"},
            "req_last_10min": {"$sum": 1},
            "high_risk_last_10min": {"$sum": {"$cond": [{"$gte": ["$risk_score", 61]}, 1, 0]}},
        }}
    ]

    results = await db.ai_events.aggregate(pipeline).to_list(100)
    hourly_rows = await db.ai_events.aggregate(hourly_pipeline).to_list(100)
    recent_rows = await db.ai_events.aggregate(recent_pipeline).to_list(100)

    hourly_map = {row["_id"]: row for row in hourly_rows}
    recent_map = {row["_id"]: row for row in recent_rows}
    blocked_users = await db.blocked_ai_users.find({}, {"_id": 0}).to_list(100)
    blocked_ids = {b["user_id"] for b in blocked_users}

    blended_cost_per_1k = 0.004
    user_rows = []
    for r in results:
        user_id = r.pop("_id")
        recent = recent_map.get(user_id, {})
        hourly = hourly_map.get(user_id, {})

        total_tokens = int(r.get("total_tokens") or 0)
        request_count = int(r.get("request_count") or 0)
        avg_risk = round(r.get("avg_risk") or 0, 1)
        tokens_last_hour = int(hourly.get("tokens_last_hour") or 0)
        req_last_hour = int(hourly.get("req_last_hour") or 0)
        tokens_last_10min = int(recent.get("tokens_last_10min") or 0)
        req_last_10min = int(recent.get("req_last_10min") or 0)
        high_risk_last_10min = int(recent.get("high_risk_last_10min") or 0)
        avg_tokens_per_request = int(round(total_tokens / request_count)) if request_count else 0
        projected_hourly_tokens = tokens_last_10min * 6
        estimated_cost = round((total_tokens / 1000) * blended_cost_per_1k, 2)
        projected_hourly_cost = round((projected_hourly_tokens / 1000) * blended_cost_per_1k, 2)

        pressure_score = 0
        if tokens_last_10min > 12000:
            pressure_score += 40
        elif tokens_last_10min > 6000:
            pressure_score += 22
        if req_last_10min > 30:
            pressure_score += 30
        elif req_last_10min > 15:
            pressure_score += 15
        if avg_tokens_per_request > 2500:
            pressure_score += 20
        elif avg_tokens_per_request > 1200:
            pressure_score += 10
        if high_risk_last_10min > 0:
            pressure_score += min(20, high_risk_last_10min * 5)
        if avg_risk >= 70:
            pressure_score += 15
        pressure_score = min(100, pressure_score)

        if pressure_score >= 70 or projected_hourly_cost >= 2.0:
            recommendation = "BLOCK_OR_REVIEW"
        elif pressure_score >= 40 or projected_hourly_cost >= 0.75:
            recommendation = "RATE_LIMIT_AND_MONITOR"
        else:
            recommendation = "ALLOW_AND_WATCH"

        user_rows.append({
            **r,
            "user_id": user_id,
            "is_blocked": user_id in blocked_ids,
            "avg_risk": avg_risk,
            "tokens_last_hour": tokens_last_hour,
            "req_last_hour": req_last_hour,
            "tokens_last_10min": tokens_last_10min,
            "req_last_10min": req_last_10min,
            "high_risk_last_10min": high_risk_last_10min,
            "avg_tokens_per_request": avg_tokens_per_request,
            "estimated_cost": estimated_cost,
            "projected_hourly_tokens": projected_hourly_tokens,
            "projected_hourly_cost": projected_hourly_cost,
            "pressure_score": pressure_score,
            "recommendation": recommendation,
        })

    user_rows.sort(
        key=lambda row: (
            row["is_blocked"],
            row["pressure_score"],
            row["projected_hourly_cost"],
            row["total_tokens"],
        ),
        reverse=True,
    )

    summary = {
        "user_count": len(user_rows),
        "blocked_users": len([row for row in user_rows if row["is_blocked"]]),
        "total_tokens": sum(row["total_tokens"] for row in user_rows),
        "tokens_last_hour": sum(row["tokens_last_hour"] for row in user_rows),
        "estimated_total_cost": round(sum(row["estimated_cost"] for row in user_rows), 2),
        "projected_hourly_cost": round(sum(row["projected_hourly_cost"] for row in user_rows), 2),
        "active_bursts": len([row for row in user_rows if row["pressure_score"] >= 40]),
        "high_pressure_users": len([row for row in user_rows if row["pressure_score"] >= 70]),
    }

    return {"summary": summary, "users": user_rows}

@api.post("/ai/block-user/{user_id}")
async def block_user_ai(user_id: str, user=Depends(current_user)):
    """Block a user from AI access - security_team only"""
    require_security_team(user)
    
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    
    await db.blocked_ai_users.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "email": target["email"],
            "blocked_by": user["email"],
            "blocked_at": datetime.now(timezone.utc).isoformat(),
            "reason": "Excessive token usage or suspicious behavior"
        }},
        upsert=True
    )
    
    # Create alert
    await db.alerts.insert_one({
        "alert_id": str(uuid.uuid4()),
        "event_id": None,
        "user_id": user_id,
        "email": target["email"],
        "kind": "ai_blocked",
        "reason": [f"AI access blocked by {user['email']}"],
        "risk_score": 100,
        "role": target.get("role"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"status": "blocked", "user_id": user_id, "email": target["email"]}

@api.post("/ai/unblock-user/{user_id}")
async def unblock_user_ai(user_id: str, user=Depends(current_user)):
    """Unblock a user's AI access - security_team only"""
    require_security_team(user)
    
    result = await db.blocked_ai_users.delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "User not blocked")
    
    return {"status": "unblocked", "user_id": user_id}

@api.get("/ai/blocked-users")
async def get_blocked_users(user=Depends(current_user)):
    """Get list of blocked users - security_team only"""
    require_security_team(user)
    return await db.blocked_ai_users.find({}, {"_id": 0}).to_list(100)

# ---------- Seed ----------
SEED = [
    # Security operator (single)
    {"email": "security@gmail.com", "password": "Security@123", "name": "Vaibhav Rao",
     "role": "security_team", "shift": "day",
     "baseline_location": "Bangalore, IN", "baseline_device": "laptop", "demo": True},
    # CEO
    {"email": "sudeep@gmail.com", "password": "Sudeep@123", "name": "Ramesh Iyer",
     "role": "ceo", "shift": "day",
     "baseline_location": "Bangalore, IN", "baseline_device": "desktop", "demo": True},
    # Employees (internal)
    {"email": "punith@gmail.com", "password": "Punith@123", "name": "Layana Joseph",
     "role": "employee", "shift": "day",
     "baseline_location": "Bangalore, IN", "baseline_device": "laptop", "demo": True},
    {"email": "lohith@gmail.com", "password": "Lohith@123", "name": "Parinitha Shetty",
     "role": "employee", "shift": "day",
     "baseline_location": "Mumbai, IN", "baseline_device": "laptop", "demo": True},
    {"email": "sapthagiri@gmail.com", "password": "Sapthagiri@123", "name": "Likith Gowda",
     "role": "employee", "shift": "night",
     "baseline_location": "Bangalore, IN", "baseline_device": "laptop", "demo": True},
    # Customers / end-users (use the AI chat)
    {"email": "prabhu@gmail.com", "password": "Prabhu@123", "name": "Tejas Reddy",
     "role": "customer", "shift": "day",
     "baseline_location": "Bangalore, IN", "baseline_device": "mobile", "demo": True},
    {"email": "gagan@gmail.com", "password": "Gagan@123", "name": "Manoj Kumar",
     "role": "customer", "shift": "day",
     "baseline_location": "Hyderabad, IN", "baseline_device": "mobile", "demo": True},
    {"email": "deepak@gmail.com", "password": "Deepak@123", "name": "Nandini Rao",
     "role": "customer", "shift": "day",
     "baseline_location": "Chennai, IN", "baseline_device": "mobile", "demo": True},
]

async def seed():
    for u in SEED:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": u["email"], "name": u["name"],
                "role": u["role"], "shift": u["shift"],
                "password_hash": hash_pw(u["password"]),
                "baseline_location": u["baseline_location"],
                "baseline_device": u["baseline_device"],
                "baseline_hour": 9, "baseline_session": 30.0,
                **({"demo": True} if u.get("demo") else {}),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            await db.users.update_one(
                {"email": u["email"]},
                {"$set": {"name": u["name"], "role": u["role"], "shift": u["shift"],
                          "baseline_location": u["baseline_location"],
                          "baseline_device": u["baseline_device"],
                          **({"demo": True} if u.get("demo") else {})}},
            )
    await db.users.create_index("email", unique=True)
    await db.logs.create_index("timestamp")
    await db.alerts.create_index("timestamp")
    await db.approval_requests.create_index("status")
    await db.approval_requests.create_index("created_at")
    await db.active_sessions.create_index("user_id")
    await db.ai_events.create_index("timestamp")
    await db.ai_events.create_index("user_id")
    await db.ai_events.create_index("conversation_id")

@app.on_event("startup")
async def on_startup():
    train_model()
    await seed()
    await ensure_sessions()
    register_ai_routes(app, db, current_user)

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
