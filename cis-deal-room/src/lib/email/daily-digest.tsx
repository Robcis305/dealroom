import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from '@react-email/components';

interface DigestEvent {
  workspaceName: string;
  action: string;
  actorName: string;
  targetName: string;
  at: string;
}

interface DailyDigestEmailProps {
  recipientName: string;
  events: DigestEvent[];
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    uploaded: 'uploaded',
    notified_batch: 'uploaded files to',
    invited: 'invited',
    removed: 'removed',
    participant_updated: 'updated',
    created_folder: 'created folder',
    created_workspace: 'created workspace',
    status_changed: 'changed status',
  };
  return map[action] ?? action;
}

export function DailyDigestEmail({ recipientName, events }: DailyDigestEmailProps) {
  const byWorkspace = new Map<string, DigestEvent[]>();
  for (const e of events) {
    const list = byWorkspace.get(e.workspaceName) ?? [];
    list.push(e);
    byWorkspace.set(e.workspaceName, list);
  }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${events.length} update${events.length === 1 ? '' : 's'} from your deal rooms`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img
            src={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/cis-partners-logo.png`}
            alt="CIS Partners"
            width="160"
            style={{ display: 'block', marginBottom: '32px' }}
          />
          <Heading style={headingStyle}>Your daily deal-room digest</Heading>
          <Text style={textStyle}>Hi {recipientName},</Text>
          <Text style={textStyle}>Here&apos;s what happened in your deals in the last 24 hours:</Text>

          {[...byWorkspace.entries()].map(([workspace, eventList]) => (
            <Section key={workspace} style={sectionStyle}>
              <Heading as="h3" style={h3Style}>{workspace}</Heading>
              {eventList.map((e, i) => (
                <Text key={i} style={itemStyle}>
                  &bull; {e.actorName} {actionLabel(e.action)} {e.targetName}
                </Text>
              ))}
            </Section>
          ))}

          <Text style={smallTextStyle}>
            You&apos;re receiving this because daily digest is enabled. Change to real-time notifications in your account settings.
          </Text>

          <Text style={footerStyle}>CIS Partners Advisory &mdash; Confidential</Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = { backgroundColor: '#F4F4F5', fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: '40px 0' };
const containerStyle: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: '8px', maxWidth: '560px', margin: '0 auto', padding: '40px 32px' };
const headingStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '24px', fontWeight: '700', margin: '0 0 16px' };
const h3Style: React.CSSProperties = { color: '#0D0D0D', fontSize: '16px', fontWeight: '700', margin: '24px 0 8px' };
const textStyle: React.CSSProperties = { color: '#52525B', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px' };
const itemStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '14px', lineHeight: '1.7', margin: '0' };
const sectionStyle: React.CSSProperties = { margin: '0 0 24px' };
const smallTextStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '13px', lineHeight: '1.5', margin: '24px 0 16px' };
const footerStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '12px', margin: '0' };
