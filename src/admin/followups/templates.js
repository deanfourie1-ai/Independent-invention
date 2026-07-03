export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-first',
    name: 'First contact',
    body: "Hi {contact} — this is Karin from Bethlehem Plumbers. I'm calling about your outstanding balance of {amount}. When would you be able to arrange payment?",
  },
  {
    id: 'tpl-reminder',
    name: 'Payment reminder',
    body: 'Hi {contact}, following up on your account — {amount} is still outstanding. Please let us know when we can expect payment.',
  },
  {
    id: 'tpl-final',
    name: 'Final notice',
    body: 'Hi {contact}, this is a final notice — {amount} has been outstanding for {oldestDays}. Please arrange payment urgently or contact us to discuss.',
  },
  {
    id: 'tpl-broken',
    name: 'Broken promise',
    body: "Hi {contact}, the payment of {amount} we agreed on hasn't reflected yet. Please confirm when it will be processed.",
  },
  {
    id: 'tpl-paid',
    name: 'Payment confirmed',
    body: 'Spoke to {contact} — confirmed that payment of {amount} has been arranged. Following up to ensure it reflects on our side.',
  },
  {
    id: 'tpl-writtenoff',
    name: 'Written off',
    body: 'In opdrag van Steyn bevestig as afgeskryf.',
  },
  {
    id: 'tpl-fullypaid',
    name: 'Fully paid',
    body: 'Fully paid — payment of {amount} received. Paid on {today}.',
  },
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function todayDisp() {
  const d = new Date();
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export function fillTemplate(body, customer, owedAmount, openInvoices, oldestDays) {
  const contact = (customer.contact && customer.contact !== '—') ? customer.contact : customer.name;
  const amount = 'R ' + Number(owedAmount || 0).toLocaleString('en-ZA');
  const invoices = (openInvoices || []).map((i) => i.no).join(', ') || '—';
  return body
    .replace(/\{name\}/g, customer.name || '')
    .replace(/\{contact\}/g, contact)
    .replace(/\{amount\}/g, amount)
    .replace(/\{invoices\}/g, invoices)
    .replace(/\{oldestDays\}/g, oldestDays + ' days')
    .replace(/\{today\}/g, todayDisp());
}
