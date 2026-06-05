// pr0Vault — Page Hook
// Runs in the page's MAIN world (injected by content.ts), so it can
// intercept the real `window.fetch` and `XMLHttpRequest` that pr0gramm
// uses. Sends each API response back to the content script via
// `window.postMessage`. Content script then forwards to the service
// worker.

const TAG = "PR0VAULT_API";

function send(url: string, data: unknown) {
  try {
    window.postMessage({ source: TAG, url, data }, window.location.origin);
  } catch {
    /* DOM closed / detached */
  }
}

// ---- fetch ----

const originalFetch = window.fetch;
window.fetch = async function pr0VaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await originalFetch(input, init);
  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : "";
    if (url.includes("/api/")) {
      const clone = response.clone();
      // Don't block the page on body parsing
      clone.json().then((json) => send(url, json)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  return response;
};

// ---- XMLHttpRequest (pr0gramm uses XHR for some endpoints) ----

const OrigXHR = window.XMLHttpRequest;
const OrigOpen = OrigXHR.prototype.open;
const OrigSend = OrigXHR.prototype.send;

OrigXHR.prototype.open = function (
  this: XMLHttpRequest & { __pr0url?: string },
  method: string,
  url: string,
  ...rest: any[]
) {
  this.__pr0url = url;
  return (OrigOpen as any).call(this, method, url, ...rest);
};

OrigXHR.prototype.send = function (this: XMLHttpRequest & { __pr0url?: string }, ...args: any[]) {
  this.addEventListener("load", () => {
    try {
      const url = this.__pr0url || "";
      if (!url.includes("/api/")) return;
      const txt = this.responseText;
      if (!txt) return;
      const json = JSON.parse(txt);
      send(url, json);
    } catch {
      /* not JSON */
    }
  });
  return (OrigSend as any).apply(this, args);
};
