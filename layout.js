(() => {
  "use strict";
  const items = [
    { href: "/", label: "Notícias", icon: "▤", key: "noticias" },
    { href: "futebol.html", label: "Futebol", icon: "⚽", key: "futebol" },
    { href: "comunidade.html", label: "Comunidade", icon: "◉", key: "comunidade" },
    { href: "projetos.html", label: "Projetos", icon: "▣", key: "projetos" },
    { href: "clima.html", label: "Clima", icon: "☼", key: "clima" }
  ];
  const path = location.pathname;
  const page = items.find(item => item.href === path || (item.href === "/" && (path.endsWith("/") || path.endsWith("index.html"))))?.key || "noticias";
  const aside = document.createElement("aside");
  aside.className = "site-sidebar";
  aside.setAttribute("aria-label", "Menu principal");
  const brand = document.createElement("a");
  brand.className = "sidebar-brand";
  brand.href = "/";
  brand.title = "Jornal FutSenai";
  brand.setAttribute("aria-label", "Jornal FutSenai — início");
  brand.innerHTML = '<span class="sidebar-brand-icon">F</span>';
  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  nav.setAttribute("aria-label", "Navegação principal");
  items.forEach(item => {
    const link = document.createElement("a");
    link.href = item.href;
    link.className = "sidebar-link" + (item.key === page ? " is-active" : "");
    link.title = item.label;
    link.setAttribute("aria-label", item.label);
    if (item.key === page) link.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.className = "sidebar-icon";
    icon.textContent = item.icon;
    link.append(icon);
    nav.append(link);
  });
  const admin = document.createElement("a");
  admin.href = "admin.html";
  admin.className = "sidebar-admin";
  admin.title = "Área administrativa";
  admin.setAttribute("aria-label", "Área administrativa");
  admin.textContent = "⚙";
  aside.append(brand, nav, admin);
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