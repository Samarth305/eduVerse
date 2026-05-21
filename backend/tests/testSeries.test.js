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

// MOCK the notification service so it doesn't crash trying to use WebSockets
app.set('notificationService', {
    broadcast: jest.fn(),
    createNotification: jest.fn()
});

app.use(express.json());
app.use(cookieParser());
app.use("/api/testseries", testSeriesRoutes);

describe("Test Series (Contest) API", () => {
    let adminToken;
    let studentToken;
    let adminId;
    let studentId;
    let adminCookie;
    let studentCookie;

    beforeEach(async () => {
        await prisma.studentActivity.deleteMany();
        await prisma.participation.deleteMany();
        await prisma.testSeries.deleteMany();
        await prisma.user.deleteMany(); 
        
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        // Create Admin
        const admin = await prisma.user.create({
            data: { email: 'admin@placeprep.com', password: hashedPassword, fullName: 'Admin User', role: 'admin', isEmailVerified: true }
        });
        adminId = admin.id;
        
        // Create Student
        const student = await prisma.user.create({
            data: { email: 'student@placeprep.com', password: hashedPassword, fullName: 'Normal Student', role: 'user', isEmailVerified: true }
        });
        studentId = student.id;

        // Generate tokens to simulate being logged in (since we aren't using the auth routes here)
        adminToken = jwt.sign({ userID: admin.id, role: admin.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        studentToken = jwt.sign({ userID: student.id, role: student.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });

        adminCookie = `jwt=${adminToken}`;
        studentCookie = `jwt=${studentToken}`;
    });

    describe("POST /api/testseries (Contest Creation)", () => {
        it("should allow an admin to create a new contest", async () => {
            // First, create some raw questions in the DB that the admin can link to the contest
            const q1 = await prisma.question.create({
                data: { category: "Aptitude", subcategory: "Math", level: "easy", question: "2+2?", options: ["3", "4", "5"], correctAnswers: ["4"], explanation: "Basic math", createdBy: adminId }
            });

            const response = await request(app)
                .post("/api/testseries")
                .set('Cookie', adminCookie)
                .send({
                    title: "Automated Math Contest",
                    startTime: new Date(Date.now() - 10000).toISOString(), // Started 10 seconds ago
                    endTime: new Date(Date.now() + 86400000).toISOString(), // Ends tomorrow
                    hasNegativeMarking: true,
                    negativeMarkingValue: 0.5,
                    questionIds: [q1.id] // Correct payload format
                });
            
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("testSeries");
            expect(response.body.testSeries.title).toBe("Automated Math Contest");
        });

        it("should prevent a normal student from creating a contest", async () => {
            const response = await request(app)
                .post("/api/testseries")
                .set('Cookie', studentCookie)
                .send({ title: "Hacker Contest", startTime: new Date(), endTime: new Date() });
            
            expect(response.status).toBe(403);
        });
    });

    describe("Student Submission & Leaderboard (Core Logic)", () => {
        let contestId;
        
        beforeEach(async () => {
            // Create a live contest for the student to take
            const contest = await prisma.testSeries.create({
                data: {
                    title: "Live Exam",
                    startTime: new Date(Date.now() - 3600000), // Started 1 hour ago
                    endTime: new Date(Date.now() + 3600000), // Ends in 1 hour
                    hasNegativeMarking: true,
                    negativeMarkingValue: 0.5,
                    createdBy: adminId, // Fixed: Using correct schema field
                    questions: {
                        create: [
                            { category: "Aptitude", subcategory: "Math", level: "easy", explanation: "Test", createdBy: adminId, question: "Q1", options: ["A", "B"], correctAnswers: ["A"] },
                            { category: "Aptitude", subcategory: "Math", level: "easy", explanation: "Test", createdBy: adminId, question: "Q2", options: ["A", "B"], correctAnswers: ["B"] }
                        ]
                    }
                },
                include: { questions: true }
            });
            contestId = contest.id;

            // Student "joins" the contest first
            await prisma.participation.create({
                data: {
                    sid: studentId,
                    testSeriesId: contestId,
                    practiceTest: false,
                    contest: true,
                    startTime: new Date(Date.now() - 60000) // Started 1 min ago
                }
            });
        });

        it("should calculate correct finalScore and negative marks upon submission", async () => {
            // Fetch questions to get their IDs
            const contest = await prisma.testSeries.findUnique({ where: { id: contestId }, include: { questions: true } });
            
            // Student submits: 1 correct, 1 wrong
            const answers = [
                { questionId: contest.questions[0].id, selectedOption: "A" }, // Correct
                { questionId: contest.questions[1].id, selectedOption: "A" }  // Wrong (Correct is B)
            ];

            const response = await request(app)
                .post(`/api/testseries/${contestId}/submit`)
                .set('Cookie', studentCookie)
                .send({ answers });

            expect(response.status).toBe(200);

            // Verify the new Database fields we added during our optimization!
            const participation = await prisma.participation.findFirst({ where: { sid: studentId, testSeriesId: contestId } });
            
            expect(participation.attempted).toBe(2);
            expect(participation.correct).toBe(1);
            expect(participation.negativeMarks).toBe(0.5); // 1 wrong * 0.5 negative ratio
            expect(participation.finalScore).toBe(0.5); // 1 correct - 0.5 negative = 0.5
        });

        it("should fetch the O(1) leaderboard successfully", async () => {
            const response = await request(app)
                .get(`/api/testseries/${contestId}/leaderboard`)
                .set('Cookie', studentCookie);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty("leaderboard");
        });
    });

    describe("GET /api/testseries/stats/all (Admin Analytics)", () => {
        it("should return global stats for admins using our O(1) optimization", async () => {
            const response = await request(app)
                .get("/api/testseries/stats/all")
                .set('Cookie', adminCookie);
            
            expect(response.status).toBe(200);
            // It returns an array of stats objects
            expect(Array.isArray(response.body)).toBe(true);
        });

        it("should forbid normal students from viewing global stats", async () => {
            const response = await request(app)
                .get("/api/testseries/stats/all")
                .set('Cookie', studentCookie);
            
            expect(response.status).toBe(403);
        });
    });
});
