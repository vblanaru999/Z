const cfg = window.APP_CONFIG;
const state = {
  session: null,
  assets: [],
  subscriptions: [],
  locations: [],
  vendors: [],
  view: 'dashboard',
  sort: {
    assets: { key: 'asset_tag', dir: 'asc' },
    subscriptions: { key: 'name', dir: 'asc' }
  }
};

const $ = (id) => document.getElementById(id);
const loginScreen = $('login-screen');
const appShell = $('app-shell');
const modalBackdrop = $('modal-backdrop');
const modalBody = $('modal-body');
const setupWarning = $('setup-warning');

function headers(withBody = false) {
  const h = {
    apikey: cfg.publishableKey,
    Authorization: `Bearer ${state.session?.access_token || cfg.publishableKey}`,
    'Accept-Profile': cfg.schema,
    'Content-Profile': cfg.schema
  };
  if (withBody) h['Content-Type'] = 'application/json';
  return h;
}

async function api(path, options = {}) {
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
  });
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    const msg = data?.message || data?.error_description || text || `HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

function safeJson(text) { try { return JSON.parse(text); } catch { return text; } }

async function signIn(email, password) {
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || 'Sign in failed');
  state.session = data;
  localStorage.setItem('bogdan_it_session', JSON.stringify(data));
  return data;
}

async function refreshSessionIfNeeded() {
  const raw = localStorage.getItem('bogdan_it_session');
  if (!raw) return false;
  const saved = safeJson(raw);
  if (!saved?.access_token) return false;
  state.session = saved;
  const expiresAt = saved.expires_at ? saved.expires_at * 1000 : 0;
  if (expiresAt && Date.now() > expiresAt - 60_000 && saved.refresh_token) {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: saved.refresh_token })
    });
    if (!res.ok) return false;
    state.session = await res.json();
    localStorage.setItem('bogdan_it_session', JSON.stringify(state.session));
  }
  return true;
}

function signOut() {
  state.session = null;
  localStorage.removeItem('bogdan_it_session');
  appShell.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

function showToast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.className = 'toast', 3000);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value));
}
function fmtDate(value) {
  if (!value) return '—';
  const [y,m,d] = String(value).slice(0,10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y,m-1,d));
}
function relativeDate(value) {
  if (!value) return '';
  const then = new Date(value); const now = new Date();
  const days = Math.round((then - now) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}
function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function locationById(id) { return state.locations.find(x => x.id === id); }
function vendorById(id) { return state.vendors.find(x => x.id === id); }
function badge(value) { return `<span class="badge ${esc(value || '')}">${esc(String(value || 'unknown').replaceAll('_',' '))}</span>`; }

async function loadAll() {
  setupWarning.classList.add('hidden');
  try {
    const org = encodeURIComponent(cfg.organizationId);
    const [assets, subscriptions, locations, vendors] = await Promise.all([
      api(`assets?organization_id=eq.${org}&select=*&order=updated_at.desc`),
      api(`subscriptions?organization_id=eq.${org}&select=*&order=updated_at.desc`),
      api(`locations?organization_id=eq.${org}&select=*&order=code.asc`),
      api(`vendors?organization_id=eq.${org}&select=*&order=name.asc`)
    ]);
    state.assets = assets || [];
    state.subscriptions = subscriptions || [];
    state.locations = locations || [];
    state.vendors = vendors || [];
    renderAll();
  } catch (err) {
    console.error(err);
    setupWarning.classList.remove('hidden');
    $('setup-warning-text').textContent = err.message.includes('schema')
      ? 'Expose the it_inventory schema in Supabase Data API settings, then refresh.'
      : `Supabase returned: ${err.message}. Confirm this user is a member of Bogdan Delivery LLC.`;
    renderAll();
  }
}

function renderAll() {
  renderDashboard();
  renderAssets();
  renderSubscriptions();
  renderLocations();
}

function renderDashboard() {
  const activeSubs = state.subscriptions.filter(s => ['active','trial'].includes(s.status));
  const monthly = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  $('kpi-assets').textContent = state.assets.length;
  $('kpi-assets-sub').textContent = `${state.assets.filter(a=>a.status==='in_use').length} currently in use`;
  $('kpi-subs').textContent = activeSubs.length;
  $('kpi-subs-sub').textContent = `${state.subscriptions.filter(s=>s.auto_renew).length} auto-renew`;
  $('kpi-cost').textContent = formatMoney(monthly);
  $('kpi-locations').textContent = state.locations.filter(l=>l.active).length;

  const counts = state.locations.map(loc => ({ loc, count: state.assets.filter(a => a.location_id === loc.id).length }));
  const max = Math.max(1, ...counts.map(c=>c.count));
  $('asset-location-bars').innerHTML = counts.length ? counts.map(({loc,count}) => `
    <div class="bar-row"><div class="bar-meta"><span>${esc(loc.code)} · ${esc(loc.name)}</span><strong>${count}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%"></div></div></div>
  `).join('') : '<div class="empty">No locations available.</div>';

  const upcoming = [];
  state.subscriptions.forEach(s => {
    if (s.renewal_date) upcoming.push({date:s.renewal_date,title:s.name,type:'Subscription renewal'});
    if (s.cancellation_deadline) upcoming.push({date:s.cancellation_deadline,title:s.name,type:'Cancellation deadline'});
  });
  state.assets.forEach(a => { if (a.warranty_expiration) upcoming.push({date:a.warranty_expiration,title:a.asset_tag,type:'Warranty expiration'}); });
  const today = new Date(); today.setHours(0,0,0,0);
  upcoming.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const future = upcoming.filter(x=>new Date(`${x.date}T23:59:59`)>=today).slice(0,6);
  $('upcoming-list').innerHTML = future.length ? future.map(x=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(x.title)}</strong><small>${esc(x.type)}</small></div><span class="timeline-date">${esc(relativeDate(x.date))}</span></div>`).join('') : '<div class="empty">Nothing upcoming.</div>';

  const recent = state.assets.slice(0,6);
  $('recent-assets-body').innerHTML = recent.length ? recent.map(a=>`<tr><td><div class="asset-name"><strong>${esc(a.asset_tag)}</strong><small>${esc(a.manufacturer || '')} ${esc(a.model || '')}</small></div></td><td>${esc(a.category)}</td><td>${esc(locationById(a.location_id)?.code || '—')}</td><td>${badge(a.status)}</td><td>${fmtDate(String(a.updated_at||'').slice(0,10))}</td></tr>`).join('') : '<tr><td class="empty" colspan="5">No assets yet.</td></tr>';
}

function monthlyEquivalent(s) {
  const amount = Number(s.billing_amount || 0);
  const factors = { weekly:52/12, monthly:1, quarterly:1/3, semiannual:1/6, annual:1/12, biennial:1/24, one_time:0, usage_based:1, other:1 };
  return amount * (factors[s.billing_frequency] ?? 1);
}

function assetSortValue(a, key) {
  switch (key) {
    case 'asset_tag': return a.asset_tag || '';
    case 'category': return a.category || '';
    case 'manufacturer_model': return [a.manufacturer, a.model].filter(Boolean).join(' ');
    case 'serial_number': return a.serial_number || '';
    case 'location': return locationById(a.location_id)?.code || '';
    case 'status': return a.status || '';
    case 'purchase_price': return Number(a.purchase_price ?? Number.NEGATIVE_INFINITY);
    default: return '';
  }
}

function subscriptionSortValue(s, key) {
  switch (key) {
    case 'name': return s.name || '';
    case 'category': return s.category || '';
    case 'vendor': return vendorById(s.vendor_id)?.name || '';
    case 'billing_frequency': return String(s.billing_frequency || '').replaceAll('_', ' ');
    case 'billing_amount': return Number(s.billing_amount ?? Number.NEGATIVE_INFINITY);
    case 'renewal_date': return s.renewal_date || '';
    case 'status': return s.status || '';
    default: return '';
  }
}

function compareSortValues(a, b, dir) {
  const emptyA = a === '' || a === null || a === undefined || Number.isNaN(a);
  const emptyB = b === '' || b === null || b === undefined || Number.isNaN(b);
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
  else cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'desc' ? -cmp : cmp;
}

function sortRows(rows, table, valueFn) {
  const { key, dir } = state.sort[table];
  return [...rows].sort((left, right) => compareSortValues(valueFn(left, key), valueFn(right, key), dir));
}

function updateSortHeaders(table) {
  const { key, dir } = state.sort[table];
  document.querySelectorAll(`.sort-btn[data-table="${table}"]`).forEach(btn => {
    const active = btn.dataset.sort === key;
    btn.classList.toggle('is-active', active);
    btn.dataset.dir = active ? dir : '';
    btn.setAttribute('aria-sort', active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function setSort(table, key) {
  const current = state.sort[table];
  if (current.key === key) current.dir = current.dir === 'asc' ? 'desc' : 'asc';
  else { current.key = key; current.dir = 'asc'; }
  if (table === 'assets') renderAssets();
  else renderSubscriptions();
}
window.setSort = setSort;

function bindSortTable(tableId, tableName) {
  const table = document.getElementById(tableId);
  if (!table || table.dataset.sortBound === '1') return;
  table.dataset.sortBound = '1';
  table.tHead?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    e.preventDefault();
    setSort(tableName, btn.dataset.sort);
  });
}

function renderAssets() {
  const q = $('asset-search')?.value?.trim().toLowerCase() || '';
  const filtered = state.assets.filter(a => [a.asset_tag,a.category,a.manufacturer,a.model,a.serial_number,a.hostname].some(v=>String(v||'').toLowerCase().includes(q)));
  const rows = sortRows(filtered, 'assets', assetSortValue);
  updateSortHeaders('assets');
  bindSortTable('assets-table', 'assets');
  $('assets-body').innerHTML = rows.length ? rows.map(a=>`<tr>
    <td><div class="asset-name"><strong>${esc(a.asset_tag)}</strong><small>${esc(a.hostname || '')}</small></div></td>
    <td>${esc(a.category)}</td><td>${esc([a.manufacturer,a.model].filter(Boolean).join(' ') || '—')}</td><td>${esc(a.serial_number || '—')}</td><td>${esc(locationById(a.location_id)?.code || '—')}</td><td>${badge(a.status)}</td><td>${formatMoney(a.purchase_price)}</td>
    <td><div class="table-actions"><button class="table-btn" onclick="openAssetForm('${a.id}')">Edit</button></div></td>
  </tr>`).join('') : '<tr><td class="empty" colspan="8">No matching assets.</td></tr>';
}

function renderSubscriptions() {
  const q = $('subscription-search')?.value?.trim().toLowerCase() || '';
  const filtered = state.subscriptions.filter(s=>[s.name,s.category,s.account_name].some(v=>String(v||'').toLowerCase().includes(q)));
  const rows = sortRows(filtered, 'subscriptions', subscriptionSortValue);
  updateSortHeaders('subscriptions');
  bindSortTable('subscriptions-table', 'subscriptions');
  $('subscriptions-body').innerHTML = rows.length ? rows.map(s=>`<tr>
    <td><div class="asset-name"><strong>${esc(s.name)}</strong><small>${esc(s.account_email || s.account_name || '')}</small></div></td><td>${esc(s.category || '—')}</td><td>${esc(vendorById(s.vendor_id)?.name || '—')}</td><td>${esc(String(s.billing_frequency).replaceAll('_',' '))}</td><td>${formatMoney(s.billing_amount)}</td><td>${fmtDate(s.renewal_date)}</td><td>${badge(s.status)}</td>
    <td><div class="table-actions"><button class="table-btn" onclick="openSubscriptionForm('${s.id}')">Edit</button></div></td>
  </tr>`).join('') : '<tr><td class="empty" colspan="8">No matching subscriptions.</td></tr>';
}

function renderLocations() {
  $('locations-grid').innerHTML = state.locations.length ? state.locations.map(l=>{
    const address = [l.address_line1,l.address_line2,[l.city,l.state,l.postal_code].filter(Boolean).join(', ')].filter(Boolean).join('<br>');
    const count = state.assets.filter(a=>a.location_id===l.id).length;
    return `<article class="location-card"><div class="location-card-head"><div><span class="location-code">${esc(l.code)}</span><h3>${esc(l.name)}</h3><p>${address || 'No address entered'}</p></div><button class="table-btn" onclick="openLocationForm('${l.id}')">Edit</button></div><div class="location-meta">${badge(l.location_type)} <span class="badge">${count} assets</span> ${l.active ? '<span class="badge active">active</span>' : '<span class="badge">inactive</span>'}</div></article>`;
  }).join('') : '<div class="empty">No locations yet.</div>';
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  $(`view-${view}`).classList.add('active');
  const meta = {
    dashboard:['Dashboard','Overview of IT assets and recurring services.'],
    assets:['Assets','Track equipment, status, location, warranty, and cost.'],
    subscriptions:['Subscriptions','Manage recurring services, renewals, licenses, and spend.'],
    locations:['Locations','Offices and warehouses where IT assets are deployed.']
  }[view];
  $('page-title').textContent = meta[0]; $('page-subtitle').textContent = meta[1];
}

function openModal(title, subtitle, html) {
  $('modal-title').textContent = title;
  $('modal-subtitle').textContent = subtitle;
  modalBody.innerHTML = html;
  modalBackdrop.classList.remove('hidden');
  setTimeout(()=>modalBody.querySelector('input,select,textarea')?.focus(), 0);
}
function closeModal(){ modalBackdrop.classList.add('hidden'); modalBody.innerHTML=''; }
function selectOptions(items, selected, labelFn = x=>x.name, valueFn = x=>x.id, blank='None') {
  return `<option value="">${esc(blank)}</option>` + items.map(x=>`<option value="${esc(valueFn(x))}" ${String(valueFn(x))===String(selected||'')?'selected':''}>${esc(labelFn(x))}</option>`).join('');
}
function value(v){ return esc(v ?? ''); }

window.openAssetForm = function(id = null) {
  const a = id ? state.assets.find(x=>x.id===id) : {};
  openModal(id?'Edit Asset':'Add Asset', id?'Update this equipment record.':'Create a new IT equipment record.', `
  <form id="asset-form" class="form-grid">
    <div><label>Asset Tag *</label><input name="asset_tag" required value="${value(a.asset_tag)}" placeholder="BDL-LAP-001"></div>
    <div><label>Category *</label><input name="category" required value="${value(a.category)}" placeholder="Laptop, Camera, Switch…"></div>
    <div><label>Manufacturer</label><input name="manufacturer" value="${value(a.manufacturer)}" placeholder="Dell"></div>
    <div><label>Model</label><input name="model" value="${value(a.model)}" placeholder="Latitude 7450"></div>
    <div><label>Serial Number</label><input name="serial_number" value="${value(a.serial_number)}"></div>
    <div><label>Hostname</label><input name="hostname" value="${value(a.hostname)}"></div>
    <div><label>Location</label><select name="location_id">${selectOptions(state.locations,a.location_id,x=>`${x.code} — ${x.name}`)}</select></div>
    <div><label>Status *</label><select name="status">${['in_stock','in_use','loaned','repair','reserved','retired','lost','stolen','disposed'].map(x=>`<option ${a.status===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div>
    <div><label>Condition</label><select name="condition"><option value="">None</option>${['new','excellent','good','fair','poor','damaged'].map(x=>`<option ${a.condition===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div><label>Criticality</label><select name="criticality">${['low','standard','high','critical'].map(x=>`<option ${a.criticality===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="form-section"><strong>Purchase & warranty</strong><p>Optional financial and lifecycle details.</p></div>
    <div><label>Purchase Date</label><input type="date" name="purchase_date" value="${value(a.purchase_date)}"></div>
    <div><label>Purchase Price</label><input type="number" min="0" step="0.01" name="purchase_price" value="${value(a.purchase_price)}"></div>
    <div><label>Order Number</label><input name="order_number" value="${value(a.order_number)}"></div>
    <div><label>Invoice Number</label><input name="invoice_number" value="${value(a.invoice_number)}"></div>
    <div><label>Warranty Expiration</label><input type="date" name="warranty_expiration" value="${value(a.warranty_expiration)}"></div>
    <div><label>Expected Replacement</label><input type="date" name="expected_replacement_date" value="${value(a.expected_replacement_date)}"></div>
    <div class="full"><label>Notes</label><textarea name="notes">${value(a.notes)}</textarea></div>
    <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">${id?'Save Changes':'Add Asset'}</button></div>
  </form>`);
  $('asset-form').addEventListener('submit', e=>saveAsset(e,id));
};

async function saveAsset(e,id) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const body = clean({
    organization_id: cfg.organizationId, asset_tag:f.get('asset_tag'), category:f.get('category'), manufacturer:f.get('manufacturer'), model:f.get('model'), serial_number:f.get('serial_number'), hostname:f.get('hostname'), location_id:f.get('location_id'), status:f.get('status'), condition:f.get('condition'), criticality:f.get('criticality'), purchase_date:f.get('purchase_date'), purchase_price:numOrNull(f.get('purchase_price')), order_number:f.get('order_number'), invoice_number:f.get('invoice_number'), warranty_expiration:f.get('warranty_expiration'), expected_replacement_date:f.get('expected_replacement_date'), notes:f.get('notes')
  });
  try {
    if (id) await api(`assets?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    else await api('assets', {method:'POST',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    closeModal(); showToast(id?'Asset updated':'Asset added'); await loadAll();
  } catch(err){ showToast(err.message,true); }
}

window.openSubscriptionForm = function(id = null) {
  const s = id ? state.subscriptions.find(x=>x.id===id) : {};
  openModal(id?'Edit Subscription':'Add Subscription', id?'Update billing, renewal, and account details.':'Add a recurring service or software subscription.', `
  <form id="subscription-form" class="form-grid">
    <div><label>Service Name *</label><input name="name" required value="${value(s.name)}" placeholder="Microsoft 365"></div>
    <div><label>Category</label><input name="category" value="${value(s.category)}" placeholder="SaaS, Telecom, Security…"></div>
    <div><label>Vendor</label><select name="vendor_id">${selectOptions(state.vendors,s.vendor_id,x=>x.name,x=>x.id,'No vendor')}</select></div>
    <div><label>Status *</label><select name="status">${['trial','active','pending_cancellation','cancelled','expired','suspended'].map(x=>`<option ${s.status===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div>
    <div><label>Billing Frequency *</label><select name="billing_frequency">${['weekly','monthly','quarterly','semiannual','annual','biennial','usage_based','one_time','other'].map(x=>`<option ${s.billing_frequency===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div>
    <div><label>Billing Amount</label><input type="number" min="0" step="0.01" name="billing_amount" value="${value(s.billing_amount)}"></div>
    <div><label>Licenses / Quantity</label><input type="number" min="0" name="quantity_purchased" value="${value(s.quantity_purchased)}"></div>
    <div><label>Unit Price</label><input type="number" min="0" step="0.01" name="unit_price" value="${value(s.unit_price)}"></div>
    <div class="form-section"><strong>Dates & renewal</strong><p>Track the date that matters before auto-renewal.</p></div>
    <div><label>Start Date</label><input type="date" name="start_date" value="${value(s.start_date)}"></div>
    <div><label>Renewal Date</label><input type="date" name="renewal_date" value="${value(s.renewal_date)}"></div>
    <div><label>Cancellation Deadline</label><input type="date" name="cancellation_deadline" value="${value(s.cancellation_deadline)}"></div>
    <div><label>Contract End Date</label><input type="date" name="contract_end_date" value="${value(s.contract_end_date)}"></div>
    <div class="checkbox-row"><input id="auto-renew" type="checkbox" name="auto_renew" ${s.auto_renew?'checked':''}><label for="auto-renew">Auto renew</label></div>
    <div><label>Payment Method Label</label><input name="payment_method_label" value="${value(s.payment_method_label)}" placeholder="Amex ending 1234"></div>
    <div class="form-section"><strong>Account</strong><p>Do not store passwords or MFA secrets here.</p></div>
    <div><label>Account Name</label><input name="account_name" value="${value(s.account_name)}"></div>
    <div><label>Account Email</label><input type="email" name="account_email" value="${value(s.account_email)}"></div>
    <div><label>Account Number</label><input name="account_number" value="${value(s.account_number)}"></div>
    <div><label>Service URL</label><input type="url" name="service_url" value="${value(s.service_url)}" placeholder="https://..."></div>
    <div class="full"><label>Description</label><textarea name="description">${value(s.description)}</textarea></div>
    <div class="full"><label>Notes</label><textarea name="notes">${value(s.notes)}</textarea></div>
    <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">${id?'Save Changes':'Add Subscription'}</button></div>
  </form>`);
  $('subscription-form').addEventListener('submit', e=>saveSubscription(e,id));
};

async function saveSubscription(e,id) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const body = clean({ organization_id:cfg.organizationId, name:f.get('name'), category:f.get('category'), vendor_id:f.get('vendor_id'), status:f.get('status'), billing_frequency:f.get('billing_frequency'), billing_amount:numOrNull(f.get('billing_amount')), quantity_purchased:intOrNull(f.get('quantity_purchased')), unit_price:numOrNull(f.get('unit_price')), start_date:f.get('start_date'), renewal_date:f.get('renewal_date'), cancellation_deadline:f.get('cancellation_deadline'), contract_end_date:f.get('contract_end_date'), auto_renew:f.get('auto_renew')==='on', payment_method_label:f.get('payment_method_label'), account_name:f.get('account_name'), account_email:f.get('account_email'), account_number:f.get('account_number'), service_url:f.get('service_url'), description:f.get('description'), notes:f.get('notes') });
  try {
    if (id) await api(`subscriptions?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    else await api('subscriptions', {method:'POST',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    closeModal(); showToast(id?'Subscription updated':'Subscription added'); await loadAll();
  } catch(err){ showToast(err.message,true); }
}

window.openLocationForm = function(id = null) {
  const l = id ? state.locations.find(x=>x.id===id) : {};
  openModal(id?'Edit Location':'Add Location', id?'Update site details.':'Create an office, warehouse, or other site.', `
  <form id="location-form" class="form-grid">
    <div><label>Code *</label><input name="code" required value="${value(l.code)}" placeholder="SEA6"></div>
    <div><label>Name *</label><input name="name" required value="${value(l.name)}" placeholder="SEA6"></div>
    <div><label>Type</label><select name="location_type">${['warehouse','office','server_room','home_office','vehicle','other'].map(x=>`<option ${l.location_type===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div>
    <div class="checkbox-row"><input id="loc-active" type="checkbox" name="active" ${l.active!==false?'checked':''}><label for="loc-active">Active location</label></div>
    <div class="full"><label>Address Line 1</label><input name="address_line1" value="${value(l.address_line1)}"></div>
    <div class="full"><label>Address Line 2</label><input name="address_line2" value="${value(l.address_line2)}"></div>
    <div><label>City</label><input name="city" value="${value(l.city)}"></div>
    <div><label>State</label><input name="state" maxlength="2" value="${value(l.state)}"></div>
    <div><label>ZIP</label><input name="postal_code" value="${value(l.postal_code)}"></div>
    <div><label>Country</label><input name="country" value="${value(l.country || 'USA')}"></div>
    <div class="full"><label>Notes</label><textarea name="notes">${value(l.notes)}</textarea></div>
    <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">${id?'Save Changes':'Add Location'}</button></div>
  </form>`);
  $('location-form').addEventListener('submit', e=>saveLocation(e,id));
};

async function saveLocation(e,id) {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const body = clean({organization_id:cfg.organizationId, code:f.get('code'), name:f.get('name'), location_type:f.get('location_type'), active:f.get('active')==='on', address_line1:f.get('address_line1'), address_line2:f.get('address_line2'), city:f.get('city'), state:String(f.get('state')||'').toUpperCase(), postal_code:f.get('postal_code'), country:f.get('country'), notes:f.get('notes')});
  try {
    if (id) await api(`locations?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    else await api('locations', {method:'POST',body:JSON.stringify(body),headers:{Prefer:'return=representation'}});
    closeModal(); showToast(id?'Location updated':'Location added'); await loadAll();
  } catch(err){ showToast(err.message,true); }
}

function clean(obj) { Object.keys(obj).forEach(k=>{ if (obj[k] === '') obj[k] = null; }); return obj; }
function numOrNull(v){ return v === '' || v == null ? null : Number(v); }
function intOrNull(v){ return v === '' || v == null ? null : parseInt(v,10); }
window.closeModal = closeModal;

$('login-form').addEventListener('submit', async e=>{
  e.preventDefault(); $('login-error').textContent='';
  try { await signIn($('login-email').value.trim(), $('login-password').value); await enterApp(); }
  catch(err){ $('login-error').textContent=err.message; }
});
$('signout-btn').addEventListener('click', signOut);
$('refresh-btn').addEventListener('click', ()=>loadAll().then(()=>showToast('Data refreshed')));
$('modal-close').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e=>{ if(e.target===modalBackdrop) closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.go)));
$('add-asset-btn').addEventListener('click',()=>openAssetForm());
$('add-subscription-btn').addEventListener('click',()=>openSubscriptionForm());
$('add-location-btn').addEventListener('click',()=>openLocationForm());
$('asset-search').addEventListener('input',renderAssets);
$('subscription-search').addEventListener('input',renderSubscriptions);

async function enterApp() {
  loginScreen.classList.add('hidden'); appShell.classList.remove('hidden');
  const email = state.session?.user?.email || 'User';
  $('user-email').textContent = email;
  $('user-initial').textContent = email[0]?.toUpperCase() || 'U';
  await loadAll();
}

(async function init(){
  if (await refreshSessionIfNeeded()) await enterApp();
})();
