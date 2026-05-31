import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });
      this.logger.log('SMTP Transport configured successfully');
    } else {
      this.logger.warn('SMTP credentials not found. Emails will be logged to console instead of sent.');
    }
  }

  async sendVerificationEmail(to: string, token: string) {
    const from = this.configService.get<string>('FROM_EMAIL') || 'noreply@civiceye.app';
    const clientUrl = this.configService.get<string>('ALLOWED_ORIGINS')?.split(',')[0] || 'https://civiceye.app';
    
    // Create the verification URL. In production, this should point to a frontend route
    // that captures the token and calls the backend verify API.
    const verifyUrl = `${clientUrl}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"Civic Eye" <${from}>`,
      to,
      subject: 'Verify your Civic Eye Email',
      text: `Welcome to Civic Eye! Please verify your email by clicking the following link: ${verifyUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome to Civic Eye!</h2>
          <p>Thank you for registering. Please verify your email address to unlock all features.</p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 10px 20px; color: white; background-color: #2563eb; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    };

    if (this.transporter) {
      try {
        await this.transporter.sendMail(mailOptions);
        this.logger.log(`Verification email sent to ${to}`);
      } catch (error) {
        this.logger.error(`Failed to send email to ${to}`, error);
        // Optionally, throw the error if you want to fail the registration process
      }
    } else {
      // Mock email sending
      this.logger.debug(`[MOCK EMAIL] To: ${to}`);
      this.logger.debug(`[MOCK EMAIL] Subject: ${mailOptions.subject}`);
      this.logger.debug(`[MOCK EMAIL] Verification Link: ${verifyUrl}`);
    }
  }
}
