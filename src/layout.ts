const container = document.querySelector<HTMLElement>(".app-container");
const toggle = document.getElementById("menu-toggle");

function setOpen(open: boolean): void {
  if (!container) return;
  container.classList.toggle("nav-open", open);
  document.body.classList.toggle("nav-locked", open);
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрити меню" : "Відкрити меню");
  }
}

toggle?.addEventListener("click", () => setOpen(!container?.classList.contains("nav-open")));
document.getElementById("sidebar-backdrop")?.addEventListener("click", () => setOpen(false));
document.getElementById("sidebar-close")?.addEventListener("click", () => setOpen(false));
document.getElementById("sidebar")?.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("a")) setOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpen(false);
});

window.matchMedia("(min-width: 1101px)").addEventListener("change", (e) => {
  if (e.matches) setOpen(false);
});