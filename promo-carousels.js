(() => {
  "use strict";

  const INTERVAL_MS = 4500;
  const galleries = {
    cards: [
      {
        src: "https://fut-senai-cards.vercel.app/assets/heitorbarbosa-5nLGH9G_.jpg",
        alt: "Carta de Heitor Barbosa, fixo",
        caption: "HEITOR · FIXO",
        title: "Heitor já virou carta!",
        description: "Veja os craques da turma e comece sua coleção."
      },
      {
        src: "https://fut-senai-cards.vercel.app/assets/pietroguedes-Clw3RtbL.jpg",
        alt: "Carta de Pietro Guedes, pivô",
        caption: "PIETRO · PIVÔ",
        title: "Pietro chegou ao elenco!",
        description: "Abra pacotes e descubra quem vai completar seu time."
      },
      {
        src: "https://fut-senai-cards.vercel.app/assets/thiagotavares-3nVwKoB2.jpg",
        alt: "Carta de Thiago Tavares, ala",
        caption: "THIAGO · ALA",
        title: "Thiago é o próximo craque?",
        description: "Colecione cartas da turma e monte sua escalação."
      }
    ]
  };

  function initializeGallery(element) {
    const slides = galleries[element.dataset.promoGallery];
    const image = element.querySelector("[data-promo-image]");
    const caption = element.querySelector("[data-promo-caption]");
    const title = element.querySelector("[data-promo-title]");
    const description = element.querySelector("[data-promo-description]");
    const counter = element.querySelector("[data-promo-counter]");
    const previous = element.querySelector("[data-promo-prev]");
    const next = element.querySelector("[data-promo-next]");
    const media = element.querySelector(".promo-card-media");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!slides || !image || !caption || !title || !description || !counter || !previous || !next || !media) {
      console.error("Não foi possível inicializar uma galeria de publicidade.", element);
      return;
    }

    let currentIndex = 0;
    let timerId = null;
    let changeTimeoutId = null;

    function renderSlide() {
      const slide = slides[currentIndex];
      image.classList.add("is-changing");
      window.clearTimeout(changeTimeoutId);
      image.src = slide.src;
      image.alt = slide.alt;
      caption.textContent = slide.caption;
      title.textContent = slide.title;
      description.textContent = slide.description;
      counter.textContent = (currentIndex + 1) + " / " + slides.length;
      changeTimeoutId = window.setTimeout(() => image.classList.remove("is-changing"), 180);
    }

    function changeSlide(direction) {
      currentIndex = (currentIndex + direction + slides.length) % slides.length;
      renderSlide();
    }

    function stopAutoplay() {
      window.clearInterval(timerId);
      timerId = null;
    }

    function startAutoplay() {
      stopAutoplay();
      if (reducedMotion.matches || document.hidden || media.matches(":hover") ||
        media.contains(document.activeElement)) return;
      timerId = window.setInterval(() => changeSlide(1), INTERVAL_MS);
    }

    previous.addEventListener("click", () => {
      changeSlide(-1);
      startAutoplay();
    });
    next.addEventListener("click", () => {
      changeSlide(1);
      startAutoplay();
    });
    media.addEventListener("mouseenter", stopAutoplay);
    media.addEventListener("mouseleave", startAutoplay);
    media.addEventListener("focusin", stopAutoplay);
    media.addEventListener("focusout", event => {
      if (!media.contains(event.relatedTarget)) startAutoplay();
    });
    reducedMotion.addEventListener("change", startAutoplay);
    document.addEventListener("visibilitychange", startAutoplay);

    slides.slice(1).forEach(slide => {
      const preloadedImage = new Image();
      preloadedImage.src = slide.src;
    });
    renderSlide();
    startAutoplay();
  }

  document.querySelectorAll("[data-promo-gallery]").forEach(initializeGallery);
})();
