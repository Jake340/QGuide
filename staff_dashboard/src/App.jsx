import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api/apiClient.js";
import "./App.css";

const TOKEN_KEY = "qguide_dashboard_token";
const STATUS_OPTIONS = ["WAITING", "CALLED", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"];

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status) {
    return `status status-${String(status || "unknown").toLowerCase().replaceAll("_", "-")}`;
}

function getErrorMessage(error) {
    if (error?.status === 401) return "Your session may have expired. Please sign in again.";
    if (error?.status === 403) return "Your account does not have permission to perform this action.";
    return error?.message || "Something went wrong. Please try again.";
}

function LoginScreen({ onLogin }) {
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            await onLogin(identifier.trim(), password);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="login-shell">
            <section className="login-card">
                <div className="brand-mark large">Q</div>
                <p className="eyebrow">EVMC · OUTPATIENT DEPARTMENT</p>
                <h1>Q-Guide Dashboard</h1>
                <p className="muted">Sign in with your authorized staff or administrator account.</p>
                <form onSubmit={submit} className="form-stack">
                    <label>
                        Username or email
                        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
                    </label>
                    <label>
                        Password
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                    </label>
                    {error && <div className="alert error" role="alert">{error}</div>}
                    <button type="submit" className="button primary full" disabled={busy}>
                        {busy ? "Signing in…" : "Sign in"}
                    </button>
                </form>
                <p className="login-footnote">Development dashboard · Use fictional records during testing.</p>
            </section>
        </main>
    );
}

function App() {
    const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
    const [user, setUser] = useState(null);
    const [authChecking, setAuthChecking] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)));
    const [page, setPage] = useState("queue");
    const [notice, setNotice] = useState(null);
    const [logoutConfirm, setLogoutConfirm] = useState(false);

    const request = useCallback((path, options = {}) => apiRequest(path, { ...options, token }), [token]);

    const showNotice = useCallback((type, message) => {
        setNotice({ type, message });
        window.setTimeout(() => setNotice(null), 5000);
    }, []);

    const signOut = useCallback(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken("");
        setUser(null);
        setPage("queue");
        setLogoutConfirm(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function restoreSession() {
            if (!token) {
                setAuthChecking(false);
                return;
            }
            try {
                const result = await apiRequest("/auth/me", { token });
                if (cancelled) return;
                if (!result?.user || !["ADMIN", "STAFF"].includes(result.user.role)) {
                    sessionStorage.removeItem(TOKEN_KEY);
                    setToken("");
                    setUser(null);
                } else {
                    setUser(result.user);
                }
            } catch {
                if (!cancelled) {
                    sessionStorage.removeItem(TOKEN_KEY);
                    setToken("");
                    setUser(null);
                }
            } finally {
                if (!cancelled) setAuthChecking(false);
            }
        }
        restoreSession();
        return () => { cancelled = true; };
    }, [token]);

    async function login(identifier, password) {
        const result = await apiRequest("/auth/login", {
            method: "POST",
            body: { identifier, password }
        });
        if (!result?.accessToken || !result?.user) {
            throw new Error("The API did not return a valid login response.");
        }
        if (!["ADMIN", "STAFF"].includes(result.user.role)) {
            throw new Error("This dashboard is available only to authorized staff and administrators.");
        }
        sessionStorage.setItem(TOKEN_KEY, result.accessToken);
        setToken(result.accessToken);
        setUser(result.user);
        setPage("queue");
    }

    if (authChecking) {
        return <main className="loading-shell"><div className="spinner" /><p>Checking your session…</p></main>;
    }
    if (!user || !token) return <LoginScreen onLogin={login} />;

    const isAdmin = user.role === "ADMIN";
    const navItems = [
        { key: "queue", label: "Queue dashboard", icon: "▤" },
        ...(isAdmin ? [
            { key: "clinics", label: "Clinic management", icon: "⌂" },
            { key: "staff", label: "Staff management", icon: "♙" },
            { key: "audit", label: "Audit logs", icon: "◷" }
        ] : [])
    ];

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand-row">
                    <div className="brand-mark">Q</div>
                    <div><strong>Q-Guide</strong><span>OPD management</span></div>
                </div>
                <div className="nav-label">WORKSPACE</div>
                <nav className="side-nav" aria-label="Main navigation">
                    {navItems.map((item) => (
                        <button key={item.key} className={`nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)}>
                            <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <div className="user-chip">
                        <div className="avatar">{(user.fullName || user.username || "U").slice(0, 1).toUpperCase()}</div>
                        <div className="user-info"><strong>{user.fullName || user.username}</strong><span>{user.role}</span></div>
                    </div>
                    <button className="nav-item logout" onClick={() => setLogoutConfirm(true)}><span className="nav-icon">↪</span><span>Sign out</span></button>
                    <p className="sidebar-note">Local development build<br />Use approved hospital data only.</p>
                </div>
            </aside>

            <main className="main-panel">
                <header className="topbar">
                    <div>
                        <p className="eyebrow">EASTERN VISAYAS MEDICAL CENTER · OPD</p>
                        <h1>{navItems.find((item) => item.key === page)?.label || "Q-Guide"}</h1>
                    </div>
                    <div className="topbar-right"><span className="connection-dot" /> API session active <span className="role-pill">{user.role}</span></div>
                </header>
                {notice && <div className={`alert ${notice.type}`} role="status">{notice.message}</div>}
                <div className="page-content">
                    {page === "queue" && <QueuePage request={request} showNotice={showNotice} />}
                    {page === "clinics" && isAdmin && <ClinicsPage request={request} showNotice={showNotice} />}
                    {page === "staff" && isAdmin && <StaffPage request={request} showNotice={showNotice} currentUser={user} />}
                    {page === "audit" && isAdmin && <AuditPage request={request} showNotice={showNotice} />}
                </div>
                <footer className="page-footer">Q-Guide · Development interface · Confirm clinic locations with authorized EVMC personnel.</footer>
            </main>

            {logoutConfirm && <ConfirmDialog title="Sign out?" message="Your dashboard session will be cleared from this browser tab." onCancel={() => setLogoutConfirm(false)} onConfirm={signOut} confirmLabel="Sign out" />}
        </div>
    );
}

function QueuePage({ request, showNotice }) {
    const [clinics, setClinics] = useState([]);
    const [clinicCode, setClinicCode] = useState("");
    const [queue, setQueue] = useState(null);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [loadingClinics, setLoadingClinics] = useState(true);
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [workingTicket, setWorkingTicket] = useState("");
    const [error, setError] = useState("");

    const loadClinics = useCallback(async () => {
        setLoadingClinics(true);
        try {
            const result = await request("/clinics");
            const list = Array.isArray(result?.clinics) ? result.clinics : [];
            setClinics(list);
            setClinicCode((current) => list.some((clinic) => clinic.clinicCode === current) ? current : (list[0]?.clinicCode || ""));
            setError(list.length ? "" : "No active clinics were returned. Check the clinic seed data in phpMyAdmin.");
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoadingClinics(false);
        }
    }, [request]);

    const loadQueue = useCallback(async () => {
        if (!clinicCode) {
            setQueue(null);
            return;
        }
        setLoadingQueue(true);
        setError("");
        try {
            const query = new URLSearchParams({ clinicCode });
            const result = await request(`/queues?${query.toString()}`);
            setQueue(result);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoadingQueue(false);
        }
    }, [clinicCode, request]);

    useEffect(() => { loadClinics(); }, [loadClinics]);
    useEffect(() => { loadQueue(); }, [loadQueue]);

    async function callNext() {
        if (!clinicCode) return;
        setWorkingTicket("CALL_NEXT");
        try {
            const result = await request("/queues/call-next", { method: "POST", body: { clinicCode } });
            showNotice("success", `${result.ticket?.tokenNumber || "Next ticket"} has been called.`);
            await loadQueue();
        } catch (err) {
            showNotice("error", getErrorMessage(err));
        } finally {
            setWorkingTicket("");
        }
    }

    async function updateStatus(ticket, status) {
        setWorkingTicket(ticket.ticketId);
        try {
            await request(`/queues/${ticket.ticketId}/status`, {
                method: "PATCH",
                body: { status, reason: status === "COMPLETED" ? "Completed from staff dashboard" : undefined }
            });
            showNotice("success", `${ticket.tokenNumber} updated to ${status.replaceAll("_", " ")}.`);
            await loadQueue();
        } catch (err) {
            showNotice("error", getErrorMessage(err));
        } finally {
            setWorkingTicket("");
        }
    }

    const summary = queue?.summary || { total: 0, waiting: 0, called: 0, inService: 0, completed: 0, cancelled: 0, noShow: 0 };
    const allTickets = queue?.tickets || [];
    const tickets = statusFilter === "ALL"
        ? allTickets
        : allTickets.filter((ticket) => ticket.status === statusFilter);

    return (
        <section className="stack-lg">
            <div className="section-heading">
                <div><h2>Live clinic queue</h2><p className="muted">Monitor check-ins and update tickets as patients are served.</p></div>
                <button className="button secondary" onClick={() => { loadClinics(); loadQueue(); }} disabled={loadingClinics || loadingQueue}>↻ Refresh</button>
            </div>

            <div className="toolbar-card">
                <label className="clinic-select-label">Selected clinic
                    <select value={clinicCode} onChange={(event) => setClinicCode(event.target.value)} disabled={loadingClinics || !clinics.length}>
                        {clinics.length === 0 && <option value="">No active clinics</option>}
                        {clinics.map((clinic) => <option key={clinic.id} value={clinic.clinicCode}>{clinic.clinicName} ({clinic.clinicCode})</option>)}
                    </select>
                </label>
                <label className="clinic-select-label">Filter status
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="ALL">All statuses</option>
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                    </select>
                </label>
                <div className="toolbar-spacer" />
                <button className="button primary" onClick={callNext} disabled={!clinicCode || loadingQueue || Boolean(workingTicket)}>{workingTicket === "CALL_NEXT" ? "Calling…" : "▶ Call next"}</button>
            </div>

            {error && <div className="alert error">{error}</div>}

            <div className="stat-grid">
                <StatCard label="Tickets shown" value={summary.total ?? tickets.length} tone="blue" />
                <StatCard label="Waiting" value={summary.waiting ?? 0} tone="amber" />
                <StatCard label="Called" value={summary.called ?? 0} tone="violet" />
                <StatCard label="In service" value={summary.inService ?? 0} tone="teal" />
                <StatCard label="Completed" value={summary.completed ?? 0} tone="green" />
            </div>

            <section className="panel-card">
                <div className="panel-header">
                    <div><h3>{queue?.clinic?.clinicName || "Queue tickets"}</h3><p className="muted">Queue date: {queue?.queueDate || "—"}</p></div>
                    {loadingQueue && <span className="inline-loading"><span className="spinner small" /> Updating</span>}
                </div>
                {tickets.length === 0 ? (
                    <div className="empty-state"><div className="empty-icon">▤</div><h3>No tickets to display</h3><p>{clinicCode ? "No tickets match this clinic and filter for today's queue." : "Select a clinic after clinic data has been added."}</p></div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Ticket</th><th>Patient</th><th>Checked in</th><th>Room</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {tickets.map((ticket) => <tr key={ticket.ticketId}>
                                    <td><span className="ticket-number">{ticket.tokenNumber}</span><small>#{ticket.sequenceNumber}</small></td>
                                    <td><strong>{ticket.patient?.fullName || "Patient"}</strong><small>{ticket.patient?.patientCode || "—"}</small></td>
                                    <td>{formatDateTime(ticket.checkedInAt)}</td>
                                    <td>{ticket.clinic?.floorLabel || ticket.clinic?.roomNumber ? `${ticket.clinic?.floorLabel || ""} · Room ${ticket.clinic?.roomNumber || "—"}` : "Not configured"}</td>
                                    <td><span className={statusClass(ticket.status)}>{ticket.status?.replaceAll("_", " ")}</span></td>
                                    <td><TicketActions ticket={ticket} onUpdate={updateStatus} busy={workingTicket === ticket.ticketId || Boolean(workingTicket && workingTicket !== "CALL_NEXT")} /></td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </section>
    );
}

function TicketActions({ ticket, onUpdate, busy }) {
    const actions = {
        WAITING: [{ label: "Call", status: "CALLED", primary: true }, { label: "No-show", status: "NO_SHOW" }, { label: "Cancel", status: "CANCELLED" }],
        CALLED: [{ label: "Start service", status: "IN_SERVICE", primary: true }, { label: "Return to waiting", status: "WAITING" }, { label: "No-show", status: "NO_SHOW" }],
        IN_SERVICE: [{ label: "Complete", status: "COMPLETED", primary: true }],
        NO_SHOW: [{ label: "Return to waiting", status: "WAITING", primary: true }],
        COMPLETED: [],
        CANCELLED: []
    };
    const options = actions[ticket.status] || [];
    if (!options.length) return <span className="muted">No actions</span>;
    return <div className="action-group">{options.map((action) => <button key={action.status} type="button" className={`button tiny ${action.primary ? "primary" : "secondary"}`} disabled={busy} onClick={() => onUpdate(ticket, action.status)}>{action.label}</button>)}</div>;
}

function StatCard({ label, value, tone }) {
    return <div className={`stat-card tone-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

const EMPTY_CLINIC = {
    clinicCode: "", clinicName: "", tokenPrefix: "", description: "", isActive: true,
    buildingName: "", floorLabel: "", roomNumber: "", directions: ""
};

function ClinicsPage({ request, showNotice }) {
    const [clinics, setClinics] = useState([]);
    const [form, setForm] = useState(EMPTY_CLINIC);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await request("/admin/clinics");
            setClinics(result.clinics || []);
            setError("");
        } catch (err) { setError(getErrorMessage(err)); }
        finally { setLoading(false); }
    }, [request]);

    useEffect(() => { load(); }, [load]);

    function resetForm() { setEditingId(null); setForm(EMPTY_CLINIC); }
    function editClinic(clinic) {
        setEditingId(clinic.id);
        setForm({
            clinicCode: clinic.clinicCode || "",
            clinicName: clinic.clinicName || "",
            tokenPrefix: clinic.tokenPrefix || "",
            description: clinic.description || "",
            isActive: Boolean(clinic.isActive),
            buildingName: clinic.location?.buildingName || "",
            floorLabel: clinic.location?.floorLabel || "",
            roomNumber: clinic.location?.roomNumber || "",
            directions: clinic.location?.directions || ""
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function save(event) {
        event.preventDefault();
        setSaving(true); setError("");
        try {
            const body = {
                clinicName: form.clinicName.trim(),
                tokenPrefix: form.tokenPrefix.trim().toUpperCase(),
                description: form.description.trim(),
                buildingName: form.buildingName.trim(),
                floorLabel: form.floorLabel.trim(),
                roomNumber: form.roomNumber.trim(),
                directions: form.directions.trim()
            };
            if (!editingId) {
                body.clinicCode = form.clinicCode.trim().toUpperCase();
                await request("/admin/clinics", { method: "POST", body });
                showNotice("success", "Clinic created.");
            } else {
                body.isActive = Boolean(form.isActive);
                await request(`/admin/clinics/${editingId}`, { method: "PATCH", body });
                showNotice("success", "Clinic updated.");
            }
            resetForm();
            await load();
        } catch (err) { setError(getErrorMessage(err)); }
        finally { setSaving(false); }
    }

    async function toggleActive(clinic) {
        try {
            await request(`/admin/clinics/${clinic.id}`, { method: "PATCH", body: { isActive: !clinic.isActive } });
            showNotice("success", `${clinic.clinicName} ${clinic.isActive ? "deactivated" : "activated"}.`);
            await load();
        } catch (err) { showNotice("error", getErrorMessage(err)); }
    }

    function update(key, value) { setForm((old) => ({ ...old, [key]: value })); }

    return <section className="stack-lg">
        <div className="section-heading"><div><h2>Clinic management</h2><p className="muted">Maintain clinic codes, queue prefixes, active state, and approved room directions.</p></div><button className="button secondary" onClick={load} disabled={loading}>↻ Refresh</button></div>
        <section className="panel-card form-panel">
            <div className="panel-header"><div><h3>{editingId ? "Edit clinic" : "Add a clinic"}</h3><p className="muted">Room details should be confirmed by authorized EVMC staff.</p></div>{editingId && <button className="button secondary" onClick={resetForm}>Cancel edit</button>}</div>
            <form className="form-grid" onSubmit={save}>
                {!editingId && <label>Clinic code<input value={form.clinicCode} onChange={(e) => update("clinicCode", e.target.value)} placeholder="e.g. FAMED" required maxLength={20} /></label>}
                <label>Clinic name<input value={form.clinicName} onChange={(e) => update("clinicName", e.target.value)} required maxLength={150} /></label>
                <label>Queue token prefix<input value={form.tokenPrefix} onChange={(e) => update("tokenPrefix", e.target.value)} placeholder="e.g. F" required maxLength={8} /></label>
                <label className="span-2">Description<input value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={500} /></label>
                <label>Building<input value={form.buildingName} onChange={(e) => update("buildingName", e.target.value)} maxLength={100} /></label>
                <label>Floor label<input value={form.floorLabel} onChange={(e) => update("floorLabel", e.target.value)} placeholder="e.g. 2nd Floor" maxLength={50} /></label>
                <label>Room number<input value={form.roomNumber} onChange={(e) => update("roomNumber", e.target.value)} maxLength={30} /></label>
                <label className="span-2">Directions<textarea value={form.directions} onChange={(e) => update("directions", e.target.value)} rows="2" maxLength={500} /></label>
                {editingId && <label className="checkbox-label"><input type="checkbox" checked={form.isActive} onChange={(e) => update("isActive", e.target.checked)} /> Clinic is active</label>}
                <div className="form-actions span-2"><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save clinic" : "Create clinic"}</button>{!editingId && <button className="button secondary" type="button" onClick={resetForm}>Clear</button>}</div>
            </form>
            {error && <div className="alert error">{error}</div>}
        </section>
        <section className="panel-card"><div className="panel-header"><div><h3>Clinic directory</h3><p className="muted">{clinics.length} clinic record(s)</p></div></div>
            {loading ? <Loading /> : clinics.length === 0 ? <Empty message="No clinic records found." /> : <div className="table-wrap"><table><thead><tr><th>Clinic</th><th>Token prefix</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>{clinics.map((clinic) => <tr key={clinic.id}><td><strong>{clinic.clinicName}</strong><small>{clinic.clinicCode}</small></td><td><span className="prefix-pill">{clinic.tokenPrefix}</span></td><td>{clinic.location ? <>{clinic.location.floorLabel} · Room {clinic.location.roomNumber}<small>{clinic.location.buildingName || clinic.location.directions || ""}</small></> : <span className="muted">Not configured</span>}</td><td><span className={clinic.isActive ? "status status-completed" : "status status-cancelled"}>{clinic.isActive ? "ACTIVE" : "INACTIVE"}</span></td><td><div className="action-group"><button className="button tiny secondary" onClick={() => editClinic(clinic)}>Edit</button><button className="button tiny secondary" onClick={() => toggleActive(clinic)}>{clinic.isActive ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table></div>}
        </section>
    </section>;
}

function StaffPage({ request, showNotice, currentUser }) {
    const [staff, setStaff] = useState([]);
    const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "", role: "STAFF" });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try { const result = await request("/admin/staff"); setStaff(result.staff || []); setError(""); }
        catch (err) { setError(getErrorMessage(err)); }
        finally { setLoading(false); }
    }, [request]);
    useEffect(() => { load(); }, [load]);

    async function create(event) {
        event.preventDefault(); setSaving(true); setError("");
        try {
            await request("/admin/staff", { method: "POST", body: form });
            setForm({ fullName: "", username: "", email: "", password: "", role: "STAFF" });
            showNotice("success", "Staff account created with a hashed password.");
            await load();
        } catch (err) { setError(getErrorMessage(err)); }
        finally { setSaving(false); }
    }

    async function toggleActive(person) {
        try {
            await request(`/admin/staff/${person.id}`, { method: "PATCH", body: { isActive: !person.isActive } });
            showNotice("success", `${person.username} ${person.isActive ? "deactivated" : "activated"}.`);
            await load();
        } catch (err) { showNotice("error", getErrorMessage(err)); }
    }

    async function changeRole(person, role) {
        if (person.id === String(currentUser.id) && role !== "ADMIN") {
            showNotice("error", "You cannot remove your own administrator role.");
            await load();
            return;
        }
        try {
            await request(`/admin/staff/${person.id}`, { method: "PATCH", body: { role } });
            showNotice("success", `${person.username}'s role updated.`);
            await load();
        } catch (err) { showNotice("error", getErrorMessage(err)); }
    }

    return <section className="stack-lg">
        <div className="section-heading"><div><h2>Staff management</h2><p className="muted">Create accounts and control access for staff and administrators.</p></div><button className="button secondary" onClick={load} disabled={loading}>↻ Refresh</button></div>
        <section className="panel-card form-panel"><div className="panel-header"><div><h3>Create staff account</h3><p className="muted">Passwords are hashed by the backend before being stored.</p></div></div>
            <form className="form-grid" onSubmit={create}>
                <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={150} /></label>
                <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} maxLength={80} /></label>
                <label>Email (optional)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={190} /></label>
                <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="STAFF">STAFF</option><option value="ADMIN">ADMIN</option></select></label>
                <label className="span-2">Temporary password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} autoComplete="new-password" /><small>Use at least 12 characters. Arrange a secure password change process before production use.</small></label>
                <div className="form-actions span-2"><button className="button primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create account"}</button></div>
            </form>
            {error && <div className="alert error">{error}</div>}
        </section>
        <section className="panel-card"><div className="panel-header"><div><h3>Staff accounts</h3><p className="muted">{staff.length} account(s)</p></div></div>
            {loading ? <Loading /> : staff.length === 0 ? <Empty message="No staff accounts found." /> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username / email</th><th>Role</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead><tbody>{staff.map((person) => <tr key={person.id}><td><strong>{person.fullName}</strong><small>ID {person.id}</small></td><td>{person.username}<small>{person.email || "No email"}</small></td><td><select className="inline-select" aria-label={`Role for ${person.username}`} value={person.role} onChange={(e) => changeRole(person, e.target.value)} disabled={person.id === String(currentUser.id)}><option value="STAFF">STAFF</option><option value="ADMIN">ADMIN</option></select></td><td>{formatDateTime(person.lastLoginAt)}</td><td><span className={person.isActive ? "status status-completed" : "status status-cancelled"}>{person.isActive ? "ACTIVE" : "INACTIVE"}</span></td><td><button className="button tiny secondary" disabled={person.id === String(currentUser.id)} onClick={() => toggleActive(person)}>{person.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
        </section>
    </section>;
}

function AuditPage({ request, showNotice }) {
    const [logs, setLogs] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async (offset = 0) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: "50", offset: String(offset) });
            const result = await request(`/admin/audit-logs?${params.toString()}`);
            setLogs(result.auditLogs || []);
            setPagination(result.pagination || { total: 0, limit: 50, offset });
            setError("");
        } catch (err) { setError(getErrorMessage(err)); showNotice("error", getErrorMessage(err)); }
        finally { setLoading(false); }
    }, [request, showNotice]);

    useEffect(() => { load(0); }, [load]);
    const canPrevious = pagination.offset > 0;
    const canNext = pagination.offset + pagination.limit < pagination.total;

    return <section className="stack-lg">
        <div className="section-heading"><div><h2>Audit logs</h2><p className="muted">Review administrative and queue actions for accountability.</p></div><button className="button secondary" onClick={() => load(pagination.offset)} disabled={loading}>↻ Refresh</button></div>
        {error && <div className="alert error">{error}</div>}
        <section className="panel-card"><div className="panel-header"><div><h3>Recent activity</h3><p className="muted">{pagination.total} total record(s)</p></div><div className="pagination"><button className="button tiny secondary" disabled={!canPrevious || loading} onClick={() => load(Math.max(0, pagination.offset - pagination.limit))}>Previous</button><button className="button tiny secondary" disabled={!canNext || loading} onClick={() => load(pagination.offset + pagination.limit)}>Next</button></div></div>
            {loading ? <Loading /> : logs.length === 0 ? <Empty message="No audit events have been recorded yet." /> : <div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th><th>IP address</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDateTime(log.createdAt)}<small>Event #{log.id}</small></td><td>{log.actorName}<small>{log.actorUserId ? `User ${log.actorUserId}` : "System / no actor"}</small></td><td><span className="audit-action">{log.action}</span></td><td>{log.entityType}<small>{log.entityId ? `ID ${log.entityId}` : "—"}</small></td><td><details className="details-pop"><summary>View details</summary><pre>{JSON.stringify(log.details || {}, null, 2)}</pre></details></td><td>{log.ipAddress || "—"}</td></tr>)}</tbody></table></div>}
        </section>
        <p className="muted small-note">Audit details are administrative metadata. Do not record passwords, access tokens, diagnoses, or unnecessary personal information in audit events.</p>
    </section>;
}

function ConfirmDialog({ title, message, onCancel, onConfirm, confirmLabel }) {
    return <div className="dialog-backdrop" role="presentation"><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{title}</h2><p>{message}</p><div className="dialog-actions"><button className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}

function Loading() { return <div className="empty-state"><div className="spinner" /><p className="muted">Loading data…</p></div>; }
function Empty({ message }) { return <div className="empty-state"><div className="empty-icon">—</div><p>{message}</p></div>; }

export default App;
