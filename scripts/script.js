document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".navT").forEach(navT => {
    navT.addEventListener("click", function () {
      this.classList.toggle("active");
      document.getElementById("menu").classList.toggle("open");
      document.querySelector(".content").classList.toggle("shift");
    });
  });

  const desktopToggle = document.getElementById("darkmode-toggle-desktop");
  const mobileToggle = document.getElementById("darkmode-toggle-mobile");
  const isDarkMode = localStorage.getItem("darkMode") === "true";

  document.body.classList.add(isDarkMode ? "dark-mode" : "light-mode");
  desktopToggle.checked = isDarkMode;
  mobileToggle.checked = isDarkMode;

  function syncDarkModeToggles(isEnabled) {
    desktopToggle.checked = isEnabled;
    mobileToggle.checked = isEnabled;
    if (isEnabled) {
      document.body.classList.add("dark-mode");
      document.body.classList.remove("light-mode");
    } else {
      document.body.classList.add("light-mode");
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", isEnabled.toString());
  }

  desktopToggle.addEventListener("change", function () {
    syncDarkModeToggles(desktopToggle.checked);
  });

  mobileToggle.addEventListener("change", function () {
    syncDarkModeToggles(mobileToggle.checked);
  });

  const elementsToAnimate = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.4
  });

  elementsToAnimate.forEach(element => observer.observe(element));

  function toggleDropdown(element) {
    const dropdown = element.parentElement;
    dropdown.classList.toggle('open');
    const content = dropdown.querySelector('.dropdown-content');
    if (dropdown.classList.contains('open')) {
      content.style.display = 'block';
    } else {
      content.style.display = 'none';
    }
  }
  window.toggleDropdown = toggleDropdown;
});

if (window.innerWidth <= 1000) {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      const projectElement = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio === 1) {
        projectElement.classList.add('project-visible');
      } else {
        projectElement.classList.remove('project-visible');
      }
    });
  }, {
    threshold: 1.0
  });

}