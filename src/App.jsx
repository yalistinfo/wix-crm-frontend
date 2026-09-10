import React, { useState, useEffect, useMemo, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const STAGES = ["Lead", "Active", "Customer", "Churned"];

const RECORD_TYPES = {
  order: { label: "Order", color: "#2F6F5E", bg: "#E7F1EE" },
  booking: { label: "Booking", color: "#4A5FA0", bg: "#E9EBF6" },
  quote: { label: "Quote", color: "#B8863B", bg: "#F7EEDD" },
  invoice: { label: "Invoice", color: "#A0473F", bg: "#F6E7E5" },
};

const STATUS_OPTIONS = {
  order: ["Placed", "Fulfilled", "Cancelled"],
  booking: ["Scheduled", "Completed", "Cancelled"],
  quote: ["Sent", "Accepted", "Declined"],
  invoice: ["Sent", "Paid", "Overdue"],
};

const DEAL_STATUSES = [
  "Uncontacted",
  "Contacted",
  "Negotiating",
  "Follow-up needed",
  "Complete",
  "Lost",
  "Lost to price",
  "Dead",
];

const CLOSED_STATUSES = ["Complete", "Lost", "Lost to price", "Dead"];

const DEAL_STATUS_COLOR = {
  "Uncontacted": { color: "#FFFFFF", bg: "#E14B3E" },
  "Contacted": { color: "#FFFFFF", bg: "#3A5FE0" },
  "Negotiating": { color: "#1B1E1D", bg: "#F0B429" },
  "Follow-up needed": { color: "#FFFFFF", bg: "#8A4FE0" },
  "Complete": { color: "#FFFFFF", bg: "#1FA36B" },
  "Lost": { color: "#FFFFFF", bg: "#6B6F6C" },
  "Lost to price": { color: "#FFFFFF", bg: "#C2701F" },
  "Dead": { color: "#FFFFFF", bg: "#2B2D2A" },
};

const INVOICED_STATUSES = ["Not Invoiced", "Invoiced", "Paid"];

const INVOICED_STATUS_COLOR = {
  "Not Invoiced": DEAL_STATUS_COLOR["Uncontacted"],
  "Invoiced": DEAL_STATUS_COLOR["Lost to price"],
  "Paid": DEAL_STATUS_COLOR["Complete"],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const INVOICE_STATUSES = ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Voided"];

const INVOICE_CLOSED_STATUSES = ["Paid", "Voided"];

const INVOICE_STATUS_COLOR = {
  "Draft": { color: "#1B1E1D", bg: "#D8D5C9" },
  "Sent": { color: "#FFFFFF", bg: "#3A5FE0" },
  "Partially Paid": { color: "#1B1E1D", bg: "#F0B429" },
  "Paid": { color: "#FFFFFF", bg: "#1FA36B" },
  "Overdue": { color: "#FFFFFF", bg: "#E14B3E" },
  "Voided": { color: "#FFFFFF", bg: "#2B2D2A" },
};


function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function findCsvCol(headers, keywords) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const k of keywords) {
    const idx = lower.findIndex((h) => h === k);
    if (idx >= 0) return idx;
  }
  for (const k of keywords) {
    const idx = lower.findIndex((h) => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeCsvDate(str) {
  if (!str) return "";
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, day, yr] = m;
    return `${yr}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const emptyData = { contacts: [], records: [], deals: [], invoices: [] };

export default function App() {
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState("deals");
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/data`);
        if (res.ok) {
          const parsed = await res.json();
          setData({
            contacts: parsed.contacts || [],
            records: parsed.records || [],
            deals: parsed.deals || [],
            invoices: parsed.invoices || [],
          });
        }
      } catch (e) {
        // backend unreachable — start empty rather than blocking the UI
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/data`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setSaveError(!res.ok);
      } catch (e) {
        setSaveError(true);
      }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  if (!loaded) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif", padding: "3rem", color: "#6B6F6C" }}>
        Loading your records…
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "#FAFAF8",
        height: "100%",
        minHeight: "100vh",
        display: "flex",
        color: "#1B1E1D",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:wght@500;600&display=swap');
        .serif { font-family: 'Source Serif 4', serif; }
        button.ghost { background: transparent; border: 1px solid #D8D5C9; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; color: #1B1E1D; font-family: Inter, sans-serif; }
        button.ghost:hover { background: #F0EEE5; }
        button.primary { background: #1B1E1D; color: #FAFAF8; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: Inter, sans-serif; }
        button.primary:hover { background: #34372F; }
        button.danger { background: #A0473F; color: #FAFAF8; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: Inter, sans-serif; }
        input, select, textarea { font-family: Inter, sans-serif; font-size: 13px; padding: 7px 10px; border: 1px solid #D8D5C9; border-radius: 6px; background: #FFFFFF; color: #1B1E1D; width: 100%; box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #2F6F5E; }
        .contact-row { cursor: pointer; padding: 10px 14px; border-bottom: 1px solid #EDEBE2; display: flex; align-items: center; gap: 10px; }
        .contact-row:hover { background: #F2F0E7; }
        .contact-row.selected { background: #ECEFE9; border-left: 3px solid #2F6F5E; padding-left: 11px; }
        .navtab { cursor: pointer; padding: 8px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 2px; }
        .navtab.active { background: #34372F; color: #FAFAF8; }
        .navtab:not(.active) { color: #B8B6AA; }
        .navtab:not(.active):hover { background: #262924; }
        .deal-cell { font-size: 13px; padding: 8px 10px; border: none; background: transparent; }
        .deal-row { border-bottom: 1px solid #EDEBE2; }
        .deal-row:hover { background: #F7F6F0; }
      `}</style>

      <div style={{ width: "220px", background: "#1B1E1D", color: "#E7E5DA", padding: "1.5rem 1.25rem", flexShrink: 0 }}>
        <div className="serif" style={{ fontSize: "19px", fontWeight: 600, marginBottom: "2px" }}>
          Ledger
        </div>
        <div style={{ fontSize: "12px", color: "#9A9A90", marginBottom: "1.5rem" }}>Customer &amp; deal records</div>

        <div className={"navtab" + (tab === "contacts" ? " active" : "")} onClick={() => setTab("contacts")}>
          Contacts
        </div>
        <div className={"navtab" + (tab === "deals" ? " active" : "")} onClick={() => setTab("deals")}>
          Quotes Dashboard
        </div>
        <div className={"navtab" + (tab === "invoices" ? " active" : "")} onClick={() => setTab("invoices")}>
          Invoice Dashboard
        </div>

        <div style={{ marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid #34372F" }}>
          <div style={{ fontSize: "11px", color: "#7A7A70", marginBottom: "10px", letterSpacing: "0.02em" }}>
            Synced from Wix
          </div>
          {["Contacts", "Orders", "Bookings", "Quotes", "Invoices"].map((s) => (
            <div key={s} style={{ fontSize: "12px", color: "#B8B6AA", padding: "3px 0" }}>
              {s}
            </div>
          ))}
          {saveError && (
            <div style={{ fontSize: "11px", color: "#E29B8F", marginTop: "10px" }}>
              Couldn't save changes. Try again.
            </div>
          )}
        </div>
      </div>

      {tab === "contacts" ? (
        <ContactsView data={data} setData={setData} />
      ) : tab === "deals" ? (
        <DealsView data={data} setData={setData} />
      ) : (
        <InvoicesView data={data} setData={setData} />
      )}
    </div>
  );
}

/* ---------------- Contacts ---------------- */

function ContactsView({ data, setData }) {
  const [selectedId, setSelectedId] = useState(data.contacts[0]?.id || null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [showContactForm, setShowContactForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);

  const contacts = data.contacts;
  const records = data.records;

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => stageFilter === "All" || c.stage === stageFilter)
      .filter((c) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, search, stageFilter]);

  const selected = contacts.find((c) => c.id === selectedId) || null;
  const selectedRecords = useMemo(
    () => records.filter((r) => r.contactId === selectedId).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [records, selectedId]
  );

  const stats = useMemo(() => {
    const openQuoteValue = records.filter((r) => r.type === "quote" && r.status === "Sent").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const unpaidInvoiceValue = records.filter((r) => r.type === "invoice" && r.status !== "Paid").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const upcomingBookings = records.filter((r) => r.type === "booking" && r.status === "Scheduled").length;
    return { totalContacts: contacts.length, openQuoteValue, unpaidInvoiceValue, upcomingBookings };
  }, [contacts, records]);

  function addContact(contact) {
    const c = { id: uid(), createdAt: new Date().toISOString(), ...contact };
    setData((d) => ({ ...d, contacts: [...d.contacts, c] }));
    setSelectedId(c.id);
    setShowContactForm(false);
  }

  function deleteContact(id) {
    setData((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== id), records: d.records.filter((r) => r.contactId !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function updateStage(id, stage) {
    setData((d) => ({ ...d, contacts: d.contacts.map((c) => (c.id === id ? { ...c, stage } : c)) }));
  }

  function addRecord(record) {
    const r = { id: uid(), contactId: selectedId, ...record };
    setData((d) => ({ ...d, records: [...d.records, r] }));
    setShowRecordForm(false);
  }

  function updateRecordStatus(id, status) {
    setData((d) => ({ ...d, records: d.records.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }

  function deleteRecord(id) {
    setData((d) => ({ ...d, records: d.records.filter((r) => r.id !== id) }));
  }

  return (
    <>
      <div style={{ width: "300px", borderRight: "1px solid #EDEBE2", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "1rem 1rem 0.75rem" }}>
          <input placeholder="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ marginTop: "8px" }}>
            <option value="All">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="primary" style={{ width: "100%", marginTop: "8px" }} onClick={() => setShowContactForm(true)}>
            Add contact
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredContacts.length === 0 && (
            <div style={{ padding: "2rem 1rem", color: "#8A8A80", fontSize: "13px" }}>No contacts yet.</div>
          )}
          {filteredContacts.map((c) => (
            <div key={c.id} className={"contact-row" + (c.id === selectedId ? " selected" : "")} onClick={() => setSelectedId(c.id)}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#DCE5DE", color: "#2F6F5E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}>
                {initials(c.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: "12px", color: "#8A8A80", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company || c.email || c.stage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1.75rem" }}>
          <MetricCard label="Contacts" value={stats.totalContacts} />
          <MetricCard label="Open quotes" value={formatMoney(stats.openQuoteValue)} />
          <MetricCard label="Unpaid invoices" value={formatMoney(stats.unpaidInvoiceValue)} />
          <MetricCard label="Upcoming bookings" value={stats.upcomingBookings} />
        </div>

        {!selected && (
          <div style={{ color: "#8A8A80", fontSize: "14px", padding: "3rem 0", textAlign: "center" }}>
            Select a contact to see their full record, or add a new one to get started.
          </div>
        )}

        {selected && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div>
                <div className="serif" style={{ fontSize: "22px", fontWeight: 600 }}>{selected.name}</div>
                <div style={{ fontSize: "13px", color: "#8A8A80", marginTop: "2px" }}>
                  {[selected.company, selected.email, selected.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select value={selected.stage} onChange={(e) => updateStage(selected.id, e.target.value)} style={{ width: "auto" }}>
                  {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
                <button className="ghost" onClick={() => deleteContact(selected.id)}>Delete</button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#5C5F58" }}>Timeline</div>
              <button className="ghost" onClick={() => setShowRecordForm(true)}>Add record</button>
            </div>

            {selectedRecords.length === 0 && (
              <div style={{ color: "#8A8A80", fontSize: "13px", padding: "1.5rem 0" }}>Nothing logged for this contact yet.</div>
            )}

            <div>
              {selectedRecords.map((r) => {
                const t = RECORD_TYPES[r.type];
                return (
                  <div key={r.id} style={{ borderLeft: `3px solid ${t.color}`, padding: "10px 14px", marginBottom: "8px", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>
                        <span style={{ fontSize: "11px", color: t.color, background: t.bg, borderRadius: "4px", padding: "1px 6px", marginRight: "8px" }}>{t.label}</span>
                        {r.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "#8A8A80", marginTop: "3px" }}>{formatDate(r.date)}{r.notes ? ` · ${r.notes}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {r.amount ? <div style={{ fontSize: "13px", fontWeight: 500 }}>{formatMoney(r.amount)}</div> : null}
                      <select value={r.status} onChange={(e) => updateRecordStatus(r.id, e.target.value)} style={{ width: "auto", fontSize: "12px", padding: "4px 8px" }}>
                        {STATUS_OPTIONS[r.type].map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                      <button className="ghost" style={{ padding: "4px 8px" }} onClick={() => deleteRecord(r.id)}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showContactForm && <ContactForm onCancel={() => setShowContactForm(false)} onSave={addContact} />}
      {showRecordForm && selected && <RecordForm onCancel={() => setShowRecordForm(false)} onSave={addRecord} contactName={selected.name} />}
    </>
  );
}

function DateCell({ value, onCommit, style, className }) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <input
      className={className || "deal-cell"}
      type="date"
      value={local}
      style={style}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
    />
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={{ background: "#F0EEE5", borderRadius: "8px", padding: "0.85rem 1rem" }}>
      <div style={{ fontSize: "12px", color: "#7A7A70", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Overlay({ children, onCancel }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(27,30,29,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }} onClick={onCancel}>
      <div style={{ background: "#FAFAF8", borderRadius: "10px", padding: "1.5rem", width: "360px", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function CsvImportModal({ onCancel, onImport, summary, title, helpText }) {
  return (
    <Overlay onCancel={onCancel}>
      <div className="serif" style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
        {title}
      </div>

      {!summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: "#5C5F58" }}>{helpText}</div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
            }}
          />
        </div>
      )}

      {summary && summary.error && (
        <div style={{ fontSize: "13px", color: "#A0473F" }}>{summary.error}</div>
      )}

      {summary && !summary.error && (
        <div style={{ fontSize: "13px", color: "#1B1E1D" }}>
          Imported <strong>{summary.newRows}</strong> row{summary.newRows === 1 ? "" : "s"}.
          {summary.skippedDuplicates > 0 ? (
            <div style={{ marginTop: "6px", color: "#8A8A80" }}>
              Skipped {summary.skippedDuplicates} row{summary.skippedDuplicates === 1 ? "" : "s"} already in the table (same title and date).
            </div>
          ) : null}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
        <button className="ghost" onClick={onCancel}>
          {summary ? "Close" : "Cancel"}
        </button>
      </div>
    </Overlay>
  );
}


function ContactForm({ onCancel, onSave }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", stage: "Lead" });
  const [error, setError] = useState("");

  function submit() {
    if (!form.name.trim()) { setError("Enter a name first."); return; }
    onSave(form);
  }

  return (
    <Overlay onCancel={onCancel}>
      <div className="serif" style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Add contact</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input placeholder="Full name" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); if (error) setError(""); }} />
        {error && <div style={{ fontSize: "12px", color: "#A0473F" }}>{error}</div>}
        <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input placeholder="name@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
          {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={submit}>Save contact</button>
      </div>
    </Overlay>
  );
}

function RecordForm({ onCancel, onSave, contactName }) {
  const [form, setForm] = useState({ type: "order", title: "", amount: "", date: new Date().toISOString().slice(0, 10), status: STATUS_OPTIONS.order[0], notes: "" });
  const [error, setError] = useState("");

  function setType(type) { setForm({ ...form, type, status: STATUS_OPTIONS[type][0] }); }

  function submit() {
    if (!form.title.trim()) { setError("Enter a title first."); return; }
    onSave({ ...form, amount: form.amount ? Number(form.amount) : 0 });
  }

  return (
    <Overlay onCancel={onCancel}>
      <div className="serif" style={{ fontSize: "16px", fontWeight: 600, marginBottom: "2px" }}>Add record</div>
      <div style={{ fontSize: "12px", color: "#8A8A80", marginBottom: "12px" }}>For {contactName}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <select value={form.type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(RECORD_TYPES).map(([key, t]) => (<option key={key} value={key}>{t.label}</option>))}
        </select>
        <input placeholder="Title" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (error) setError(""); }} />
        {error && <div style={{ fontSize: "12px", color: "#A0473F" }}>{error}</div>}
        <input placeholder="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {STATUS_OPTIONS[form.type].map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <textarea placeholder="Notes (optional)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={submit}>Save record</button>
      </div>
    </Overlay>
  );
}

/* ---------------- Deals ---------------- */

function DealsView({ data, setData }) {
  const deals = data.deals;
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set(deals.map((d) => new Date(d.dueDate).getFullYear()).filter((y) => !isNaN(y)));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [deals, currentYear]);

  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const filtered = useMemo(() => {
    return deals
      .filter((d) => d.dueDate && new Date(d.dueDate).getFullYear() === year)
      .filter((d) => statusFilter === "All" || d.status === statusFilter)
      .filter((d) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return d.title.toLowerCase().includes(q) || (d.customerEmail || "").toLowerCase().includes(q);
      });
  }, [deals, year, statusFilter, search]);

  const unscheduled = useMemo(() => {
    return deals
      .filter((d) => !d.dueDate)
      .filter((d) => statusFilter === "All" || d.status === statusFilter)
      .filter((d) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return d.title.toLowerCase().includes(q) || (d.customerEmail || "").toLowerCase().includes(q);
      });
  }, [deals, statusFilter, search]);

  const grouped = useMemo(() => {
    const g = {};
    MONTHS.forEach((m) => (g[m] = []));
    filtered.forEach((d) => {
      const m = MONTHS[new Date(d.dueDate).getMonth()];
      if (g[m]) g[m].push(d);
    });
    return g;
  }, [filtered]);

  const metrics = useMemo(() => {
    const inYear = deals.filter((d) => new Date(d.dueDate).getFullYear() === year);
    const perStatus = {};
    DEAL_STATUSES.forEach((s) => {
      const rows = inYear.filter((d) => d.status === s);
      perStatus[s] = { count: rows.length, value: rows.reduce((sum, d) => sum + (Number(d.price) || 0), 0) };
    });
    const openPipeline = inYear.filter((d) => !CLOSED_STATUSES.includes(d.status)).reduce((s, d) => s + (Number(d.price) || 0), 0);
    const wonValue = perStatus["Complete"].value;
    const closedCount = CLOSED_STATUSES.reduce((s, st) => s + perStatus[st].count, 0);
    const winRate = closedCount > 0 ? Math.round((perStatus["Complete"].count / closedCount) * 100) : 0;
    const remindersDueToday = inYear.filter((d) => !CLOSED_STATUSES.includes(d.status) && d.nextReminder && d.nextReminder <= todayStr()).length;
    const neverContacted = inYear.filter((d) => !d.lastContact).length;
    return { perStatus, openPipeline, wonValue, winRate, remindersDueToday, neverContacted };
  }, [deals, year]);

  function addDeal() {
    const d = {
      id: uid(),
      title: "New deal",
      customerEmail: "",
      price: 0,
      dueDate: todayStr(),
      status: "Uncontacted",
      lastContact: "",
      nextReminder: "",
      invoiceStatus: "Not Invoiced",
      notes: "",
    };
    setData((prev) => ({ ...prev, deals: [...prev.deals, d] }));
  }

  function clearAllDeals() {
    setData((prev) => ({ ...prev, deals: [] }));
    setConfirmClearAll(false);
  }

  function importQuotesCsv(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCsv(String(e.target.result));
      if (rows.length < 2) {
        setImportSummary({ error: "That file doesn't look like a CSV with a header row and data." });
        return;
      }
      const headers = rows[0].map((h) => h.trim());
      const emailCol = findCsvCol(headers, ["customer", "contact", "email"]);
      const amountCol = findCsvCol(headers, ["amount", "total", "price"]);
      const statusCol = findCsvCol(headers, ["status"]);
      const dateCol = findCsvCol(headers, ["date"]);
      const titleCol = findCsvCol(headers, ["description", "title"]);
      const notesCol = findCsvCol(headers, ["quote number", "number", "note"]);

      let newRows = 0;
      let skippedDuplicates = 0;

      setData((prev) => {
        const deals = [...prev.deals];
        for (let r = 1; r < rows.length; r++) {
          const cols = rows[r];
          const customerEmail = emailCol >= 0 ? (cols[emailCol] || "").trim() : "";
          const price = amountCol >= 0 ? Number(String(cols[amountCol] || "0").replace(/[^0-9.-]/g, "")) : 0;
          const rawStatus = statusCol >= 0 ? (cols[statusCol] || "").trim() : "";
          const lastContact = dateCol >= 0 ? normalizeCsvDate(cols[dateCol]) : "";
          const title = titleCol >= 0 ? (cols[titleCol] || "").trim() : `Quote ${r}`;
          const notes = notesCol >= 0 ? (cols[notesCol] || "").trim() : "";

          if (!title && !customerEmail) continue;

          const matchedStatus = DEAL_STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
          const status = matchedStatus || "Uncontacted";

          const isDuplicate = deals.some(
            (d) => d.title.trim().toLowerCase() === title.trim().toLowerCase() && d.lastContact === lastContact
          );
          if (isDuplicate) {
            skippedDuplicates++;
            continue;
          }

          deals.push({
            id: uid(),
            title,
            customerEmail,
            price,
            dueDate: "",
            status,
            lastContact,
            nextReminder: lastContact ? addDays(lastContact, 90) : "",
            invoiceStatus: "Not Invoiced",
            notes: notes ? `Quote #${notes}` : "",
          });
          newRows++;
        }
        return { ...prev, deals };
      });

      setImportSummary({ newRows, skippedDuplicates });
    };
    reader.readAsText(file);
  }

  const AUTO_CARRY_STATUSES = ["Complete", "Lost", "Lost to price"];

  function updateDeal(id, patch) {
    setData((prev) => {
      const current = prev.deals.find((d) => d.id === id);
      if (!current) return prev;

      const next = { ...current, ...patch };
      if (patch.status && patch.status !== current.status) {
        next.lastContact = todayStr();
        next.nextReminder = addDays(todayStr(), 90);
      }
      if (patch.lastContact !== undefined) {
        next.nextReminder = patch.lastContact ? addDays(patch.lastContact, 90) : "";
      }

      let deals = prev.deals.map((d) => (d.id === id ? next : d));

      const justClosed =
        patch.status && patch.status !== current.status && AUTO_CARRY_STATUSES.includes(patch.status);
      if (justClosed) {
        let carriedDueDate = "";
        if (next.dueDate) {
          const nextDue = new Date(next.dueDate);
          nextDue.setFullYear(nextDue.getFullYear() + 1);
          carriedDueDate = nextDue.toISOString().slice(0, 10);
        }
        deals = [
          ...deals,
          {
            ...next,
            id: uid(),
            dueDate: carriedDueDate,
            status: "Uncontacted",
            lastContact: "",
            nextReminder: "",
            invoiceStatus: "Not Invoiced",
          },
        ];
      }

      return { ...prev, deals };
    });
  }

  function deleteDeal(id) {
    setData((prev) => ({ ...prev, deals: prev.deals.filter((d) => d.id !== id) }));
    setConfirmDeleteId(null);
  }

  function addToNextYear(deal) {
    let carriedDueDate = "";
    if (deal.dueDate) {
      const nextDue = new Date(deal.dueDate);
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      carriedDueDate = nextDue.toISOString().slice(0, 10);
    }
    const copy = {
      ...deal,
      id: uid(),
      dueDate: carriedDueDate,
      status: "Uncontacted",
      lastContact: "",
      nextReminder: "",
      invoiceStatus: "Not Invoiced",
    };
    setData((prev) => ({ ...prev, deals: [...prev.deals, copy] }));
  }

  return (
    <>
    <div style={{ flex: 1, overflowY: "auto", padding: "1.75rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div className="serif" style={{ fontSize: "22px", fontWeight: 600 }}>Quotes Dashboard</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "auto" }}>
            {years.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
          <input placeholder="Search deals" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "180px" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="All">All statuses</option>
            {DEAL_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <button className="primary" onClick={addDeal}>Add new deal</button>
          <button className="ghost" onClick={() => { setImportSummary(null); setShowImportModal(true); }}>Import CSV</button>
          {confirmClearAll ? (
            <button className="danger" onClick={clearAllDeals}>Confirm clear all?</button>
          ) : (
            <button className="ghost" onClick={() => setConfirmClearAll(true)}>Clear all</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1rem" }}>
        <MetricCard label="Open pipeline" value={formatMoney(metrics.openPipeline)} />
        <MetricCard label="Won value" value={formatMoney(metrics.wonValue)} />
        <MetricCard label="Win rate" value={`${metrics.winRate}%`} />
        <MetricCard label="Reminders due today" value={metrics.remindersDueToday} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1.75rem" }}>
        <MetricCard label="Never contacted" value={metrics.neverContacted} />
        {["Uncontacted", "Complete", "Lost", "Dead"].map((s) => (
          <MetricCard key={s} label={`${s} (${metrics.perStatus[s].count})`} value={formatMoney(metrics.perStatus[s].value)} />
        ))}
      </div>

      {filtered.length === 0 && unscheduled.length === 0 && (
        <div style={{ color: "#8A8A80", fontSize: "13px", padding: "2rem 0", textAlign: "center" }}>
          No deals match this filter. Add one, or connect Wix to import your live rows.
        </div>
      )}

      {unscheduled.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#5C5F58", marginBottom: "6px" }}>
            Unscheduled <span style={{ color: "#8A8A80", fontWeight: 400 }}>(no due date set — set one to move it into a month)</span>
          </div>
          <div style={{ border: "1px solid #EDEBE2", borderRadius: "8px", overflow: "hidden", background: "#FFFFFF" }}>
            <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1fr 1fr 1.1fr 1.6fr 0.6fr", background: "#F2F0E7", fontSize: "11px", color: "#7A7A70", padding: "6px 4px" }}>
              <div style={{ padding: "0 6px" }}>Price</div>
              <div style={{ padding: "0 6px" }}>Status</div>
              <div style={{ padding: "0 6px" }}>Title</div>
              <div style={{ padding: "0 6px" }}>Customer email</div>
              <div style={{ padding: "0 6px" }}>Due date</div>
              <div style={{ padding: "0 6px" }}>Last contact</div>
              <div style={{ padding: "0 6px" }}>Next reminder</div>
                <div style={{ padding: "0 6px" }}>Invoiced</div>
              <div style={{ padding: "0 6px" }}>Notes</div>
              <div></div>
            </div>
            {unscheduled.map((d) => {
              const sc = DEAL_STATUS_COLOR[d.status];
              const overdue = !CLOSED_STATUSES.includes(d.status) && d.nextReminder && d.nextReminder <= todayStr();
              return (
                <div key={d.id} className="deal-row" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1fr 1fr 1.1fr 1.6fr 0.6fr", alignItems: "center", background: sc.bg + "22" }}>
                  <input className="deal-cell" type="number" value={d.price} onChange={(e) => updateDeal(d.id, { price: Number(e.target.value) })} style={{ fontWeight: 600 }} />
                  <select
                    className="deal-cell"
                    value={d.status}
                    onChange={(e) => updateDeal(d.id, { status: e.target.value })}
                    style={{ color: sc.color, background: sc.bg, fontWeight: 600, borderRadius: "5px", border: "none" }}
                  >
                    {DEAL_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <input className="deal-cell" value={d.title} onChange={(e) => updateDeal(d.id, { title: e.target.value })} />
                  <input className="deal-cell" value={d.customerEmail} onChange={(e) => updateDeal(d.id, { customerEmail: e.target.value })} />
                  <DateCell value={d.dueDate} onCommit={(v) => updateDeal(d.id, { dueDate: v })} />
                  <input className="deal-cell" type="date" value={d.lastContact} onChange={(e) => updateDeal(d.id, { lastContact: e.target.value })} />
                  <div className="deal-cell" style={{ color: overdue ? "#E14B3E" : "#8A8A80", fontWeight: overdue ? 600 : 400 }}>
                    {formatDate(d.nextReminder) || "—"}
                  </div>
                  <select
                    className="deal-cell"
                    value={d.invoiceStatus || "Not Invoiced"}
                    onChange={(e) => updateDeal(d.id, { invoiceStatus: e.target.value })}
                    style={{ color: INVOICED_STATUS_COLOR[d.invoiceStatus || "Not Invoiced"].color, background: INVOICED_STATUS_COLOR[d.invoiceStatus || "Not Invoiced"].bg, fontWeight: 600, borderRadius: "5px", border: "none" }}
                  >
                    {INVOICED_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <input className="deal-cell" placeholder="Notes" value={d.notes || ""} onChange={(e) => updateDeal(d.id, { notes: e.target.value })} />
                  <div style={{ display: "flex", gap: "4px", padding: "0 6px" }}>
                    <button className="ghost" title="Copy to next year" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => addToNextYear(d)}>↻</button>
                    {confirmDeleteId === d.id ? (
                      <button className="danger" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => deleteDeal(d.id)}>Sure?</button>
                    ) : (
                      <button className="ghost" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => setConfirmDeleteId(d.id)}>×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {MONTHS.map((m) => {
        const rows = grouped[m];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={m} style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#5C5F58", marginBottom: "6px" }}>{m} {year}</div>
            <div style={{ border: "1px solid #EDEBE2", borderRadius: "8px", overflow: "hidden", background: "#FFFFFF" }}>
              <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1fr 1fr 1.1fr 1.6fr 0.6fr", background: "#F2F0E7", fontSize: "11px", color: "#7A7A70", padding: "6px 4px" }}>
                <div style={{ padding: "0 6px" }}>Price</div>
                <div style={{ padding: "0 6px" }}>Status</div>
                <div style={{ padding: "0 6px" }}>Title</div>
                <div style={{ padding: "0 6px" }}>Customer email</div>
                <div style={{ padding: "0 6px" }}>Due date</div>
                <div style={{ padding: "0 6px" }}>Last contact</div>
                <div style={{ padding: "0 6px" }}>Next reminder</div>
                <div style={{ padding: "0 6px" }}>Invoiced</div>
                <div style={{ padding: "0 6px" }}>Notes</div>
                <div></div>
              </div>
              {rows
                .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                .map((d) => {
                  const sc = DEAL_STATUS_COLOR[d.status];
                  const overdue = !CLOSED_STATUSES.includes(d.status) && d.nextReminder && d.nextReminder <= todayStr();
                  return (
                    <div key={d.id} className="deal-row" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1fr 1fr 1.1fr 1.6fr 0.6fr", alignItems: "center", background: sc.bg + "22" }}>
                      <input className="deal-cell" type="number" value={d.price} onChange={(e) => updateDeal(d.id, { price: Number(e.target.value) })} style={{ fontWeight: 600 }} />
                      <select
                        className="deal-cell"
                        value={d.status}
                        onChange={(e) => updateDeal(d.id, { status: e.target.value })}
                        style={{ color: sc.color, background: sc.bg, fontWeight: 600, borderRadius: "5px", border: "none" }}
                      >
                        {DEAL_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                      <input className="deal-cell" value={d.title} onChange={(e) => updateDeal(d.id, { title: e.target.value })} />
                      <input className="deal-cell" value={d.customerEmail} onChange={(e) => updateDeal(d.id, { customerEmail: e.target.value })} />
                      <DateCell value={d.dueDate} onCommit={(v) => updateDeal(d.id, { dueDate: v })} />
                      <input className="deal-cell" type="date" value={d.lastContact} onChange={(e) => updateDeal(d.id, { lastContact: e.target.value })} />
                      <div className="deal-cell" style={{ color: overdue ? "#E14B3E" : "#8A8A80", fontWeight: overdue ? 600 : 400 }}>
                        {formatDate(d.nextReminder) || "—"}
                      </div>
                      <select
                        className="deal-cell"
                        value={d.invoiceStatus || "Not Invoiced"}
                        onChange={(e) => updateDeal(d.id, { invoiceStatus: e.target.value })}
                        style={{ color: INVOICED_STATUS_COLOR[d.invoiceStatus || "Not Invoiced"].color, background: INVOICED_STATUS_COLOR[d.invoiceStatus || "Not Invoiced"].bg, fontWeight: 600, borderRadius: "5px", border: "none" }}
                      >
                        {INVOICED_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                      <input className="deal-cell" placeholder="Notes" value={d.notes || ""} onChange={(e) => updateDeal(d.id, { notes: e.target.value })} />
                      <div style={{ display: "flex", gap: "4px", padding: "0 6px" }}>
                        <button className="ghost" title="Copy to next year" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => addToNextYear(d)}>↻</button>
                        {confirmDeleteId === d.id ? (
                          <button className="danger" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => deleteDeal(d.id)}>Sure?</button>
                        ) : (
                          <button className="ghost" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => setConfirmDeleteId(d.id)}>×</button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
    {showImportModal && (
      <CsvImportModal
        onCancel={() => setShowImportModal(false)}
        onImport={importQuotesCsv}
        summary={importSummary}
        title="Import quotes CSV"
        helpText="Expects columns: Quote Number, Description, Customer / Contact, Date, Amount, Status. Description becomes the title, Amount the price, Quote Number goes into notes, and Customer/Contact into the customer email field. Status defaults to Uncontacted if it doesn't match one of the 8 pipeline stages."
      />
    )}
    </>
  );
}

/* ---------------- Invoices ---------------- */

function InvoicesView({ data, setData }) {
  const invoices = data.invoices;
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set(invoices.map((d) => new Date(d.dueDate).getFullYear()).filter((y) => !isNaN(y)));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [invoices, currentYear]);

  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const filtered = useMemo(() => {
    return invoices
      .filter((d) => new Date(d.dueDate).getFullYear() === year)
      .filter((d) => statusFilter === "All" || d.status === statusFilter)
      .filter((d) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return d.title.toLowerCase().includes(q) || (d.customerEmail || "").toLowerCase().includes(q);
      });
  }, [invoices, year, statusFilter, search]);

  const grouped = useMemo(() => {
    const g = {};
    MONTHS.forEach((m) => (g[m] = []));
    filtered.forEach((d) => {
      const m = MONTHS[new Date(d.dueDate).getMonth()];
      if (g[m]) g[m].push(d);
    });
    return g;
  }, [filtered]);

  const metrics = useMemo(() => {
    const inYear = invoices.filter((d) => new Date(d.dueDate).getFullYear() === year);
    const outstanding = inYear
      .filter((d) => ["Sent", "Partially Paid", "Overdue"].includes(d.status))
      .reduce((s, d) => s + (Number(d.price) || 0), 0);
    const paid = inYear.filter((d) => d.status === "Paid").reduce((s, d) => s + (Number(d.price) || 0), 0);
    const overdueCount = inYear.filter((d) => d.status === "Overdue").length;
    const draftCount = inYear.filter((d) => d.status === "Draft").length;
    return { outstanding, paid, overdueCount, draftCount };
  }, [invoices, year]);

  function addInvoice() {
    const d = {
      id: uid(),
      title: "New invoice",
      customerEmail: "",
      price: 0,
      dueDate: todayStr(),
      status: "Draft",
      notes: "",
    };
    setData((prev) => ({ ...prev, invoices: [...prev.invoices, d] }));
  }

  function clearAllInvoices() {
    setData((prev) => ({ ...prev, invoices: [] }));
    setConfirmClearAll(false);
  }

  function importInvoicesCsv(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCsv(String(e.target.result));
      if (rows.length < 2) {
        setImportSummary({ error: "That file doesn't look like a CSV with a header row and data." });
        return;
      }
      const headers = rows[0].map((h) => h.trim());
      const invoiceNumberCol = findCsvCol(headers, ["invoice #", "invoice number", "number", "#"]);
      const customerCol = findCsvCol(headers, ["customer", "contact", "email"]);
      const dueDateCol = findCsvCol(headers, ["due date"]);
      const invoiceDateCol = findCsvCol(headers, ["invoice date", "date"]);
      const amountCol = findCsvCol(headers, ["amount", "total", "price"]);
      const statusCol = findCsvCol(headers, ["status"]);

      let newRows = 0;
      let skippedDuplicates = 0;

      setData((prev) => {
        const invoices = [...prev.invoices];
        for (let r = 1; r < rows.length; r++) {
          const cols = rows[r];
          const invoiceNumber = invoiceNumberCol >= 0 ? (cols[invoiceNumberCol] || "").trim() : "";
          const customerEmail = customerCol >= 0 ? (cols[customerCol] || "").trim() : "";
          const price = amountCol >= 0 ? Number(String(cols[amountCol] || "0").replace(/[^0-9.-]/g, "")) : 0;
          const rawStatus = statusCol >= 0 ? (cols[statusCol] || "").trim() : "";
          const dueDateRaw = dueDateCol >= 0 ? (cols[dueDateCol] || "").trim() : "";
          const dueDate = normalizeCsvDate(dueDateRaw) || todayStr();
          const title = invoiceNumber ? `Invoice ${invoiceNumber}` : `Invoice ${r}`;

          if (!invoiceNumber && !customerEmail) continue;

          const matchedStatus = INVOICE_STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
          const status = matchedStatus || "Draft";

          const isDuplicate = invoices.some(
            (d) => d.title.trim().toLowerCase() === title.trim().toLowerCase()
          );
          if (isDuplicate) {
            skippedDuplicates++;
            continue;
          }

          invoices.push({
            id: uid(),
            title,
            customerEmail,
            price,
            dueDate,
            status,
            notes: "Imported from CSV",
          });
          newRows++;
        }
        return { ...prev, invoices };
      });

      setImportSummary({ newRows, skippedDuplicates });
    };
    reader.readAsText(file);
  }

  function updateInvoice(id, patch) {
    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }

  function deleteInvoice(id) {
    setData((prev) => ({ ...prev, invoices: prev.invoices.filter((d) => d.id !== id) }));
    setConfirmDeleteId(null);
  }

  return (
    <>
    <div style={{ flex: 1, overflowY: "auto", padding: "1.75rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div className="serif" style={{ fontSize: "22px", fontWeight: 600 }}>Invoice Dashboard</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "auto" }}>
            {years.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
          <input placeholder="Search invoices" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "180px" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="All">All statuses</option>
            {INVOICE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <button className="primary" onClick={addInvoice}>Add new invoice</button>
          <button className="ghost" onClick={() => { setImportSummary(null); setShowImportModal(true); }}>Import CSV</button>
          {confirmClearAll ? (
            <button className="danger" onClick={clearAllInvoices}>Confirm clear all?</button>
          ) : (
            <button className="ghost" onClick={() => setConfirmClearAll(true)}>Clear all</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1.75rem" }}>
        <MetricCard label="Outstanding" value={formatMoney(metrics.outstanding)} />
        <MetricCard label="Paid" value={formatMoney(metrics.paid)} />
        <MetricCard label="Overdue" value={metrics.overdueCount} />
        <MetricCard label="Drafts" value={metrics.draftCount} />
      </div>

      {filtered.length === 0 && (
        <div style={{ color: "#8A8A80", fontSize: "13px", padding: "2rem 0", textAlign: "center" }}>
          No invoices match this filter. Add one, or import a CSV from the Contacts tab.
        </div>
      )}

      {MONTHS.map((m) => {
        const rows = grouped[m];
        if (!rows || rows.length === 0) return null;
        return (
          <div key={m} style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#5C5F58", marginBottom: "6px" }}>{m} {year}</div>
            <div style={{ border: "1px solid #EDEBE2", borderRadius: "8px", overflow: "hidden", background: "#FFFFFF" }}>
              <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1.6fr 0.6fr", background: "#F2F0E7", fontSize: "11px", color: "#7A7A70", padding: "6px 4px" }}>
                <div style={{ padding: "0 6px" }}>Price</div>
                <div style={{ padding: "0 6px" }}>Status</div>
                <div style={{ padding: "0 6px" }}>Title</div>
                <div style={{ padding: "0 6px" }}>Customer email</div>
                <div style={{ padding: "0 6px" }}>Due date</div>
                <div style={{ padding: "0 6px" }}>Notes</div>
                <div></div>
              </div>
              {rows
                .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                .map((d) => {
                  const sc = INVOICE_STATUS_COLOR[d.status];
                  const overdue =
                    d.status === "Overdue" ||
                    (!INVOICE_CLOSED_STATUSES.includes(d.status) && d.dueDate && d.dueDate < todayStr());
                  return (
                    <div key={d.id} className="deal-row" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.2fr 1.6fr 1.4fr 1fr 1.6fr 0.6fr", alignItems: "center", background: sc.bg + "22" }}>
                      <input className="deal-cell" type="number" value={d.price} onChange={(e) => updateInvoice(d.id, { price: Number(e.target.value) })} style={{ fontWeight: 600 }} />
                      <select
                        className="deal-cell"
                        value={d.status}
                        onChange={(e) => updateInvoice(d.id, { status: e.target.value })}
                        style={{ color: sc.color, background: sc.bg, fontWeight: 600, borderRadius: "5px", border: "none" }}
                      >
                        {INVOICE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                      <input className="deal-cell" value={d.title} onChange={(e) => updateInvoice(d.id, { title: e.target.value })} />
                      <input className="deal-cell" value={d.customerEmail} onChange={(e) => updateInvoice(d.id, { customerEmail: e.target.value })} />
                      <input
                        className="deal-cell"
                        type="date"
                        value={d.dueDate}
                        onChange={(e) => updateInvoice(d.id, { dueDate: e.target.value })}
                        style={{ color: overdue ? "#E14B3E" : "#1B1E1D", fontWeight: overdue ? 600 : 400 }}
                      />
                      <input className="deal-cell" placeholder="Notes" value={d.notes || ""} onChange={(e) => updateInvoice(d.id, { notes: e.target.value })} />
                      <div style={{ display: "flex", gap: "4px", padding: "0 6px" }}>
                        {confirmDeleteId === d.id ? (
                          <button className="danger" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => deleteInvoice(d.id)}>Sure?</button>
                        ) : (
                          <button className="ghost" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => setConfirmDeleteId(d.id)}>×</button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
    {showImportModal && (
      <CsvImportModal
        onCancel={() => setShowImportModal(false)}
        onImport={importInvoicesCsv}
        summary={importSummary}
        title="Import invoices CSV"
        helpText="Upload the CSV you exported from Wix Invoices. Rows with a status that matches Draft, Sent, Partially Paid, Paid, Overdue, or Voided will use it; anything else defaults to Draft."
      />
    )}
    </>
  );
}

