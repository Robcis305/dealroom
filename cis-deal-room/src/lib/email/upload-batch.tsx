import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface UploadBatchEmailProps {
  workspaceName: string;
  folderName: string;
  files: Array<{ fileName: string; sizeBytes: number }>;
  workspaceLink: string;
  uploaderEmail: string;
  unsubscribeUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload notification email sent to every participant with download access
 * to a folder, after a batch of files has been uploaded. One email per
 * participant per batch (not per file).
 */
export function UploadBatchNotificationEmail({
  workspaceName,
  folderName,
  files,
  workspaceLink,
  uploaderEmail,
  unsubscribeUrl,
}: UploadBatchEmailProps) {
  const fileCount = files.length;
  const fileWord = fileCount === 1 ? 'file' : 'files';

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {`${fileCount} new ${fileWord} in ${folderName} on ${workspaceName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            <Img
              src={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/cis-partners-logo.png`}
              alt="CIS Partners"
              width="160"
              style={{ display: 'block', marginBottom: '32px' }}
            />
          </Section>

          <Heading style={headingStyle}>
            {fileCount} new {fileWord} uploaded
          </Heading>

          <Text style={textStyle}>
            {uploaderEmail} uploaded {fileCount} {fileWord} to <strong>{folderName}</strong> in{' '}
            <strong>{workspaceName}</strong>.
          </Text>

          <Section style={fileListStyle}>
            {files.map((f, i) => (
              <Text key={`${i}-${f.fileName}`} style={fileItemStyle}>
                <span style={fileNameStyle}>{f.fileName}</span>{' '}
                <span style={fileSizeStyle}>({formatBytes(f.sizeBytes)})</span>
              </Text>
            ))}
          </Section>

          <Section style={buttonSectionStyle}>
            <Button href={workspaceLink} style={buttonStyle}>
              Open Workspace
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            Don&apos;t want upload notifications?{' '}
            <a href={unsubscribeUrl} style={{ color: '#52525B', textDecoration: 'underline' }}>
              Unsubscribe
            </a>.
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
  margin: '0 0 24px',
};

const fileListStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '0 0 24px',
};

const fileItemStyle: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.7',
  margin: '0',
  color: '#0D0D0D',
};

const fileNameStyle: React.CSSProperties = {
  fontWeight: '600',
};

const fileSizeStyle: React.CSSProperties = {
  color: '#A1A1AA',
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
  color: '#A1A1AA',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '24px 0 16px',
};

const footerStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '12px',
  margin: '0',
};
