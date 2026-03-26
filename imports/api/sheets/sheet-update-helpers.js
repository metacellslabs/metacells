import { defineModel } from '../../../lib/orm.js';

const SheetsWithoutTimestamps = defineModel('sheets', { timestamps: false });

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildSheetUpdate(setFields, unsetFields) {
  const update = {};
  if (isPlainObject(setFields) && Object.keys(setFields).length) {
    update.$set = { ...setFields };
  }
  if (isPlainObject(unsetFields) && Object.keys(unsetFields).length) {
    update.$unset = { ...unsetFields };
  }
  return update;
}

export async function updateSheetDocumentFields(sheetId, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const nextSet = isPlainObject(opts.set) ? { ...opts.set } : {};
  const nextUnset = isPlainObject(opts.unset) ? { ...opts.unset } : {};
  if (nextSet.updatedAt === undefined) {
    nextSet.updatedAt = new Date();
  }
  return SheetsWithoutTimestamps.updateAsync(
    { _id: String(sheetId || '') },
    buildSheetUpdate(nextSet, nextUnset),
  );
}

export async function updateSheetRuntimeFields(sheetId, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const nextSet = isPlainObject(opts.set) ? { ...opts.set } : {};
  const nextUnset = isPlainObject(opts.unset) ? { ...opts.unset } : {};
  return SheetsWithoutTimestamps.updateAsync(
    { _id: String(sheetId || '') },
    buildSheetUpdate(nextSet, nextUnset),
  );
}
