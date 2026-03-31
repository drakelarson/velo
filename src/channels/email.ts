import nodemailer from "nodemailer";
import { Agent } from "../agent.ts";

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export function createEmailChannel(agent: Agent, config: EmailConfig) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  // For receiving emails, you'd need an IMAP watcher
  // This is a simplified version that handles sending replies

  const sendReply = async (to: string, subject: string, body: string) => {
    await transporter.sendMail({
      from: config.user,
      to,
      subject: `Re: ${subject}`,
      text: body,
    });
  };

  // Process an incoming email (you'd call this from an IMAP watcher)
  const processEmail = async (from: string, subject: string, body: string) => {
    // Extract email address
    const emailMatch = from.match(/<(.+?)>/);
    const email = emailMatch?.[1] || from;

    agent.setSession(`email:${email}`);

    const response = await agent.process(`Subject: ${subject}\n\n${body}`);
    await sendReply(email, subject, response);

    return response;
  };

  return {
    sendReply,
    processEmail,
    transporter,
  };
}