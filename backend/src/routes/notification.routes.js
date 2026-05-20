import express from 'express';
import { PrismaClient } from '@prisma/client';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get notification service from app
const getNotificationService = (req) => {
  return req.app.get('notificationService');
};

// Test notification route (for demonstration)
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const notificationService = getNotificationService(req);
    if (!notificationService) {
      return res.status(500).json({ message: 'Notification service not available' });
    }

    const { type, message } = req.body;
    
    let notification;
    switch (type) {
      case 'contest':
        notification = {
          title: 'Test Contest Notification',
          message: message || 'This is a test contest notification',
          type: 'CONTEST_ANNOUNCED',
          data: { contestId: 1, contestTitle: 'Test Contest' }
        };
        break;
      case 'result':
        notification = {
          title: 'Test Result Notification',
          message: message || 'This is a test result notification',
          type: 'RESULT_AVAILABLE',
          data: { resultId: 1, title: 'Test Result' }
        };
        break;
      case 'system':
        notification = {
          title: 'Test System Update',
          message: message || 'This is a test system update',
          type: 'SYSTEM_UPDATE',
          data: {}
        };
        break;
      default:
        notification = {
          title: 'Test Notification',
          message: message || 'This is a test notification',
          type: 'GENERAL',
          data: {}
        };
    }

    await notificationService.sendToUser(req.user.id, notification);
    res.json({ message: 'Test notification sent successfully' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ message: 'Failed to send test notification' });
  }
});

// Get user notifications
router.get('/user', authMiddleware, async (req, res) => {
  try {
    console.log(`[Debug Notif] Fetching notifications for user ID: ${req.user.id} (${req.user.email})`);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    console.log(`[Debug Notif] Found ${notifications.length} notifications in database for user ID: ${req.user.id}`);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await prisma.notification.update({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id
      },
      data: {
        isRead: true
      }
    });

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

// Get unread notification count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    console.log(`[Debug Notif] Fetching unread count for user ID: ${req.user.id}`);
    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    });
    console.log(`[Debug Notif] Unread count for user ID: ${req.user.id} is ${count}`);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ message: 'Failed to fetch unread count' });
  }
});

// Delete notification
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.delete({
      where: {
        id: parseInt(req.params.id),
        userId: req.user.id
      }
    });

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

export default router; 