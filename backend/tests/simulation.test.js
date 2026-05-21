import request from "supertest";
import testSeriesRoutes from "../src/routes/testSeries.routes.js";
import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const app = express();

app.set('notificationService', {
    broadcast: jest.fn(),
    createNotification: jest.fn(),
    notifyHighScore: jest.fn(),
    notifyContestAnnounced: jest.fn()
});

app.use(express.json());
app.use(cookieParser());
app.use("/api/testseries", testSeriesRoutes);

describe("Massive Integration Stress Test", () => {
    let adminId, adminCookie;
    let moderators = [];
    let students = [];
    let contestId;
    let q1, q2, q3;

    // We use a longer timeout because creating 13 users + relations takes more than 5 seconds
    jest.setTimeout(30000); 

    beforeAll(async () => {
        // Clean slate
        await prisma.studentActivity.deleteMany();
        await prisma.participation.deleteMany();
        await prisma.testSeries.deleteMany();
        await prisma.question.deleteMany();
        await prisma.user.deleteMany();

        const hashedPassword = await bcrypt.hash('password123', 10);

        // 1. Create Admin
        const admin = await prisma.user.create({
            data: { email: 'admin_stress@test.com', password: hashedPassword, fullName: 'Admin', role: 'admin', isEmailVerified: true }
        });
        adminId = admin.id;
        const adminToken = jwt.sign({ userID: admin.id, role: admin.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        adminCookie = `jwt=${adminToken}`;

        // 2. Create 2 Moderators
        for (let i = 1; i <= 2; i++) {
            const mod = await prisma.user.create({
                data: { email: `mod${i}@test.com`, password: hashedPassword, fullName: `Mod ${i}`, role: 'moderator', isEmailVerified: true }
            });
            const modToken = jwt.sign({ userID: mod.id, role: mod.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
            moderators.push({ id: mod.id, cookie: `jwt=${modToken}` });
        }

        // 3. Create 10 Students
        for (let i = 1; i <= 10; i++) {
            const student = await prisma.user.create({
                data: { email: `student${i}@test.com`, password: hashedPassword, fullName: `Student ${i}`, role: 'user', isEmailVerified: true }
            });
            const studentToken = jwt.sign({ userID: student.id, role: student.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
            students.push({ id: student.id, cookie: `jwt=${studentToken}` });
        }

        // Create 3 baseline questions
        q1 = await prisma.question.create({ data: { category: "Aptitude", subcategory: "Math", level: "medium", question: "10+10", options: ["10", "20", "30"], correctAnswers: ["20"], explanation: "x", createdBy: adminId }});
        q2 = await prisma.question.create({ data: { category: "Aptitude", subcategory: "Math", level: "medium", question: "20+20", options: ["20", "40", "60"], correctAnswers: ["40"], explanation: "x", createdBy: adminId }});
        q3 = await prisma.question.create({ data: { category: "Aptitude", subcategory: "Math", level: "medium", question: "Is the sky blue?", options: ["Yes", "No"], correctAnswers: ["No"], explanation: "A trick question that the admin will fix later", createdBy: adminId }});
    });

    it("Step 1: Admin creates the contest", async () => {
        const response = await request(app)
            .post("/api/testseries")
            .set('Cookie', adminCookie)
            .send({
                title: "Stress Test Exam",
                startTime: new Date(Date.now() - 3600000).toISOString(), // Started 1 hour ago
                endTime: new Date(Date.now() + 3600000).toISOString(), // Ends in 1 hour
                hasNegativeMarking: true,
                negativeMarkingValue: 0.5,
                questionIds: [q1.id, q2.id, q3.id]
            });
        
        expect(response.status).toBe(201);
        contestId = response.body.testSeries.id;
    });

    it("Step 2: Admin updates the contest time in between", async () => {
        const response = await request(app)
            .put(`/api/testseries/${contestId}/extend`)
            .set('Cookie', adminCookie)
            .send({ extensionMinutes: 30 });
        
        expect(response.status).toBe(200);
        expect(response.body.message).toMatch(/extended/);
    });

    it("Step 3: All 10 students join and submit concurrently", async () => {
        // We will make 10 parallel API requests to simulate heavy traffic
        const submissions = students.map((student, index) => {
            // Force students to "join" the DB first so violations/submissions work
            return prisma.participation.create({
                data: {
                    sid: student.id,
                    testSeriesId: contestId,
                    practiceTest: false,
                    contest: true,
                    startTime: new Date()
                }
            }).then(() => {
                // Determine answers based on student index (some get 100%, some fail)
                const isEven = index % 2 === 0;
                const answers = [
                    { questionId: q1.id, selectedOption: isEven ? "20" : "10" }, // Evens right, Odds wrong
                    { questionId: q2.id, selectedOption: isEven ? "40" : "20" },
                    { questionId: q3.id, selectedOption: "No" } // Everyone gets the "trick" question right... for now
                ];

                return request(app)
                    .post(`/api/testseries/${contestId}/submit`)
                    .set('Cookie', student.cookie)
                    .send({ answers });
            });
        });

        // Await all 10 simultaneous submissions
        const results = await Promise.all(submissions);
        
        // Assert they all succeeded
        results.forEach(res => {
            expect(res.status).toBe(200);
        });
    });

    it("Step 4: Check the leaderboard for all 10 students", async () => {
        const response = await request(app)
            .get(`/api/testseries/${contestId}/leaderboard`)
            .set('Cookie', students[0].cookie);
        
        expect(response.status).toBe(200);
        expect(response.body.leaderboard.length).toBe(10);
    });

    it("Step 5: Fix broken question and recalculate globals!", async () => {
        // Admin realizes Q3 answer was actually "Yes" and updates DB
        await prisma.question.update({
            where: { id: q3.id },
            data: { correctAnswers: ["Yes"] }
        });

        // Admin triggers recalculation
        const recalcResponse = await request(app)
            .post(`/api/testseries/${contestId}/recalculate-results`)
            .set('Cookie', adminCookie);
        
        expect(recalcResponse.status).toBe(200);
        expect(recalcResponse.body.updatedCount).toBe(10); // Recalculated 10 participations

        // Verify that Final Scores shifted! Everyone answered "No", so everyone's score should have DROPPED
        const leaderboardResponse = await request(app)
            .get(`/api/testseries/${contestId}/leaderboard`)
            .set('Cookie', adminCookie);
        
        const topStudent = leaderboardResponse.body.leaderboard[0];
        
        // Previously, Evens got Q1(1) + Q2(1) + Q3(1) = 3 correct.
        // After fix, they got Q3 WRONG, so: 2 correct. 1 wrong. 
        // 2 - (0.5 negative marks) = 1.5 finalScore.
        expect(topStudent.finalScore).toBe(1.5);
    });
});
