const applicationModel = require("../models/applicationModel");
const auditModel = require("../models/auditModel");

function err(status, message) {
  return Object.assign(new Error(message), { status });
}

async function getAccessibleApplication(applicationId, user) {
  const application = await applicationModel.findApplicationById(applicationId);

  if (!application) {
    throw err(404, "Application not found");
  }

  if (user.role === "APPLICANT" && application.applicant_id !== user.id) {
    throw err(403, "Access denied");
  }

  if (user.role === "REVIEWER" && application.reviewer_id !== user.id) {
    throw err(403, "Only the assigned reviewer can view this audit trail");
  }

  return application;
}

async function listApplicationAudit(applicationId, user) {
  await getAccessibleApplication(applicationId, user);
  return auditModel.listByApplicationId(applicationId);
}

async function listSystemAudit() {
  return auditModel.listAll();
}

module.exports = {
  listApplicationAudit,
  listSystemAudit,
};
