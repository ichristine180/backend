const applicationModel = require('../models/applicationModel');
const documentModel = require('../models/documentModel');

const err = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

async function createApplication(userId, body) {
  if (!body.institution_name || !body.institution_type || !body.license_type) {
    throw err(400, 'institution_name, institution_type and license_type are required');
  }

  return applicationModel.withTransaction(async (client) => {
    const active = await client.query(
      "SELECT id FROM applications WHERE applicant_id = $1 AND status NOT IN ('APPROVED', 'REJECTED') LIMIT 1",
      [userId]
    );
    if (active.rowCount > 0) {
      throw err(409, 'You already have an active application in progress');
    }

    const created = await applicationModel.createApplication({
      applicant_id: userId,
      institution_name: body.institution_name,
      institution_type: body.institution_type,
      license_type: body.license_type,
      registration_number: body.registration_number,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
    }, client);

    await applicationModel.recordApplicationAudit(client, {
      applicationId: created.id,
      actor: { id: userId, role: 'APPLICANT' },
      action: 'APPLICATION_CREATED',
      prevStatus: null,
      newStatus: created.status,
      prevState: null,
      newState: created,
    });

    return created;
  });
}

async function listApplications(user) {
  const { role, id } = user;
  if (role === 'APPLICANT') return applicationModel.getApplicationForApplicant(id);
  if (role === 'REVIEWER') return applicationModel.getSubmittedApplications();
  if (role === 'APPROVER') return applicationModel.getApplicationsForApprover();
  if (role === 'ADMIN') return applicationModel.listAll();
  return [];
}

async function getApplication(id, user) {
  const app = await applicationModel.findApplicationById(id);
  if (!app) throw err(404, 'Application not found');

  if (user.role === 'APPLICANT' && app.applicant_id !== user.id) throw err(403, 'Access denied');
  if (user.role === 'REVIEWER' && app.status === 'DRAFT') throw err(403, 'Access denied');

  const documents = await documentModel.listCurrentByApplicationId(id);
  return { ...app, documents };
}

async function updateApplication(id, userId, body) {
  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.applicant_id !== userId) throw err(403, 'Access denied');
    if (app.status !== 'DRAFT') throw err(400, 'Only DRAFT applications can be edited');

    const updated = await applicationModel.updateApplication(id, {
      institution_name: body.institution_name ?? app.institution_name,
      institution_type: body.institution_type ?? app.institution_type,
      license_type: body.license_type ?? app.license_type,
      registration_number: 'registration_number' in body ? body.registration_number : app.registration_number,
      contact_email: 'contact_email' in body ? body.contact_email : app.contact_email,
      contact_phone: 'contact_phone' in body ? body.contact_phone : app.contact_phone,
    }, client);

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id,
      actor: { id: userId, role: 'APPLICANT' },
      action: 'APPLICATION_UPDATED',
      prevStatus: app.status,
      newStatus: updated.status,
      prevState: app,
      newState: updated,
    });

    return updated;
  });
}

async function submit(id, user) {
  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.applicant_id !== user.id) throw err(403, 'Access denied');
    if (app.status !== 'DRAFT') throw err(400, `Cannot submit application is ${app.status}`);

    const docs = await applicationModel.countCurrentDocuments(id, client);
    if (docs === 0) throw err(400, 'Upload at least one document before submitting');

    const updated = await applicationModel.applyApplicationUpdate(client, id, {
      status: 'SUBMITTED',
      submitted_at: new Date()
    });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'APPLICATION_SUBMITTED',
      prevStatus: app.status, newStatus: 'SUBMITTED',
      prevState: app, newState: updated
    });

    return updated;
  });
}

async function startReview(id, user) {
  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.status !== 'SUBMITTED') throw err(400, `Cannot start review  application is ${app.status}`);

    const updated = await applicationModel.applyApplicationUpdate(client, id, {
      status: 'UNDER_REVIEW',
      reviewer_id: user.id
    });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'REVIEW_STARTED',
      prevStatus: app.status, newStatus: 'UNDER_REVIEW',
      prevState: app, newState: updated
    });

    return updated;
  });
}

async function requestInfo(id, user, reason) {
  if (!reason) throw err(400, 'A reason is required when requesting additional information');

  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.status !== 'UNDER_REVIEW') throw err(400, `Can not request info  application is ${app.status}`);
    if (app.reviewer_id !== user.id) throw err(403, 'Only the assigned reviewer can request additional information');

    const updated = await applicationModel.applyApplicationUpdate(client, id, { status: 'ADDITIONAL_INFO_REQUIRED' });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'INFO_REQUESTED',
      prevStatus: app.status, newStatus: 'ADDITIONAL_INFO_REQUIRED',
      prevState: app, newState: updated,
      metadata: { reason }
    });

    return updated;
  });
}

async function resubmit(id, user) {
  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.applicant_id !== user.id) throw err(403, 'Access denied');
    if (app.status !== 'ADDITIONAL_INFO_REQUIRED') throw err(400, `Can not resubmit application is ${app.status}`);

    const docs = await applicationModel.countCurrentDocuments(id, client);
    if (docs === 0) throw err(400, 'Upload at least one document');

    const updated = await applicationModel.applyApplicationUpdate(client, id, { status: 'UNDER_REVIEW' });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'APPLICATION_RESUBMITTED',
      prevStatus: app.status, newStatus: 'UNDER_REVIEW',
      prevState: app, newState: updated
    });

    return updated;
  });
}

async function completeReview(id, user, reviewNotes) {
  if (!reviewNotes) throw err(400, 'Review notes are required');

  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.status !== 'UNDER_REVIEW') throw err(400, `Can not complete review — application is ${app.status}`);
    if (app.reviewer_id !== user.id) throw err(403, 'Only the assigned reviewer can complete the review');

    const updated = await applicationModel.applyApplicationUpdate(client, id, {
      status: 'REVIEWED',
      review_notes: reviewNotes
    });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'REVIEW_COMPLETED',
      prevStatus: app.status, newStatus: 'REVIEWED',
      prevState: app, newState: updated
    });

    return updated;
  });
}

async function approve(id, user) {
  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.status !== 'REVIEWED') throw err(400, `Can not approve  application is ${app.status}`);
    if (app.reviewer_id === user.id) throw err(403, 'You cannot approve an application you reviewed');

    const updated = await applicationModel.applyApplicationUpdate(client, id, {
      status: 'APPROVED',
      approver_id: user.id,
      decided_at: new Date()
    });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'APPLICATION_APPROVED',
      prevStatus: app.status, newStatus: 'APPROVED',
      prevState: app, newState: updated
    });

    return updated;
  });
}

async function reject(id, user, reason) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw err(400, 'A reason is required when rejecting an application');
  }

  const normalizedReason = reason.trim();

  return applicationModel.withApplicationLock(id, async (client, app) => {
    if (app.status !== 'REVIEWED') throw err(400, `Can not reject`);
    if (app.reviewer_id === user.id) throw err(403, 'You can not decide on   application you reviewed');

    const updated = await applicationModel.applyApplicationUpdate(client, id, {
      status: 'REJECTED',
      approver_id: user.id,
      decided_at: new Date(),
      decision_reason: normalizedReason
    });

    await applicationModel.recordApplicationAudit(client, {
      applicationId: id, actor: user,
      action: 'APPLICATION_REJECTED',
      prevStatus: app.status, newStatus: 'REJECTED',
      prevState: app, newState: updated,
      metadata: { reason: normalizedReason }
    });

    return updated;
  });
}

module.exports = {
  createApplication, listApplications, getApplication, updateApplication,
  submit, startReview, requestInfo, resubmit, completeReview, approve, reject
};
