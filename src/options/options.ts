// Load saved setting
chrome.storage.local.get("storageScope", (data) => {
  if (data.storageScope) {
    const radio = document.querySelector(`input[value="${data.storageScope}"]`);
    if (radio) (radio as HTMLInputElement).checked = true;
  }
});

// Save on change
document.querySelectorAll('input[name="storageScope"]').forEach((el) => {
  el.addEventListener("change", () => {
    chrome.storage.local.set({ storageScope: (el as HTMLInputElement).value });
  });
});

// Color theme
const DEFAULT_COLOR = "#d23c22";
chrome.storage.local.get("accentColor", (data) => {
  const color = data.accentColor || DEFAULT_COLOR;
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', (s as HTMLElement).dataset.color === color);
  });
});
document.getElementById("colorPicker")!.addEventListener("click", (e) => {
  const swatch = (e.target as HTMLElement).closest('.color-swatch') as HTMLElement | null;
  if (!swatch) return;
  const color = swatch.dataset.color!;
  chrome.storage.local.set({ accentColor: color });
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
});

// Delete all data
document.getElementById("deleteBtn")!.addEventListener("click", () => {
  if (!confirm("Wirklich ALLE gespeicherten Backup-Daten löschen? Das kann nicht rückgängig gemacht werden.")) return;

  const status = document.getElementById("status")!;
  const request = indexedDB.deleteDatabase("pr0Vault");
  request.onsuccess = () => {
    chrome.storage.local.clear();
    status.textContent = "Alle Daten gelöscht.";
    status.className = "status success";
  };
  request.onerror = () => {
    status.textContent = "Fehler beim Löschen.";
    status.className = "status error";
  };
});
