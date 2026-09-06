(() => {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const form = document.getElementById("quote-form");
  const status = document.getElementById("form-status");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  if (form && status) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      status.classList.remove("is-success");
      if (!form.checkValidity()) {
        status.textContent = "Please complete the required fields.";
        form.reportValidity();
        return;
      }
      status.textContent =
        "Thanks — your inquiry is ready to send. Email info@bogdandelivery.com or call (253) 364-0717.";
      status.classList.add("is-success");
      form.reset();
    });
  }

  let lastY = window.scrollY;
  window.addEventListener(
    "scroll",
    () => {
      if (!header) return;
      const y = window.scrollY;
      header.style.boxShadow =
        y > 12 ? "0 8px 24px rgba(12, 22, 34, 0.08)" : "none";
      lastY = y;
    },
    { passive: true }
  );
})();
