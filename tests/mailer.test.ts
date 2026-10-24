import { describe, expect, it, vi } from "vitest";
import {
  createMailer,
  describeMailMode,
  resolveSmtp,
  type SmtpConfig,
} from "../src/lib/mailer";

const message = {
  to: "maria.alvarez@example.com",
  subject: "Warning: Order not closed in the app",
  text: "This is a formal warning.",
};

describe("mailer", () => {
  it("saves to the outbox when SMTP is not configured", async () => {
    const deliver = vi.fn();
    const mailer = createMailer({}, deliver);
    await expect(mailer.send(message)).resolves.toEqual({
      transport: "outbox",
      status: "saved",
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(describeMailMode({}).mode).toBe("outbox");
  });

  it("treats blank SMTP variables as unconfigured", async () => {
    const mailer = createMailer({
      SMTP_HOST: "  ",
      SMTP_PORT: "",
      SMTP_FROM: " ",
    });
    await expect(mailer.send(message)).resolves.toEqual({
      transport: "outbox",
      status: "saved",
    });
  });

  it("refuses to send when SMTP is only partly configured", async () => {
    const deliver = vi.fn();
    const mailer = createMailer({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587" }, deliver);
    await expect(mailer.send(message)).rejects.toThrow(/SMTP_HOST, SMTP_PORT, and SMTP_FROM/);
    expect(deliver).not.toHaveBeenCalled();
    expect(describeMailMode({ SMTP_FROM: "ops@example.com" }).mode).toBe("invalid");
  });

  it("sends through SMTP when host, port, and from are set", async () => {
    const seen: SmtpConfig[] = [];
    const mailer = createMailer(
      {
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_FROM: "ops@example.com",
        SMTP_USER: "ops",
        SMTP_PASS: "secret",
      },
      async (_message, config) => {
        seen.push(config);
      },
    );
    await expect(mailer.send(message)).resolves.toEqual({
      transport: "smtp",
      status: "sent",
    });
    expect(seen[0]).toEqual({
      host: "smtp.example.com",
      port: 587,
      from: "ops@example.com",
      secure: false,
      auth: { user: "ops", pass: "secret" },
    });
    expect(describeMailMode({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_FROM: "ops@example.com",
    }).mode).toBe("smtp");
  });

  it("keeps a failed SMTP attempt as a failed result instead of throwing", async () => {
    const mailer = createMailer(
      {
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_FROM: "ops@example.com",
      },
      async () => {
        throw new Error("connection refused");
      },
    );
    await expect(mailer.send(message)).resolves.toEqual({
      transport: "smtp",
      status: "failed",
      error: "connection refused",
    });
  });

  it("chooses implicit TLS for port 465 unless SMTP_SECURE says otherwise", () => {
    expect(
      resolveSmtp({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_FROM: "ops@example.com",
      })?.secure,
    ).toBe(true);
    expect(
      resolveSmtp({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_FROM: "ops@example.com",
        SMTP_SECURE: "false",
      })?.secure,
    ).toBe(false);
    expect(
      resolveSmtp({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_FROM: "ops@example.com",
        SMTP_SECURE: "true",
      })?.secure,
    ).toBe(true);
    expect(
      resolveSmtp({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "25",
        SMTP_FROM: "ops@example.com",
      })?.auth,
    ).toBeUndefined();
  });

  it("rejects a port that is not a number", () => {
    expect(() =>
      resolveSmtp({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "mail",
        SMTP_FROM: "ops@example.com",
      }),
    ).toThrow(/SMTP_PORT/);
  });
});
