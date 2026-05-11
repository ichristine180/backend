const documentTypeModel = require('../models/documentTypeModel');

async function listDocumentTypes() {
  return documentTypeModel.findAll();
}

async function isValidType(name) {
  const dt = await documentTypeModel.findByName(name);
  return dt !== null;
}

module.exports = { listDocumentTypes, isValidType };
