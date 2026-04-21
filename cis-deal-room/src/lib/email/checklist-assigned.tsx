import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { getAppUrl } from '@/lib/app-url';

interface Props {
  workspaceName: string;
  itemName: string;
  workspaceUrl: string;
}

export function ChecklistAssignedEmail({ workspaceName, itemName, workspaceUrl }: Props) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New diligence item assigned to you: {itemName}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img
            src={`${getAppUrl()}/cis-partners-logo.png`}
            alt="CIS Partners"
            width="160"
            style={{ display: 'block', marginBottom: '32px' }}
          />
          <Heading style={headingStyle}>New diligence item assigned</Heading>
          <Text style={textStyle}>
            You have a new request on <strong>{workspaceName}</strong>:
          </Text>
          <Section style={itemBoxStyle}>
            <Text style={itemNameStyle}>{itemName}</Text>
          </Section>
          <Section style={buttonSectionStyle}>
            <Button href={workspaceUrl} style={buttonStyle}>
              View in Deal Room
            </Button>
          </Section>
          <Text style={mutedStyle}>
            Or open{' '}
            <Link href={workspaceUrl} style={linkStyle}>
              {workspaceUrl}
            </Link>
          </Text>
          <Text style={footerStyle}>CIS Partners Advisory &mdash; Confidential</Text>
        </Container>
      </Body>
    </Html>
  );
}

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

const headingStyle: React.CSSProperties = {
  color: '#0D0D0D',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
};

const textStyle: React.CSSProperties = {
  color: '#52525B',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const itemBoxStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '0 0 24px',
};

const itemNameStyle: React.CSSProperties = {
  color: '#0D0D0D',
  fontSize: '15px',
  fontWeight: '600',
  margin: 0,
  lineHeight: '1.5',
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

const mutedStyle: React.CSSProperties = {
  color: '#A1A1AA',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 24px',
};

const linkStyle: React.CSSProperties = {
  color: '#E10600',
  textDecoration: 'underline',
};

const footerStyle: React.CSSProperties = {
  color: '#A1A1AA',
  fontSize: '12px',
  margin: '0',
};
