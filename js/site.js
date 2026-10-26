// Small page behaviours that aren't part of the graph.

// Copy the contact email; fall back to selecting it if the clipboard is unavailable.
(function () {
  const btn = document.getElementById("copy-email"), email = document.getElementById("email");
  if (!btn || !email) return;
  btn.addEventListener("click", () => {
    const text = email.textContent.trim();
    const select = () => {
      const range = document.createRange(); range.selectNodeContents(email);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = "Selected, press ⌘C";
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = "Copy"; }, 1800);
    }, select);
    else select();
  });
})();

// Opening an FAQ answer changes the page height, so the graph re-measures where each section sits.
document.addEventListener("toggle", () => dispatchEvent(new Event("resize")), true);

// Light/dark toggle. With no saved choice the page follows the OS; a click pins the opposite of what's showing.
(function () {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const root = document.documentElement, osDark = matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (osDark.matches ? "dark" : "light");
  const label = () => btn.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme");
  btn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("gw-theme", next); } catch (e) {}
    label(); dispatchEvent(new Event("themechange"));
  });
  osDark.addEventListener("change", () => { label(); dispatchEvent(new Event("themechange")); });
  label();
})();
