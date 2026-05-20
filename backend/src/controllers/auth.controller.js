import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from 'bcryptjs';
import { generateToken } from '../lib/utils.js';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { sendWelcomeEmail, sendPasswordResetEmail, sendEmailVerificationEmail, sendModeratorRoleEmail } from '../lib/emailService.js';
import crypto from 'crypto';
import cache from '../lib/cache.js';


// Generate a random 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const signup = async (req, res) => {
    const { fullName, email, password, role } = req.body;
    
    try {
        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate verification code
        const verificationCode = generateVerificationCode();

        // Insert new user without storing verification token in PostgreSQL
        const result = await prisma.user.create({
            data: {
                role: role || 'user',
                fullName,
                email,
                password: hashedPassword,
                isEmailVerified: false
            },
            select: {
                id: true,
                role: true,
                fullName: true,
                email: true,
                created_at: true
            }
        });

        if (result) {
            // Store verification code in cache with a 10-minute (600s) TTL
            await cache.set(`verification:${email}`, verificationCode, 600);

            // Send verification email (non-blocking)
            sendEmailVerificationEmail(result.email, result.fullName, verificationCode)
                .then(() => {
                    console.log(`Verification email sent to: ${result.email}`);
                })
                .catch((error) => {
                    console.error('Failed to send verification email:', error);
                    // Don't block the signup process if email fails
                });

            res.status(201).json({
                message: 'Account created successfully! Please check your email for verification.',
                userId: result.id,
                email: result.email,
                requiresVerification: true
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Error in signup controller:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const verifyEmail = async (req, res) => {
    const { email, verificationCode } = req.body;
    
    try {
        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: "Email is already verified" });
        }

        const cachedCode = await cache.get(`verification:${email}`);

        if (!cachedCode) {
            return res.status(400).json({ message: "Verification code not found or expired" });
        }

        if (String(cachedCode).trim() !== String(verificationCode).trim()) {
            return res.status(400).json({ message: "Invalid verification code" });
        }

        // Mark email as verified
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true
            }
        });

        // Delete code from cache
        await cache.del(`verification:${email}`);

        // Send welcome email after verification
        sendWelcomeEmail(user.email, user.fullName)
            .then(() => {
                console.log(`Welcome email sent to verified user: ${user.email}`);
            })
            .catch((error) => {
                console.error('Failed to send welcome email:', error);
            });

        res.status(200).json({
            message: "Email verified successfully! You can now log in.",
            email: user.email
        });
    } catch (error) {
        console.error("Error in verifyEmail controller:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const resendVerificationCode = async (req, res) => {
    const { email } = req.body;
    
    try {
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: "Email is already verified" });
        }

        // Generate new verification code
        const verificationCode = generateVerificationCode();

        // Store new verification code in cache with a 10-minute (600s) TTL
        await cache.set(`verification:${email}`, verificationCode, 600);

        // Send new verification email
        sendEmailVerificationEmail(user.email, user.fullName, verificationCode)
            .then(() => {
                console.log(`New verification email sent to: ${user.email}`);
            })
            .catch((error) => {
                console.error('Failed to send new verification email:', error);
            });

        res.status(200).json({
            message: "New verification code sent to your email",
            email: user.email
        });
    } catch (error) {
        console.error("Error in resendVerificationCode controller:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await prisma.user.findUnique({ where: { email } });
        const user = userResult;
        if (!user) {
            return res.status(400).json({ message: "Invalid Credentials" });
        }
        
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid Credentials" });
        }

        // Allow login regardless of email verification status
        generateToken(user.id, user.role, res);
        res.status(200).json({
            role: user.role,
            _id: user.id,
            fullName: user.fullName,
            email: user.email,
        });
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const createModerator = async (req, res) => {
    const { fullName, email } = req.body;
    try {
        if (!fullName || !email) {
            return res.status(400).json({ message: "Full name and email are required" });
        }
        
        const password = req.body.password || crypto.randomBytes(6).toString('hex');

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = await prisma.user.create({
            data: {
                role: 'moderator',
                fullName,
                email,
                password: hashedPassword,
                isEmailVerified: true, // Admin-created moderators are pre-verified
                emailVerificationToken: null,
                emailVerificationExpires: null
            },
            select: {
                id: true,
                role: true,
                fullName: true,
                email: true,
                created_at: true
            }
        });
        
        // Send moderator role assignment email to new moderator (non-blocking)
        sendModeratorRoleEmail(result.email, result.fullName, password)
            .then(() => {
                console.log(`Moderator role assignment email sent to: ${result.email}`);
            })
            .catch((error) => {
                console.error('Failed to send moderator role assignment email:', error);
            });
        
        res.status(201).json({
            _id: result.id,
            role: result.role,
            fullName: result.fullName,
            email: result.email,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        console.log("Error in logout controller", error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
export const googleAuth = async (req, res) => {
    const { id_token } = req.body;
    
    if(!id_token){
        return res.status(400).json({ message: "ID token is missing" });
    }
    
    try {
        const ticket = await client.verifyIdToken({
            idToken: id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;

        let userResult = await prisma.user.findUnique({ where: { email } });
        let user = userResult;

        if(!user){
            const insertResult = await prisma.user.create({
                data: {
                    role: 'user',
                    fullName: name,
                    email,
                    password: 'google-oauth',
                    isEmailVerified: true, // Google users are already verified
                    emailVerificationToken: null,
                    emailVerificationExpires: null
                },
                select: {
                    id: true,
                    role: true,
                    fullName: true,
                    email: true,
                    created_at: true
                }
            });
            user = insertResult;
            
            // Google OAuth users are already verified, so no welcome email needed
            console.log(`Google OAuth user account created: ${user.email}`);
        }
        
        const token = jwt.sign(
            { userID: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        generateToken(user.id, user.role, res);
        
        const responseData = {
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
            },  
        };
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error("Error in googleAuth controller:", error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const userResult = await prisma.user.findUnique({ where: { email } });
        const user = userResult;
        if (!user) {
            return res.status(404).json({ message: 'User is not registered' });
        }

        const resetToken = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        await sendPasswordResetEmail(email, resetToken);
        res.status(200).json({ message: 'Password reset link sent to your email.' });
    } catch (error) {
        console.log('Error in forgotPassword controller', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ message: 'Token and password are required.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.status(200).json({ message: 'Password has been reset successfully.' });
    } catch (error) {
        console.log('Error in resetPassword controller', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'Reset token has expired.' });
        }
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const me = async (req, res) => {
    try {
        // User is already authenticated by authMiddleware
        // Just return the user data from the request object
        res.status(200).json({
            _id: req.user.id,
            role: req.user.role,
            fullName: req.user.fullName,
            email: req.user.email
        });
    } catch (error) {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

export const getAllUsers = async (req, res) => {
  try {
    // Base users
    const users = await prisma.user.findMany({
      select: { id: true, fullName: true, email: true, role: true }
    });

    // Build per-user accuracy from StudentActivity
    const activities = await prisma.studentActivity.findMany({
      where: { selectedAnswer: { not: null } },
      include: { question: { select: { correctAnswers: true } } }
    });

    const userStats = new Map();
    activities.forEach(a => {
      if (!userStats.has(a.sid)) userStats.set(a.sid, { attempted: 0, correct: 0 });
      const stats = userStats.get(a.sid);
      stats.attempted += 1;
      if (Array.isArray(a.question.correctAnswers) && a.question.correctAnswers.includes(a.selectedAnswer)) stats.correct += 1;
    });

    const usersWithScore = users.map(u => {
      const stats = userStats.get(u.id);
      const score = stats && stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : null;
      return { ...u, score };
    });

    res.json({ users: usersWithScore });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: 'user' } });
    const totalModerators = await prisma.user.count({ where: { role: 'moderator' } });
    const totalTests = await prisma.testSeries.count();

    // Success rate: average user accuracy from StudentActivity
    const activities = await prisma.studentActivity.findMany({
      where: { selectedAnswer: { not: null } },
      include: { question: { select: { correctAnswers: true } } }
    });

    const userStats = new Map();
    activities.forEach(a => {
      if (!userStats.has(a.sid)) userStats.set(a.sid, { attempted: 0, correct: 0 });
      const stats = userStats.get(a.sid);
      stats.attempted += 1;
      if (Array.isArray(a.question.correctAnswers) && a.question.correctAnswers.includes(a.selectedAnswer)) stats.correct += 1;
    });

    const userAccuracies = Array.from(userStats.values()).map(s => (s.attempted > 0 ? (s.correct / s.attempted) * 100 : 0));
    const successRate = userAccuracies.length
      ? Math.round(userAccuracies.reduce((sum, v) => sum + v, 0) / userAccuracies.length)
      : 0;

    res.json({ totalUsers, totalModerators, totalTests, successRate });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getModerators = async (req, res) => {
  try {
    const moderators = await prisma.user.findMany({
      where: { role: 'moderator' },
      select: {
        id: true,
        fullName: true,
        email: true,
        testSeries: {
          select: { startTime: true } 
        }
      }
    });

    const result = moderators.map(m => {
      const testsCreated = m.testSeries.length;
      let lastActive = null;
      if (testsCreated > 0) {
        lastActive = m.testSeries.reduce(
          (latest, t) => t.startTime > latest ? t.startTime : latest,
          m.testSeries[0].startTime
        );
      }
      const status = testsCreated > 0 ? 'Active' : 'Inactive';
      return {
        id: m.id,
        name: m.fullName,
        email: m.email,
        status,
        testsCreated,
        lastActive
      };
    });

    res.json({ moderators: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getUserAnalytics = async (req, res) => {
  try {
    // Example: join user and activity tables, adjust as per your schema
    const analytics = await prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        activities: true // or join with your activity table
      }
    });
    res.json({ analytics });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getActivityLogs = async (req, res) => {
  try {
    const logs = await prisma.activity.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const deleteModerator = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if the user exists and is a moderator
    const moderator = await prisma.user.findFirst({
      where: { 
        id: parseInt(id),
        role: 'moderator'
      }
    });

    if (!moderator) {
      return res.status(404).json({ message: 'Moderator not found' });
    }

    // Delete the moderator
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Moderator deleted successfully' });
  } catch (error) {
    console.error('Error deleting moderator:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

