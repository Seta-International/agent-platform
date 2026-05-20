/** @jsxImportSource react */
import { Body, Button, Container, Head, Heading, Html, Text } from '@react-email/components';
import type { JSX } from 'react';
import type { MailTemplateProps } from '../../types.ts';

type Props = MailTemplateProps['failed-login-alert'];

export function subject(_props: Props): string {
  return 'Failed sign-in attempts on your Seta account';
}

export default function FailedLoginAlert(props: Props): JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: 480, padding: 24, background: '#ffffff' }}>
          <Heading style={{ fontSize: 20, marginBottom: 12 }}>Suspicious sign-in attempts</Heading>
          <Text>
            Hi {props.displayName}, we noticed 5 failed sign-in attempts to your Seta account.
          </Text>
          <Text>
            IP: {props.ip}
            {props.geo ? ` · ${props.geo}` : ''}
            <br />
            Last attempt: {props.attemptedAt}
          </Text>
          <Text>If this wasn't you, reset your password now.</Text>
          <Button
            href={props.resetUrl}
            style={{
              background: '#0047FF',
              color: '#ffffff',
              padding: '10px 16px',
              textDecoration: 'none',
              borderRadius: 6,
            }}
          >
            Reset password
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
