import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendContactFormEmail } from '../services/email.service';
import { createLogger } from '../config/utils/logger';
import { rateLimit } from 'express-rate-limit';
import { isLikelySpam } from '../config/utils/email-validation';

const router = Router();
const logger = createLogger('contact.routes');

const contactFormSchema = z.object({
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(100),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  subject: z.string().min(3, 'Betreff muss mindestens 3 Zeichen lang sein').max(200),
  message: z.string().min(10, 'Nachricht muss mindestens 10 Zeichen lang sein').max(5000),
  // Honeypot field - should be empty
  website: z.string().optional(),
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', contactLimiter, async (req: Request, res: Response) => {
  try {
    const validation = contactFormSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validierungsfehler',
        details: validation.error.issues.map((e: z.ZodIssue) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const { name, email, subject, message, website } = validation.data;

    // Honeypot check - if filled, it's a bot
    if (website && website.trim() !== '') {
      logger.warn('Honeypot triggered', { email, name });
      // Return success to not reveal the honeypot
      return res.status(200).json({
        success: true,
        message: 'Ihre Nachricht wurde erfolgreich gesendet. Wir melden uns in Kürze bei Ihnen.',
      });
    }

    // Check if CONTACT_EMAIL is configured
    const contactRecipient = process.env.CONTACT_EMAIL?.trim();
    if (!contactRecipient) {
      logger.error('CONTACT_EMAIL not configured');
      return res.status(503).json({
        success: false,
        error: 'Kontaktformular ist momentan nicht verfügbar. Bitte schreiben Sie uns direkt an info@simplyseat.de.',
      });
    }

    // Spam detection
    const spamCheck = isLikelySpam(email, message);
    if (spamCheck.isSpam) {
      logger.warn('Spam detected in contact form', { 
        email, 
        name, 
        reason: spamCheck.reason 
      });
      return res.status(400).json({
        success: false,
        error: spamCheck.reason || 'Ihre Nachricht konnte nicht gesendet werden.',
      });
    }

    logger.info('Contact form submission received', { 
      name, 
      email, 
      subject: subject.slice(0, 50) 
    });

    const emailSent = await sendContactFormEmail(name, email, subject, message);

    if (!emailSent) {
      logger.error('Failed to send contact form email', { name, email });
      return res.status(500).json({
        success: false,
        error: 'Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut oder schreiben Sie uns direkt an info@simplyseat.de.',
      });
    }

    logger.info('Contact form email sent successfully', { name, email });

    return res.status(200).json({
      success: true,
      message: 'Ihre Nachricht wurde erfolgreich gesendet. Wir melden uns in Kürze bei Ihnen.',
    });
  } catch (err) {
    logger.error('Unexpected error in contact form', err);
    return res.status(500).json({
      success: false,
      error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
    });
  }
});

export default router;
