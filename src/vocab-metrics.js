'use strict';

const fs = require('fs');
const path = require('path');
const sm2 = require('./sm2');
const { getStreakDays } = require('./vocab-library');

function defaultMetrics(now = new Date()) {
  return {
    installed_at: now.toISOString(),
    support_clicks: 0,
    donation_checks: 0,
    confirmed_donations: 0,
    confirmed_order_ids: [],
    last_support_click_at: '',
    last_donation_check_at: '',
    last_confirmed_order_id: '',
    updated_at: now.toISOString(),
  };
}

function loadMetrics(filePath, now = new Date()) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...defaultMetrics(now),
      ...raw,
      support_clicks: Number(raw.support_clicks) || 0,
      donation_checks: Number(raw.donation_checks) || 0,
      confirmed_donations: Number(raw.confirmed_donations) || 0,
      confirmed_order_ids: Array.isArray(raw.confirmed_order_ids) ? raw.confirmed_order_ids.map(String) : [],
    };
  } catch {
    return defaultMetrics(now);
  }
}

function saveMetrics(filePath, metrics) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2), { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch {}
  return metrics;
}

function recordSupportClick(filePath, now = new Date()) {
  const metrics = loadMetrics(filePath, now);
  metrics.support_clicks += 1;
  metrics.last_support_click_at = now.toISOString();
  metrics.updated_at = now.toISOString();
  return saveMetrics(filePath, metrics);
}

function recordDonationCheck(filePath, now = new Date()) {
  const metrics = loadMetrics(filePath, now);
  metrics.donation_checks += 1;
  metrics.last_donation_check_at = now.toISOString();
  metrics.updated_at = now.toISOString();
  return saveMetrics(filePath, metrics);
}

function recordConfirmedDonation(filePath, orderId, now = new Date()) {
  const metrics = loadMetrics(filePath, now);
  const id = String(orderId || '').trim();
  const firstDonation = metrics.confirmed_order_ids.length === 0;
  if (id && !metrics.confirmed_order_ids.includes(id)) {
    metrics.confirmed_order_ids.push(id);
    metrics.confirmed_donations = metrics.confirmed_order_ids.length;
  }
  if (id) metrics.last_confirmed_order_id = id;
  metrics.updated_at = now.toISOString();
  return { metrics: saveMetrics(filePath, metrics), firstDonation };
}

function buildDashboard(library = [], metrics = defaultMetrics(), now = new Date()) {
  const words = Array.isArray(library) ? library : [];
  const dueWords = sm2.dueWords(words, now);
  const mastered = words.filter(w => w.status === 'mastered' || Number(w.mastery_score) >= 5).length;
  const kept = words.filter(w => w.status !== 'skipped').length;
  return {
    ok: true,
    installed_at: metrics.installed_at,
    words_total: words.length,
    words_kept: kept,
    words_mastered: mastered,
    reviews_due: dueWords.length,
    streak: getStreakDays(words, now),
    support_clicks: Number(metrics.support_clicks) || 0,
    donation_checks: Number(metrics.donation_checks) || 0,
    confirmed_donations: Number(metrics.confirmed_donations) || 0,
    last_support_click_at: metrics.last_support_click_at || '',
    last_confirmed_order_id: metrics.last_confirmed_order_id || '',
  };
}

function normalizeDonationStatus(data = {}) {
  const state = String(data.state || data.status || data.payment_state || '').toLowerCase();
  const paid = data.paid === true || data.confirmed === true || data.is_paid === true;
  const confirmed = paid || ['paid', 'confirmed', 'sale', 'done', 'posted'].includes(state);
  return {
    ok: true,
    confirmed,
    state: state || 'unknown',
    order_id: String(data.order_id || data.order || data.name || ''),
    amount_vnd: Number(data.amount_vnd || data.amount_total || data.amount || 0) || 0,
    donor_name: data.donor_name || data.customer_name || data.partner_name || null,
  };
}

module.exports = {
  defaultMetrics,
  loadMetrics,
  saveMetrics,
  recordSupportClick,
  recordDonationCheck,
  recordConfirmedDonation,
  buildDashboard,
  normalizeDonationStatus,
};
