// Fade sections in as they scroll into view
const items = document.querySelectorAll(".section-head, .card, .role, .contact");

if ("IntersectionObserver" in window) {
  document.documentElement.classList.add("js");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("seen");
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px" });

  items.forEach((item) => {
    item.classList.add("reveal");
    observer.observe(item);
  });
}
