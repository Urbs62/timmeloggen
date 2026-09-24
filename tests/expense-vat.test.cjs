const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const app = read('app.js');
const invoice = read('invoice.html');
const timesheet = read('underlag.html');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const legacy = { netAmountMinor: 89600, vatAmountMinor: 22400 };
const software = { netAmountMinor: 105000, vatAmountMinor: 0, invoiceVatRate: 25 };
function renderInvoice(expenses, work = 0, rate = .25) {
  const nodes = {};
  const document = {
    getElementById: id => nodes[id] ||= { children: [], appendChild(row) { this.children.push(row); } },
    createElement: () => ({})
  };
  const context = { document, invoiceExpenses: expenses, sumEx: work, vatRate: rate,
    escapeHtml: String, formatExpenseMoney: n => (n / 100).toFixed(2), formatMoney: String };
  vm.runInNewContext(section(invoice, '  let expenseNetMinor = 0;', '</script>'), context);
  return nodes;
}
test('legacy and US software regression examples', () => {
  for (const [expense, expected] of [[legacy, ['896.00', '224.00', '1120.00']], [software, ['1050.00', '262.50', '1312.50']]]) {
    const nodes = renderInvoice([expense]);
    assert.deepEqual(['sumEx', 'vat', 'total'].map(id => nodes[id].textContent), expected);
    assert.ok(nodes.expenseRows.children[0].innerHTML.includes(expected[1]));
  }
});
test('all explicit rates, zero overrides purchase VAT, rounding per expense', () => {
  for (const rate of [25, 12, 6, 0]) {
    assert.equal(renderInvoice([{ ...legacy, netAmountMinor: 10000, invoiceVatRate: rate }]).vat.textContent, rate.toFixed(2));
  }
  assert.equal(renderInvoice([{ netAmountMinor: 2, vatAmountMinor: 0, invoiceVatRate: 25 }]).vat.textContent, '0.01');
  assert.equal(renderInvoice([{ netAmountMinor: 1, vatAmountMinor: 0, invoiceVatRate: 25 }]).vat.textContent, '0.00');
});
test('mixed expense treatments and work VAT remain independent', () => {
  const expenses = [legacy, software, ...[12, 6, 0].map(invoiceVatRate => ({ netAmountMinor: 10000, vatAmountMinor: 2500, invoiceVatRate }))];
  const nodes = renderInvoice(expenses, 1000, .12);
  assert.deepEqual(['sumEx', 'vat', 'total'].map(id => nodes[id].textContent), ['3246.00', '624.50', '3870.50']);
  assert.equal(renderInvoice([], 1000).total.textContent, '1250');
});
test('form saves numeric rates and removes the property for Same as purchase', () => {
  const submit = section(app, '  const record = { id: existing?.id', '  const next = existing ?');
  for (const value of ['', '25', '12', '6', '0']) {
    const context = { existing: { id: 'original', invoiceVatRate: 25 }, date: '2026-09-24', accountId: 'a', description: 'License',
      netAmountMinor: 105000, vatAmountMinor: 0, expenseInvoiceVat: { value }, alert: message => { throw Error(message); } };
    vm.runInNewContext(`result = (() => { ${submit}; return record; })()`, context);
    assert.equal(context.result.vatAmountMinor, 0);
    assert.equal(context.result.id, 'original');
    assert.equal(context.result.invoiceVatRate, value === '' ? undefined : Number(value));
    assert.equal(Object.hasOwn(context.result, 'invoiceVatRate'), value !== '');
  }
});
test('timesheet payload and rows preserve purchase values and optional invoice rate', () => {
  const context = { selectedExpenses: [legacy, software, { ...software, invoiceVatRate: 0 }], accountNameById: () => 'Account',
    invNo: '1', monthVal: '2026-09', accLabel: 'Account', compactRows: [] };
  vm.runInNewContext(section(app, '       const payload = { v:1', '       localStorage.setItem("tl_underlag_payload_v1"') + '\nresult = payload;', context);
  const expenses = JSON.parse(JSON.stringify(context.result)).expenses;
  assert.equal(Object.hasOwn(expenses[0], 'invoiceVatRate'), false);
  assert.equal(expenses[1].invoiceVatRate, 25);
  assert.equal(expenses[2].invoiceVatRate, 0);
  const render = { expenses, currency: 'SEK', escapeHtml: String, formatExpenseMoney: n => (n / 100).toFixed(2) };
  vm.runInNewContext(section(timesheet, '      let expenseNet = 0;', '      content.innerHTML =') + '\nresult = { expenseRows, expenseNet, expenseVat };', render);
  assert.equal(render.result.expenseVat, 22400);
  assert.ok(render.result.expenseRows.includes('Invoice VAT: 25% of net'));
  assert.ok(render.result.expenseRows.includes('Invoice VAT: 0% of net'));
  assert.ok(render.result.expenseRows.includes('1050.00'));
});
test('all scripts parse', () => {
  new vm.Script(app);
  new vm.Script(read('service-worker.js'));
  for (const html of [invoice, timesheet]) {
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  }
});
