import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface InvitationEmailProps {
  inviteLink: string;
  workspaceName: string;
  roleLabel: string;
  inviterEmail: string;
}

/**
 * Invitation email sent to a new participant when an admin invites them to
 * a deal workspace. Magic link is pre-authenticated and redirects directly
 * into the workspace; valid for 3 days.
 */
export function InvitationEmail({
  inviteLink,
  workspaceName,
  roleLabel,
  inviterEmail,
}: InvitationEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You have been invited to {workspaceName} on CIS Deal Room</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            <Text style={logoPlaceholderStyle}>CIS Partners</Text>
          </Section>

          <Heading style={headingStyle}>You&apos;re invited to {workspaceName}</Heading>

          <Text style={textStyle}>
            {inviterEmail} has invited you to collaborate on <strong>{workspaceName}</strong> as{' '}
            <strong>{roleLabel}</strong>. Click the button below to accept and sign in. This invitation is
            valid for 3 days.
          </Text>

          <Section style={buttonSectionStyle}>
            <Button href={inviteLink} style={buttonStyle}>
              Accept Invitation
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            If you did not expect this invitation, you can safely ignore this email.
          </Text>

          <Text style={footerStyle}>
            CIS Partners Advisory &mdash; Confidential
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily: 'DM Sans, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '40px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '480px',
  margin: '0 auto',
  padding: '40px 32px',
};

const logoSectionStyle: React.CSSProperties = {
  marginBottom: '32px',
};

const logoPlaceholderStyle: React.CSSProperties = {
  color: '#E10600',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  margin: '0',
};

const headingStyle: React.CSSProperties = {
  color: '#0D0D0D',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
};

const textStyle: React.CSSProperties = {
  color: '#3f3f46',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const buttonSectionStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 24px',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#E10600',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
};

const smallTextStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 16px',
};

const footerStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '12px',
  margin: '0',
};
