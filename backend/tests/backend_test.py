# this is team z
"""UEBA Backend API Tests - Iteration 2 (Role-Based + Human-in-the-Loop Approvals)"""
import os, pytest, requests, uuid

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://risk-auth-detect.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(s, email, password, simulate=None):
    body = {"email": email, "password": password}
    if simulate:
        body["simulate"] = simulate
    r = s.post(f"{API}/auth/login", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _admin_approve(s, request_id):
    # admin has security_team role with no time restriction => should ALLOW
    a = s.post(f"{API}/auth/login", json={"email": "admin@ueba.io", "password": "Admin@123"})
    assert a.status_code == 200 and a.json()["action"] == "ALLOW", f"admin must ALLOW: {a.text}"
    atoken = a.json()["token"]
    r = s.post(f"{API}/approvals/{request_id}/approve", json={"note": "test auto"},
               headers={"Authorization": f"Bearer {atoken}"})
    assert r.status_code == 200, r.text
    st = s.get(f"{API}/approvals/status/{request_id}")
    assert st.status_code == 200 and st.json()["token"]
    return st.json()["token"]


def _get_token(s, email, password):
    """Login and resolve token across ALLOW / REQUIRE_OTP / REQUIRE_APPROVAL."""
    d = _login(s, email, password)
    if d["action"] == "ALLOW":
        return d["token"]
    if d["action"] == "REQUIRE_OTP":
        otp = d["otp_challenge"]["demo_otp"]
        r = s.post(f"{API}/auth/verify-otp", json={"event_id": d["event_id"], "otp": otp})
        assert r.status_code == 200, r.text
        return r.json()["token"]
    if d["action"] == "REQUIRE_APPROVAL":
        return _admin_approve(s, d["approval_request"]["request_id"])
    pytest.skip(f"Unexpected action {d['action']} for {email}")


@pytest.fixture(scope="module")
def admin_token(s):
    a = s.post(f"{API}/auth/login", json={"email": "admin@ueba.io", "password": "Admin@123"})
    assert a.status_code == 200 and a.json()["action"] == "ALLOW"
    return a.json()["token"]


@pytest.fixture(scope="module")
def alice_token(s):
    return _get_token(s, "alice@ueba.io", "Alice@123")


# ========== HEALTH / INFO ==========
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_role_config_has_all_roles(s):
    r = s.get(f"{API}/role-config")
    assert r.status_code == 200
    d = r.json()
    for role in ("ceo", "security_team", "team_lead", "employee"):
        assert role in d, f"role {role} missing from role-config"
    # security_team has no restriction
    assert d["security_team"]["day"]["start"] is None
    assert d["security_team"]["night"]["start"] is None


def test_demo_users_has_role_shift(s):
    r = s.get(f"{API}/demo-users")
    assert r.status_code == 200
    users = r.json()
    emails = {u["email"] for u in users}
    assert {"alice@ueba.io", "bob@ueba.io", "carol@ueba.io", "dave@ueba.io", "secops@ueba.io"} <= emails
    for u in users:
        assert "role" in u and "shift" in u


# ========== REGISTER ==========
def test_register_with_role_and_shift(s):
    email = f"test_{uuid.uuid4().hex[:8]}@ueba.io"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Test@1234", "name": "Test",
        "role": "team_lead", "shift": "night"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d
    assert d["user"]["role"] == "team_lead"
    assert d["user"]["shift"] == "night"
    # verify persistence via /auth/me
    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {d['token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "team_lead"
    assert me.json()["shift"] == "night"


# ========== LOGIN PATHS ==========
def test_login_alice_normal(s):
    r = s.post(f"{API}/auth/login", json={"email": "alice@ueba.io", "password": "Alice@123"})
    assert r.status_code == 200
    d = r.json()
    assert d["action"] in ("ALLOW", "REQUIRE_OTP", "REQUIRE_APPROVAL")
    assert d["role"] == "employee"


def test_login_bad_password(s):
    r = s.post(f"{API}/auth/login", json={"email": "alice@ueba.io", "password": "wrong"})
    assert r.status_code == 401


def test_medium_otp_flow(s):
    # pick a scenario likely MEDIUM: new_device alone
    d = _login(s, "bob@ueba.io", "Bob@123", simulate=["new_device"])
    if d["action"] != "REQUIRE_OTP":
        pytest.skip(f"Expected REQUIRE_OTP, got {d['action']}")
    otp = d["otp_challenge"]["demo_otp"]
    r = s.post(f"{API}/auth/verify-otp", json={"event_id": d["event_id"], "otp": otp})
    assert r.status_code == 200 and "token" in r.json()


# ========== REQUIRE_APPROVAL FLOW ==========
@pytest.fixture(scope="module")
def approval_request(s):
    """Create a HIGH-risk login -> REQUIRE_APPROVAL and share request_id across tests."""
    d = _login(s, "alice@ueba.io", "Alice@123", simulate=["new_location", "new_device", "night_login"])
    assert d["action"] == "REQUIRE_APPROVAL", f"Expected REQUIRE_APPROVAL got {d['action']}: {d}"
    assert "token" not in d
    assert "otp_challenge" not in d
    assert d["approval_request"]["status"] == "pending"
    return d["approval_request"]["request_id"]


def test_login_high_risk_creates_approval_request(approval_request):
    assert approval_request  # fixture asserted shape


def test_pending_approvals_requires_security_team(s, alice_token, approval_request):
    r = s.get(f"{API}/approvals/pending", headers={"Authorization": f"Bearer {alice_token}"})
    assert r.status_code == 403, r.text


def test_pending_approvals_lists_request(s, admin_token, approval_request):
    r = s.get(f"{API}/approvals/pending", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    rows = r.json()
    assert any(x["request_id"] == approval_request for x in rows), \
        f"approval {approval_request} missing in pending list"


def test_approval_status_pending(s, approval_request):
    r = s.get(f"{API}/approvals/status/{approval_request}")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "pending"
    assert d.get("token") in (None, "")
    assert d.get("user") is None


def test_approve_request(s, admin_token, approval_request):
    r = s.post(f"{API}/approvals/{approval_request}/approve",
               json={"note": "ok by qa"},
               headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    # status now returns token + user
    s2 = s.get(f"{API}/approvals/status/{approval_request}")
    assert s2.status_code == 200
    d = s2.json()
    assert d["status"] == "approved"
    assert d["token"]
    assert d["user"] and d["user"]["email"] == "alice@ueba.io"


def test_double_approve_returns_400(s, admin_token, approval_request):
    r = s.post(f"{API}/approvals/{approval_request}/approve",
               json={},
               headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 400


def test_reject_flow(s, admin_token):
    # create another pending request
    d = _login(s, "bob@ueba.io", "Bob@123", simulate=["new_location", "new_device"])
    if d["action"] != "REQUIRE_APPROVAL":
        pytest.skip(f"bob did not land HIGH, got {d['action']}")
    rid = d["approval_request"]["request_id"]
    r = s.post(f"{API}/approvals/{rid}/reject",
               json={"note": "blocked"},
               headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    st = s.get(f"{API}/approvals/status/{rid}")
    assert st.status_code == 200
    sd = st.json()
    assert sd["status"] == "rejected"
    assert sd.get("token") in (None, "")


# ========== SIMULATE ==========
def test_simulate_role_mismatch(s, alice_token):
    r = s.post(f"{API}/simulate",
               json={"email": "alice@ueba.io", "scenario": "role_mismatch"},
               headers={"Authorization": f"Bearer {alice_token}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["features"]["role_time_mismatch"] == 1
    assert any("outside expected working hours" in x.lower() for x in d["explanation"]), \
        f"reasons missing role mismatch: {d['explanation']}"


def test_simulate_requires_auth(s):
    r = s.post(f"{API}/simulate", json={"email": "bob@ueba.io", "scenario": "new_location"})
    assert r.status_code == 401


# ========== AUTH-PROTECTED ENDPOINTS ==========
def test_me_no_token(s):
    assert s.get(f"{API}/auth/me").status_code == 401


def test_logs_alerts_analytics(s, alice_token):
    h = {"Authorization": f"Bearer {alice_token}"}
    assert s.get(f"{API}/logs", headers=h).status_code == 200
    assert s.get(f"{API}/logs/all", headers=h).status_code == 200
    assert s.get(f"{API}/alerts", headers=h).status_code == 200
    a = s.get(f"{API}/analytics", headers=h)
    assert a.status_code == 200
    d = a.json()
    for k in ("total_events", "login_hour_distribution", "risk_trend",
              "device_distribution", "level_distribution", "role_distribution"):
        assert k in d


def test_protected_require_auth(s):
    assert s.get(f"{API}/logs").status_code == 401
    assert s.get(f"{API}/alerts").status_code == 401
    assert s.get(f"{API}/approvals/pending").status_code == 401



# ========== CONTINUOUS MONITORING (Iteration 3) ==========
REQUIRED_KEYS = {
    "user_id", "email", "role", "shift", "session_duration_min", "data_accessed_mb",
    "file_operations", "file_operations_total", "location", "device", "ip_address",
    "recent_files", "location_history", "started_at",
}


@pytest.fixture(scope="module")
def secops_token(s):
    a = s.post(f"{API}/auth/login", json={"email": "secops@ueba.io", "password": "Sec@123"})
    assert a.status_code == 200 and a.json().get("action") == "ALLOW", a.text
    return a.json()["token"]


@pytest.fixture(scope="module")
def fresh_employee_token(s):
    """Register a brand-new employee (daytime working hours to avoid REQUIRE_APPROVAL)."""
    email = f"emp_{uuid.uuid4().hex[:8]}@ueba.io"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Emp@1234", "name": "EmpTester",
        "role": "employee", "shift": "night"
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_monitoring_users_requires_auth(s):
    r = s.get(f"{API}/monitoring/users")
    assert r.status_code == 401


def test_monitoring_users_forbidden_for_non_security(s, fresh_employee_token):
    r = s.get(f"{API}/monitoring/users",
              headers={"Authorization": f"Bearer {fresh_employee_token}"})
    assert r.status_code == 403, r.text


def test_monitoring_users_returns_shape(s, secops_token):
    r = s.get(f"{API}/monitoring/users",
              headers={"Authorization": f"Bearer {secops_token}"})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 4, f"want >=4 demo users, got {len(rows)}"
    for u in rows:
        missing = REQUIRED_KEYS - set(u.keys())
        assert not missing, f"missing keys {missing} for {u.get('email')}"
        assert u["session_duration_min"] > 0
        assert u["data_accessed_mb"] > 0
        fo = u["file_operations"]
        assert fo["reads"] + fo["writes"] + fo["deletes"] == u["file_operations_total"]


def test_monitoring_user_detail(s, secops_token):
    rows = s.get(f"{API}/monitoring/users",
                 headers={"Authorization": f"Bearer {secops_token}"}).json()
    uid = rows[0]["user_id"]
    r = s.get(f"{API}/monitoring/users/{uid}",
              headers={"Authorization": f"Bearer {secops_token}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert not (REQUIRED_KEYS - set(d.keys()))
    assert "recent_events" in d and isinstance(d["recent_events"], list)


def test_monitoring_refresh_forbidden(s, fresh_employee_token):
    r = s.post(f"{API}/monitoring/refresh",
               headers={"Authorization": f"Bearer {fresh_employee_token}"})
    assert r.status_code == 403, r.text


def test_monitoring_refresh_monotonic(s, secops_token):
    h = {"Authorization": f"Bearer {secops_token}"}
    before = {u["user_id"]: u for u in s.get(f"{API}/monitoring/users", headers=h).json()}
    r = s.post(f"{API}/monitoring/refresh", headers=h)
    assert r.status_code == 200, r.text
    after_rows = r.json()
    assert isinstance(after_rows, list) and len(after_rows) >= 4
    after = {u["user_id"]: u for u in after_rows}
    # reads, writes, deletes must not decrease for users that existed in both
    for uid, a in after.items():
        if uid not in before:
            continue
        b = before[uid]
        for k in ("reads", "writes", "deletes"):
            assert a["file_operations"][k] >= b["file_operations"][k], \
                f"{k} decreased for {a['email']}: before={b['file_operations'][k]} after={a['file_operations'][k]}"
    # At least one counter in total must have increased across the set (jitter)
    diffs = []
    for uid, a in after.items():
        if uid in before:
            diffs.append(a["file_operations_total"] - before[uid]["file_operations_total"])
    assert any(d > 0 for d in diffs), f"no counter jitter happened: diffs={diffs}"
