import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { InstructorApplication } from '../../models/InstructorApplication.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { readFinanceSummary, reportWindow } from '../finance/financeSummary.service.js';

const snapshot = work => mongoose.connection.transaction(work,
  { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
const role = name => ({ $in: [name, { $ifNull: ['$roles', []] }] });
const status = name => ({ $eq: ['$status', name] });

async function countWhere(model, metrics, session) {
  const group = Object.fromEntries(Object.entries(metrics).map(([key, condition]) =>
    [key, { $sum: { $cond: [condition, 1, 0] } }]));
  const [row] = await model.aggregate([{ $group: { _id: null, ...group } }, { $project: { _id: 0 } }])
    .session(session).option({ maxTimeMS: 5000, allowDiskUse: false });
  return row ?? Object.fromEntries(Object.keys(metrics).map(key => [key, 0]));
}

export function createAdminFinanceService({ clock = () => new Date() } = {}) {
  return Object.freeze({
    dashboard(query) {
      return snapshot(async session => {
        const asOf = clock();
        const range = reportWindow(query, asOf);
        const users = await countWhere(User, { total: true, active: status('active'), suspended: status('suspended'),
          students: role('student'), activeInstructors: { $and: [role('instructor'), status('active')] } }, session);
        const pendingApplications = await InstructorApplication.countDocuments({ status: 'pending' })
          .session(session).maxTimeMS(5000);
        const courses = await countWhere(Course, { total: true, draft: status('draft'), pendingReview: status('pending_review'),
          published: status('published'), rejected: status('rejected'), unavailable: status('unavailable'), archived: status('archived') }, session);
        const finance = await readFinanceSummary({ currency: query.currency, range, asOf, session });
        return { users: { ...users, pendingApplications }, courses, finance };
      });
    },
    summary(query) {
      return snapshot(async session => {
        const asOf = clock();
        const range = reportWindow(query, asOf);
        const instructorId = query.instructorId ? new mongoose.Types.ObjectId(query.instructorId) : undefined;
        // Keep the history of existing accounts even after they lose the instructor role.
        if (instructorId && !await User.exists({ _id: instructorId }).session(session).maxTimeMS(5000)) {
          throw new ApiError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'The financial account was not found');
        }
        const summary = await readFinanceSummary({ currency: query.currency, instructorId, range, asOf, session });
        return { instructorId: query.instructorId ?? null, summary };
      });
    },
  });
}
