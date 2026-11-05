const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

const STATUS_LABEL = { arrived: 'Arrived', at_door: 'At door', unloading: 'Unloading', unloaded: 'Unloaded', departed: 'Departed' };
const COND_LABEL = { ok: 'OK', damaged: 'Damaged', seal_broken: 'Seal broken', wet: 'Wet', other: 'Other' };

const whoInput = $('#who');
try { whoInput.value = localStorage.getItem('who') || ''; } catch {}
whoInput.addEventListener('change', () => { try { localStorage.setItem('who', whoInput.value.trim()); } catch {} });

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (whoInput.value.trim()) headers['X-User-Name'] = whoInput.value.trim();
  const res = await fetch(`/api${path}`, { method, headers, body: body && JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.details = data.details;
    throw err;
  }
  return data;
}

const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const errText = (e) => e.details ? Object.entries(e.details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') : e.message;

/* ---------- list ---------- */
const rows = $('#rows'), empty = $('#empty'), search = $('#search'), filter = $('#filter');
for (const [v, l] of Object.entries(STATUS_LABEL)) filter.append(el('option', { value: v, textContent: l }));

async function loadList() {
  const qs = new URLSearchParams();
  if (search.value.trim()) qs.set('q', search.value.trim());
  if (filter.value) qs.set('status', filter.value);
  const list = await api(`/trailers?${qs}`);
  rows.replaceChildren(...list.map((t) => {
    const flags = [];
    if (t.condition !== 'ok') flags.push(COND_LABEL[t.condition]);
    if (!t.seal_intact) flags.push('Seal not intact');
    const tr = el('tr', { tabIndex: 0 },
      el('td', {}, el('strong', { textContent: t.trailer_number })),
      el('td', { textContent: t.carrier }),
      el('td', { textContent: t.door || '—' }),
      el('td', {}, el('span', { className: `pill ${t.status}`, textContent: STATUS_LABEL[t.status] })),
      el('td', { textContent: fmt(t.arrived_at) }),
      el('td', {}, ...flags.map((f) => el('span', { className: 'flag', textContent: f }))));
    const open = () => openDetail(t.id);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    return tr;
  }));
  empty.hidden = list.length > 0;
}
let timer;
search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadList, 250); });
filter.addEventListener('change', loadList);

/* ---------- new trailer ---------- */
const form = $('#new-form'), newError = $('#new-error');
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const resetForm = () => { form.reset(); form.elements.arrived_at.value = toLocalInput(new Date()); };
resetForm();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  newError.textContent = '';
  const f = form.elements;
  for (const i of form.querySelectorAll('input')) i.removeAttribute('aria-invalid');
  const body = {
    seal_intact: f.seal_intact.checked,
    pallet_count: f.pallet_count.value === '' ? null : Number(f.pallet_count.value),
    temperature_f: f.temperature_f.value === '' ? null : Number(f.temperature_f.value),
    arrived_at: f.arrived_at.value ? new Date(f.arrived_at.value).toISOString() : null,
  };
  for (const k of ['trailer_number', 'carrier', 'driver_name', 'driver_phone', 'load_type', 'door', 'bol_number', 'po_numbers', 'seal_number', 'condition']) body[k] = f[k].value;
  try {
    const t = await api('/trailers', { method: 'POST', body });
    const note = f.note.value.trim();
    if (note) await api(`/trailers/${t.id}/notes`, { method: 'POST', body: { body: note } });
    resetForm();
    await loadList();
  } catch (err) {
    newError.textContent = errText(err);
    for (const k of Object.keys(err.details || {})) f[k]?.setAttribute('aria-invalid', 'true');
  }
});

/* ---------- detail ---------- */
const dialog = $('#detail'), detailBody = $('#detail-body');

async function openDetail(id) {
  try { renderDetail(await api(`/trailers/${id}`)); } catch (e) { alert(e.message); return; }
  if (!dialog.open) dialog.showModal();
}

function field(label, input) { return el('label', {}, label, input); }
function select(name, opts, value) {
  const s = el('select', { name });
  for (const [v, l] of Object.entries(opts)) s.append(el('option', { value: v, textContent: l, selected: v === value }));
  return s;
}

function renderDetail(t) {
  const err = el('p', { className: 'error', role: 'alert' });
  const edit = el('form', { noValidate: true });
  const inputs = {
    status: select('status', STATUS_LABEL, t.status),
    door: el('input', { name: 'door', value: t.door, maxLength: 20 }),
    condition: select('condition', COND_LABEL, t.condition),
    seal_number: el('input', { name: 'seal_number', value: t.seal_number, maxLength: 50 }),
    pallet_count: el('input', { name: 'pallet_count', type: 'number', min: 0, value: t.pallet_count ?? '' }),
    temperature_f: el('input', { name: 'temperature_f', type: 'number', step: '0.1', value: t.temperature_f ?? '' }),
  };
  const seal = el('input', { type: 'checkbox', checked: t.seal_intact });
  edit.append(
    el('div', { className: 'grid' },
      field('Status', inputs.status), field('Door / dock', inputs.door), field('Condition', inputs.condition),
      field('Seal #', inputs.seal_number), field('Pallet count', inputs.pallet_count), field('Temp (°F)', inputs.temperature_f),
      el('label', { className: 'check' }, seal, 'Seal intact')),
    err,
    el('button', { type: 'submit', className: 'primary', textContent: 'Save changes' }));
  edit.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const patch = {
        status: inputs.status.value, door: inputs.door.value, condition: inputs.condition.value,
        seal_number: inputs.seal_number.value, seal_intact: seal.checked,
        pallet_count: inputs.pallet_count.value === '' ? null : Number(inputs.pallet_count.value),
        temperature_f: inputs.temperature_f.value === '' ? null : Number(inputs.temperature_f.value),
      };
      renderDetail(await api(`/trailers/${t.id}`, { method: 'PATCH', body: patch }));
      loadList();
    } catch (ex) { err.textContent = errText(ex); }
  });

  const noteErr = el('p', { className: 'error', role: 'alert' });
  const noteInput = el('input', { placeholder: 'Add a note (damage, shortage, instructions…)', maxLength: 2000, required: true });
  const noteForm = el('form', { className: 'note-row', noValidate: true }, noteInput, el('button', { type: 'submit', textContent: 'Add note' }));
  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!noteInput.value.trim()) return;
    try {
      renderDetail(await api(`/trailers/${t.id}/notes`, { method: 'POST', body: { body: noteInput.value } }));
      loadList();
    } catch (ex) { noteErr.textContent = errText(ex); }
  });

  const meta = [t.carrier, t.driver_name && `Driver: ${t.driver_name}`, t.driver_phone, t.load_type === 'drop' ? 'Drop' : 'Live',
    t.bol_number && `BOL ${t.bol_number}`, t.po_numbers && `PO ${t.po_numbers}`, `Arrived ${fmt(t.arrived_at)}`].filter(Boolean).join(' · ');

  const timeline = el('ul', { className: 'timeline' }, ...t.notes.map((n) =>
    el('li', { className: n.kind },
      el('small', { textContent: `${fmt(n.created_at)}${n.author ? ' · ' + n.author : ''}` }),
      el('span', { textContent: n.body }))));

  detailBody.replaceChildren(
    el('h2', { textContent: `Trailer ${t.trailer_number}` }),
    el('p', { className: 'muted', textContent: meta }),
    edit,
    el('h2', { textContent: 'Notes & history' }), timeline, noteForm, noteErr);
}

loadList().catch((e) => { newError.textContent = e.message; });
