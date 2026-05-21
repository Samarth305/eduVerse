import express from 'express';
import { 
  createTestSeries, 
  getAllTestSeries, 
  getTestSeriesById, 
  getTestSeriesQuestions, 
  submitTestSeriesAnswers, 
  joinTestSeries, 
  getUserContestResult, 
  getContestStats, 
  getContestLeaderboard, 
  getAllContestStats, 
  getUserParticipations, 
  getUpcomingContests, 
  joinContestByCode, 
  updateTestSeries, 
  recordViolation, 
  getContestParticipants, 
  getParticipantAnswers,
  exportContestResults,
  downloadContestResultsExcel,
  getDetailedAnalysis,
  deleteTestSeries,
  deleteMultipleTestSeries,
  extendContestTime,
  recalculateContestResults
} from '../controllers/testSeries.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdminOrModerator } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', requireAdminOrModerator, createTestSeries); 
router.get('/', getAllTestSeries);
router.get('/contests', getAllTestSeries);
router.get('/participations', getUserParticipations);
router.get('/contests/upcoming', getUpcomingContests);
router.get('/stats/all', requireAdminOrModerator, getAllContestStats);
router.get('/:id/questions', getTestSeriesQuestions);
router.get('/:id/result', getUserContestResult);
router.get('/:id/results', getUserContestResult);
router.get('/:id/stats', getContestStats);
router.get('/:id/leaderboard', getContestLeaderboard);
router.get('/:id/participants', getContestParticipants);
router.get('/:contestId/participant/:participantId/answers', getParticipantAnswers);
router.get('/:id/export', exportContestResults);
router.get('/:id/detailed-analysis', requireAdminOrModerator, getDetailedAnalysis);
router.post('/:id/download-results', requireAdminOrModerator, downloadContestResultsExcel);
router.post('/:id/submit', submitTestSeriesAnswers);
router.post('/:id/violation', recordViolation);
router.post('/:id/join', joinTestSeries);
router.post('/join-by-code', joinContestByCode);
router.put('/:id', requireAdminOrModerator, updateTestSeries);
router.delete('/:id', requireAdminOrModerator, deleteTestSeries);
router.post('/bulk-delete', requireAdminOrModerator, deleteMultipleTestSeries);
router.get('/:id', getTestSeriesById);

// Admin contest management routes
router.put('/:id/extend', authMiddleware, extendContestTime);
router.post('/:id/recalculate-results', authMiddleware, recalculateContestResults);

export default router;                                                                  