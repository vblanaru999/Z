export const STATUSES = ['arrived', 'at_door', 'unloading', 'unloaded', 'departed'];
export const LOAD_TYPES = ['live', 'drop'];
export const CONDITIONS = ['ok', 'damaged', 'seal_broken', 'wet', 'other'];

const TEXT_FIELDS = {
  trailer_number: { max: 30 },
  carrier: { max: 100 },
  driver_name: { max: 100 },
  driver_phone: { max: 30 },
  seal_number: { max: 50 },
  bol_number: { max: 50 },
  po_numbers: { max: 500 },
  door: { max: 20 },
};

/**
 * Validate trailer input. With `partial: true` (PATCH) only provided fields are
 * checked; otherwise required fields must be present (POST).
 * Returns { errors: {field: message}, value: cleaned } .
 */
export function validateTrailer(input, { partial = false } = {}) {
  const errors = {};
  const value = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: { _: 'Body must be a JSON object' }, value };
  }
  const has = (k) => input[k] !== undefined;

  for (const [field, { max }] of Object.entries(TEXT_FIELDS)) {
    if (!has(field)) continue;
    const raw = input[field];
    if (raw === null || raw === '') { value[field] = ''; continue; }
    if (typeof raw !== 'string') { errors[field] = 'Must be text'; continue; }
    const s = raw.trim();
    if (s.length > max) errors[field] = `Must be at most ${max} characters`;
    else value[field] = s;
  }
  if (!partial) {
    for (const field of Object.keys(TEXT_FIELDS)) if (!has(field)) value[field] = '';
  }
  for (const req of ['trailer_number', 'carrier']) {
    if (partial && !has(req)) continue;
    if (!value[req] && !errors[req]) errors[req] = 'Required';
  }

  if (has('load_type')) {
    if (!LOAD_TYPES.includes(input.load_type)) errors.load_type = `Must be one of: ${LOAD_TYPES.join(', ')}`;
    else value.load_type = input.load_type;
  } else if (!partial) value.load_type = 'live';

  if (has('condition')) {
    if (!CONDITIONS.includes(input.condition)) errors.condition = `Must be one of: ${CONDITIONS.join(', ')}`;
    else value.condition = input.condition;
  } else if (!partial) value.condition = 'ok';

  if (has('status')) {
    if (!STATUSES.includes(input.status)) errors.status = `Must be one of: ${STATUSES.join(', ')}`;
    else value.status = input.status;
  } else if (!partial) value.status = 'arrived';

  if (has('seal_intact')) {
    if (typeof input.seal_intact !== 'boolean') errors.seal_intact = 'Must be true or false';
    else value.seal_intact = input.seal_intact ? 1 : 0;
  } else if (!partial) value.seal_intact = 1;

  if (has('pallet_count')) {
    if (input.pallet_count === null || input.pallet_count === '') value.pallet_count = null;
    else if (!Number.isInteger(input.pallet_count) || input.pallet_count < 0 || input.pallet_count > 1000)
      errors.pallet_count = 'Must be a whole number between 0 and 1000';
    else value.pallet_count = input.pallet_count;
  } else if (!partial) value.pallet_count = null;

  if (has('temperature_f')) {
    if (input.temperature_f === null || input.temperature_f === '') value.temperature_f = null;
    else if (typeof input.temperature_f !== 'number' || !Number.isFinite(input.temperature_f) ||
             input.temperature_f < -100 || input.temperature_f > 200)
      errors.temperature_f = 'Must be a number between -100 and 200';
    else value.temperature_f = input.temperature_f;
  } else if (!partial) value.temperature_f = null;

  if (has('arrived_at') && input.arrived_at !== null && input.arrived_at !== '') {
    const d = new Date(input.arrived_at);
    if (typeof input.arrived_at !== 'string' || Number.isNaN(d.getTime())) errors.arrived_at = 'Must be a valid date/time';
    else value.arrived_at = d.toISOString();
  } else if (!partial) value.arrived_at = new Date().toISOString();

  return { errors, value };
}

export function validateNote(input) {
  const errors = {};
  const value = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: { _: 'Body must be a JSON object' }, value };
  }
  if (typeof input.body !== 'string' || !input.body.trim()) errors.body = 'Required';
  else if (input.body.trim().length > 2000) errors.body = 'Must be at most 2000 characters';
  else value.body = input.body.trim();

  if (input.author === undefined || input.author === null || input.author === '') value.author = '';
  else if (typeof input.author !== 'string' || input.author.trim().length > 100) errors.author = 'Must be text up to 100 characters';
  else value.author = input.author.trim();
  return { errors, value };
}
