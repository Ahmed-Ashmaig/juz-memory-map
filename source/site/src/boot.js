/* Wire up the shell once everything is defined. */
document.querySelectorAll(".modes button").forEach(b => b.addEventListener("click", () => Surah.setMode(b.dataset.mode)));
Weak.listeners.add(() => {
  if (!$("home").hidden) showHome();
  else if (Surah.n) Surah.refresh();
});
window.addEventListener("hashchange", route);
Weak.connect();
route();
