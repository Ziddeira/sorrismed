'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLead, leadsToCsv, formatPhone, createRateLimiter } = require('../lib/leads');

const valid = {
  nome: '  Maria   Silva ',
  telefone: '(48) 99661-2975',
  interesse: 'Implantes dentários',
  periodo: 'Manhã',
  consentimento: true,
  empresa: '',
  tempo: 15000,
  utm: { utm_source: 'google', hack: 'x' }
};

test('aceita e normaliza um lead válido', () => {
  const r = validateLead(valid);
  assert.equal(r.ok, true);
  assert.equal(r.lead.nome, 'Maria Silva');
  assert.equal(r.lead.telefone, '48996612975');
  assert.deepEqual(r.lead.utm, { utm_source: 'google' });
});

test('rejeita campos obrigatórios ausentes ou inválidos', () => {
  const r = validateLead({ nome: 'A', telefone: '123', interesse: 'Outra coisa', consentimento: false, tempo: 9000 });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['consentimento', 'interesse', 'nome', 'telefone']);
});

test('marca como spam honeypot preenchido ou envio rápido demais', () => {
  assert.equal(validateLead({ ...valid, empresa: 'Bot Ltda' }).spam, true);
  assert.equal(validateLead({ ...valid, tempo: 300 }).spam, true);
});

test('formata telefones de 10 e 11 dígitos', () => {
  assert.equal(formatPhone('48996612975'), '(48) 99661-2975');
  assert.equal(formatPhone('4832061234'), '(48) 3206-1234');
});

test('CSV escapa aspas e neutraliza fórmulas', () => {
  const csv = leadsToCsv([{ id: '1', criadoEm: 'x', nome: '=HYPERLINK("a")', telefone: '48996612975', interesse: 'Clareamento dental', periodo: 'Tarde', utm: {} }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes(`"'=HYPERLINK(""a"")"`));
  assert.ok(csv.includes('"https://wa.me/5548996612975"'));
});

test('limitador bloqueia após o limite dentro da janela', () => {
  const limited = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limited('ip', 0), false);
  assert.equal(limited('ip', 10), false);
  assert.equal(limited('ip', 20), true);
  assert.equal(limited('ip', 2000), false);
});
