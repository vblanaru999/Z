import nodemailer from "nodemailer";
import { AppError } from "./errors";
import type { EmailStatus, EmailTransport } from "./types";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type SendResult =
  | { transport: "outbox"; status: "saved" }
  | { transport: "smtp"; status: "sent" }
  | { transport: "smtp"; status: "failed"; error: string };

export interface Mailer {
  send(message: EmailMessage): Promise<SendResult>;
}

export type SmtpConfig = {
  host: string;
  port: number;
  from: string;
  secure: boolean;
  auth?: { user: string; pass: string };
};

export type Env = Record<string, string | undefined>;

export type SmtpDelivery = (
  message: EmailMessage,
  config: SmtpConfig,
) => Promise<void>;

function trimmed(env: Env, key: string): string {
  return env[key]?.trim() ?? "";
}

/**
 * Full SMTP config, null when email is intentionally unconfigured (outbox),
 * or an error when only some of the required variables are set.
 */
export function resolveSmtp(env: Env): SmtpConfig | null {
  const host = trimmed(env, "SMTP_HOST");
  const portRaw = trimmed(env, "SMTP_PORT");
  const from = trimmed(env, "SMTP_FROM");
  const any = Boolean(host || portRaw || from);
  if (!any) return null;
  if (!host || !portRaw || !from) {
    throw new AppError(
      "SMTP is only partly configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM, or leave all three empty to use the outbox.",
    );
  }
  if (!/^\d+$/.test(portRaw)) {
    throw new AppError("SMTP_PORT must be a whole number.");
  }
  const port = Number(portRaw);
  if (port < 1 || port > 65535) {
    throw new AppError("SMTP_PORT must be between 1 and 65535.");
  }
  const secureRaw = trimmed(env, "SMTP_SECURE").toLowerCase();
  let secure: boolean;
  if (secureRaw === "true") secure = true;
  else if (secureRaw === "false") secure = false;
  else if (secureRaw === "") secure = port === 465;
  else throw new AppError("SMTP_SECURE must be true, false, or empty.");

  const user = trimmed(env, "SMTP_USER");
  const pass = env.SMTP_PASS ?? "";
  return {
    host,
    port,
    from,
    secure,
    auth: user ? { user, pass } : undefined,
  };
}

export function describeMailMode(env: Env): {
  mode: "outbox" | "smtp" | "invalid";
  detail: string;
} {
  try {
    const config = resolveSmtp(env);
    if (!config) {
      return {
        mode: "outbox",
        detail:
          "SMTP is not configured. Warning emails are saved in the app outbox and still count as the warning step.",
      };
    }
    return {
      mode: "smtp",
      detail: `Warning emails are sent through SMTP (${config.host}:${config.port}).`,
    };
  } catch (error) {
    return {
      mode: "invalid",
      detail: error instanceof Error ? error.message : "SMTP configuration is invalid.",
    };
  }
}

export async function deliverWithNodemailer(
  message: EmailMessage,
  config: SmtpConfig,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export function createMailer(
  env: Env,
  deliver: SmtpDelivery = deliverWithNodemailer,
): Mailer {
  return {
    async send(message) {
      const config = resolveSmtp(env);
      if (!config) {
        return { transport: "outbox", status: "saved" };
      }
      try {
        await deliver(message, config);
        return { transport: "smtp", status: "sent" };
      } catch (error) {
        const text = error instanceof Error ? error.message : "Unknown SMTP error";
        return {
          transport: "smtp",
          status: "failed",
          error: text.slice(0, 500),
        };
      }
    },
  };
}

export function emailAuditMessage(
  result: SendResult,
  to: string,
): { transport: EmailTransport; status: EmailStatus; error: string | null; message: string } {
  if (result.status === "saved") {
    return {
      transport: "outbox",
      status: "saved",
      error: null,
      message: `Warning email saved to the outbox for ${to}.`,
    };
  }
  if (result.status === "sent") {
    return {
      transport: "smtp",
      status: "sent",
      error: null,
      message: `Warning email sent to ${to}.`,
    };
  }
  return {
    transport: "smtp",
    status: "failed",
    error: result.error,
    message: `Warning email to ${to} could not be sent. ${result.error}`,
  };
}
