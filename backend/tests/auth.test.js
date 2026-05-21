import request from "supertest";
import authRoutes from "../src/routes/auth.routes.js";
import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { jest } from '@jest/globals';

// MOCK the email service so tests don't send real emails or leave dangling promises!
jest.mock('../src/lib/emailService.js', () => ({
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendModeratorRoleEmail: jest.fn().mockResolvedValue(true)
}));

const prisma = new PrismaClient();
const app = express();

// Required middleware for testing auth
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

describe("Authentication API", () => {
    
    beforeEach(async () => {
        await prisma.user.deleteMany(); // Reset state
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        await prisma.user.create({
            data: {
                email: 'test@student.com',
                password: hashedPassword,
                fullName: 'Test Student',
                role: 'user',
                isEmailVerified: true
            }
        });
    });

    describe("POST /api/auth/signup", () => {
        it("should create a new user successfully and require verification", async () => {
            const response = await request(app).post("/api/auth/signup").send({
                fullName: "New User",
                email: "new@student.com",
                password: "password123"
            });
            
            // Should return 201 Created and NOT send a cookie yet
            expect(response.status).toBe(201);
            expect(response.body.requiresVerification).toBe(true);
            expect(response.body.email).toBe("new@student.com");

            // Verify in DB
            const dbUser = await prisma.user.findUnique({ where: { email: "new@student.com" } });
            expect(dbUser).not.toBeNull();
            expect(dbUser.isEmailVerified).toBe(false);

            // Wait for the background email service promise (macrotask queue) to cleanly resolve so Jest doesn't complain about logs after teardown
            await new Promise(resolve => setTimeout(resolve, 250));
        });

        it("should reject signup if email already exists", async () => {
            const response = await request(app).post("/api/auth/signup").send({
                fullName: "Copycat",
                email: "test@student.com", // Already created in beforeEach
                password: "password123"
            });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Email already exists/i);
        });
    });

    describe("POST /api/auth/login", () => {
        it("should login with valid credentials", async () => {
            const response = await request(app).post("/api/auth/login").send({
                email: 'test@student.com',
                password: 'password123'
            });
            expect(response.status).toBe(200);
            expect(response.headers['set-cookie']).toBeDefined();
            expect(response.body.email).toBe('test@student.com');
        });

        it("should reject login with incorrect password", async () => {
            const response = await request(app).post('/api/auth/login').send({
                email: 'test@student.com',
                password: 'wrongpassword'
            });
            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Invalid Credentials');
        });
    });

    describe("GET /api/auth/me & RBAC", () => {
        it("should allow access to /me with valid cookie", async () => {
            // First, login to get the cookie
            const loginRes = await request(app).post("/api/auth/login").send({
                email: 'test@student.com',
                password: 'password123'
            });
            const cookies = loginRes.headers['set-cookie'];

            // Then, hit /me using that cookie
            const meRes = await request(app).get("/api/auth/me").set('Cookie', cookies);
            expect(meRes.status).toBe(200);
            expect(meRes.body.email).toBe('test@student.com');
        });

        it("should reject normal users from accessing Admin routes (RBAC)", async () => {
            // Login as normal user
            const loginRes = await request(app).post("/api/auth/login").send({
                email: 'test@student.com',
                password: 'password123'
            });
            const cookies = loginRes.headers['set-cookie'];

            // Try to hit admin stats
            const adminRes = await request(app).get("/api/auth/admin/stats").set('Cookie', cookies);
            
            // Should be 403 Forbidden because they are 'user', not 'admin'
            expect(adminRes.status).toBe(403);
            expect(adminRes.body.message).toMatch(/forbidden|unauthorized|admin/i);
        });
    });
});