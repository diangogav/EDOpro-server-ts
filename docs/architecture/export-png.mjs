import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Renders the delivered archify HTML to light/dark PNGs for the README.
// Usage: node docs/architecture/export-png.mjs docs/architecture/server-architecture.html docs/architecture
// Requires the archify skill (ARCHIFY_DIR, default ~/.claude/skills/archify) and Chromium (CHROME_PATH).
const archifyDir =
	process.env.ARCHIFY_DIR || path.join(os.homedir(), ".claude", "skills", "archify");
const { ChromeVisualBrowser } = await import(path.join(archifyDir, "bin", "visual-check.mjs"));

const [artifact, outDir] = process.argv.slice(2);
const browser = new ChromeVisualBrowser(process.env.CHROME_PATH || "/usr/bin/chromium");
const sessionId = await browser.sessionPromise;
const cdp = browser.cdp;
for (const theme of ["light", "dark"]) {
	await cdp.send(
		"Emulation.setDeviceMetricsOverride",
		{ width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false },
		sessionId,
	);
	const url = new URL(`file://${path.resolve(artifact)}`);
	url.searchParams.set("theme", theme);
	const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
	await cdp.send("Page.navigate", { url: url.href }, sessionId);
	await loaded;
	const rect = await cdp.send(
		"Runtime.evaluate",
		{
			returnByValue: true,
			awaitPromise: true,
			expression: `(async () => {
    document.documentElement.setAttribute('data-motion', 'still');
    const panel = document.querySelector('[data-detail-level]'); if (panel) panel.setAttribute('data-detail-level', 'read');
    const st=document.createElement('style'); st.textContent='.diagram-nav,.no-print{display:none!important}'; document.head.appendChild(st);
    await new Promise(r => setTimeout(r, 2500)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const svg = document.querySelector('svg[role="img"]');
    const r = svg.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, theme: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(svg.closest('section, div') || document.body).backgroundColor };
  })()`,
		},
		sessionId,
	);
	const r = rect.result.value;
	console.log(theme, JSON.stringify(r));
	const shot = await cdp.send(
		"Page.captureScreenshot",
		{
			format: "png",
			fromSurface: true,
			captureBeyondViewport: true,
			clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 2 },
		},
		sessionId,
		30000,
	);
	fs.writeFileSync(
		path.join(outDir, `server-architecture.${theme}.png`),
		Buffer.from(shot.data, "base64"),
	);
}
await browser.close();
