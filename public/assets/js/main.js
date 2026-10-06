/* SorrisMed — interações e conversão */
(function () {
  'use strict';

  var CONFIG = {
    whatsapp: '5548996612975',
    defaultMessage: 'Olá! Vim pelo site e gostaria de agendar uma avaliação.',
    leadEndpoint: '/api/leads',
    timezone: 'America/Sao_Paulo',
    // Horário de funcionamento: dia da semana (0 = domingo) -> [abre, fecha] em horas
    hours: { 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18] }
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function waLink(message) {
    return 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(message || CONFIG.defaultMessage);
  }

  /* ---------- Rastreamento (GA4 / GTM / Meta Pixel, se instalados) ---------- */
  window.dataLayer = window.dataLayer || [];
  function track(event, params) {
    params = params || {};
    window.dataLayer.push(Object.assign({ event: event }, params));
    if (typeof window.gtag === 'function') window.gtag('event', event, params);
    if (typeof window.fbq === 'function') {
      if (event === 'generate_lead') window.fbq('track', 'Lead', params);
      else if (event === 'whatsapp_click' || event === 'phone_click') window.fbq('track', 'Contact', params);
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    var label = el.getAttribute('data-track') || '';
    if (href.indexOf('wa.me') !== -1) track('whatsapp_click', { cta: label });
    else if (href.indexOf('tel:') === 0) track('phone_click', { cta: label });
    else if (label) track('cta_click', { cta: label });
  });

  /* ---------- UTMs (repassadas junto com o lead) ---------- */
  var utm = {};
  try {
    var qs = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(function (k) {
      if (qs.get(k)) utm[k] = qs.get(k);
    });
    if (Object.keys(utm).length) sessionStorage.setItem('sm_utm', JSON.stringify(utm));
    else utm = JSON.parse(sessionStorage.getItem('sm_utm') || '{}');
  } catch (err) { /* armazenamento indisponível */ }

  /* ---------- Links de WhatsApp por tratamento ---------- */
  $$('[data-service]').forEach(function (card) {
    var service = card.getAttribute('data-service');
    card.href = waLink('Olá! Vim pelo site e gostaria de saber mais sobre ' + service + '.');
    card.target = '_blank';
    card.rel = 'noopener';
  });

  /* ---------- Header e menu ---------- */
  var header = $('[data-header]');
  var toggle = $('[data-nav-toggle]');
  var nav = $('#menu');
  var mobileBar = $('.mobile-bar');
  var hero = $('.hero');

  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    if (mobileBar && hero) mobileBar.classList.toggle('is-visible', y > hero.offsetHeight * 0.6);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
  }
  toggle.addEventListener('click', function () {
    var open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ---------- Status aberto / fechado ---------- */
  var statusEl = $('[data-open-status]');
  if (statusEl) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CONFIG.timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
      }).formatToParts(new Date());
      var get = function (t) { return (parts.filter(function (p) { return p.type === t; })[0] || {}).value; };
      var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
      var now = (parseInt(get('hour'), 10) % 24) + parseInt(get('minute'), 10) / 60;
      var today = CONFIG.hours[day];
      if (today && now >= today[0] && now < today[1]) {
        statusEl.classList.add('is-open');
        statusEl.lastChild.textContent = ' Aberto agora · fecha às ' + today[1] + 'h';
      }
    } catch (err) { /* mantém o texto padrão */ }
  }

  /* ---------- Formulário de lead ---------- */
  var form = $('[data-lead-form]');
  if (form) {
    var startedAt = Date.now();
    var phoneInput = $('[data-phone-mask]', form);

    phoneInput.addEventListener('input', function () {
      var d = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      var out = d;
      if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length > 7) out = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
      phoneInput.value = out;
    });

    function setError(input, msg) {
      var field = input.closest('.field');
      var err = field ? $('.field__err', field) : $('.field__err--consent', form);
      if (field) field.classList.toggle('has-error', !!msg);
      if (err) err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function validate() {
      var ok = true;
      var nome = form.nome, tel = form.telefone, interesse = form.interesse, consent = form.consentimento;
      var digits = tel.value.replace(/\D/g, '');

      if (nome.value.trim().length < 2) { setError(nome, 'Informe seu nome.'); ok = false; } else setError(nome);
      if (digits.length < 10 || digits.length > 11) { setError(tel, 'Informe um WhatsApp válido com DDD.'); ok = false; } else setError(tel);
      if (!interesse.value) { setError(interesse, 'Selecione uma opção.'); ok = false; } else setError(interesse);
      if (!consent.checked) { setError(consent, 'Precisamos da sua autorização para entrar em contato.'); ok = false; } else setError(consent);

      if (!ok) {
        var first = $('[aria-invalid="true"]', form);
        if (first) first.focus();
      }
      return ok;
    }

    $$('input, select', form).forEach(function (el) {
      el.addEventListener('change', function () { if (el.getAttribute('aria-invalid') === 'true') validate(); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;

      var data = {
        nome: form.nome.value.trim(),
        telefone: form.telefone.value.replace(/\D/g, ''),
        interesse: form.interesse.value,
        periodo: (form.querySelector('input[name="periodo"]:checked') || {}).value || '',
        consentimento: true,
        empresa: form.empresa.value,
        tempo: Date.now() - startedAt,
        pagina: location.href,
        utm: utm
      };

      var message = 'Olá! Meu nome é ' + data.nome + '. Vim pelo site e tenho interesse em: ' +
        data.interesse + '. Melhor período para contato: ' + data.periodo + '.';

      form.classList.add('is-loading');

      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 8000);

      fetch(CONFIG.leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) { return res.ok; })
        .catch(function () { return false; })
        .then(function (saved) {
          clearTimeout(timer);
          form.classList.remove('is-loading');
          track('generate_lead', { interesse: data.interesse, canal: saved ? 'formulario' : 'whatsapp_fallback' });
          showSuccess(saved, message);
        });
    });

    function showSuccess(saved, message) {
      var body = $('.lead-form__body', form);
      var success = $('.lead-form__success', form);
      var btn = $('[data-success-whats]', form);
      btn.href = waLink(message);
      if (!saved) {
        // Sem backend disponível: o WhatsApp vira o canal principal do lead
        $('h3', success).textContent = 'Falta só um passo!';
        $('p', success).textContent = 'Toque no botão abaixo para enviar sua solicitação pelo WhatsApp. A mensagem já vai pronta.';
      }
      body.hidden = true;
      success.hidden = false;
      success.focus();
    }
  }

  /* ---------- Mapa sob demanda (mais leve e sem cookies até o clique) ---------- */
  var mapBtn = $('[data-map-load]');
  if (mapBtn) {
    mapBtn.addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.google.com/maps?q=' +
        encodeURIComponent('SorrisMed Rod. Armando Calil Bulos, 6100 - Ingleses Norte, Florianópolis - SC, 88058-001') +
        '&output=embed';
      iframe.title = 'Mapa da localização da SorrisMed';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.allowFullscreen = true;
      mapBtn.replaceWith(iframe);
      track('map_open');
    });
  }

  /* ---------- Animações de entrada ---------- */
  var revealEls = $$('.card, .features li, .step, .review, .faq details, .section__head, .gallery__main, .lead-form');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var target = entry.target;
          target.classList.add('is-visible');
          io.unobserve(target);
          setTimeout(function () { target.style.transitionDelay = ''; }, 900);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
      io.observe(el);
    });
  }

  /* ---------- Dica do WhatsApp flutuante ---------- */
  var floatBtn = $('.whats-float');
  if (floatBtn) {
    setTimeout(function () {
      floatBtn.classList.add('show-tip');
      setTimeout(function () { floatBtn.classList.remove('show-tip'); }, 5000);
    }, 9000);
  }

  var yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
