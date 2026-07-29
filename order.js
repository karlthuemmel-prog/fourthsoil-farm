/* Fourth Soil Farm — order.js
   Drives the order.html form: product-type switching, dynamic Custom Combo
   rows, live price display, the subscription upsell step, and final
   submission to the Cloudflare Worker that creates the Stripe Checkout
   Session. Pricing shown here is for display only — the Worker always
   recomputes the authoritative price server-side. */

(function () {
  'use strict';

  // Replace with your deployed Worker URL — see SERVERLESS_SETUP.md
  const CHECKOUT_ENDPOINT = 'https://fourthsoil-checkout.karlthuemmel.workers.dev/create-checkout-session';

  let pricing = null;
  let comboRowCount = 0;

  const els = {
    planTypeRadios: () => document.querySelectorAll('input[name="planType"]'),
    panels: {
      'variety-pack': document.getElementById('panel-variety-pack'),
      'custom-combo': document.getElementById('panel-custom-combo'),
      'single-bulk': document.getElementById('panel-single-bulk'),
    },
    comboRows: document.getElementById('comboRows'),
    addComboRow: document.getElementById('addComboRow'),
    bulkVariety: document.getElementById('bulkVariety'),
    bulkQty: document.getElementById('bulkQty'),
    oneTimeTotal: document.getElementById('oneTimeTotal'),
    deliveryFeeNote: document.getElementById('deliveryFeeNote'),
    continueBtn: document.getElementById('continueBtn'),
    stepConfigure: document.getElementById('step-configure'),
    stepUpsell: document.getElementById('step-upsell'),
    upsellOneTime: document.getElementById('upsellOneTime'),
    upsellSubTotal: document.getElementById('upsellSubTotal'),
    upsellSavings: document.getElementById('upsellSavings'),
    subscribeBtn: document.getElementById('subscribeBtn'),
    oneTimeBtn: document.getElementById('oneTimeBtn'),
    backBtn: document.getElementById('backBtn'),
    orderStatus: document.getElementById('orderStatus'),
  };

  function money(n) {
    return `$${n.toFixed(2)}`;
  }

  function getSelectedPlanType() {
    const checked = document.querySelector('input[name="planType"]:checked');
    return checked ? checked.value : 'variety-pack';
  }

  function showPanelFor(planType) {
    Object.keys(els.panels).forEach((key) => {
      els.panels[key].hidden = key !== planType;
    });
  }

  // ---- Populate dropdowns from pricing.json ----

  function populateComboVarietySelect(select) {
    pricing.customComboVarieties.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.label;
      select.appendChild(opt);
    });
  }

  function populateBulkVarietySelect() {
    const allBulk = [...pricing.bulk.shoots.varieties, ...pricing.bulk.micros.varieties];
    allBulk.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.label;
      els.bulkVariety.appendChild(opt);
    });
  }

  // ---- Custom Combo rows ----

  function addComboRow() {
    comboRowCount += 1;
    const row = document.createElement('div');
    row.className = 'combo-row';
    row.dataset.rowId = comboRowCount;

    const varietyGroup = document.createElement('div');
    varietyGroup.className = 'form-group';
    const varietyLabel = document.createElement('label');
    varietyLabel.textContent = 'Variety';
    const varietySelect = document.createElement('select');
    varietySelect.className = 'combo-variety';
    populateComboVarietySelect(varietySelect);
    varietyGroup.append(varietyLabel, varietySelect);

    const qtyGroup = document.createElement('div');
    qtyGroup.className = 'form-group form-group--qty';
    const qtyLabel = document.createElement('label');
    qtyLabel.textContent = 'Boxes';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = '1';
    qtyInput.className = 'combo-qty';
    qtyGroup.append(qtyLabel, qtyInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'combo-row-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      row.remove();
      updatePriceDisplay();
    });

    row.append(varietyGroup, qtyGroup, removeBtn);
    els.comboRows.appendChild(row);

    varietySelect.addEventListener('change', updatePriceDisplay);
    qtyInput.addEventListener('input', updatePriceDisplay);

    updatePriceDisplay();
  }

  // ---- Price calculation (display only — Worker is authoritative) ----

  function calculateOneTimeSubtotal() {
    const planType = getSelectedPlanType();

    if (planType === 'variety-pack') {
      return pricing.varietyPack.boxCount * pricing.box.oneTimePrice;
    }

    if (planType === 'custom-combo') {
      let total = 0;
      els.comboRows.querySelectorAll('.combo-row').forEach((row) => {
        const qty = Number.parseInt(row.querySelector('.combo-qty').value, 10) || 0;
        total += qty * pricing.box.oneTimePrice;
      });
      return total;
    }

    if (planType === 'single-bulk') {
      const varietyId = els.bulkVariety.value;
      const qty = Number.parseInt(els.bulkQty.value, 10) || 0;
      const category = findBulkCategory(varietyId);
      if (!category) return 0;
      return qty * pricing.bulk[category].oneTimePrice;
    }

    return 0;
  }

  function calculateSubscriptionSubtotal() {
    const planType = getSelectedPlanType();

    if (planType === 'variety-pack') {
      return pricing.varietyPack.boxCount * pricing.box.subscriptionPrice;
    }

    if (planType === 'custom-combo') {
      let total = 0;
      els.comboRows.querySelectorAll('.combo-row').forEach((row) => {
        const qty = Number.parseInt(row.querySelector('.combo-qty').value, 10) || 0;
        total += qty * pricing.box.subscriptionPrice;
      });
      return total;
    }

    if (planType === 'single-bulk') {
      const varietyId = els.bulkVariety.value;
      const qty = Number.parseInt(els.bulkQty.value, 10) || 0;
      const category = findBulkCategory(varietyId);
      if (!category) return 0;
      return qty * pricing.bulk[category].subscriptionPrice;
    }

    return 0;
  }

  // Adds the delivery fee whenever the relevant subtotal is under the free
  // threshold — mirrors cloudflare-worker/create-checkout-session.js exactly,
  // so the price shown here always matches what Stripe will actually charge.
  function applyDeliveryFee(subtotal) {
    return subtotal < pricing.delivery.freeThreshold
      ? subtotal + pricing.delivery.fee
      : subtotal;
  }

  function calculateOneTimeTotal() {
    return applyDeliveryFee(calculateOneTimeSubtotal());
  }

  function calculateSubscriptionTotal() {
    return applyDeliveryFee(calculateSubscriptionSubtotal());
  }

  function findBulkCategory(varietyId) {
    if (pricing.bulk.shoots.varieties.some((v) => v.id === varietyId)) return 'shoots';
    if (pricing.bulk.micros.varieties.some((v) => v.id === varietyId)) return 'micros';
    return null;
  }

  function updatePriceDisplay() {
    const subtotal = calculateOneTimeSubtotal();
    els.oneTimeTotal.textContent = money(applyDeliveryFee(subtotal));
    els.deliveryFeeNote.hidden = subtotal >= pricing.delivery.freeThreshold;
  }

  // ---- Build the order payload sent to the Worker ----

  function buildOrderItems() {
    const planType = getSelectedPlanType();

    if (planType === 'custom-combo') {
      return [...els.comboRows.querySelectorAll('.combo-row')].map((row) => ({
        variety: row.querySelector('.combo-variety').value,
        qty: Number.parseInt(row.querySelector('.combo-qty').value, 10) || 1,
      }));
    }

    if (planType === 'single-bulk') {
      return [{
        variety: els.bulkVariety.value,
        qty: Number.parseInt(els.bulkQty.value, 10) || 1,
      }];
    }

    return []; // variety-pack needs no items — the Worker uses the fixed combo
  }

  // ---- Step transitions ----

  function goToUpsellStep() {
    const planType = getSelectedPlanType();

    if (planType === 'custom-combo' && !els.comboRows.querySelector('.combo-row')) {
      els.orderStatus.textContent = 'Please add at least one variety to your Custom Combo.';
      els.orderStatus.className = 'form-status error';
      return;
    }

    const oneTime = calculateOneTimeTotal();
    const subscription = calculateSubscriptionTotal();

    if (oneTime <= 0) {
      els.orderStatus.textContent = 'Please complete your selection before continuing.';
      els.orderStatus.className = 'form-status error';
      return;
    }

    els.orderStatus.textContent = '';
    els.upsellOneTime.textContent = money(oneTime);
    els.upsellSubTotal.textContent = money(subscription);
    els.upsellSavings.textContent = money(oneTime - subscription);

    els.stepConfigure.hidden = true;
    els.stepUpsell.hidden = false;
    window.scrollTo({ top: els.stepUpsell.offsetTop - 100, behavior: 'smooth' });
  }

  function goBackToConfigureStep() {
    els.stepUpsell.hidden = true;
    els.stepConfigure.hidden = false;
    els.orderStatus.textContent = '';
  }

  // ---- Submission ----

  async function submitOrder(subscribe) {
    const planType = getSelectedPlanType();
    const cadence = subscribe
      ? document.querySelector('input[name="cadence"]:checked').value
      : null;

    const order = {
      planType,
      items: buildOrderItems(),
      subscribe,
      cadence,
    };

    const buttons = [els.subscribeBtn, els.oneTimeBtn];
    buttons.forEach((b) => { b.disabled = true; });
    els.orderStatus.textContent = 'Taking you to secure checkout…';
    els.orderStatus.className = 'form-status';

    if (CHECKOUT_ENDPOINT.includes('YOUR_WORKER_ENDPOINT_HERE')) {
      els.orderStatus.textContent = 'Ordering isn’t set up yet — please email info@fourthsoil.farm to place your order.';
      els.orderStatus.className = 'form-status error';
      buttons.forEach((b) => { b.disabled = false; });
      return;
    }

    try {
      const response = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Checkout could not be started.');
      }

      window.location.href = result.url;
    } catch (err) {
      els.orderStatus.textContent = `Something went wrong: ${err.message}. Please try again or email info@fourthsoil.farm.`;
      els.orderStatus.className = 'form-status error';
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  // ---- Init ----

  async function init() {
    try {
      const res = await fetch('pricing.json');
      pricing = await res.json();
    } catch {
      els.orderStatus.textContent = 'Could not load pricing. Please refresh the page.';
      els.orderStatus.className = 'form-status error';
      return;
    }

    populateBulkVarietySelect();
    addComboRow(); // start Custom Combo with one row

    els.planTypeRadios().forEach((radio) => {
      radio.addEventListener('change', () => {
        showPanelFor(radio.value);
        updatePriceDisplay();
      });
    });

    els.addComboRow.addEventListener('click', addComboRow);
    els.bulkVariety.addEventListener('change', updatePriceDisplay);
    els.bulkQty.addEventListener('input', updatePriceDisplay);

    els.continueBtn.addEventListener('click', goToUpsellStep);
    els.backBtn.addEventListener('click', goBackToConfigureStep);
    els.subscribeBtn.addEventListener('click', () => submitOrder(true));
    els.oneTimeBtn.addEventListener('click', () => submitOrder(false));

    showPanelFor(getSelectedPlanType());
    updatePriceDisplay();

    if (new URLSearchParams(window.location.search).get('canceled') === 'true') {
      els.orderStatus.textContent = 'Your order was not completed — no charge was made. Feel free to try again whenever you’re ready.';
      els.orderStatus.className = 'form-status';
    }
  }

  // Catches the case where a customer used the browser's own Back button to
  // leave Stripe's checkout page — that's a pure client-side history
  // navigation and never touches our ?canceled=true redirect, but it does
  // restore this page from the browser's back/forward cache (bfcache).
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && els.orderStatus && !els.orderStatus.textContent) {
      els.orderStatus.textContent = 'Looks like you didn’t finish checking out — no charge was made. Ready when you are.';
      els.orderStatus.className = 'form-status';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
