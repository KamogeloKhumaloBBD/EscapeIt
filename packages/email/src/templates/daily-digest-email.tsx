import { Button, Heading, Text } from "react-email";
import * as React from "react";

import { EmailLayout, emailColors } from "../components/email-layout";

export interface DigestLink {
  label: string;
  source: string;
  url: string;
}

export interface DailyDigestEmailProperties {
  dashboardUrl: string;
  digest: string;
  eventCount: number;
  links?: readonly DigestLink[];
  periodLabel: string;
  workspaceName: string;
}

const headingStyle: React.CSSProperties = {
  fontSize: "28px",
  letterSpacing: "-0.04em",
  lineHeight: "34px",
  margin: "0 0 4px",
};

const periodStyle: React.CSSProperties = {
  color: emailColors.muted,
  fontSize: "13px",
  letterSpacing: "0.03em",
  margin: "0 0 24px",
  textTransform: "uppercase",
};

const listStyle: React.CSSProperties = {
  margin: "0 0 8px",
  padding: "0 0 0 20px",
};

const itemStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  paddingBottom: "10px",
};

const sourceStyle: React.CSSProperties = {
  fontWeight: 700,
};

/**
 * The digest arrives as one line per tool, whether it was written by the
 * summarizer or rendered from the events directly. Splitting on newlines is
 * therefore the only parsing needed, and a digest that arrives as a single
 * paragraph still renders correctly as one item.
 */
function digestLines(
  digest: string,
): { rest: string; source: string | null }[] {
  return digest
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf(": ");

      // Only treat a leading word as the tool name. A colon later in the
      // sentence is ordinary punctuation, not a label.
      if (separator === -1 || line.slice(0, separator).includes(" ")) {
        return { rest: line, source: null };
      }

      return {
        rest: line.slice(separator + 2),
        source: line.slice(0, separator),
      };
    });
}

const linkStyle: React.CSSProperties = {
  color: emailColors.primary,
  textDecoration: "underline",
};

/**
 * Turns the labels a line mentions into links, longest label first so that a
 * page called "Release notes" is not half-linked by a page called "Release".
 * Only the first occurrence of each label is linked; a sentence that repeats a
 * reference does not need it twice.
 */
function linkifyLine(
  text: string,
  links: readonly DigestLink[],
): React.ReactNode[] {
  let nodes: React.ReactNode[] = [text];

  for (const link of [...links].sort(
    (a, b) => b.label.length - a.label.length,
  )) {
    let linked = false;

    nodes = nodes.flatMap((node) => {
      if (linked || typeof node !== "string") {
        return [node];
      }

      const index = node.indexOf(link.label);

      if (index === -1) {
        return [node];
      }

      linked = true;

      return [
        node.slice(0, index),
        <a href={link.url} key={link.url} style={linkStyle}>
          {link.label}
        </a>,
        node.slice(index + link.label.length),
      ];
    });
  }

  return nodes;
}

export function DailyDigestEmail({
  dashboardUrl,
  digest,
  eventCount,
  links = [],
  periodLabel,
  workspaceName,
}: DailyDigestEmailProperties) {
  const lines = digestLines(digest);

  return (
    <EmailLayout preview={`${workspaceName}: ${periodLabel}`}>
      <Heading as="h1" style={headingStyle}>
        {workspaceName}
      </Heading>
      <Text style={periodStyle}>{periodLabel}</Text>
      <ul style={listStyle}>
        {lines.map((line, index) => (
          <li key={String(index)} style={itemStyle}>
            {line.source === null ? null : (
              <span style={sourceStyle}>{line.source}: </span>
            )}
            {linkifyLine(
              line.rest,
              links.filter((link) => link.source === line.source),
            )}
          </li>
        ))}
      </ul>
      <Button
        href={dashboardUrl}
        style={{
          backgroundColor: emailColors.primary,
          color: emailColors.white,
          display: "inline-block",
          fontSize: "13px",
          fontWeight: 700,
          letterSpacing: "0.03em",
          margin: "12px 0 0",
          padding: "13px 20px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        Open dashboard
      </Button>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "13px",
          lineHeight: "20px",
          margin: "24px 0 0",
        }}
      >
        {eventCount === 1
          ? "From 1 event across your connected tools."
          : `From ${String(eventCount)} events across your connected tools.`}
      </Text>
    </EmailLayout>
  );
}

DailyDigestEmail.PreviewProps = {
  dashboardUrl: "http://localhost:3000/dashboard",
  digest: [
    "github: pull request #88 to move the pricing page to server components was opened and merged, and issue #91 was opened for the pricing table overflowing on mobile.",
    "bitbucket: pull request #214 for retry failed card authorisations was opened, discussed over two comments and merged.",
    "jira: PAY-402 moved to In Progress and then to Done, and PAY-418 was created to investigate duplicate settlement rows.",
  ].join("\n"),
  eventCount: 16,
  links: [
    {
      label: "#88",
      source: "github",
      url: "https://github.com/acme/web/issues/88",
    },
    {
      label: "#91",
      source: "github",
      url: "https://github.com/acme/web/issues/91",
    },
    {
      label: "#214",
      source: "bitbucket",
      url: "https://bitbucket.org/acme/checkout/pull-requests/214",
    },
    {
      label: "PAY-402",
      source: "jira",
      url: "https://acme.atlassian.net/browse/PAY-402",
    },
  ],
  periodLabel: "Tuesday 14 August",
  workspaceName: "Acme Engineering",
} satisfies DailyDigestEmailProperties;

export function dailyDigestEmail(properties: DailyDigestEmailProperties) {
  return React.createElement(DailyDigestEmail, properties);
}

export default DailyDigestEmail;
