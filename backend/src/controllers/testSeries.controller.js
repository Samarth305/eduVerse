import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
const prisma = new PrismaClient();

// Get notification service from app
const getNotificationService = (req) => {
  return req.app.get('notificationService');
};

// Utility: convert decimal negative marking value to a human-friendly ratio like "1/4"
const toNegativeRatioString = (value) => {
  if (!value || value <= 0) return '0';
  // Try to express as 1/n up to a reasonable denominator
  const maxDenominator = 10;
  for (let d = 1; d <= maxDenominator; d++) {
    const candidate = 1 / d;
    if (Math.abs(candidate - value) < 1e-6) {
      return `1/${d}`;
    }
  }
  // Fallback: show decimal up to 2 decimals
  return String(Number(value.toFixed(2)));
};

// Generate a unique contest code
const generateContestCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Create a new TestSeries (admin/moderator only)
export const createTestSeries = async (req, res) => {
  try {
    const { title, questionIds, startTime, endTime, requiresCode, hasNegativeMarking, negativeMarkingValue } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ message: 'Only admin or moderator can create test series.' });
    }

    // Validate questionIds
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ message: 'Provide at least one question.' });
    }

    // Allow optional subcategory from body for easier filtering
    const subcategory = typeof req.body.subcategory === 'string' && req.body.subcategory.trim() !== ''
      ? req.body.subcategory.trim()
      : null;

    // Generate contest code if required
    let contestCode = null;
    if (requiresCode) {
      let isUnique = false;
      while (!isUnique) {
        contestCode = generateContestCode();
        const existingContest = await prisma.testSeries.findUnique({
          where: { contestCode }
        });
        if (!existingContest) {
          isUnique = true;
        }
      }
    }

    // Create TestSeries
    console.log('Creating test series with negative marking:', {
      hasNegativeMarking,
      negativeMarkingValue
    });
    
    const testSeries = await prisma.testSeries.create({
      data: {
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        requiresCode: requiresCode || false,
        contestCode,
        hasNegativeMarking: hasNegativeMarking || false,
        negativeMarkingValue: negativeMarkingValue || 0.25,
        subcategory,
        createdBy: userId,
        questions: {
          connect: questionIds.map(id => ({ id })),
        },
      },
      include: { questions: { select: { id: true, question: true, options: true, level: true, category: true, subcategory: true, correctAnswers: true } }, creator: true },
    });

    await prisma.question.updateMany({
      where: { id: { in: questionIds } },
      data: { visibility: false }
    });

    // Send notification about new contest
    const notificationService = getNotificationService(req);
    if (notificationService) {
      try {
        await notificationService.notifyContestAnnounced(testSeries);
        console.log(`Contest announcement notification sent for: ${testSeries.title}`);
      } catch (error) {
        console.error('Failed to send contest announcement notification:', error);
      }
    }

    res.status(201).json({ testSeries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all TestSeries (optionally filter by creator)
export const getAllTestSeries = async (req, res) => {
  try {
    const tests = await prisma.testSeries.findMany({
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        requiresCode: true,
        contestCode: true,
        subcategory: true,
        _count: {
          select: {
            participations: true
          }
        },
        creator: {
          select: {
            fullName: true
          }
        }
      },
      orderBy: { startTime: 'desc' }
    });

    const mapped = tests.map(t => ({
      id: t.id,
      title: t.title,
      startTime: t.startTime,
      endTime: t.endTime,
      requiresCode: t.requiresCode,
      contestCode: t.contestCode,
      participants: t._count.participations,
      creator: t.creator,
      subcategory: t.subcategory || null
    }));
    res.json({ testSeries: mapped });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single TestSeries by ID
export const getTestSeriesById = async (req, res) => {
  try {
    const { id } = req.params;
    const testSeries = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            correctAnswers: true,
            level: true,
            category: true,
            subcategory: true,
            explanation: true
          }
        },
        creator: {
          select: {
            fullName: true
          }
        }
      }
    });
    if (!testSeries) {
      return res.status(404).json({ message: 'Test series not found.' });
    }
    res.json({ testSeries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get questions for a specific TestSeries (without correct answers)
export const getTestSeriesQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    const testSeries = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            level: true,
            category: true,
            subcategory: true,
            correctAnswers: true
          }
        }
      }
    });
    if (!testSeries) {
      return res.status(404).json({ message: 'Test series not found.' });
    }
    res.json({ questions: testSeries.questions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add joinTestSeries endpoint
export const joinTestSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get contest details
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            level: true,
            category: true,
            subcategory: true
          }
        }
      }
    });
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found.' });
    }
    
    // Check if participation already exists
    let participation = await prisma.participation.findFirst({
      where: { sid: userId, testSeriesId: Number(id) }
    });
    if (!participation) {
      participation = await prisma.participation.create({
        data: {
          practiceTest: false,
          contest: true,
          startTime: new Date(),
          endTime: null,
          user: { connect: { id: userId } }, // Connect to user
          testSeries: { connect: { id: Number(id) } }
        }
      });
    }
    
    res.status(201).json({ 
      participation,
      contest: {
        id: contest.id,
        title: contest.title,
        questions: contest.questions
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update submitTestSeriesAnswers
export const submitTestSeriesAnswers = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { answers, autoSubmitted = false, violationType = null } = req.body; // [{ questionId, selectedOption }]
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers are required.' });
    }
    
    // Fetch correct answers for the questions in this test series
    const testSeries = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: { 
            id: true, 
            correctAnswers: true,
            question: true,
            options: true
          }
        }
      }
    });
    
    if (!testSeries) {
      return res.status(404).json({ message: 'Test series not found.' });
    }
    
    // Map questionId to correct answers and question details
    const correctMap = {};
    const questionMap = {};
    testSeries.questions.forEach(q => {
      correctMap[q.id] = Array.isArray(q.correctAnswers) ? q.correctAnswers : [];
      questionMap[q.id] = q;
    });
    

    
    // Calculate score with negative marking support (per-question deduction by ratio)
    let score = 0;
    let attempted = 0;
    let negativeMarks = 0;
    const questionResults = [];
    
    // Debug logging
    console.log('TestSeries negative marking settings:', {
      hasNegativeMarking: testSeries.hasNegativeMarking,
      negativeMarkingValue: testSeries.negativeMarkingValue
    });
    
    answers.forEach(ans => {
      const hasAnswer = ans.selectedOption && ans.selectedOption.trim() !== '' && ans.selectedOption !== 'null';
      
      if (hasAnswer) {
        attempted++;
        const isCorrect = correctMap[ans.questionId] && correctMap[ans.questionId].includes(ans.selectedOption.trim());
        
        if (isCorrect) {
          score++;
        } else if (testSeries.hasNegativeMarking) {
          // Apply negative marking for wrong answers using per-question ratio
          const ratio = Number(testSeries.negativeMarkingValue) || 0;
          const qScore = 1;
          negativeMarks += ratio * qScore;
          console.log(`Wrong answer for question ${ans.questionId}: adding ${testSeries.negativeMarkingValue} negative marks`);
        }
      }
      
      // Create result object for each question
      questionResults.push({
        questionId: ans.questionId,
        question: questionMap[ans.questionId]?.question || '',
        options: questionMap[ans.questionId]?.options || [],
        userAnswer: ans.selectedOption || '',
        correctAnswer: (correctMap[ans.questionId] || []).join(', '),
        isCorrect: hasAnswer && (correctMap[ans.questionId] || []).includes(ans.selectedOption.trim()),
        isAttempted: hasAnswer,
        negativeMarks: hasAnswer && !(correctMap[ans.questionId] || []).includes(ans.selectedOption.trim()) && testSeries.hasNegativeMarking ? ((Number(testSeries.negativeMarkingValue) || 0) * 1) : 0
      });
    });
    
    // Calculate final score (correct answers minus negative marks)
    const finalScore = Math.max(0, score - negativeMarks);
    
    console.log('Score calculation:', {
      score,
      negativeMarks,
      finalScore,
      totalQuestions: testSeries.questions.length
    });
    
    // Get current participation to check violations
    const participation = await prisma.participation.findFirst({
      where: { sid: userId, testSeriesId: Number(id) }
    });

    if (!participation) {
      return res.status(404).json({ message: 'Participation not found.' });
    }

    // Handle violations
    let currentViolations = participation.violations || 0;
    if (violationType) {
      currentViolations += 1;
    }

    // Update participation (set endTime, submittedAt, violations, and scores)
    const endTime = new Date();
    await prisma.participation.updateMany({
      where: { sid: userId, testSeriesId: Number(id) },
      data: { 
        endTime: endTime,
        submittedAt: endTime,
        violations: currentViolations,
        finalScore: finalScore,
        correct: score,
        attempted: attempted,
        negativeMarks: negativeMarks
      }
    });
    
    // Calculate time taken in minutes
    const timeTaken = participation.startTime ? 
      Math.round((endTime.getTime() - new Date(participation.startTime).getTime()) / (1000 * 60)) : 0;
    
    // Log student activity for each question (create a new record for every answer)
    const now = new Date();
    
    for (const ans of answers) {
      const activityData = {
        sid: userId,
        qid: ans.questionId,
        testSeriesId: Number(id),
        time: now,
        selectedAnswer: ans.selectedOption && ans.selectedOption.trim() !== '' && ans.selectedOption !== 'null' ? ans.selectedOption : null
      };
      
      await prisma.studentActivity.create({
        data: activityData
      });
    }
    
    // Send performance notification for high scores (80% or above) - use final score for percentage
    const percentage = Math.round((finalScore / testSeries.questions.length) * 100);
    const notificationService = getNotificationService(req);
    if (notificationService && percentage >= 80) {
      try {
        await notificationService.notifyHighScore(userId, testSeries, score, testSeries.questions.length);
        console.log(`High score notification sent for user ${userId}: ${percentage}%`);
      } catch (error) {
        console.error('Failed to send high score notification:', error);
      }
    }

    res.json({ 
      score: finalScore, 
      correct: score, // Raw correct answers (before negative marking)
      total: testSeries.questions.length,
      attempted,
      negativeMarks,
      hasNegativeMarking: testSeries.hasNegativeMarking,
      negativeMarkingValue: testSeries.negativeMarkingValue,
      negativeMarkingRatio: toNegativeRatioString(Number(testSeries.negativeMarkingValue) || 0),
      timeTaken: timeTaken, // Add time taken to top level
      autoSubmitted,
      violations: currentViolations,
      results: {
        correctAnswers: score,
        correct: score, // Raw correct answers (before negative marking)
        totalQuestions: testSeries.questions.length,
        attemptedQuestions: attempted,
        negativeMarks,
        negativeMarkingRatio: toNegativeRatioString(Number(testSeries.negativeMarkingValue) || 0),
        finalScore,
        timeTaken: timeTaken, // Calculate time taken in minutes
        questionResults
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserContestResult = async (req, res) => {
  try {
    const { id } = req.params; // contest id
    const { pid } = req.query; // participation id (optional)
    const userId = req.user.id;

    // Get contest start/end time and questions with correct answers
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      select: { 
        startTime: true, 
        endTime: true,
        hasNegativeMarking: true,
        negativeMarkingValue: true,
        questions: { 
          select: { 
            id: true, 
            question: true, 
            options: true, 
            correctAnswers: true 
          } 
        } 
      }
    });
    if (!contest) return res.status(404).json({ message: 'Contest not found' });

    // Check if contest has ended
    const now = new Date();
    const contestEndTime = new Date(contest.endTime);
    
    if (now < contestEndTime) {
      return res.status(403).json({ 
        message: 'Results not available yet',
        contestEndTime: contest.endTime,
        timeUntilEnd: contestEndTime.getTime() - now.getTime()
      });
    }

    // Get StudentActivity for this user/contest
    let activities = [];
    let participation = null;
    
    if (pid) {
      // If participation ID is provided, get activities for that specific participation
      participation = await prisma.participation.findFirst({
        where: {
          pid: Number(pid),
          sid: userId,
          testSeriesId: Number(id)
        }
      });
      
      if (!participation) {
        return res.status(404).json({ message: 'Participation not found' });
      }
      
      // Get activities for this user/contest without strict time filtering
      activities = await prisma.studentActivity.findMany({
        where: {
          sid: userId,
          testSeriesId: Number(id)
        }
      });
    } else {
      // Get participation and activities for this user/contest
      participation = await prisma.participation.findFirst({
        where: {
          sid: userId,
          testSeriesId: Number(id)
        }
      });
      
      // If user participated, get their activities
      if (participation) {
        activities = await prisma.studentActivity.findMany({
          where: {
            sid: userId,
            testSeriesId: Number(id)
          }
        });
      }
      // If no participation, we'll still show contest info but no personal results
    }

    // Map questionId to correct answers and question details
    const correctMap = {};
    const questionMap = {};
    contest.questions.forEach(q => { 
      correctMap[q.id] = Array.isArray(q.correctAnswers) ? q.correctAnswers : [];
      questionMap[q.id] = q;
    });

    // Calculate stats with negative marking support
    let correct = 0;
    let attempted = 0;
    let negativeMarks = 0;
    const questionResults = [];
    
    // Calculate time taken if participation exists
    let timeTaken = 0;
    if (participation && participation.startTime && participation.endTime) {
      timeTaken = Math.round((new Date(participation.endTime).getTime() - new Date(participation.startTime).getTime()) / (1000 * 60));
    }
    
    // Process each question
    contest.questions.forEach(question => {
      const activity = activities.find(act => act.qid === question.id);
      const hasAnswer = activity && activity.selectedAnswer && activity.selectedAnswer.trim() !== '' && activity.selectedAnswer !== 'null';
      
      if (hasAnswer) {
        attempted++;
        const isCorrect = (correctMap[question.id] || []).includes(activity.selectedAnswer);
        if (isCorrect) {
          correct++;
        } else if (contest.hasNegativeMarking) {
          // Apply negative marking for wrong answers
          const qScore = 1;
          negativeMarks += (Number(contest.negativeMarkingValue) || 0) * qScore;
        }
      }
      
      questionResults.push({
        questionId: question.id,
        question: question.question,
        options: question.options,
        userAnswer: activity?.selectedAnswer || '',
        correctAnswer: (correctMap[question.id] || []).join(', '),
        isCorrect: hasAnswer && (correctMap[question.id] || []).includes(activity.selectedAnswer),
        isAttempted: hasAnswer,
        negativeMarks: hasAnswer && !(correctMap[question.id] || []).includes(activity.selectedAnswer) && contest.hasNegativeMarking ? ((Number(contest.negativeMarkingValue) || 0) * 1) : 0
      });
    });
    
    // Calculate final score (correct answers minus negative marks)
    const finalScore = Math.max(0, correct - negativeMarks);
    


    res.json({
      totalQuestions: contest.questions.length,
      attempted,
      correct,
      correctAnswers: correct, // Add this for consistency
      negativeMarks,
      hasNegativeMarking: contest.hasNegativeMarking,
      negativeMarkingValue: contest.negativeMarkingValue,
      negativeMarkingRatio: toNegativeRatioString(Number(contest.negativeMarkingValue) || 0),
      finalScore,
      timeTaken: timeTaken,
      violations: participation?.violations || 0,
      autoSubmitted: participation?.violations >= 2,
      hasParticipated: !!participation,
      questionResults
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get contest leaderboard
export const getContestLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get all participations for this contest with precalculated scores
    const participations = await prisma.participation.findMany({
      where: { testSeriesId: Number(id) },
      select: {
        sid: true,
        startTime: true,
        endTime: true,
        submittedAt: true,
        finalScore: true,
        correct: true,
        attempted: true,
        negativeMarks: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      },
      orderBy: [
        { finalScore: 'desc' },
        { submittedAt: 'asc' }
      ]
    });

    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      select: { 
        startTime: true,
        endTime: true,
        hasNegativeMarking: true,
        negativeMarkingValue: true,
        questions: { select: { id: true } } 
      }
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found.' });
    }

    const totalQuestions = contest.questions.length;

    // Create leaderboard entries directly from the participation stats
    const leaderboard = participations.map((p, index) => {
      // Calculate time taken
      let timeTaken = 0;
      if (p.startTime && p.endTime) {
        timeTaken = Math.round((new Date(p.endTime).getTime() - new Date(p.startTime).getTime()) / (1000 * 60));
      } else if (p.startTime && p.submittedAt) {
        timeTaken = Math.round((new Date(p.submittedAt).getTime() - new Date(p.startTime).getTime()) / (1000 * 60));
      } else if (contest.startTime && p.submittedAt) {
        timeTaken = Math.round((new Date(p.submittedAt).getTime() - new Date(contest.startTime).getTime()) / (1000 * 60));
      }
      
      const attempted = p.attempted || 0;
      const correct = p.correct || 0;
      const finalScore = p.finalScore || 0;
      
      const percentage = totalQuestions > 0 ? (finalScore / totalQuestions) * 100 : 0;
      const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;
      
      return {
        rank: index + 1,
        userId: p.sid,
        userName: p.user.fullName,
        userEmail: p.user.email,
        correct: correct,
        finalScore: finalScore,
        negativeMarks: p.negativeMarks || 0,
        hasNegativeMarking: contest.hasNegativeMarking,
        attempted: attempted,
        totalQuestions: totalQuestions,
        percentage: Math.round(percentage * 100) / 100,
        accuracy: Math.round(accuracy * 100) / 100,
        submittedAt: p.submittedAt,
        timeTaken: timeTaken
      };
    });

    res.json({
      contestId: Number(id),
      totalParticipants: leaderboard.length,
      totalQuestions: totalQuestions,
      leaderboard: leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getContestStats = async (req, res) => {
  try {
    const { id } = req.params;
    // Get all participations with precalculated scores
    const participations = await prisma.participation.findMany({
      where: { testSeriesId: Number(id) },
      select: { sid: true, finalScore: true }
    });

    // Get all users' StudentActivity for question-wise stats
    const allActivities = await prisma.studentActivity.findMany({
      where: { testSeriesId: Number(id) }
    });

    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      select: { 
        questions: { 
          select: { 
            id: true, 
            correctAnswers: true,
            question: true,
            options: true
          } 
        } 
      }
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found.' });
    }

    const totalQuestions = contest.questions.length;
    const totalParticipants = participations.length;

    // Use precalculated scores from the database
    const scores = participations.map(p => p.finalScore || 0);

    // Calculate average
    const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const averagePercentage = scores.length && totalQuestions > 0 ? ((average / totalQuestions) * 100) : 0;

    // Calculate question-wise statistics
    const questionStats = {};
    const correctMap = {};
    
    contest.questions.forEach(q => {
      correctMap[q.id] = q.correctAnswers;
      questionStats[q.id] = {
        questionId: q.id,
        question: q.question,
        options: q.options,
        correctAns: q.correctAnswers,
        totalAttempts: 0,
        correctAttempts: 0,
        incorrectAttempts: 0,
        notAttempted: 0
      };
    });

    // Populate question statistics
    allActivities.forEach(act => {
      if (questionStats[act.qid]) {
        questionStats[act.qid].totalAttempts++;
        const hasAnswer = act.selectedAnswer && act.selectedAnswer.trim() !== '' && act.selectedAnswer !== 'null';
        if (hasAnswer) {
          const correctAnswers = correctMap[act.qid];
          if (Array.isArray(correctAnswers) && correctAnswers.includes(act.selectedAnswer)) {
            questionStats[act.qid].correctAttempts++;
          } else {
            questionStats[act.qid].incorrectAttempts++;
          }
        } else {
          questionStats[act.qid].notAttempted++;
        }
      }
    });

    // Calculate not attempted for each question
    Object.values(questionStats).forEach(q => {
      q.notAttempted = totalParticipants - q.totalAttempts;
    });

    // Find most/least statistics
    const questionStatsArray = Object.values(questionStats);
    const mostCorrect = questionStatsArray.length > 0 ? questionStatsArray.reduce((max, q) => 
      q.correctAttempts > max.correctAttempts ? q : max, questionStatsArray[0]) : null;
    const mostIncorrect = questionStatsArray.length > 0 ? questionStatsArray.reduce((max, q) => 
      q.incorrectAttempts > max.incorrectAttempts ? q : max, questionStatsArray[0]) : null;
    const mostAttempted = questionStatsArray.length > 0 ? questionStatsArray.reduce((max, q) => 
      q.totalAttempts > max.totalAttempts ? q : max, questionStatsArray[0]) : null;
    const leastAttempted = questionStatsArray.length > 0 ? questionStatsArray.reduce((min, q) => 
      q.totalAttempts < min.totalAttempts ? q : min, questionStatsArray[0]) : null;

    res.json({
      scores,
      average,
      averagePercentage,
      totalQuestions,
      totalParticipants,
      questionStats: questionStatsArray,
      mostCorrect,
      mostIncorrect,
      mostAttempted,
      leastAttempted
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get statistics for all contests
export const getAllContestStats = async (req, res) => {
  try {
    const contests = await prisma.testSeries.findMany({
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        questions: { select: { id: true } }
      }
    });

    // O(1) query: group by testSeriesId and average the finalScore
    const participationsAgg = await prisma.participation.groupBy({
      by: ['testSeriesId'],
      _count: { sid: true },
      _avg: { finalScore: true }
    });

    const statsMap = {};
    participationsAgg.forEach(p => {
      if (p.testSeriesId) {
        statsMap[p.testSeriesId] = {
          totalParticipants: p._count.sid,
          averageScore: p._avg.finalScore || 0
        };
      }
    });

    const allContestStats = contests.map(contest => {
      const totalQuestions = contest.questions.length;
      const stats = statsMap[contest.id] || { totalParticipants: 0, averageScore: 0 };
      
      let averagePercentage = 0;
      if (totalQuestions > 0 && stats.averageScore > 0) {
        averagePercentage = (stats.averageScore / totalQuestions) * 100;
      }

      return {
        contestId: contest.id,
        contestTitle: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
        totalQuestions,
        totalParticipants: stats.totalParticipants,
        averageScore: stats.averageScore,
        averagePercentage,
        status: new Date() < contest.startTime ? 'upcoming' : 
               new Date() > contest.endTime ? 'completed' : 'live'
      };
    });

    res.json(allContestStats);
  } catch (error) {
    console.error('Error in getAllContestStats:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getUserParticipations = async (req, res) => {
  try {
    const userId = req.user.id;
    // Get all participations for this user, with contest info
    const participations = await prisma.participation.findMany({
      where: { sid: userId, testSeriesId: { not: null } },
      include: {
        testSeries: { select: { id: true, title: true } }
      },
      orderBy: { startTime: 'desc' }
    });
    res.json({ participations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get upcoming contests (test series)
export const getUpcomingContests = async (req, res) => {
  try {
    const now = new Date();
    const contests = await prisma.testSeries.findMany({
      where: { startTime: { gte: now } },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        requiresCode: true,
        contestCode: true,
        participations: true,
      }
    });
    
    // Map to expected frontend format with proper timezone handling
    const result = contests.map(c => {
      // Convert UTC to local time
      const startTime = new Date(c.startTime);
      const endTime = new Date(c.endTime);
      
      // Format date and time in local timezone
      const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      };
      
      const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      };
      
      // Calculate time until start
      const timeUntilStart = startTime.getTime() - now.getTime();
      const hoursUntilStart = Math.floor(timeUntilStart / (1000 * 60 * 60));
      const minutesUntilStart = Math.floor((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeStatus = '';
      if (hoursUntilStart > 24) {
        const daysUntilStart = Math.floor(hoursUntilStart / 24);
        timeStatus = `${daysUntilStart} day${daysUntilStart > 1 ? 's' : ''} away`;
      } else if (hoursUntilStart > 0) {
        timeStatus = `${hoursUntilStart}h ${minutesUntilStart}m away`;
      } else if (minutesUntilStart > 0) {
        timeStatus = `${minutesUntilStart}m away`;
      } else {
        timeStatus = 'Starting now';
      }
      
      return {
        id: c.id,
        name: c.title,
        date: formatDate(startTime),
        time: formatTime(startTime),
        endDate: formatDate(endTime),
        endTime: formatTime(endTime),
        participants: c.participations ? c.participations.length : 0,
        requiresCode: c.requiresCode,
        contestCode: c.contestCode,
        timeStatus,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      };
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update TestSeries (admin/moderator only)
export const updateTestSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, startTime, endTime, requiresCode, hasNegativeMarking, negativeMarkingValue, questionIds } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ message: 'Only admin or moderator can update test series.' });
    }

    // Check if contest exists
    const existingContest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: { questions: true }
    });

    if (!existingContest) {
      return res.status(404).json({ message: 'Test series not found.' });
    }

    // Validate times
    const newStartTime = new Date(startTime);
    const newEndTime = new Date(endTime);
    const now = new Date();
    // Allow edits during live contests but keep sane validations
    if (newEndTime <= newStartTime) {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }

    // Update the contest
    const updatedContest = await prisma.testSeries.update({
      where: { id: Number(id) },
      data: {
        title: title.trim(),
        startTime: newStartTime,
        endTime: newEndTime,
        requiresCode: requiresCode || false,
        hasNegativeMarking: hasNegativeMarking || false,
        negativeMarkingValue: negativeMarkingValue || 0.25,
        ...(questionIds && {
          questions: {
            set: [], // Clear existing questions
            connect: questionIds.map(id => ({ id })) // Connect new questions
          }
        })
      },
      include: { 
        questions: { select: { id: true, question: true, options: true, level: true, category: true, subcategory: true } }, 
        creator: true 
      },
    });

    // Handle question visibility if questions were updated
    if (questionIds) {
      // Make old questions visible again
      const oldQuestionIds = existingContest.questions.map(q => q.id);
      if (oldQuestionIds.length > 0) {
        await prisma.question.updateMany({
          where: { id: { in: oldQuestionIds } },
          data: { visibility: true }
        });
      }
      
      // Hide new questions
      await prisma.question.updateMany({
        where: { id: { in: questionIds } },
        data: { visibility: false }
      });
    }

    res.json({ testSeries: updatedContest });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a TestSeries (admin/moderator only)
export const deleteTestSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ message: 'Only admin or moderator can delete test series.' });
    }

    const contestId = Number(id);
    const contest = await prisma.testSeries.findUnique({
      where: { id: contestId },
      include: { questions: true }
    });
    if (!contest) {
      return res.status(404).json({ message: 'Test series not found.' });
    }

    await prisma.$transaction(async (tx) => {
      // Make previously hidden questions visible again
      const questionIds = contest.questions.map(q => q.id);
      if (questionIds.length > 0) {
        await tx.question.updateMany({
          where: { id: { in: questionIds } },
          data: { visibility: true }
        });
      }

      // Remove related activities and participations
      await tx.studentActivity.deleteMany({ where: { testSeriesId: contestId } });
      await tx.participation.deleteMany({ where: { testSeriesId: contestId } });

      // Finally delete the test series
      await tx.testSeries.delete({ where: { id: contestId } });
    });

    res.json({ message: 'Test series deleted successfully.' });
  } catch (error) {
    console.error('Error deleting test series:', error);
    res.status(500).json({ message: error.message });
  }
};

// Bulk delete TestSeries (admin/moderator only)
export const deleteMultipleTestSeries = async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ message: 'Only admin or moderator can delete test series.' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids must be a non-empty array' });
    }

    await prisma.$transaction(async (tx) => {
      // For each contest, cleanup related data and delete
      for (const id of ids) {
        const contestId = Number(id);
        const contest = await tx.testSeries.findUnique({ where: { id: contestId }, include: { questions: true } });
        if (!contest) continue;
        const questionIds = contest.questions.map(q => q.id);
        if (questionIds.length > 0) {
          await tx.question.updateMany({ where: { id: { in: questionIds } }, data: { visibility: true } });
        }
        await tx.studentActivity.deleteMany({ where: { testSeriesId: contestId } });
        await tx.participation.deleteMany({ where: { testSeriesId: contestId } });
        await tx.testSeries.delete({ where: { id: contestId } });
      }
    });

    res.json({ message: 'Selected test series deleted successfully.' });
  } catch (error) {
    console.error('Error bulk deleting test series:', error);
    res.status(500).json({ message: error.message });
  }
};

// Join contest using code
export const joinContestByCode = async (req, res) => {
  try {
    const { contestCode } = req.body;
    const userId = req.user.id;

    if (!contestCode) {
      return res.status(400).json({ message: 'Contest code is required.' });
    }

    // Find contest by code
    const contest = await prisma.testSeries.findUnique({
      where: { contestCode },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            level: true,
            category: true,
            subcategory: true
          }
        }
      }
    });

    if (!contest) {
      return res.status(404).json({ message: 'Invalid contest code.' });
    }

    // Check if contest is active
    const now = new Date();
    if (now < contest.startTime || now > contest.endTime) {
      return res.status(400).json({ message: 'Contest is not currently active.' });
    }

    // Check if user already participated
    const existingParticipation = await prisma.participation.findFirst({
      where: {
        sid: userId,
        testSeriesId: contest.id
      }
    });

    if (existingParticipation) {
      return res.status(400).json({ message: 'You have already joined this contest.' });
    }

    // Create participation
    const participation = await prisma.participation.create({
      data: {
        practiceTest: false,
        contest: true,
        startTime: new Date(),
        endTime: null,
        user: { connect: { id: userId } },
        testSeries: { connect: { id: contest.id } }
      }
    });

    res.status(201).json({ 
      message: 'Successfully joined contest!',
      contest: {
        id: contest.id,
        title: contest.title,
        questions: contest.questions
      },
      participation
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Record a violation for a contest
export const recordViolation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { violationType } = req.body;

    if (!violationType) {
      return res.status(400).json({ message: 'Violation type is required.' });
    }

    // Get current participation
    const participation = await prisma.participation.findFirst({
      where: { sid: userId, testSeriesId: Number(id) }
    });

    if (!participation) {
      return res.status(404).json({ message: 'Participation not found.' });
    }

    // Update violation count
    const currentViolations = (participation.violations || 0) + 1;
    
    await prisma.participation.updateMany({
      where: { sid: userId, testSeriesId: Number(id) },
      data: { violations: currentViolations }
    });

    res.json({ 
      violations: currentViolations,
      shouldAutoSubmit: currentViolations >= 2
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all participants for a specific contest
export const getContestParticipants = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch contest settings to determine negative marking
    const contestConfig = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      select: { hasNegativeMarking: true, negativeMarkingValue: true }
    });

    const participants = await prisma.participation.findMany({
      where: {
        testSeriesId: Number(id),
        contest: true
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });

    // Calculate scores and stats for each participant
    const participantsWithStats = await Promise.all(
      participants.map(async (participation) => {
        try {
          // Get all answers for this participant
          const answers = await prisma.studentActivity.findMany({
            where: {
              sid: participation.sid,
              testSeriesId: Number(id)
            },
            include: {
              question: {
                select: {
                  id: true,
                  correctAnswers: true
                }
              }
            }
          });

          const totalQuestions = await prisma.question.count({
            where: {
              testSeries: {
                some: {
                  id: Number(id)
                }
              }
            }
          });

          const correctAnswers = answers.filter(a => 
            Array.isArray(a.question.correctAnswers) && 
            a.question.correctAnswers.includes(a.selectedAnswer)
          ).length;
          const attempted = answers.filter(a => a.selectedAnswer && a.selectedAnswer.trim() !== '' && a.selectedAnswer !== 'null').length;
          let negative = 0;
          if (contestConfig?.hasNegativeMarking) {
            const ratio = Number(contestConfig.negativeMarkingValue) || 0;
            answers.forEach(a => {
              const hasAns = a.selectedAnswer && a.selectedAnswer.trim() !== '' && a.selectedAnswer !== 'null';
              const isCorrect = hasAns && Array.isArray(a.question.correctAnswers) && a.question.correctAnswers.includes(a.selectedAnswer);
              if (hasAns && !isCorrect) {
                negative += ratio * 1;
              }
            });
          }
          const finalScore = Math.max(0, correctAnswers - negative);
          const percentage = totalQuestions > 0 ? ((finalScore / totalQuestions) * 100).toFixed(1) : '0';
          const timeTaken = participation.submittedAt && participation.startTime 
            ? Math.round((new Date(participation.submittedAt) - new Date(participation.startTime)) / (1000 * 60))
            : 0;

          return {
            id: participation.pid,
            userId: participation.user?.id || 'unknown',
            name: participation.user?.fullName || 'Unknown User',
            email: participation.user?.email || 'No email',
            score: finalScore,
            totalQuestions,
            percentage: parseFloat(percentage),
            accuracy: parseFloat(percentage),
            timeTaken,
            submittedAt: participation.submittedAt,
            startTime: participation.startTime
          };
        } catch (error) {
          console.error('Error processing participant:', participation.pid, error);
          return {
            id: participation.pid,
            userId: 'unknown',
            name: 'Unknown User',
            email: 'No email',
            score: 0,
            totalQuestions: 0,
            percentage: 0,
            accuracy: 0,
            timeTaken: 0,
            submittedAt: participation.submittedAt,
            startTime: participation.startTime
          };
        }
      })
    );

    // Sort by score (highest first)
    participantsWithStats.sort((a, b) => b.score - a.score);

    res.json({ participants: participantsWithStats });
  } catch (error) {
    console.error('Error getting contest participants:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get detailed answers for a specific participant
export const getParticipantAnswers = async (req, res) => {
  try {
    const { contestId, participantId } = req.params;
    
    const participation = await prisma.participation.findFirst({
      where: {
        pid: Number(participantId),
        testSeriesId: Number(contestId),
        contest: true
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        testSeries: {
          select: {
            id: true,
            title: true,
            hasNegativeMarking: true,
            negativeMarkingValue: true,
            questions: {
              select: {
                id: true,
                question: true,
                options: true,
                correctAnswers: true,
                explanation: true
              }
            }
          }
        }
      }
    });

    if (!participation) {
      return res.status(404).json({ message: 'Participation not found.' });
    }

    // Build answers from StudentActivity since Result may not exist
    const activities = await prisma.studentActivity.findMany({
      where: {
        sid: participation.sid,
        testSeriesId: participation.testSeriesId
      }
    });

    const questionOrder = participation.testSeries.questions.map(q => q.id);
    const answersByQuestionId = new Map(activities.map(a => [a.qid, a.selectedAnswer]));
    const answers = questionOrder.map(qid => answersByQuestionId.get(qid) || null);
    const totalQuestions = participation.testSeries.questions.length;
    const correctAnswers = participation.testSeries.questions.reduce((acc, q) => {
      const ans = answersByQuestionId.get(q.id);
      return acc + (ans && Array.isArray(q.correctAnswers) && q.correctAnswers.includes(ans) ? 1 : 0);
    }, 0);
    // Apply negative marking if enabled
    const attempted = participation.testSeries.questions.reduce((acc, q) => {
      const val = answersByQuestionId.get(q.id);
      const hasAnswer = typeof val === 'string' ? (val.trim() !== '' && val !== 'null') : !!val;
      return acc + (hasAnswer ? 1 : 0);
    }, 0);
    const wrong = Math.max(0, attempted - correctAnswers);
    const negative = participation.testSeries.hasNegativeMarking ? (wrong * (Number(participation.testSeries.negativeMarkingValue) || 0)) : 0;
    const finalScore = Math.max(0, correctAnswers - negative);
    const percentage = totalQuestions > 0 ? ((finalScore / totalQuestions) * 100).toFixed(1) : '0';
    const timeTaken = participation.submittedAt && participation.startTime 
      ? Math.round((new Date(participation.submittedAt) - new Date(participation.startTime)) / 1000 / 60)
      : 0;

    // Map questions with user answers
    const questionsWithAnswers = participation.testSeries.questions.map((question, index) => {
      const userAnswer = answers[index] || null;
      const isCorrect = userAnswer && Array.isArray(question.correctAnswers) && question.correctAnswers.includes(userAnswer);
      
      return {
        id: question.id,
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswers,
        userAnswer,
        isCorrect,
        explanation: question.explanation
      };
    });

    res.json({
      participant: {
        id: participation.pid,
        userId: participation.user?.id || 'unknown',
        name: participation.user?.fullName || 'Unknown User',
        email: participation.user?.email || 'No email',
        score: finalScore,
        totalQuestions,
        percentage: parseFloat(percentage),
        accuracy: parseFloat(percentage),
        timeTaken,
        submittedAt: participation.submittedAt,
        startTime: participation.startTime
      },
      contest: {
        id: participation.testSeries?.id || 'unknown',
        title: participation.testSeries?.title || 'Unknown Contest'
      },
      questions: questionsWithAnswers
    });
  } catch (error) {
    console.error('Error getting participant answers:', error);
    res.status(500).json({ message: error.message });
  }
};

// Export contest results as CSV
export const exportContestResults = async (req, res) => {
  try {
    const { id } = req.params;
    
    const participants = await prisma.participation.findMany({
      where: {
        testSeriesId: Number(id),
        contest: true
      },
      include: {
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });

    // Get results for all participants
    const participantsWithResults = await Promise.all(
      participants.map(async (participation) => {
        const result = await prisma.result.findFirst({
          where: { pid: participation.id }
        });

        const totalQuestions = await prisma.question.count({
          where: {
            testSeries: {
              some: {
                id: Number(id)
              }
            }
          }
        });

        const correctAnswers = result?.correct || 0;
        const percentage = totalQuestions > 0 ? ((correctAnswers / totalQuestions) * 100).toFixed(1) : '0';
        const timeTaken = participation.submittedAt && participation.startTime 
          ? Math.round((new Date(participation.submittedAt) - new Date(participation.startTime)) / 1000 / 60)
          : 0;

        return {
          name: participation.user?.fullName || 'Unknown User',
          email: participation.user?.email || 'No email',
          score: correctAnswers,
          totalQuestions,
          percentage,
          timeTaken: `${timeTaken} minutes`,
          submittedAt: participation.submittedAt ? new Date(participation.submittedAt).toLocaleString() : 'Not submitted'
        };
      })
    );

    // Sort by score (highest first)
    participantsWithResults.sort((a, b) => b.score - a.score);

    // Create CSV content
    const csvHeaders = ['Rank', 'Name', 'Email', 'Score', 'Total Questions', 'Percentage', 'Time Taken', 'Submitted At'];
    const csvRows = participantsWithResults.map((participant, index) => [
      index + 1,
      participant.name,
      participant.email,
      participant.score,
      participant.totalQuestions,
      `${participant.percentage}%`,
      participant.timeTaken,
      participant.submittedAt
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      select: { title: true }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${contest?.title || 'contest'}-results.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting contest results:', error);
    res.status(500).json({ message: error.message });
  }
};

// Download contest results as Excel with detailed answers
export const downloadContestResultsExcel = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Downloading Excel for contest ID:', id);
    console.log('User making request:', req.user);
    
    // Get contest details
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            correctAnswers: true,
            level: true,
            category: true,
            subcategory: true
          }
        }
      }
    });

    if (!contest) {
      console.log('Contest not found for ID:', id);
      return res.status(404).json({ message: 'Contest not found' });
    }

    console.log('Found contest:', contest.title, 'with', contest.questions.length, 'questions');

    // Get all participants with their results
    const participants = await prisma.participation.findMany({
      where: {
        testSeriesId: Number(id),
        contest: true
      },
      include: {
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });

    console.log('Found participants:', participants.length);

    // Get detailed answers for each participant
    const participantsWithAnswers = await Promise.all(
      participants.map(async (participation) => {
        const answers = await prisma.studentActivity.findMany({
          where: { 
            sid: participation.sid,
            testSeriesId: participation.testSeriesId
          },
          include: {
            question: {
              select: {
                id: true,
                question: true,
                options: true,
                correctAnswers: true
              }
            }
          },
          orderBy: {
            qid: 'asc'
          }
        });

        const totalQuestions = contest.questions.length;
        const correctAnswers = answers.filter(a => 
          Array.isArray(a.question.correctAnswers) && 
          a.question.correctAnswers.includes(a.selectedAnswer)
        ).length;
        const percentage = totalQuestions > 0 ? ((correctAnswers / totalQuestions) * 100).toFixed(1) : '0';
        const timeTaken = participation.submittedAt && participation.startTime 
          ? Math.round((new Date(participation.submittedAt) - new Date(participation.startTime)) / 1000 / 60)
          : 0;

        return {
          participant: {
            name: participation.user?.fullName || 'Unknown User',
            email: participation.user?.email || 'No email',
            score: correctAnswers,
            totalQuestions,
            percentage,
            timeTaken,
            submittedAt: participation.submittedAt ? new Date(participation.submittedAt).toLocaleString() : 'Not submitted',
            rank: 0 // Will be calculated later
          },
          answers: answers.map(answer => ({
            questionId: answer.qid,
            question: answer.question.question,
            options: answer.question.options,
            userAnswer: answer.selectedAnswer,
            correctAnswer: answer.question.correctAnswers,
            isCorrect: Array.isArray(answer.question.correctAnswers) && answer.question.correctAnswers.includes(answer.selectedAnswer),
            questionNumber: contest.questions.findIndex(q => q.id === answer.qid) + 1
          }))
        };
      })
    );

    // Sort by score (highest first) and assign ranks
    participantsWithAnswers.sort((a, b) => b.participant.score - a.participant.score);
    participantsWithAnswers.forEach((participant, index) => {
      participant.participant.rank = index + 1;
    });

    // Create Excel workbook using exceljs
    const workbook = new ExcelJS.Workbook();

    // Summary worksheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Total Questions', key: 'totalQuestions', width: 16 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Time Taken (minutes)', key: 'timeTaken', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 24 }
    ];
    participantsWithAnswers.forEach(p => {
      summarySheet.addRow({
        rank: p.participant.rank,
        name: p.participant.name,
        email: p.participant.email,
        score: p.participant.score,
        totalQuestions: p.participant.totalQuestions,
        percentage: `${p.participant.percentage}%`,
        timeTaken: p.participant.timeTaken,
        submittedAt: p.participant.submittedAt
      });
    });

    // Detailed answers worksheets per participant
    participantsWithAnswers.forEach((participant) => {
      const participantName = participant.participant.name.replace(/[^a-zA-Z0-9]/g, '_');
      const sheetName = `${participant.participant.rank}_${participantName}`.substring(0, 31);
      const ws = workbook.addWorksheet(sheetName);
      ws.columns = [
        { header: 'Question Number', key: 'questionNumber', width: 16 },
        { header: 'Question', key: 'question', width: 80 },
        { header: 'Options', key: 'options', width: 60 },
        { header: 'User Answer', key: 'userAnswer', width: 14 },
        { header: 'Correct Answer', key: 'correctAnswer', width: 16 },
        { header: 'Status', key: 'status', width: 12 }
      ];
      participant.answers.forEach(answer => {
        ws.addRow({
          questionNumber: answer.questionNumber,
          question: answer.question,
          options: JSON.stringify(answer.options),
          userAnswer: answer.userAnswer || 'Not answered',
          correctAnswer: answer.correctAnswer,
          status: answer.isCorrect ? 'Correct' : (answer.userAnswer ? 'Incorrect' : 'Not answered')
        });
      });
    });

    // Questions worksheet
    const questionsSheet = workbook.addWorksheet('Questions');
    questionsSheet.columns = [
      { header: 'Question Number', key: 'number', width: 16 },
      { header: 'Question', key: 'question', width: 80 },
      { header: 'Options', key: 'options', width: 60 },
      { header: 'Correct Answer(s)', key: 'correct', width: 20 },
      { header: 'Level', key: 'level', width: 12 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Subcategory', key: 'subcategory', width: 16 }
    ];
    contest.questions.forEach((q, index) => {
      questionsSheet.addRow({
        number: index + 1,
        question: q.question,
        options: JSON.stringify(q.options),
        correct: Array.isArray(q.correctAnswers) ? q.correctAnswers.join(', ') : '',
        level: q.level,
        category: q.category,
        subcategory: q.subcategory
      });
    });

    // Generate Excel as buffer and send
    const fileName = `${contest.title}_Detailed_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    const excelBuffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', excelBuffer.byteLength);
    res.send(Buffer.from(excelBuffer));
  } catch (error) {
    console.error('Error downloading contest results Excel:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

// Get detailed analysis for contest
export const getDetailedAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Getting detailed analysis for contest ID:', id);
    
    // Get contest with questions
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
            correctAnswers: true,
            level: true,
            category: true,
            subcategory: true
          }
        }
      }
    });

    if (!contest) {
      console.log('Contest not found for detailed analysis ID:', id);
      return res.status(404).json({ message: 'Contest not found' });
    }

    console.log('Found contest for analysis:', contest.title, 'with', contest.questions.length, 'questions');

    // Get all participants with their answers
    const participants = await prisma.participation.findMany({
      where: {
        testSeriesId: Number(id),
        contest: true
      },
      include: {
        user: {
          select: {
            fullName: true,
            email: true
          }
        },
        // We'll get answers separately since they're in StudentActivity
      }
    });

    // Get all answers for this contest
    const allAnswers = await prisma.studentActivity.findMany({
      where: {
        testSeriesId: Number(id)
      },
      include: {
        question: {
          select: {
            id: true,
            question: true,
            options: true,
            correctAnswers: true,
            level: true,
            category: true,
            subcategory: true
          }
        }
      }
    });

    // Question Analysis with option counts
    const questionAnalysis = contest.questions.map(question => {
      const answersForQuestion = allAnswers.filter(a => a.qid === question.id);

      const correctAnswers = answersForQuestion.filter(a =>
        Array.isArray(question.correctAnswers) && question.correctAnswers.includes(a.selectedAnswer)
      ).length;

      const successRate = answersForQuestion.length > 0 ?
        (correctAnswers / answersForQuestion.length) * 100 : 0;

      // Count selections per option and not attempted
      const optionCounts = {};
      
      // Initialize optionCounts based on question structure
      if (Array.isArray(question.options)) {
        // New array-based structure
        question.options.forEach((option, index) => {
          optionCounts[option] = 0;
        });
        optionCounts.notAttempted = 0;
      } else {
        // Old object-based structure
        optionCounts.a = 0;
        optionCounts.b = 0;
        optionCounts.c = 0;
        optionCounts.d = 0;
        optionCounts.notAttempted = 0;
      }
      
      answersForQuestion.forEach(a => {
        const value = a.selectedAnswer;
        if (!value || value === 'null' || value === null) {
          optionCounts.notAttempted += 1;
        } else if (Array.isArray(question.options)) {
          // New structure: count by actual option text
          if (question.options.includes(value)) {
            optionCounts[value] = (optionCounts[value] || 0) + 1;
          } else {
            optionCounts.notAttempted += 1;
          }
        } else {
          // Old structure: count by a/b/c/d keys
          const key = value.toLowerCase();
          if (['a','b','c','d'].includes(key)) {
            optionCounts[key] += 1;
          } else {
            optionCounts.notAttempted += 1;
          }
        }
      });

      return {
        questionId: question.id,
        question: question.question,
        options: question.options,
        difficulty: question.level || 'medium',
        category: question.category || 'General',
        subcategory: question.subcategory || 'General',
        successRate,
        totalAttempts: answersForQuestion.length,
        correctAttempts: correctAnswers,
        optionCounts
      };
    });

    // Performance Metrics
    const performanceMetrics = {
      totalParticipants: participants.length,
      completedParticipants: participants.filter(p => p.submittedAt).length,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      standardDeviation: 0
    };

    if (participants.length > 0) {
      const scores = participants.map(p => {
        const participantAnswers = allAnswers.filter(a => a.sid === p.sid);
        const correctAnswers = participantAnswers.filter(a => 
          Array.isArray(a.question.correctAnswers) && 
          a.question.correctAnswers.includes(a.selectedAnswer)
        ).length;
        return correctAnswers;
      });

      performanceMetrics.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      performanceMetrics.highestScore = Math.max(...scores);
      performanceMetrics.lowestScore = Math.min(...scores);
      
      const mean = performanceMetrics.averageScore;
      const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
      performanceMetrics.standardDeviation = Math.sqrt(variance);
    }

    // Time Analysis
    const timeAnalysis = {};
    participants.forEach(participant => {
      if (participant.startTime && participant.submittedAt) {
        const timeTaken = Math.round((new Date(participant.submittedAt) - new Date(participant.startTime)) / (1000 * 60));
        
        let timeRange;
        if (timeTaken <= 30) timeRange = '0-30 min';
        else if (timeTaken <= 60) timeRange = '31-60 min';
        else if (timeTaken <= 90) timeRange = '61-90 min';
        else timeRange = '90+ min';
        
        timeAnalysis[timeRange] = (timeAnalysis[timeRange] || 0) + 1;
      }
    });

    // Category Analysis (fixed to use StudentActivity instead of non-existent p.answers)
    const categoryAnalysis = {};
    contest.questions.forEach(question => {
      const category = question.category || 'General';
      if (!categoryAnalysis[category]) {
        categoryAnalysis[category] = {
          questionCount: 0,
          totalAttempts: 0,
          correctAttempts: 0,
          averageScore: 0,
          successRate: 0
        };
      }

      categoryAnalysis[category].questionCount++;

      const answersForQuestion = allAnswers.filter(a => a.qid === question.id);

      categoryAnalysis[category].totalAttempts += answersForQuestion.length;
      categoryAnalysis[category].correctAttempts += answersForQuestion.filter(a =>
        Array.isArray(question.correctAnswers) && 
        question.correctAnswers.includes(a.selectedAnswer)
      ).length;
    });

    // Calculate category metrics
    Object.keys(categoryAnalysis).forEach(category => {
      const data = categoryAnalysis[category];
      data.averageScore = data.totalAttempts > 0 ? data.correctAttempts / data.totalAttempts : 0;
      data.successRate = data.totalAttempts > 0 ? (data.correctAttempts / data.totalAttempts) * 100 : 0;
    });

    console.log('Detailed analysis completed successfully');
    res.json({
      questionAnalysis,
      performanceMetrics,
      timeAnalysis,
      categoryAnalysis,
      totalQuestions: contest.questions.length
    });
  } catch (error) {
    console.error('Error getting detailed analysis:', error);
    res.status(500).json({ message: error.message });
  }
};

// Extend contest time
export const extendContestTime = async (req, res) => {
  try {
    const { id } = req.params;
    const { extensionMinutes } = req.body;
    
    if (!extensionMinutes || extensionMinutes <= 0) {
      return res.status(400).json({ message: 'Extension time must be positive' });
    }
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can extend contest time' });
    }
    
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) }
    });
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Calculate new end time
    const currentEndTime = new Date(contest.endTime);
    const newEndTime = new Date(currentEndTime.getTime() + (extensionMinutes * 60 * 1000));
    
    // Update contest end time
    const updatedContest = await prisma.testSeries.update({
      where: { id: Number(id) },
      data: { endTime: newEndTime }
    });
    
    // Send notification to all participants about time extension
    try {
      const participants = await prisma.participation.findMany({
        where: { testSeriesId: Number(id) },
        include: { user: true }
      });
      
      for (const participant of participants) {
        await prisma.notification.create({
          data: {
            userId: participant.sid,
            title: 'Contest Time Extended',
            message: `The contest "${contest.title}" has been extended by ${extensionMinutes} minutes. New end time: ${newEndTime.toLocaleString()}`,
            type: 'CONTEST_ANNOUNCED',
            data: { contestId: contest.id, extensionMinutes }
          }
        });
      }
    } catch (notificationError) {
      console.error('Failed to send time extension notifications:', notificationError);
      // Don't fail the main operation if notifications fail
    }
    
    res.json({ 
      message: `Contest time extended by ${extensionMinutes} minutes`,
      contest: updatedContest
    });
  } catch (error) {
    console.error('Error extending contest time:', error);
    res.status(500).json({ message: error.message });
  }
};

// Recalculate contest results after question changes
export const recalculateContestResults = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can recalculate results' });
    }
    
    const contest = await prisma.testSeries.findUnique({
      where: { id: Number(id) },
      include: { questions: true }
    });
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Get all participations for this contest
    const participations = await prisma.participation.findMany({
      where: { testSeriesId: Number(id) },
      include: { studentActivities: true }
    });
    
    let updatedCount = 0;
    
    // Recalculate results for each participation
    for (const participation of participations) {
      let correctCount = 0;
      const questionResults = [];
      
      for (const question of contest.questions) {
        const userAnswer = participation.studentActivities.find(
          activity => activity.qid === question.id
        );
        
        if (userAnswer && userAnswer.selectedAnswer) {
          const isCorrect = Array.isArray(question.correctAnswers) && 
            question.correctAnswers.includes(userAnswer.selectedAnswer.trim());
          
          if (isCorrect) correctCount++;
          
          questionResults.push({
            questionId: question.id,
            userAnswer: userAnswer.selectedAnswer,
            isCorrect,
            correctAnswers: question.correctAnswers
          });
        }
      }
      
      // Update participation with new score
      await prisma.participation.update({
        where: { pid: participation.pid },
        data: { 
          score: contest.questions.length > 0 ? Math.round((correctCount / contest.questions.length) * 100) : 0
        }
      });
      
      updatedCount++;
    }
    
    res.json({ 
      message: `Results recalculated for ${updatedCount} participants`,
      updatedCount
    });
  } catch (error) {
    console.error('Error recalculating contest results:', error);
    res.status(500).json({ message: error.message });
  }
};