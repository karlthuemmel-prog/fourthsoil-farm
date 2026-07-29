/* Fourth Soil Farm — main.js */

(function () {
  'use strict';

  // ---- Mobile nav toggle ----
  const toggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (toggle && navLinks) {
    toggle.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen);
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    // Close nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      });
    });

    // Close nav on outside click
    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- Highlight active nav link on scroll ----
  const sections = document.querySelectorAll('section[id], header[id]');
  const navAnchorLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  if (sections.length && navAnchorLinks.length) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            navAnchorLinks.forEach(function (a) {
              a.classList.remove('active');
              if (a.getAttribute('href') === '#' + entry.target.id) {
                a.classList.add('active');
              }
            });
          }
        });
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    sections.forEach(function (s) { observer.observe(s); });
  }

  // ---- Contact form: Formspree AJAX submission ----
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');

  if (form && status) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      const originalText = submitBtn.textContent;

      // Bail out if placeholder URL hasn't been replaced yet
      if (form.action.includes('YOUR_FORMSPREE_ID')) {
        status.textContent = 'Contact form not configured yet — please email info@fourthsoil.farm directly.';
        status.className = 'form-status error';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      status.textContent = '';
      status.className = 'form-status';

      try {
        const data = new FormData(form);
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' }
        });

        if (response.ok) {
          status.textContent = "Message sent! We'll get back to you within one business day.";
          status.className = 'form-status success';
          form.reset();
        } else {
          const json = await response.json().catch(() => ({}));
          const msg = (json.errors || []).map(function (e) { return e.message; }).join(', ');
          throw new Error(msg || 'Submission failed');
        }
      } catch (err) {
        status.textContent = 'Something went wrong. Please email info@fourthsoil.farm directly.';
        status.className = 'form-status error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // ---- Footer year ----
  const yearEl = document.getElementById('year');
  if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

  // ---- Smooth scroll offset for sticky header ----
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href').slice(1);
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      const headerHeight = document.querySelector('.site-header')?.offsetHeight || 64;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

})();
