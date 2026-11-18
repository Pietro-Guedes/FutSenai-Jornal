(() => {
  "use strict";
  if (document.querySelector(".site-sidebar")) return;
  const items = [
    { href: "/", label: "Notícias", key: "noticias", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM8 8h8M8 12h8M8 16h5"/></svg>' },
    { href: "futebol.html", label: "Futebol", key: "futebol", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 7 3 2-1 4h-4L9 9zm-3 2-3-1m8-1 2-3m0 10 3 2m-8-1-2 4"/></svg>' },
    { href: "comunidade.html", label: "Comunidade", key: "comunidade", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6-7.5a4 4 0 0 1 0 7.7M17 15h.5a3.5 3.5 0 0 1 3.5 3.5V20"/></svg>' },
    { href: "projetos.html", label: "Projetos", key: "projetos", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>' },
    { href: "clima.html", label: "Clima", key: "clima", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 9a4.5 4.5 0 0 0 0 9zM12 2v2m-7 1 1.5 1.5M19 5l-1.5 1.5"/></svg>' }
  ];
  const path = location.pathname;
  const page = items.find(x => x.href === path || (x.href === "/" && (path.endsWith("/") || path.endsWith("index.html"))))?.key || "noticias";
  const aside = document.createElement("aside");
  aside.className = "site-sidebar";
  aside.innerHTML = '<a class="sidebar-brand" href="/" aria-label="Jornal FutSenai"><span class="sidebar-brand-icon">F</span><span class="sidebar-brand-name">FutSenai<small>JORNAL DIGITAL</small></span></a><p class="sidebar-caption">NAVEGAÇÃO</p>';
  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  nav.setAttribute("aria-label", "Navegação principal");
  for (const item of items) {
    const a = document.createElement("a");
    a.href = item.href;
    a.className = "sidebar-link" + (item.key === page ? " is-active" : "");
    if (item.key === page) a.setAttribute("aria-current", "page");
    a.innerHTML = '<span class="sidebar-icon">'+item.icon+'</span><span class="sidebar-link-label">'+item.label+'</span>';
    nav.append(a);
  }
  const admin = document.createElement("a");
  admin.className = "sidebar-admin";
  admin.href = "admin.html";
  admin.innerHTML = '<span class="sidebar-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.5-2.6 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.5-2.6 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h3l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.5 2.6-1.4 1.1a7 7 0 0 1 0 1.7z"/></svg></span><span class="sidebar-link-label">Administração</span>';
  aside.append(nav, admin);
  document.body.prepend(aside);
})();