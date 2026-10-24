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
  | { transport: "smtp"; status: "failed"; error: string }
  | { transport: "smtp2go"; status: "sent"; emailId: string }
  | { transport: "smtp2go"; status: "failed"; error: string };

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

export const SMTP2GO_ENDPOINT = "https://api.smtp2go.com/v3/email/send";
export const DEFAULT_SMTP2GO_FROM = "claim@bogdandelivery.com";

export type Smtp2GoRequest = {
  apiKey: string;
  sender: string;
  to: string[];
  subject: string;
  textBody: string;
};

export type Smtp2GoSender = (request: Smtp2GoRequest) => Promise<{ emailId: string }>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type Smtp2GoBody = {
  data?: {
    email_id?: string;
    succeeded?: number;
    failed?: number;
    error?: string;
    error_code?: string;
    failures?: unknown;
  };
};

export type MailerDeps = {
  deliverSmtp?: SmtpDelivery;
  sendSmtp2Go?: Smtp2GoSender;
};

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

export function smtp2GoFrom(env: Env): string {
  return trimmed(env, "SMTP2GO_FROM") || DEFAULT_SMTP2GO_FROM;
}

export function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

function smtp2GoError(status: number, parsed: Smtp2GoBody | null, raw: string): string {
  const data = parsed?.data;
  if (data?.error) {
    const code = data.error_code ? ` (${data.error_code})` : "";
    return `SMTP2GO ${status}: ${data.error}${code}`;
  }
  if (Array.isArray(data?.failures) && data.failures.length > 0) {
    return `SMTP2GO ${status}: ${JSON.stringify(data.failures)}`;
  }
  const body = raw.trim() || "empty response";
  return `SMTP2GO ${status}: ${body}`;
}

export async function sendWithSmtp2Go(
  request: Smtp2GoRequest,
  fetchImpl: FetchLike = fetch,
): Promise<{ emailId: string }> {
  let response: Response;
  try {
    response = await fetchImpl(SMTP2GO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Smtp2go-Api-Key": request.apiKey,
      },
      body: JSON.stringify({
        sender: request.sender,
        to: request.to,
        subject: request.subject,
        text_body: request.textBody,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(redactSecret(`SMTP2GO request failed: ${message}`, request.apiKey));
  }

  const raw = await response.text();
  let parsed: Smtp2GoBody | null = null;
  try {
    parsed = JSON.parse(raw) as Smtp2GoBody;
  } catch {
    parsed = null;
  }
  const emailId = parsed?.data?.email_id?.trim() ?? "";
  const failed = parsed?.data?.failed ?? 0;
  if (response.ok && emailId && failed === 0 && !parsed?.data?.error) {
    return { emailId };
  }
  throw new Error(redactSecret(smtp2GoError(response.status, parsed, raw), request.apiKey));
}

export function describeMailMode(env: Env): {
  mode: "outbox" | "smtp" | "smtp2go" | "invalid";
  detail: string;
} {
  if (trimmed(env, "SMTP2GO_API_KEY")) {
    return {
      mode: "smtp2go",
      detail: `Warning emails are sent through SMTP2GO from ${smtp2GoFrom(env)}.`,
    };
  }
  try {
    const config = resolveSmtp(env);
    if (!config) {
      return {
        mode: "outbox",
        detail:
          "Email is not configured. Warning emails are saved in the app outbox and still count as the warning step.",
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

export function createMailer(env: Env, deliverOrDeps: SmtpDelivery | MailerDeps = {}): Mailer {
  const deps: MailerDeps =
    typeof deliverOrDeps === "function" ? { deliverSmtp: deliverOrDeps } : deliverOrDeps;
  const deliverSmtp = deps.deliverSmtp ?? deliverWithNodemailer;
  const sendSmtp2Go = deps.sendSmtp2Go ?? sendWithSmtp2Go;

  return {
    async send(message) {
      const apiKey = trimmed(env, "SMTP2GO_API_KEY");
      if (apiKey) {
        try {
          const { emailId } = await sendSmtp2Go({
            apiKey,
            sender: smtp2GoFrom(env),
            to: [message.to],
            subject: message.subject,
            textBody: message.text,
          });
          return { transport: "smtp2go", status: "sent", emailId };
        } catch (error) {
          const text = error instanceof Error ? error.message : "SMTP2GO request failed";
          return {
            transport: "smtp2go",
            status: "failed",
            error: redactSecret(text, apiKey).slice(0, 500),
          };
        }
      }

      const config = resolveSmtp(env);
      if (!config) {
        return { transport: "outbox", status: "saved" };
      }
      try {
        await deliverSmtp(message, config);
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
): {
  transport: EmailTransport;
  status: EmailStatus;
  error: string | null;
  providerMessageId: string | null;
  message: string;
} {
  if (result.status === "saved") {
    return {
      transport: "outbox",
      status: "saved",
      error: null,
      providerMessageId: null,
      message: `Warning email saved to the outbox for ${to}.`,
    };
  }
  if (result.status === "sent") {
    const providerMessageId = result.transport === "smtp2go" ? result.emailId : null;
    const message =
      result.transport === "smtp2go"
        ? `Warning email accepted by SMTP2GO for ${to}. Email id ${result.emailId}.`
        : `Warning email sent to ${to}.`;
    return {
      transport: result.transport,
      status: "sent",
      error: null,
      providerMessageId,
      message,
    };
  }
  return {
    transport: result.transport,
    status: "failed",
    error: result.error,
    providerMessageId: null,
    message: `Warning email to ${to} could not be sent. ${result.error}`,
  };
}
