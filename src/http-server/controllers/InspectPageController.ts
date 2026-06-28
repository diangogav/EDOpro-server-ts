import { Request, Response } from "express";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Arcane Library · Server cards & banlists</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&display=swap" rel="stylesheet" />
	<style>
		:root {
			--bg: #0a0712; --panel: rgba(28,18,46,.66); --panel-2: rgba(20,13,34,.82);
			--border: rgba(176,138,74,.28); --gold: #e6c074; --gold-soft: #f3d79b;
			--violet: #a78bfa; --text: #ece6f5; --muted: #9b91b3;
			--forbidden: #ff6b6b; --limited: #ffa94d; --semi: #ffd43b; --white: #69db7c;
		}
		* { box-sizing: border-box; }
		html, body { height: 100%; }
		body {
			margin: 0; color: var(--text);
			font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
			background:
				radial-gradient(1200px 600px at 20% -10%, rgba(123,58,237,.16), transparent 60%),
				radial-gradient(900px 500px at 100% 0%, rgba(230,192,116,.08), transparent 55%),
				var(--bg);
		}
		input, select, button { font: inherit; color: var(--text); }
		.muted { color: var(--muted); font-size: .9rem; }

		.layout { display: grid; grid-template-columns: 320px 1fr; height: 100vh; }

		.sidebar {
			overflow-y: auto; padding: 1.3rem 1rem; border-right: 1px solid var(--border);
			background: linear-gradient(180deg, rgba(28,18,46,.55), rgba(10,7,18,.15));
		}
		.brand {
			font-family: "Cinzel", Georgia, serif; color: var(--gold); text-align: center;
			letter-spacing: .08em; font-size: 1.15rem; margin-bottom: 1.2rem;
			text-shadow: 0 0 14px rgba(230,192,116,.3);
		}
		.filters { display: flex; flex-direction: column; gap: .55rem; margin-bottom: 1.4rem; }
		.filters input, .filters select, .filters button {
			width: 100%; background: var(--panel-2); border: 1px solid var(--border);
			border-radius: 10px; padding: .6rem .75rem;
		}
		.filters input:focus, .filters select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(230,192,116,.15); }
		.btn-primary {
			cursor: pointer; background: linear-gradient(180deg, rgba(230,192,116,.22), rgba(230,192,116,.08));
			color: var(--gold-soft); border-color: var(--gold); transition: box-shadow .12s, transform .12s;
		}
		.btn-primary:hover { box-shadow: 0 0 14px rgba(230,192,116,.22); }
		.btn-primary:active { transform: translateY(1px); }

		.nav-section { margin-bottom: 1.3rem; }
		.nav-section h3 { font-size: .72rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); margin: .2rem .3rem .5rem; }
		.nav-item {
			display: flex; align-items: center; gap: .55rem; width: 100%; text-align: left;
			background: transparent; border: 1px solid transparent; border-radius: 9px;
			padding: .45rem .55rem; margin-bottom: .15rem; cursor: pointer; transition: background .1s, border-color .1s;
		}
		.nav-item:hover { background: rgba(255,255,255,.04); border-color: var(--border); }
		.nav-item.active { background: rgba(230,192,116,.12); border-color: var(--gold); }
		.nav-label { flex: 1; font-size: .86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.nav-sub { font-size: .72rem; color: var(--muted); }
		.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
		.dot-edopro { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
		.dot-ygopro { background: var(--violet); box-shadow: 0 0 6px var(--violet); }
		.empty { padding: .3rem .55rem; }

		.main { overflow-y: auto; padding: 2rem 2.4rem 3rem; }
		.main-head { margin-bottom: 1.3rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
		.main-head h1 {
			font-family: "Cinzel", Georgia, serif; color: var(--gold-soft); font-size: 1.6rem;
			margin: 0 0 .25rem; letter-spacing: .04em;
		}
		.list { display: flex; flex-direction: column; }
		.card-row {
			display: flex; align-items: center; gap: .8rem; padding: .6rem .7rem; border-radius: 10px;
			border-bottom: 1px solid rgba(255,255,255,.04);
		}
		.card-row:hover { background: rgba(255,255,255,.035); }
		.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: var(--gold-soft); font-size: .82rem; min-width: 100px; }
		.cname { flex: 1; }
		.src { font-size: .72rem; color: var(--muted); background: rgba(255,255,255,.05); padding: .12rem .5rem; border-radius: 6px; }
		.tag { font-size: .66rem; text-transform: uppercase; letter-spacing: .05em; padding: .14rem .5rem; border-radius: 6px; font-weight: 600; }
		.tag-edopro { color: #1a1206; background: var(--gold); }
		.tag-ygopro { color: #0b1220; background: var(--violet); }
		.ban-sec { margin: 1.3rem 0; border-left: 3px solid var(--border); padding-left: .9rem; }
		.ban-sec h4 { margin: .2rem 0 .5rem; font-size: .9rem; letter-spacing: .05em; }
		.sec-forbidden h4 { color: var(--forbidden); } .sec-limited h4 { color: var(--limited); }
		.sec-semi h4 { color: var(--semi); } .sec-white h4 { color: var(--white); }
		.pager { display: flex; gap: .6rem; margin-top: 1.4rem; align-items: center; }
		.pager button {
			cursor: pointer; background: var(--panel-2); border: 1px solid var(--border);
			border-radius: 10px; padding: .5rem .9rem; transition: border-color .12s;
		}
		.pager button:hover:not(:disabled) { border-color: var(--gold); }
		.pager button:disabled { opacity: .4; cursor: default; }

		@media (max-width: 820px) {
			.layout { grid-template-columns: 1fr; height: auto; min-height: 100vh; }
			.sidebar { border-right: none; border-bottom: 1px solid var(--border); max-height: 52vh; }
			.main { padding: 1.4rem 1.2rem 2.5rem; }
		}
		@media (max-width: 480px) {
			.main-head h1 { font-size: 1.3rem; }
			.card-row { flex-wrap: wrap; gap: .35rem .7rem; }
			.mono { min-width: 0; }
			.cname { flex: 1 1 60%; }
		}
	</style>
</head>
<body>
	<div class="layout">
		<aside class="sidebar">
			<div class="brand">&#10022; Arcane Library &#10022;</div>
			<div class="filters">
				<input id="q" placeholder="Search card name or passcode" />
				<select id="engine">
					<option value="">Both engines</option>
					<option value="edopro">EDOPro</option>
					<option value="ygopro">YGOPro</option>
				</select>
				<button id="search" class="btn-primary">Search</button>
			</div>
			<div class="nav-section">
				<h3>Ban lists</h3>
				<div id="nav-banlists" class="muted empty">Loading&hellip;</div>
			</div>
			<div class="nav-section">
				<h3>Databases (.cdb)</h3>
				<div id="nav-databases" class="muted empty">Loading&hellip;</div>
			</div>
		</aside>

		<main class="main">
			<div class="main-head">
				<h1 id="main-title">Arcane Library</h1>
				<p id="main-sub" class="muted">Pick a ban list or database on the left, or search for a card.</p>
			</div>
			<div id="main-list" class="list"></div>
			<div id="main-pager"></div>
		</main>
	</div>

	<script>
		var $ = function (id) { return document.getElementById(id); };
		var PAGE_SIZE = 60;
		var state = { engineFilter: "", banlists: {}, databases: {} };

		function el(tag, className, text) {
			var node = document.createElement(tag);
			if (className) node.className = className;
			if (text !== undefined) node.textContent = text;
			return node;
		}

		function engineTag(engine) { return el("span", "tag tag-" + engine, engine); }

		function cardRow(card) {
			var row = el("div", "card-row");
			row.appendChild(el("span", "mono", card.id));
			row.appendChild(el("span", "cname", card.name));
			if (card.source) row.appendChild(el("span", "src", card.source));
			if (card.engine) row.appendChild(engineTag(card.engine));
			return row;
		}

		function setMain(title, sub) {
			$("main-title").textContent = title;
			$("main-sub").textContent = sub || "";
			$("main-list").innerHTML = "";
			$("main-pager").innerHTML = "";
		}

		function setActive(item) {
			var items = document.querySelectorAll(".nav-item");
			for (var i = 0; i < items.length; i++) items[i].classList.remove("active");
			if (item) item.classList.add("active");
		}

		function navItem(engine, label, sub, onClick) {
			var button = el("button", "nav-item");
			button.appendChild(el("span", "dot dot-" + engine));
			button.appendChild(el("span", "nav-label", label));
			button.appendChild(el("span", "nav-sub", sub));
			button.addEventListener("click", function () { setActive(button); onClick(); });
			return button;
		}

		function renderNav() {
			var banlists = $("nav-banlists");
			var databases = $("nav-databases");
			banlists.innerHTML = "";
			databases.innerHTML = "";
			["edopro", "ygopro"].forEach(function (engine) {
				if (state.engineFilter && state.engineFilter !== engine) return;
				(state.banlists[engine] || []).forEach(function (b) {
					var count = b.forbidden + b.limited + b.semiLimited;
					banlists.appendChild(navItem(engine, b.name, String(count), function () { selectBanlist(engine, b.name); }));
				});
				(state.databases[engine] || []).forEach(function (s) {
					databases.appendChild(navItem(engine, s.source, String(s.count), function () { selectDatabase(engine, s.source, 0); }));
				});
			});
			if (!banlists.children.length) banlists.appendChild(el("p", "muted empty", "No ban lists."));
			if (!databases.children.length) databases.appendChild(el("p", "muted empty", "No databases."));
		}

		function loadBanlists() {
			fetch("/api/banlists").then(function (r) { return r.json(); }).then(function (data) {
				state.banlists = data;
				renderNav();
			});
		}

		function loadDatabases() {
			fetch("/api/databases").then(function (r) { return r.json(); }).then(function (data) {
				state.databases = data;
				renderNav();
			});
		}

		function doSearch() {
			var q = $("q").value.trim();
			var engine = state.engineFilter;
			setActive(null);
			if (!q) { setMain("Search", "Type a card name or passcode."); return; }
			setMain("Search \\u00b7 " + q, "Searching\\u2026");
			var url = "/api/cards?q=" + encodeURIComponent(q) + (engine ? "&engine=" + engine : "");
			fetch(url).then(function (r) { return r.json(); }).then(function (data) {
				var results = data.results || [];
				$("main-sub").textContent = results.length ? results.length + " result(s)" : "Not found on the server.";
				var list = $("main-list");
				results.forEach(function (c) { list.appendChild(cardRow(c)); });
			});
		}

		function banSection(title, cssClass, entries) {
			if (!entries || !entries.length) return null;
			var sec = el("div", "ban-sec " + cssClass);
			sec.appendChild(el("h4", null, title + " \\u00b7 " + entries.length));
			entries.forEach(function (e) { sec.appendChild(cardRow({ id: e.id, name: e.name || "(unknown card)" })); });
			return sec;
		}

		function selectBanlist(engine, name) {
			setMain("Ban list \\u00b7 " + name, engine.toUpperCase() + " \\u2014 loading\\u2026");
			fetch("/api/banlists/" + engine + "/" + encodeURIComponent(name)).then(function (r) { return r.json(); }).then(function (data) {
				var list = $("main-list");
				var total = (data.forbidden || []).length + (data.limited || []).length +
					(data.semiLimited || []).length + (data.whitelisted || []).length;
				$("main-sub").textContent = engine.toUpperCase() + " \\u00b7 " + total + " cards";
				var sections = [
					banSection("Forbidden", "sec-forbidden", data.forbidden),
					banSection("Limited", "sec-limited", data.limited),
					banSection("Semi-Limited", "sec-semi", data.semiLimited),
					banSection("Whitelisted", "sec-white", data.whitelisted)
				];
				sections.forEach(function (s) { if (s) list.appendChild(s); });
				if (!list.children.length) list.appendChild(el("p", "muted", "This ban list has no entries."));
			});
		}

		function selectDatabase(engine, source, offset) {
			setMain("Database \\u00b7 " + source, engine.toUpperCase() + " \\u2014 loading\\u2026");
			var url = "/api/databases/cards?engine=" + engine + "&source=" + encodeURIComponent(source) +
				"&limit=" + PAGE_SIZE + "&offset=" + offset;
			fetch(url).then(function (r) { return r.json(); }).then(function (data) {
				var total = data.total || 0;
				var from = total ? offset + 1 : 0;
				var to = Math.min(offset + PAGE_SIZE, total);
				$("main-sub").textContent = engine.toUpperCase() + " \\u00b7 " + total + " cards \\u00b7 showing " + from + "\\u2013" + to;
				var list = $("main-list");
				(data.cards || []).forEach(function (c) { list.appendChild(cardRow(c)); });
				var pager = $("main-pager");
				var prev = el("button", null, "\\u2039 Prev");
				prev.disabled = offset <= 0;
				prev.addEventListener("click", function () { selectDatabase(engine, source, Math.max(0, offset - PAGE_SIZE)); });
				var next = el("button", null, "Next \\u203a");
				next.disabled = offset + PAGE_SIZE >= total;
				next.addEventListener("click", function () { selectDatabase(engine, source, offset + PAGE_SIZE); });
				pager.appendChild(prev);
				pager.appendChild(next);
			});
		}

		$("engine").addEventListener("change", function () { state.engineFilter = this.value; renderNav(); });
		$("search").addEventListener("click", doSearch);
		$("q").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
		loadBanlists();
		loadDatabases();
	</script>
</body>
</html>`;

export class InspectPageController {
	run(_req: Request, response: Response): void {
		response.type("html").status(200).send(PAGE);
	}
}
