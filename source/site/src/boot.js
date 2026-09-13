/* Wire up the shell once everything is defined. */
// Feature menu (▾ in the top bar): pick Learn, Test me, Quiz, Similars or About for the open surah.
const featBtn = $("featBtn"), featMenu = $("featMenu");
const closeFeat = () => { featMenu.hidden = true; featBtn.setAttribute("aria-expanded", "false"); };
featBtn.addEventListener("click", () => {
  const opening = featMenu.hidden;
  featMenu.hidden = !opening;
  featBtn.setAttribute("aria-expanded", String(opening));
  if (opening) featMenu.querySelector('[aria-current="true"]')?.focus();
});
featMenu.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
  closeFeat();
  Surah.setMode(b.dataset.mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
}));
document.addEventListener("click", e => { if (!featMenu.hidden && !e.target.closest("#feat")) closeFeat(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !featMenu.hidden) { closeFeat(); featBtn.focus(); } });
Weak.listeners.add(() => {
  if (!$("home").hidden) showHome();
  else if (Surah.n) Surah.refresh();
});
// The opening animation plays once per launch; a tap skips it.
const splash = $("splash");
if (splash && !splash.hidden) {
  if ($("splashBism") && !$("splashBism").textContent) $("splashBism").textContent = IDX.basmala;   // from the muṣḥaf data, not typed by hand
  const done = () => { splash.hidden = true; try { sessionStorage.setItem("qf-splash", "1"); } catch (e) { /* storage unavailable */ } };
  if (reduceMotion) done(); else { splash.addEventListener("click", done); setTimeout(done, 3800); }
}
window.addEventListener("hashchange", route);
Weak.connect();
route();
