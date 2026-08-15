import { dailyDigestEmail, type DigestLink } from "@context-layer/email";
import type { Logger } from "pino";
import { Resend } from "resend";

export interface DigestEmail {
  dashboardUrl: string;
  digest: string;
  eventCount: number;
  links: readonly DigestLink[];
  periodLabel: string;
  recipientEmail: string;
  workspaceName: string;
}

export interface DigestEmailSender {
  sendDigest(email: DigestEmail): Promise<boolean>;
}

export function createDigestEmailSender(config: {
  from: string;
  logger: Pick<Logger, "warn">;
  resendApiKey: string;
}): DigestEmailSender {
  const resend = new Resend(config.resendApiKey);

  return {
    async sendDigest(email) {
      try {
        const { error } = await resend.emails.send({
          from: config.from,
          react: dailyDigestEmail({
            dashboardUrl: email.dashboardUrl,
            digest: email.digest,
            eventCount: email.eventCount,
            links: email.links,
            periodLabel: email.periodLabel,
            workspaceName: email.workspaceName,
          }),
          subject: `${email.workspaceName}: ${email.periodLabel}`,
          to: email.recipientEmail,
        });

        if (error !== null) {
          config.logger.warn(
            {
              providerError: {
                name: error.name,
                statusCode: error.statusCode,
              },
            },
            "Resend rejected a daily digest email",
          );
          return false;
        }

        return true;
      } catch (error) {
        config.logger.warn(
          {
            providerError: {
              name: error instanceof Error ? error.name : "UnknownError",
            },
          },
          "Daily digest email delivery failed",
        );
        return false;
      }
    },
  };
}
