(() => {
  "use strict";
  const items = [
    { href: "/", label: "Notícias", icon: "▤", key: "noticias" },
    { href: "futebol.html", label: "Futebol", icon: "⚽", key: "futebol" },
    { href: "comunidade.html", label: "Comunidade", icon: "◉", key: "comunidade" },
    { href: "projetos.html", label: "Projetos", icon: "▣", key: "projetos" },
    { href: "clima.html", label: "Clima", icon: "☼", key: "clima" }
  ];
  const page = location.pathname.endsWith("futebol.html") ? "futebol" :
    location.pathname.endsWith("comunidade.html") ? "comunidade" :
    location.pathname.endsWith("projetos.html") ? "projetos" :
    location.pathname.endsWith("clima.html") ? "clima" : "noticias";
  const aside = document.createElement("aside");
  aside.className = "site-sidebar";
  aside.innerHTML = '<a class="sidebar-brand" href="/" aria-label="Jornal FutSenai"><span class="sidebar-brand-icon">⚽</span><span>Fut<span>Senai</span><small>JORNAL DIGITAL</small></span></a><div class="sidebar-label">MENU PRINCIPAL</div>';
  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  nav.setAttribute("aria-label", "Navegação principal");
  items.forEach(item => {
    const link = document.createElement("a");
    link.href = item.href;
    link.className = "sidebar-link" + (item.key === page ? " is-active" : "");
    if (item.key === page) link.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.className = "sidebar-icon";
    icon.textContent = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    link.append(icon, label);
    nav.append(link);
  });
  aside.append(nav);
  const bottom = document.createElement("div");
  bottom.className = "sidebar-bottom";
  bottom.innerHTML = '<a href="admin.html">⚙ <span>Área administrativa</span></a><span>Jornal FutSenai · 2026</span>';
  aside.append(bottom);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sidebar-toggle";
  toggle.setAttribute("aria-label", "Abrir menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "sidebar-backdrop";
  backdrop.setAttribute("aria-label", "Fechar menu");
  function closeMenu() {
    document.body.classList.remove("sidebar-open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("sidebar-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  backdrop.addEventListener("click", closeMenu);
  nav.addEventListener("click", event => {
    if (event.target.closest("a")) closeMenu();
  });
  document.body.prepend(backdrop, aside, toggle);
})();