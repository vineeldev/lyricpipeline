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

  let names = [];
  try {
    let url =
      "https://app.asana.com/api/1.0/projects/" +
      PROJECT_GID +
      "/tasks?limit=100&opt_fields=" +
      encodeURIComponent("name,completed");
    for (let page = 0; page < 10 && url; page++) {
      const r = await fetch(url, { headers: { Authorization: "Bearer " + pat } });
      if (!r.ok) throw new Error("Asana " + r.status);
      const body = await r.json();
      for (const t of body.data || []) {
        if (t && !t.completed && typeof t.name === "string" && t.name.trim()) {
          names.push(t.name.trim());
        }
      }
      url = body.next_page && body.next_page.uri ? body.next_page.uri : null;
    }
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ _error: "asana: " + (err && err.message ? err.message : "unknown") });
    return;
  }

  names = Array.from(new Set(names));
  if (names.length === 0) {
    res.setHeader("Cache-Control", "s-maxage=3600");
    res.status(200).json({});
    return;
  }

  const system =
    "You label a music rights investment pipeline for readers outside the music industry. " +
    "Each input is the name of an artist, songwriter, producer, DJ, band, or catalog. " +
    "For each name, write one sentence under 18 words stating who they are and why they matter, " +
    "in plain professional language. Use only well-established facts you are confident about. " +
    "If you do not confidently recognize a name, or it could refer to multiple people, use null instead of guessing. " +
    "Respond with ONLY a JSON object mapping each exact input name to its sentence string or null. " +
    "No markdown, no code fences, no commentary.";

  let map = {};
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        temperature: 0,
        system: system,
        messages: [{ role: "user", content: JSON.stringify(names) }],
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
    const parsed = JSON.parse(text.slice(start, end + 1));
    for (const key of Object.keys(parsed)) {
      const v = parsed[key];
      if (typeof v === "string" && v.trim()) map[key] = v.trim();
    }
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ _error: err && err.message ? err.message : "generation failed" });
    return;
  }

  res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=86400");
  res.status(200).json(map);
};
