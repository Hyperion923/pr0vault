import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { getLogs, clearLogs } from "../shared/logger";
import type { LogEntry } from "../shared/logger";

const logs = signal<LogEntry[]>([]);

async function refreshLogs() {
  logs.value = await getLogs();
}

export function LogPanel() {
  useEffect(() => {
    refreshLogs();
    const interval = setInterval(refreshLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const levelColors: Record<string, string> = {
    info: "var(--accent-cyan)",
    warn: "#f7c516",
    error: "var(--error)",
    debug: "var(--text-muted)",
  };

  return (
    <div class="log-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:10px;color:var(--text-muted)">
          {logs.value.length} Einträge {logs.value.length > 0 ? `(letzter: ${new Date(logs.value[logs.value.length-1].ts).toLocaleTimeString("de-DE")})` : ""}
        </span>
        <button
          class="btn"
          style="font-size:10px;padding:2px 6px"
          onClick={async () => { await clearLogs(); await refreshLogs(); }}
        >
          Clear
        </button>
      </div>
      <div class="log-list">
        {logs.value.length === 0 && (
          <p class="hint">Keine Logs. Öffne pr0gramm.com um Einträge zu sehen.</p>
        )}
        {logs.value.map((l, i) => (
          <div key={i} class="log-entry">
            <span class="log-ts">{new Date(l.ts).toLocaleTimeString("de-DE")}</span>
            <span class="log-src" style="color:var(--accent-blue);font-weight:700">[{l.src}]</span>
            <span class="log-msg" style={`color:${levelColors[l.lvl] || "var(--text)"}`}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
