const root = document.querySelector("#root");
const stages = [
  "New",
  "Contacted",
  "Qualified",
  "Discovery",
  "Proposal",
  "Won",
  "Lost",
];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
function dollars(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value)))
    throw Error("Enter a dollar amount with up to two decimal places.");
  const [whole, fraction = ""] = String(value).split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
let owner,
  apps = [],
  candidates = [],
  selected,
  tab = "Overview",
  detail,
  leads = [],
  asOf = "2026-10-08",
  generation = 0,
  notice = "";
async function api(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      data.error === "APP_UNAVAILABLE"
        ? "This App is unavailable."
        : data.error === "LEAD_REVISION_CONFLICT"
          ? "This lead changed. Refresh before saving again."
          : data.error === "INSTALLATION_STALE"
            ? "The installation changed. Review a fresh approval."
            : "The request could not be completed. Refresh and try again.",
    );
  return data;
}
function call(operation, input = {}, extra = {}) {
  return api("/api/app", {
    appId: selected.appId,
    version: selected.installedVersion,
    digest: selected.installedDigest,
    operation,
    input,
    ...extra,
  });
}
function fail(error) {
  const el = document.querySelector("#notice");
  if (el) {
    el.textContent = error.message;
    el.classList.add("error");
    el.setAttribute("role", "alert");
  }
}
function shell(content) {
  return `<div class="layout"><aside class="sidebar"><p class="wordmark">MyEve<span class="muted">.</span></p><nav aria-label="MyEve"><span class="placeholder">Today</span><span class="placeholder">Chat</span><span class="placeholder">Work</span><span class="placeholder">Files</span><button class="active" id="home">Apps</button><span class="placeholder">Needs You</span></nav><p class="fixture">Isolated reference<br>Synthetic data only<br>No external effects</p></aside><main id="main" class="main"><div class="topline"><span class="muted">Your workspace / Apps</span><button id="switch">Switch fixture owner</button></div><div id="notice" class="notice" role="status" aria-live="polite">${escape(notice)}</div>${content}</main></div>`;
}
function login() {
  root.innerHTML = `<main id="main" class="panel login"><p class="wordmark">MyEve.</p><h1>Apps reference</h1><p class="muted">Explore the deterministic prototype with synthetic data. This fixture is separate from your real workspace.</p><form id="login"><label>Fixture owner<select name="owner"><option value="synthetic-owner-a">Owner A</option><option value="synthetic-owner-b">Owner B</option></select></label><button class="primary">Enter workspace</button></form><p id="notice" role="status"></p></main>`;
  document.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      owner = (
        await api("/api/fixture-login", {
          owner: new FormData(e.target).get("owner"),
        })
      ).ownerId;
      selected = null;
      await render();
    } catch (error) {
      fail(error);
    }
  };
}
function leadTable(rows) {
  if (!rows.length)
    return '<p class="empty">No leads here yet. Add a lead to get started.</p>';
  return `<div class="table-scroll"><table class="list"><thead><tr><th>Lead</th><th>Stage</th><th>Pipeline value</th><th>Spend</th><th>Follow-up</th></tr></thead><tbody>${rows.map((l) => `<tr><td><button class="lead-link" data-id="${escape(l.id)}">${escape(l.company)}</button><br><small>${escape(l.name)}</small></td><td>${escape(l.stage)}</td><td>${money(l.valueCents)}</td><td>${money(l.spendCents)}</td><td>${escape(l.followup ?? "Not scheduled")}</td></tr>`).join("")}</tbody></table></div>`;
}
async function render() {
  const revision = ++generation;
  const inventory = await api("/api/apps");
  if (revision !== generation) return;
  apps = inventory.apps;
  candidates = inventory.candidates;
  asOf = inventory.asOf;
  if (selected) selected = apps.find((a) => a.appId === selected.appId);
  let content;
  if (!selected) {
    content = `<p class="eyebrow">Persistent tools for your work</p><h1>Your Apps</h1><p class="muted">Use them here, or ask Sofie to work with the same information.</p><label class="search">Search Apps<input id="app-search" type="search" placeholder="Find an App"></label><div id="app-list" class="section-title">${
      apps.length
        ? apps
            .map(
              (a) =>
                `<section class="panel app-card"><div class="row spread"><div><h2>Lead CRM</h2><p class="muted">Leads, pipeline, spend and follow-ups in one place.</p><span class="status">${a.installedVersion ? (a.enabled ? "Installed · enabled" : "Installed · disabled") : "Ready for your review"}</span></div><div class="row">${a.installedVersion ? `<button class="primary launch" data-id="${escape(a.appId)}">Open Lead CRM</button>` : ""}${candidates
                  .filter(
                    (c) =>
                      c.appId === a.appId && c.version !== a.installedVersion,
                  )
                  .map(
                    (c) =>
                      `<button class="preview" data-id="${escape(c.appId)}" data-preview="${escape(c.previewId)}" data-version="${c.version}">${a.installedVersion ? "Preview update" : "Preview App"}</button>`,
                  )
                  .join("")}</div></div></section>`,
            )
            .join("")
        : '<div class="panel empty"><h2>No Apps installed</h2><p>When Sofie prepares an App for you, review it here before installing.</p></div>'
    }</div>`;
  } else {
    const metadata = await call(
      "detail",
      {},
      { version: selected.installedVersion ?? 1 },
    );
    let body;
    if (tab === "App details") body = detailsView(metadata);
    else if (!selected.enabled)
      body =
        '<section class="panel"><h2>This App is disabled</h2><p>Your data is preserved. Review App details to enable it.</p></section>';
    else {
      leads = await call("listLeads", {});
      if (tab === "Overview") {
        const metrics = await call("getMetrics", {
          asOf,
          periodStart: asOf.slice(0, 8) + "01",
        });
        body = `<div class="grid">${[
          ["Open leads", metrics.openLeads],
          ["Open pipeline", money(metrics.openPipelineCents)],
          ["Follow-ups due", metrics.followupsDue],
          ["Win rate", metrics.winRateBasisPoints / 100 + "%"],
          ["Closed this period", metrics.closedThisPeriod],
          ["Acquisition spend", money(metrics.acquisitionSpendCents)],
        ]
          .map(
            ([label, value]) =>
              `<section class="metric"><span class="muted">${label}</span><strong>${value}</strong></section>`,
          )
          .join(
            "",
          )}</div><h2 class="section-title">Follow-ups due</h2><section class="panel">${leadTable(leads.filter((l) => l.followup && l.followup <= asOf && !["Won", "Lost"].includes(l.stage)))}</section>`;
      } else if (tab === "Pipeline")
        body = `<div class="board" role="region" aria-label="Pipeline stages" tabindex="0">${stages
          .map(
            (s) =>
              `<section class="column"><h2>${s} · ${leads.filter((l) => l.stage === s).length}</h2>${leads
                .filter((l) => l.stage === s)
                .map(
                  (l) =>
                    `<button class="lead-card lead-link" data-id="${escape(l.id)}"><strong>${escape(l.company)}</strong><small>${escape(l.name)}</small>${money(l.valueCents)}</button>`,
                )
                .join("")}</section>`,
          )
          .join("")}</div>`;
      else if (tab === "Lead Detail")
        body = leadDetail(leads.find((l) => l.id === detail));
      else if (tab === "Follow-ups")
        body = `<section class="panel"><h2>Upcoming and overdue</h2>${leadTable(leads.filter((l) => l.followup && !["Won", "Lost"].includes(l.stage)).sort((a, b) => a.followup.localeCompare(b.followup)))}</section>`;
      else if (tab === "Lead Sources")
        body = `<section class="panel"><h2>Lead source report</h2>${[...new Set(leads.map((l) => l.source))].map((source) => `<p>${escape(source)} · ${leads.filter((l) => l.source === source).length} leads · ${money(leads.filter((l) => l.source === source).reduce((n, l) => n + l.spendCents, 0))} spent</p>`).join("") || "<p>No sources yet.</p>"}</section>`;
      else
        body = `<div class="row"><label class="search">Search leads<input id="search" type="search" placeholder="Name or company"></label><label>Stage<select id="stage-filter"><option value="">All stages</option>${stages.map((s) => `<option>${s}</option>`).join("")}</select></label></div><section class="panel section-title" id="lead-list">${leadTable(leads)}</section>`;
    }
    content = `<div class="row spread"><div><p class="eyebrow">Your App</p><h1>Lead CRM</h1><p class="muted">Keep every conversation moving forward.</p></div><div class="row"><button id="refresh">Refresh</button>${selected.enabled ? '<button id="create" class="primary">Add lead</button>' : ""}</div></div><nav class="tabs" aria-label="Lead CRM views">${[...metadata.version.package.spec.ui.navigation, "App details"].map((t) => `<button class="tab" data-tab="${escape(t)}" ${tab === t ? 'aria-current="page"' : ""}>${escape(t)}</button>`).join("")}</nav>${body}<section class="panel section-title"><h2>Ask Sofie</h2><p class="muted">The reference understands “Which leads need follow-up?” and “Move Acme to Proposal.”</p><form id="sofie"><label>Your request<input name="request" required maxlength="1000" placeholder="Move Acme to Proposal."></label><button>Ask Sofie</button></form></section>`;
  }
  if (revision !== generation) return;
  root.innerHTML = shell(content);
  bind();
}
function detailsView(metadata) {
  return `<section class="panel"><div class="row spread"><h2>App details</h2><span class="status">${metadata.version.state === "VERIFIED" ? "Verified candidate" : escape(metadata.version.state)}</span></div><p>Version ${metadata.app.installedVersion} · ${selected.enabled ? "Enabled" : "Disabled"}</p><h3>What this App can do</h3><p>Read and update its own leads, notes, acquisition spend and follow-ups.</p><h3>What remains unavailable</h3><p>Email sending, payments, external services, other Apps, owner files, computer access, publishing and deployment.</p><p>No Skills or external dependencies are enabled.</p><button id="toggle">${selected.enabled ? "Disable App" : "Enable App"}</button><details><summary>Version, qualification and Proof</summary><p class="code">App: ${escape(selected.appId)}<br>Digest: ${escape(selected.installedDigest)}<br>Originating Work: ${escape(metadata.version.package.work.workId)}<br>Factory source: ${escape(metadata.version.package.factoryVersion.sourceCommit)}</p><p>Proof describes the verified candidate before installation. Current installation: version ${metadata.app.installedVersion}.</p><p class="muted">${metadata.history.length} recorded events. Synthetic reference qualification only.</p></details></section>`;
}
function leadDetail(l) {
  if (!l) return '<p class="empty">Lead unavailable.</p>';
  const input = (label, name, value, type = "text") =>
    `<label>${label}<input name="${name}" value="${escape(value)}" type="${type}" ${type === "number" ? 'min="0" step="0.01"' : ""} required></label>`;
  return `<div class="row"><button id="back">Back to leads</button><h2>${escape(l.company)}</h2></div><div class="split"><section class="panel"><form id="edit"><h2>Contact and opportunity</h2><div class="form-grid">${input("Lead name", "name", l.name)}${input("Company", "company", l.company)}${input("Contact information", "contact", l.contact)}${input("Source", "source", l.source)}${input("Pipeline value ($)", "valueCents", l.valueCents / 100, "number")}</div><button>Save details</button></form><hr><form id="stage"><label>Pipeline stage<select name="stage" aria-label="Pipeline stage">${stages.map((s) => `<option ${s === l.stage ? "selected" : ""}>${s}</option>`).join("")}</select></label><button>Save stage</button></form><hr><form id="followup"><label>Next follow-up<input name="date" type="date" value="${escape(l.followup)}"></label><button>Save follow-up</button></form></section><section class="panel"><h2>Acquisition spend</h2><p>${money(l.spendCents)} total</p><form id="spend"><label>Add spend ($)<input type="number" min="0" step="0.01" name="amountCents" required></label><button>Record spend</button></form><h2 class="section-title">Notes</h2><ul class="notes">${l.notes.map((n) => `<li>${escape(n.text)}<br><small>${escape(n.createdAt.slice(0, 10))}</small></li>`).join("") || "<li>No notes yet.</li>"}</ul><form id="note"><label>Add a note<textarea name="note" maxlength="2000" required></textarea></label><button>Add note</button></form></section></div>`;
}
function wireForm(selector, action) {
  const form = document.querySelector(selector);
  if (!form) return;
  const requestKey = crypto.randomUUID();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await action(Object.fromEntries(new FormData(form)), requestKey);
      notice = "Saved. Your App and Sofie now see the same information.";
      await render();
    } catch (error) {
      fail(error);
      button.disabled = false;
    }
  };
}
function bindLeadLinks() {
  document.querySelectorAll(".lead-link").forEach(
    (button) =>
      (button.onclick = () => {
        detail = button.dataset.id;
        tab = "Lead Detail";
        render().catch(fail);
      }),
  );
}
function bind() {
  document.querySelector("#switch").onclick = login;
  document.querySelector("#home").onclick = () => {
    selected = null;
    notice = "";
    render().catch(fail);
  };
  document.querySelectorAll(".launch").forEach(
    (button) =>
      (button.onclick = () => {
        selected = apps.find((a) => a.appId === button.dataset.id);
        tab = "Overview";
        render().catch(fail);
      }),
  );
  document
    .querySelectorAll(".preview")
    .forEach(
      (button) => (button.onclick = () => preview(button.dataset).catch(fail)),
    );
  document.querySelectorAll(".tab").forEach(
    (button) =>
      (button.onclick = () => {
        tab = button.dataset.tab;
        render().catch(fail);
      }),
  );
  bindLeadLinks();
  const appSearch = document.querySelector("#app-search");
  if (appSearch)
    appSearch.oninput = () =>
      document
        .querySelectorAll(".app-card")
        .forEach(
          (card) =>
            (card.hidden = !card.textContent
              .toLowerCase()
              .includes(appSearch.value.toLowerCase())),
        );
  if (!selected) return;
  document.querySelector("#refresh").onclick = () => {
    notice = "App refreshed.";
    render().catch(fail);
  };
  const create = document.querySelector("#create");
  if (create) create.onclick = createDialog;
  const back = document.querySelector("#back");
  if (back)
    back.onclick = () => {
      tab = "Leads";
      render().catch(fail);
    };
  const toggle = document.querySelector("#toggle");
  if (toggle)
    toggle.onclick = async () => {
      try {
        await call(
          "setEnabled",
          {},
          { enabled: !selected.enabled, revision: selected.revision },
        );
        await render();
      } catch (error) {
        fail(error);
      }
    };
  const search = document.querySelector("#search"),
    stageFilter = document.querySelector("#stage-filter");
  if (search) {
    const filter = () => {
      document.querySelector("#lead-list").innerHTML = leadTable(
        leads.filter(
          (l) =>
            (!stageFilter.value || l.stage === stageFilter.value) &&
            `${l.name} ${l.company}`
              .toLowerCase()
              .includes(search.value.toLowerCase()),
        ),
      );
      bindLeadLinks();
    };
    search.oninput = filter;
    stageFilter.onchange = filter;
  }
  const current = leads.find((l) => l.id === detail);
  const mutate = (op, data, key) =>
    call(
      op,
      { leadId: current.id, expectedRevision: current.revision, ...data },
      { requestKey: key },
    );
  wireForm("#stage", (d, k) => mutate("updateStage", d, k));
  wireForm("#note", (d, k) => mutate("addNote", d, k));
  wireForm("#spend", (d, k) =>
    mutate("recordSpend", { amountCents: dollars(d.amountCents) }, k),
  );
  wireForm("#followup", (d, k) =>
    mutate("scheduleFollowup", { date: d.date || null }, k),
  );
  wireForm("#edit", (d, k) =>
    mutate(
      "updateLead",
      { patch: { ...d, valueCents: dollars(d.valueCents) } },
      k,
    ),
  );
  const sofie = document.querySelector("#sofie");
  const requestId = crypto.randomUUID();
  sofie.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await api("/api/agent", {
        requestId,
        request: new FormData(sofie).get("request"),
      });
      notice = result.message;
      await render();
    } catch (error) {
      fail(error);
    }
  };
}
function dialog(content) {
  const el = document.createElement("dialog");
  el.innerHTML = content;
  document.body.append(el);
  el.addEventListener("close", () => el.remove());
  el.showModal();
  return el;
}
function createDialog() {
  const el = dialog(
    `<h2>Add a lead</h2><form id="new-lead"><div class="form-grid">${[
      ["Lead name", "name"],
      ["Company", "company"],
      ["Contact information", "contact"],
      ["Source", "source"],
    ]
      .map(
        ([label, name]) =>
          `<label>${label}<input name="${name}" maxlength="160" required></label>`,
      )
      .join(
        "",
      )}<label>Pipeline value ($)<input name="valueCents" type="number" min="0" step="0.01" value="0" required></label></div><p id="dialog-error" role="alert"></p><div class="actions"><button type="button" id="cancel">Cancel</button><button class="primary">Create lead</button></div></form>`,
  );
  el.querySelector("#cancel").onclick = () => el.close();
  const key = crypto.randomUUID();
  el.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const button = el.querySelector(".primary");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(e.target));
      const lead = await call(
        "createLead",
        { ...data, valueCents: dollars(data.valueCents) },
        { requestKey: key },
      );
      detail = lead.id;
      tab = "Lead Detail";
      el.close();
      notice = "Lead created.";
      await render();
      document.querySelector("#main").setAttribute("tabindex", "-1");
      document.querySelector("#main").focus();
    } catch (error) {
      el.querySelector("#dialog-error").textContent = error.message;
      button.disabled = false;
    }
  };
}
async function preview(data) {
  const result = await api("/api/app", {
    appId: data.id,
    operation: "preview",
    previewId: data.preview,
  });
  const el = dialog(
    `<h2>Preview Lead CRM${data.version === "1" ? "" : " update"}</h2><p class="preview-banner">Private preview · Nothing has been installed from this candidate.</p><p>${escape(result.spec.purpose)}</p><nav class="tabs" aria-label="Preview views">${result.spec.ui.navigation.map((v) => `<button class="preview-tab" data-tab="${escape(v)}">${escape(v)}</button>`).join("")}</nav><div id="preview-content"></div><p>Stores leads, contacts, stages, notes, acquisition spend and follow-up dates. No email, payments, network, other Apps or computer access.</p><p class="muted">This candidate uses deterministic reference qualification.</p><p id="dialog-error" role="alert"></p><div class="actions"><button id="close">Close</button><button class="primary" id="request">Review installation</button></div>`,
  );
  const showPreview = (view) => {
    el.querySelector("#preview-content").innerHTML =
      view === "Overview"
        ? `<div class="grid"><section class="metric">Open leads<strong>${result.metrics.openLeads}</strong></section><section class="metric">Open pipeline<strong>${money(result.metrics.openPipelineCents)}</strong></section></div>`
        : view === "Pipeline"
          ? `<div class="board">${result.pipeline.map((p) => `<section class="column"><h3>${escape(p.stage)}</h3>${p.leads.map((l) => `<p>${escape(l.company)}</p>`).join("")}</section>`).join("")}</div>`
          : view === "Lead Sources"
            ? `<h3>Lead source report</h3>${[...new Set(result.leads.map((l) => l.source))].map((source) => `<p>${escape(source)} · ${result.leads.filter((l) => l.source === source).length} leads · ${money(result.leads.filter((l) => l.source === source).reduce((n, l) => n + l.spendCents, 0))} spent</p>`).join("")}`
            : `<p class="muted">Synthetic demonstration data. Read-only preview.</p>${leadTable(view === "Follow-ups" ? result.leads.filter((l) => l.followup && !["Won", "Lost"].includes(l.stage)) : result.leads)}`;
    el.querySelectorAll(".lead-link").forEach((b) => {
      b.onclick = () => {
        const lead = result.leads.find((l) => l.id === b.dataset.id);
        el.querySelector("#preview-content").innerHTML =
          `<h3>${escape(lead.company)}</h3><p>${escape(lead.name)} · ${escape(lead.stage)}</p><p>${escape(lead.contact)}</p><p>Follow-up: ${escape(lead.followup)}</p>`;
      };
    });
  };
  showPreview("Overview");
  el.querySelectorAll(".preview-tab").forEach(
    (b) => (b.onclick = () => showPreview(b.dataset.tab)),
  );
  el.querySelector("#close").onclick = () => el.close();
  el.querySelector("#request").onclick = async () => {
    try {
      const approval = await api("/api/app", {
        appId: data.id,
        operation: "requestInstall",
        previewId: data.preview,
      });
      el.close();
      const confirm = dialog(
        `<p class="eyebrow">Needs You</p><h2>${data.version === "1" ? "Install Lead CRM" : "Update Lead CRM"}</h2><p>Version ${escape(data.version)}. Allow this exact version to read and update its own CRM data. External actions remain unavailable.</p><p>Your existing data will be preserved.</p><p id="dialog-error" role="alert"></p><div class="actions"><button id="cancel">Cancel</button><button class="primary" id="approve">${data.version === "1" ? "Install App" : "Approve update"}</button></div>`,
      );
      confirm.querySelector("#cancel").onclick = () => confirm.close();
      confirm.querySelector("#approve").onclick = async () => {
        const b = confirm.querySelector("#approve");
        b.disabled = true;
        try {
          await api("/api/app", {
            appId: data.id,
            operation: "approveInstall",
            approvalId: approval.id,
          });
          confirm.close();
          notice =
            data.version === "1"
              ? "Lead CRM is installed."
              : "Lead CRM was updated. Your data is preserved.";
          await render();
        } catch (error) {
          confirm.querySelector("#dialog-error").textContent = error.message;
          b.disabled = false;
        }
      };
    } catch (error) {
      el.querySelector("#dialog-error").textContent = error.message;
    }
  };
}
login();
