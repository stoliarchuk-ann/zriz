const menuOf = (dd: HTMLElement): HTMLElement => dd.querySelector<HTMLElement>(".dropdown-menu")!;
const buttonOf = (dd: HTMLElement): HTMLElement => dd.querySelector<HTMLElement>("button")!;

function setOpen(dd: HTMLElement, open: boolean): void {
  menuOf(dd).hidden = !open;
  dd.classList.toggle("open", open);
  buttonOf(dd).setAttribute("aria-expanded", String(open));
  if (open) (menuOf(dd).querySelector<HTMLElement>(".selected") ?? menuOf(dd).querySelector<HTMLElement>("li"))?.focus();
}

function choose(dd: HTMLElement, item: HTMLElement): void {
  menuOf(dd).querySelectorAll("li").forEach((li) => li.classList.toggle("selected", li === item));
  dd.querySelector(".dropdown-label")!.textContent = item.dataset.value ?? "";
  setOpen(dd, false);
  buttonOf(dd).focus();
  dd.dispatchEvent(new CustomEvent("dropdown-change", { bubbles: true, detail: { value: item.dataset.value } }));
}

document.addEventListener("click", (e) => {
  const target = e.target as Element;
  const dd = target.closest<HTMLElement>("[data-dropdown]");
  document.querySelectorAll<HTMLElement>("[data-dropdown].open").forEach((o) => o !== dd && setOpen(o, false));
  if (!dd) return;

  const item = target.closest<HTMLElement>("li[role=option]");
  if (item) return choose(dd, item);
  if (target.closest("button")) setOpen(dd, menuOf(dd).hidden);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll<HTMLElement>("[data-dropdown].open").forEach((o) => {
      setOpen(o, false);
      buttonOf(o).focus();
    });
    return;
  }
  const dd = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-dropdown]") : null;
  if (!dd) return;
  const items = [...menuOf(dd).querySelectorAll<HTMLElement>("li")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (menuOf(dd).hidden) return setOpen(dd, true);
    const next = e.key === "ArrowDown" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0);
    items[next].focus();
  } else if (e.key === "Enter" && i >= 0) {
    e.preventDefault();
    choose(dd, items[i]);
  }
});