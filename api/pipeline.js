const PROJECT_GID = "1214909745167908";

const STAGE_GIDS = new Set([
  "1214909596271789",
  "1214909596979591",
  "1214909311161519",
  "1214909594772955",
  "1214909312215127",
  "1214909596139966",
  "1214909617968156",
  "1214909618018444",
  "1214909655380534",
  "1214909620891849",
]);

function fieldValue(task, fieldName) {
  const fields = Array.isArray(task.custom_fields) ? task.custom_fields : [];
  const match = fields.find(
    (f) => f && typeof f.name === "string" && f.name.toLowerCase() === fieldName
  );
  if (!match) return null;
  const v = match.display_value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numberValue(task, fieldName) {
  const fields = Array.isArray(task.custom_fields) ? task.custom_fields : [];
  const match = fields.find(
    (f) => f && typeof f.name === "string" && f.name.toLowerCase() === fieldName
  );
  if (!match) return null;
  if (typeof match.number_value === "number") return match.number_value;
  if (typeof match.display_value === "string") {
    const cleaned = match.display_value.replace(/[$,\s]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function sectionOf(task) {
  const memberships = Array.isArray(task.memberships) ? task.memberships : [];
  for (const m of memberships) {
    const projGid = m && m.project && m.project.gid;
    const secGid = m && m.section && m.section.gid;
    if (secGid && (!projGid || projGid === PROJECT_GID) && STAGE_GIDS.has(secGid)) {
      return secGid;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  const accessCode = process.env.ACCESS_CODE;
  if (accessCode) {
    const provided = (req.query && req.query.code) || "";
    if (provided !== accessCode) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  const pat = process.env.ASANA_PAT;
  if (!pat) {
    res.status(500).json({ error: "ASANA_PAT is not configured" });
    return;
  }

  const optFields =
    "name,completed,assignee.name,memberships.section.gid,memberships.project.gid,custom_fields.name,custom_fields.display_value,custom_fields.number_value";
  let url =
    "https://app.asana.com/api/1.0/projects/" +
    PROJECT_GID +
    "/tasks?limit=100&opt_fields=" +
    encodeURIComponent(optFields);

  const tasks = [];
  try {
    for (let page = 0; page < 10 && url; page++) {
      const r = await fetch(url, {
        headers: { Authorization: "Bearer " + pat },
      });
      if (!r.ok) {
        res.status(502).json({ error: "Asana responded " + r.status });
        return;
      }
      const body = await r.json();
      if (Array.isArray(body.data)) tasks.push(...body.data);
      url = body.next_page && body.next_page.uri ? body.next_page.uri : null;
    }
  } catch (err) {
    res.status(502).json({ error: "Could not reach Asana" });
    return;
  }

  const deals = {};
  STAGE_GIDS.forEach((gid) => (deals[gid] = []));

  for (const t of tasks) {
    if (!t || t.completed) continue;
    if (typeof t.name !== "string" || !t.name.trim()) continue;
    const status = (fieldValue(t, "status") || "").toLowerCase();
    if (status.includes("pass") || status.includes("dead")) continue;
    const sec = sectionOf(t);
    if (!sec) continue;
    const eq = numberValue(t, "$equity");
    const rbn = numberValue(t, "$rbn");
    const debt = numberValue(t, "$debt");
    let tev = numberValue(t, "$tev");
    if (tev === null && (eq !== null || rbn !== null || debt !== null)) {
      tev = (eq || 0) + (rbn || 0) + (debt || 0);
    }
    deals[sec].push({
      n: t.name.trim(),
      l: fieldValue(t, "deal lead") || (t.assignee && t.assignee.name) || null,
      x: fieldValue(t, "next steps"),
      s: fieldValue(t, "status"),
      strat: fieldValue(t, "investment strategy"),
      src: fieldValue(t, "deal source individual"),
      e: eq,
      r: rbn,
      d: debt,
      v: tev,
    });
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).json({ generatedAt: new Date().toISOString(), deals });
};
