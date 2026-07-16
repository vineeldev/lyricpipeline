const PROJECT_GID = "1214909745167908";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!pat || !apiKey) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      _error: "missing env: " + (!pat ? "ASANA_PAT " : "") + (!apiKey ? "ANTHROPIC_API_KEY" : ""),
    });
    return;
  }

  let entries = [];
  try {
    let url =
      "https://app.asana.com/api/1.0/projects/" +
      PROJECT_GID +
      "/tasks?limit=100&opt_fields=" +
      encodeURIComponent("name,completed,custom_fields.name,custom_fields.display_value");
    for (let page = 0; page < 10 && url; page++) {
      const r = await fetch(url, { headers: { Authorization: "Bearer " + pat } });
      if (!r.ok) throw new Error("Asana " + r.status);
      const body = await r.json();
      for (const t of body.data || []) {
        if (t && !t.completed && typeof t.name === "string" && t.name.trim()) {
          let hint = null;
          const fields = Array.isArray(t.custom_fields) ? t.custom_fields : [];
          const ns = fields.find(
            (f) => f && typeof f.name === "string" && f.name.toLowerCase() === "next steps"
          );
          if (ns && typeof ns.display_value === "string" && ns.display_value.trim()) {
            hint = ns.display_value.trim().slice(0, 120);
          }
          entries.push({ name: t.name.trim(), hint: hint });
        }
      }
      url = body.next_page && body.next_page.uri ? body.next_page.uri : null;
    }
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ _error: "asana: " + (err && err.message ? err.message : "unknown") });
    return;
  }

  const seen = new Set();
  entries = entries.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });
  const names = entries.map((e) => e.name);
  if (names.length === 0) {
    res.setHeader("Cache-Control", "s-maxage=3600");
    res.status(200).json({});
    return;
  }

  const system =
    "You label deals in a music rights investment pipeline for readers outside the music industry. " +
    "Every input is from the world of music: recording artists, songwriters, producers, DJs, bands, " +
    "composers for film and TV, or music catalogs. Interpret every name in that context. " +
    'Each input is an object with "name" and an optional "hint". The hint is an internal deal note ' +
    "that may help you identify who the person is (their role, genre, or acts they write for). " +
    "Use hints ONLY to identify the person. NEVER mention deal terms, dollar amounts, negotiations, " +
    "timelines, or the existence of a deal in your description. " +
    "For each name, write one sentence under 14 words describing who they are, in plain professional language. " +
    "If you confidently recognize the name, state who they are and why they matter using only well-established facts. " +
    "If you do not confidently recognize the name, write a specific but hedged line grounded in the hint, " +
    'for example "Songwriter working with contemporary pop acts" or "Composer active in film and television music", ' +
    'rather than a generic phrase like "limited public profile". ' +
    "For names you are unsure about, NEVER invent specific credits, awards, chart positions, or associations with famous acts beyond what the hint states. " +
    "Never return null or an empty string. " +
    'Respond with ONLY a JSON object mapping each exact input "name" to its sentence string. ' +
    "No markdown, no code fences, no commentary.";

  async function generateBatch(batch) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        temperature: 0,
        system: system,
        messages: [{ role: "user", content: JSON.stringify(batch) }],
      }),
    });
    if (!r.ok) {
      let bodyText = "";
      try { bodyText = (await r.text()).slice(0, 300); } catch {}
      throw new Error("anthropic " + r.status + ": " + bodyText);
    }
    const body = await r.json();
    const text = (body.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON in response");
    return JSON.parse(text.slice(start, end + 1));
  }

  const batches = [];
  for (let i = 0; i < entries.length; i += 25) batches.push(entries.slice(i, i + 25));

  const map = {};
  const results = await Promise.allSettled(batches.map((b) => generateBatch(b)));
  const failures = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value && typeof result.value === "object") {
      for (const key of Object.keys(result.value)) {
        const v = result.value[key];
        if (typeof v === "string" && v.trim()) map[key] = v.trim();
      }
    } else if (result.status === "rejected") {
      failures.push(result.reason && result.reason.message ? result.reason.message : "unknown");
    }
  }

  if (Object.keys(map).length === 0) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ _error: failures[0] || "generation failed" });
    return;
  }

  if (failures.length > 0) {
    // Partial success: return what we have but do not cache long, so missing
    // batches retry on the next fresh load.
    res.setHeader("Cache-Control", "s-maxage=600");
    res.status(200).json(map);
    return;
  }

  res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=86400");
  res.status(200).json(map);
};
