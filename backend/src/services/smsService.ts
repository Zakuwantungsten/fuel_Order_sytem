import logger from '../utils/logger';

interface SMSOptions {
  to: string;
  message: string;
}

/**
 * SMS Service for sending text messages
 * Currently uses console logging for development
 * Can be extended to use Twilio, AWS SNS, or other SMS providers
 */
class SMSService {
  /**
   * Send SMS message
   * @param options SMS options including recipient and message
   */
  async send(options: SMSOptions): Promise<void> {
    const { to, message } = options;
    
    try {
      // TODO: Integrate with actual SMS provider (Twilio, AWS SNS, etc.)
      // For now, log to console for development/testing
      logger.info(`[SMS Service] Sending SMS to ${to}`);
      logger.info(`[SMS Service] Message: ${message}`);
      
      // Simulate SMS send delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // In production, uncomment and configure your SMS provider:
      /*
      // Example with Twilio:
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      
      const client = require('twilio')(accountSid, authToken);
      
      await client.messages.create({
        body: message,
        from: fromNumber,
        to: to,
      });
      */
      
      logger.info(`[SMS Service] SMS sent successfully to ${to}`);
    } catch (error: any) {
      logger.error(`[SMS Service] Failed to send SMS to ${to}: ${error.message}`);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }
}

// Export singleton instance
const smsService = new SMSService();

/**
 * Convenience function to send SMS
 */
export const sendSMS = (options: SMSOptions) => smsService.send(options);

export default smsService;
