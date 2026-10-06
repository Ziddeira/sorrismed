'use strict';

const INTERESSES = new Set([
  'Implantes dentários',
  'Próteses e protocolo',
  'Ortodontia e alinhadores',
  'Clareamento dental',
  'Lentes e facetas',
  'Tratamento de canal',
  'Clínico geral e prevenção',
  'Consulta médica',
  'Ainda não sei / quero uma avaliação'
]);

const PERIODOS = new Set(['Manhã', 'Tarde', 'Qualquer horário']);
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

// Envios mais rápidos que isso (ms) após abrir a página são tratados como robô
const MIN_FILL_TIME = 2500;

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Valida e normaliza o payload do formulário.
 * Retorna { ok: true, lead } | { ok: false, errors } | { ok: false, spam: true }.
 */
function validateLead(body) {
  if (!body || typeof body !== 'object') return { ok: false, errors: { geral: 'Dados inválidos.' } };

  if (clean(body.empresa, 200) !== '') return { ok: false, spam: true };
  if (typeof body.tempo === 'number' && body.tempo < MIN_FILL_TIME) return { ok: false, spam: true };

  const errors = {};
  const nome = clean(body.nome, 80);
  const telefone = String(body.telefone || '').replace(/\D/g, '');
  const interesse = clean(body.interesse, 80);
  const periodo = clean(body.periodo, 40);

  if (nome.length < 2) errors.nome = 'Informe seu nome.';
  if (telefone.length < 10 || telefone.length > 11) errors.telefone = 'Telefone inválido.';
  if (!INTERESSES.has(interesse)) errors.interesse = 'Selecione uma opção válida.';
  if (periodo && !PERIODOS.has(periodo)) errors.periodo = 'Período inválido.';
  if (body.consentimento !== true) errors.consentimento = 'Consentimento obrigatório.';

  if (Object.keys(errors).length) return { ok: false, errors };

  const utm = {};
  if (body.utm && typeof body.utm === 'object') {
    for (const key of UTM_KEYS) {
      if (body.utm[key]) utm[key] = clean(body.utm[key], 200);
    }
  }

  return {
    ok: true,
    lead: {
      nome,
      telefone,
      interesse,
      periodo: periodo || 'Qualquer horário',
      pagina: clean(body.pagina, 300),
      utm
    }
  };
}

function formatPhone(digits) {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function csvCell(value) {
  let s = String(value == null ? '' : value);
  // Evita injeção de fórmulas ao abrir no Excel/Sheets
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function leadsToCsv(leads) {
  const header = ['id', 'data', 'nome', 'telefone', 'whatsapp', 'interesse', 'periodo', 'utm_source', 'utm_medium', 'utm_campaign', 'pagina'];
  const rows = leads.map((l) => [
    l.id,
    l.criadoEm,
    l.nome,
    formatPhone(l.telefone),
    `https://wa.me/55${l.telefone}`,
    l.interesse,
    l.periodo,
    (l.utm || {}).utm_source,
    (l.utm || {}).utm_medium,
    (l.utm || {}).utm_campaign,
    l.pagina
  ].map(csvCell).join(';'));
  // BOM para o Excel reconhecer UTF-8 (acentos)
  return '﻿' + [header.join(';'), ...rows].join('\r\n') + '\r\n';
}

/** Limitador simples em memória: `limit` requisições por `windowMs` por chave. */
function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function isLimited(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, list] of hits) {
        if (!list.some((t) => now - t < windowMs)) hits.delete(k);
      }
    }
    return recent.length > limit;
  };
}

module.exports = { validateLead, leadsToCsv, formatPhone, createRateLimiter, INTERESSES };
