import nodemailer from 'nodemailer';
import { emailQueue } from '../queues/email.queue.js';

// Create transporter
const createTransporter = () => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
    console.log('Email sending will be skipped due to missing credentials');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS 
    }
  });
};

// Send welcome email to new users
export const _sendWelcomeEmail = async (email, fullName) => {
  try {
    const transporter = createTransporter();
    
    // Skip email sending if transporter is null (missing credentials)
    if (!transporter) {
      return;
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to EduVerse - Your Success Journey Begins',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to EduVerse</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  
                  <!-- Header with Logo -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 1px;">Welcome to EduVerse</h1>
                      <p style="color: #e3f2fd; margin: 10px 0 0 0; font-size: 16px; font-weight: 300;">Your Gateway to Success</p>
                    </td>
                  </tr>

                  <!-- Welcome Message -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Hello ${fullName},</h2>
                      <p style="color: #555555; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">
                        Welcome to EduVerse! We're thrilled to have you join our community of learners and achievers. Your journey towards professional excellence starts now.
                      </p>
                      <p style="color: #555555; margin: 0 0 30px 0; font-size: 16px; line-height: 1.6;">
                        At EduVerse, we provide comprehensive preparation resources, live contests, and personalized learning experiences to help you achieve your career goals.
                      </p>
                    </td>
                  </tr>

                  <!-- Features Grid -->
                  <tr>
                    <td style="padding: 0 30px 30px 30px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td style="padding: 0 10px 20px 0; width: 50%;">
                            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #007bff; height: 100%;">
                              <div style="font-size: 28px; margin-bottom: 15px;">🎯</div>
                              <h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Live Contests</h3>
                              <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.5;">Participate in real-time competitions and benchmark your skills against peers.</p>
                            </div>
                          </td>
                          <td style="padding: 0 0 20px 10px; width: 50%;">
                            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #28a745; height: 100%;">
                              <div style="font-size: 28px; margin-bottom: 15px;">📚</div>
                              <h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Practice Resources</h3>
                              <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.5;">Access comprehensive question banks and study materials.</p>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 0 10px 0 0; width: 50%;">
                            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #ffc107; height: 100%;">
                              <div style="font-size: 28px; margin-bottom: 15px;">📊</div>
                              <h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Progress Tracking</h3>
                              <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.5;">Monitor your performance and track improvement over time.</p>
                            </div>
                          </td>
                          <td style="padding: 0 0 0 10px; width: 50%;">
                            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #dc3545; height: 100%;">
                              <div style="font-size: 28px; margin-bottom: 15px;">🔔</div>
                              <h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Smart Notifications</h3>
                              <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.5;">Stay updated with new contests and important announcements.</p>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Call to Action -->
                  <tr>
                    <td style="padding: 0 30px 40px 30px; text-align: center;">
                      <a href="${frontendUrl}" 
                         style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                        Get Started Now
                      </a>
                    </td>
                  </tr>

                  <!-- Support Section -->
                  <tr>
                    <td style="padding: 0 30px 40px 30px;">
                      <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center;">
                        <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">Need Assistance?</h3>
                        <p style="color: #666666; margin: 0; font-size: 15px; line-height: 1.6;">
                          Our support team is here to help you succeed. Don't hesitate to reach out if you have any questions or need guidance.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                      <p style="color: #bdc3c7; margin: 0 0 10px 0; font-size: 14px;">
                        © ${new Date().getFullYear()} EduVerse. All rights reserved.
                      </p>
                      <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                        This email was sent to ${email}. If you didn't create an account, please ignore this email.
                      </p>
                      <div style="margin-top: 20px;">
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Privacy Policy</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Terms of Service</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Contact Us</a>
                      </div>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent successfully to: ${email}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

// Send password reset email
export const _sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const transporter = createTransporter();
    
    // Skip email sending if transporter is null (missing credentials)
    if (!transporter) {
      console.log('Skipping password reset email due to missing credentials');
      return;
    }

    // Generate the complete reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your EduVerse Password',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  
                  <!-- Header with Logo -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 1px;">Password Reset</h1>
                      <p style="color: #e3f2fd; margin: 10px 0 0 0; font-size: 16px; font-weight: 300;">Secure Your Account</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
                      <p style="color: #555555; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">
                        We received a request to reset your password for your EduVerse account. If you didn't make this request, you can safely ignore this email.
                      </p>
                      <p style="color: #555555; margin: 0 0 30px 0; font-size: 16px; line-height: 1.6;">
                        To reset your password, click the button below. This link will expire in <strong>1 hour</strong> for security purposes.
                      </p>
                      
                      <!-- Reset Button -->
                      <div style="text-align: center; margin: 40px 0;">
                        <a href="${resetLink}" 
                           style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                          Reset Password
                        </a>
                      </div>
                      
                      <!-- Alternative Link -->
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0;">
                        <p style="color: #666666; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">
                          If the button doesn't work, copy and paste this link into your browser:
                        </p>
                        <p style="color: #007bff; margin: 0; font-size: 14px; word-break: break-all; line-height: 1.4;">
                          ${resetLink}
                        </p>
                      </div>
                      
                      <!-- Security Notice -->
                      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 30px 0;">
                        <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                          <strong>Security Notice:</strong> This link will expire in 1 hour. If you need to reset your password after that, please request a new reset link.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                      <p style="color: #bdc3c7; margin: 0 0 10px 0; font-size: 14px;">
                        © ${new Date().getFullYear()} EduVerse. All rights reserved.
                      </p>
                      <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                        This email was sent to ${email}. If you didn't request a password reset, please ignore this email.
                      </p>
                      <div style="margin-top: 20px;">
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Privacy Policy</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Terms of Service</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Contact Us</a>
                      </div>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}; 

// Send email verification email
export const _sendEmailVerificationEmail = async (email, fullName, verificationCode) => {
  try {
    const transporter = createTransporter();
    
    // Skip email sending if transporter is null (missing credentials)
    if (!transporter) {
      console.log('Skipping email verification email due to missing credentials');
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your EduVerse Email Address',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  
                  <!-- Header with Logo -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 1px;">Email Verification</h1>
                      <p style="color: #e3f2fd; margin: 10px 0 0 0; font-size: 16px; font-weight: 300;">Complete Your Registration</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Hello ${fullName},</h2>
                      <p style="color: #555555; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">
                        Thank you for signing up with EduVerse! To complete your registration and access all features, please verify your email address.
                      </p>
                      <p style="color: #555555; margin: 0 0 30px 0; font-size: 16px; line-height: 1.6;">
                        Use the verification code below to verify your email address. This code will expire in <strong>10 minutes</strong> for security purposes.
                      </p>
                      
                      <!-- Verification Code -->
                      <div style="text-align: center; margin: 40px 0;">
                        <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #ffffff; padding: 30px; border-radius: 12px; display: inline-block; min-width: 200px;">
                          <h3 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 400; color: #e3f2fd;">Verification Code</h3>
                          <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                            ${verificationCode}
                          </div>
                        </div>
                      </div>
                      
                      <!-- Instructions -->
                      <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0;">
                        <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">How to Verify:</h3>
                        <ol style="color: #666666; margin: 0; padding-left: 20px; line-height: 1.8;">
                          <li>Copy the verification code above</li>
                          <li>Return to EduVerse and enter the code</li>
                          <li>Click "Verify Email" to complete registration</li>
                        </ol>
                      </div>
                      
                      <!-- Security Notice -->
                      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 30px 0;">
                        <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                          <strong>Security Notice:</strong> This verification code will expire in 10 minutes. If you need a new code, you can request one from your account settings.
                        </p>
                      </div>
                      
                      <p style="color: #555555; margin: 30px 0 0 0; font-size: 16px; line-height: 1.6;">
                        If you didn't create a EduVerse account, please ignore this email.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                      <p style="color: #bdc3c7; margin: 0 0 10px 0; font-size: 14px;">
                        © ${new Date().getFullYear()} EduVerse. All rights reserved.
                      </p>
                      <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                        This email was sent to ${email}. If you didn't create an account, please ignore this email.
                      </p>
                      <div style="margin-top: 20px;">
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Privacy Policy</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Terms of Service</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Contact Us</a>
                      </div>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email verification email sent successfully to: ${email}`);
  } catch (error) {
    console.error('Error sending email verification email:', error);
    throw error;
  }
}; 

// Send moderator role assignment email
export const _sendModeratorRoleEmail = async (email, fullName, password) => {
  try {
    const transporter = createTransporter();
    
    // Skip email sending if transporter is null (missing credentials)
    if (!transporter) {
      console.log('Skipping moderator role email due to missing credentials');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'You\'ve Been Assigned Moderator Role at EduVerse',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Moderator Role Assignment</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  
                  <!-- Header with Logo -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 1px;">Moderator Role Assignment</h1>
                      <p style="color: #e3f2fd; margin: 10px 0 0 0; font-size: 16px; font-weight: 300;">Welcome to the Team</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #2c3e50; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Hello ${fullName},</h2>
                      <p style="color: #555555; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">
                        Congratulations! You have been assigned the <strong>Moderator</strong> role at EduVerse. As a moderator, you'll have access to create contests, manage questions, and help maintain the quality of our platform.
                      </p>
                      <p style="color: #555555; margin: 0 0 30px 0; font-size: 16px; line-height: 1.6;">
                        Your account has been created and is ready to use. Please find your login credentials below.
                      </p>
                      
                      <!-- Login Credentials -->
                      <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #28a745;">
                        <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">Your Login Credentials</h3>
                        <div style="margin-bottom: 15px;">
                          <strong style="color: #2c3e50;">Email:</strong>
                          <span style="color: #555555; margin-left: 10px;">${email}</span>
                        </div>
                        <div style="margin-bottom: 15px;">
                          <strong style="color: #2c3e50;">Password:</strong>
                          <span style="color: #555555; margin-left: 10px; font-family: 'Courier New', monospace;">${password}</span>
                        </div>
                        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #dee2e6;">
                          <p style="color: #666666; margin: 0; font-size: 14px; line-height: 1.5;">
                            <strong>Important:</strong> Please change your password after your first login for security purposes.
                          </p>
                        </div>
                      </div>
                      
                      <!-- Moderator Features -->
                      <div style="background-color: #e8f4fd; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #007bff;">
                        <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">Moderator Capabilities</h3>
                        <ul style="color: #555555; margin: 0; padding-left: 20px; line-height: 1.8;">
                          <li>Create and manage contests</li>
                          <li>Add and edit questions</li>
                          <li>Monitor contest results</li>
                          <li>Manage user activities</li>
                          <li>Access moderator dashboard</li>
                        </ul>
                      </div>
                      
                      <!-- Call to Action -->
                      <div style="text-align: center; margin: 40px 0;">
                        <a href="${frontendUrl}" 
                           style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                          Access Your Dashboard
                        </a>
                      </div>
                      
                      <!-- Security Notice -->
                      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 30px 0;">
                        <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                          <strong>Security Notice:</strong> Keep your login credentials secure and don't share them with anyone. If you suspect any unauthorized access, contact the admin immediately.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                      <p style="color: #bdc3c7; margin: 0 0 10px 0; font-size: 14px;">
                        © ${new Date().getFullYear()} EduVerse. All rights reserved.
                      </p>
                      <p style="color: #95a5a6; margin: 0; font-size: 12px;">
                        This email was sent to ${email}. If you didn't expect this email, please contact the admin.
                      </p>
                      <div style="margin-top: 20px;">
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Privacy Policy</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Terms of Service</a>
                        <span style="color: #7f8c8d;">|</span>
                        <a href="#" style="color: #3498db; text-decoration: none; margin: 0 10px; font-size: 12px;">Contact Us</a>
                      </div>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Moderator role assignment email sent successfully to: ${email}`);
  } catch (error) {
    console.error('Error sending moderator role assignment email:', error);
    throw error;
  }
}; 

// ==========================================
// BULLMQ FACADE FUNCTIONS
// These intercept the controller calls and route them to the queue instantly
// ==========================================

export const sendWelcomeEmail = async (email, fullName) => {
  await emailQueue.add('email-job', { type: 'WELCOME_EMAIL', payload: { email, fullName } });
};

export const sendPasswordResetEmail = async (email, resetToken) => {
  await emailQueue.add('email-job', { type: 'PASSWORD_RESET_EMAIL', payload: { email, resetToken } });
};

export const sendEmailVerificationEmail = async (email, fullName, verificationCode) => {
  await emailQueue.add('email-job', { type: 'VERIFICATION_EMAIL', payload: { email, fullName, verificationCode } });
};

export const sendModeratorRoleEmail = async (email, fullName, password) => {
  await emailQueue.add('email-job', { type: 'MODERATOR_ROLE_EMAIL', payload: { email, fullName, password } });
}; 