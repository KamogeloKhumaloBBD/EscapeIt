import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import * as React from "react";

export const emailColors = {
  background: "#f7f5f0",
  border: "#ded9ce",
  foreground: "#171510",
  muted: "#6f6a60",
  primary: "#4f35e8",
  white: "#ffffff",
} as const;

const bodyStyle: React.CSSProperties = {
  backgroundColor: emailColors.background,
  color: emailColors.foreground,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: "32px 12px",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: emailColors.white,
  border: `1px solid ${emailColors.border}`,
  margin: "0 auto",
  maxWidth: "560px",
  padding: "36px",
};

export function EmailLayout({
  children,
  preview,
}: {
  children: React.ReactNode;
  preview: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text
              style={{
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                margin: "0 0 28px",
                textTransform: "uppercase",
              }}
            >
              Context Layer
            </Text>
          </Section>
          {children}
          <Hr
            style={{
              borderColor: emailColors.border,
              margin: "32px 0 20px",
            }}
          />
          <Text
            style={{
              color: emailColors.muted,
              fontSize: "12px",
              lineHeight: "18px",
              margin: 0,
            }}
          >
            Context Layer brings work context to coding agents.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
