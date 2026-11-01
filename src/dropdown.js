// ===== Випадаючі списки: <div data-dropdown> з кнопкою та ul.dropdown-menu =====

const menuOf = (dd) => dd.querySelector(".dropdown-menu");
const buttonOf = (dd) => dd.querySelector("button");

function setOpen(dd, open) {
  menuOf(dd).hidden = !open;
  dd.classList.toggle("open", open);
  buttonOf(dd).setAttribute("aria-expanded", String(open));
  if (open) (menuOf(dd).querySelector(".selected") || menuOf(dd).querySelector("li")).focus();
}

function choose(dd, item) {
  menuOf(dd).querySelectorAll("li").forEach((li) => li.classList.toggle("selected", li === item));
  dd.querySelector(".dropdown-label").textContent = item.dataset.value;
  setOpen(dd, false);
  buttonOf(dd).focus();
  // Інші скрипти можуть слухати цю подію (наприклад, для оновлення графіка)
  dd.dispatchEvent(new CustomEvent("dropdown-change", { bubbles: true, detail: { value: item.dataset.value } }));
}

document.addEventListener("click", (e) => {
  const dd = e.target.closest("[data-dropdown]");
  // Клік поза списком закриває всі відкриті
  document.querySelectorAll("[data-dropdown].open").forEach((o) => o !== dd && setOpen(o, false));
  if (!dd) return;

  const item = e.target.closest("li[role=option]");
  if (item) return choose(dd, item);
  if (e.target.closest("button")) setOpen(dd, menuOf(dd).hidden);
});

// Клавіатура: Esc закриває, стрілки переміщують, Enter вибирає
document.addEventListener("keydown", (e) => {
  const dd = e.target.closest?.("[data-dropdown]");
  if (e.key === "Escape") {
    document.querySelectorAll("[data-dropdown].open").forEach((o) => {
      setOpen(o, false);
      buttonOf(o).focus();
    });
    return;
  }
  if (!dd) return;
  const items = [...menuOf(dd).querySelectorAll("li")];
  const i = items.indexOf(document.activeElement);
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
